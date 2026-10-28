"""Pure rules for the Hortis migration (docs/HORTIS_MIGRATION.md). No database access here."""

from __future__ import annotations

import csv
import datetime as dt
import re
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/hortis/raw/2026-04-27"
OUT = ROOT / "data/hortis/out"

TAG_RE = re.compile(r"^(?P<zone>[A-Z]{2})(?P<bed>\d{2})-(?P<kind>[TG])(?P<n>\d{2,3})_(?P<code>[A-Z]{3})$")
LOCATION_RE = re.compile(r"^(?P<zone>[A-Z]{2})-(?P<bed>\d{2})$")

IUCN = {
    "not evaluated": "NE",
    "least concern": "LC",
    "near threatened": "NT",
    "vulnerable": "VU",
    "endangered": "EN",
    "critically endangered": "CR",
    "extinct in the wild": "EW",
    "extinct": "EX",
    "data deficient": "DD",
}
# Hortis Condition to asset.condition (1 to 5). Dead sets status dead instead.
CONDITION = {"good": 4, "fair": 3, "poor": 2}
# Hortis Status "Present" is a plant in the ground: established (decision 11 Oct 2026).
STATUS_PRESENT = "established"


def read_csv(path: Path) -> list[dict[str, str]]:
    """UTF-8 with BOM; every value trimmed (several common names have trailing spaces)."""
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def parse_date(text: str) -> str | None:
    """Hortis dates are yyyy/m/d. Returns ISO yyyy-mm-dd, or None for blank."""
    if not text:
        return None
    y, m, d = (int(p) for p in text.split("/"))
    return dt.date(y, m, d).isoformat()


def iucn_code(text: str) -> str | None:
    if not text:
        return None
    try:
        return IUCN[text.strip().lower()]
    except KeyError as e:
        raise ValueError(f"unknown IUCN status: {text!r}") from e


def split_list(text: str) -> list[str]:
    return [p.strip() for p in text.split("|") if p.strip()]


def legacy_key(accession: str, qualifier: str) -> str:
    return f"{accession}.{qualifier}"


def tag_bed(tag: str) -> str | None:
    """'SG03-T34_MON' -> 'SG-03'."""
    m = TAG_RE.match(tag)
    return f"{m['zone']}-{m['bed']}" if m else None


def bed_prefix(location: str) -> str:
    """'SG-03' -> 'SG03'."""
    m = LOCATION_RE.match(location)
    if not m:
        raise ValueError(f"not a bed code: {location!r}")
    return f"{m['zone']}{m['bed']}"


@dataclass(frozen=True)
class TaxonName:
    genus: str
    specific_epithet: str | None
    infraspecific_epithet: str | None
    rank: str


def parse_name(name: str) -> TaxonName:
    """Split a scientific name into genus and epithets. Keeps the hybrid sign on the epithet
    ('Citrus × limon' -> epithet '× limon'). A third word is kept as an infraspecific epithet
    without a rank (validation flags it for the curator)."""
    words = name.split()
    genus = words[0]
    rest = words[1:]
    if rest and rest[0] == "×":
        rest = [f"× {rest[1]}", *rest[2:]] if len(rest) > 1 else []
    if not rest:
        return TaxonName(genus, None, None, "genus")
    epithet = rest[0]
    infra = " ".join(rest[1:]) or None
    return TaxonName(genus, epithet, infra, "species")


def asset_type_code(tag: str, life_forms: str) -> str:
    """Tagged trees are TREE, other tagged plants PLANT, untagged bed-level records GROUP."""
    if not tag:
        return "GROUP"
    return "TREE" if "Tree" in split_list(life_forms) else "PLANT"


def propose_codes(names: Iterable[str], taken: Iterable[str]) -> dict[str, str]:
    """Three-letter in-house codes for taxa without one, unique against `taken` and each other.
    Tries the genus' first three letters, then genus letter + two epithet letters, then genus
    two letters + epithet letter, then genus letter + epithet letters further along."""
    used = {c.upper() for c in taken}
    out: dict[str, str] = {}
    for name in sorted(names):
        n = parse_name(name)
        g = re.sub(r"[^A-Za-z]", "", n.genus).upper()
        e = re.sub(r"[^A-Za-z]", "", (n.specific_epithet or "").replace("×", "")).upper()
        candidates = [g[:3]]
        if e:
            candidates += [g[0] + e[:2], g[:2] + e[0]]
            candidates += [g[0] + e[0] + c for c in e[1:]]
            candidates += [g[0] + c + e[0] for c in g[1:]]
        candidates += [g[0] + a + b for a in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" for b in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
        code = next(c for c in candidates if len(c) == 3 and c not in used)
        used.add(code)
        out[name] = code
    return out


@dataclass
class TagResult:
    tag: str
    flags: list[tuple[str, dict]] = field(default_factory=list)


def assign_tags(records: list[dict], species_part: dict[str, str]) -> dict[str, TagResult]:
    """Tag for every plant record, keyed by legacy key.

    records: dicts with key, tag (Hortis tag or ''), location (bed code), taxon (scientific name).
    species_part: taxon name -> three letters used in new tags (approved code, else genus).

    * Hortis tags are kept as printed on the trees. A tag whose bed prefix differs from the
      recorded bed is flagged with a re-tag proposal (decision 11 Oct 2026).
    * A duplicate tag: the first record (by key) keeps it; the next gets the next free T number
      in its bed and is flagged.
    * Records without a tag get <ZONE><BED>-G<NN>_<CODE>, numbered per bed in key order.
    """
    out: dict[str, TagResult] = {}
    used: set[str] = {r["tag"] for r in records if r["tag"]}
    max_n: dict[tuple[str, str], int] = defaultdict(int)  # (bed prefix, T|G) -> highest number
    for t in used:
        m = TAG_RE.match(t)
        if m:
            key = (m["zone"] + m["bed"], m["kind"])
            max_n[key] = max(max_n[key], int(m["n"]))

    def next_tag(bed: str, kind: str, code: str) -> str:
        while True:
            max_n[(bed, kind)] += 1
            n = max_n[(bed, kind)]
            tag = f"{bed}-{kind}{n:02d}_{code}"
            if tag not in used:
                used.add(tag)
                return tag

    seen: set[str] = set()
    ordered = sorted(records, key=lambda r: r["key"])
    for r in ordered:
        if not r["tag"]:
            continue
        res = TagResult(r["tag"])
        if r["tag"] in seen:
            new = next_tag(bed_prefix(r["location"]), "T", species_part[r["taxon"]])
            res = TagResult(new, [("duplicate_tag", {"hortis_tag": r["tag"], "new_tag": new})])
        seen.add(r["tag"])
        tb = tag_bed(r["tag"])
        if tb != r["location"]:
            res.flags.append(("tag_bed_mismatch", {"hortis_tag": r["tag"], "tag_bed": tb, "location": r["location"]}))
        out[r["key"]] = res
    for r in ordered:
        if not r["tag"]:
            out[r["key"]] = TagResult(next_tag(bed_prefix(r["location"]), "G", species_part[r["taxon"]]))
    return out


def retag_proposal(tag: str, location: str, taken: set[str]) -> str:
    """Re-tag proposal for a tag whose bed prefix is out of date: same kind, code and number
    under the recorded bed if free, else the next free number there."""
    m = TAG_RE.match(tag)
    if not m:
        raise ValueError(tag)
    bed = bed_prefix(location)
    n = int(m["n"])
    while True:
        cand = f"{bed}-{m['kind']}{n:02d}_{m['code']}"
        if cand not in taken:
            return cand
        n += 1
