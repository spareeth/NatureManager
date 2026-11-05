"""Merging and normalising engine results (docs/AI_INTEGRATION.md, Engine chains)."""

from app.platform import Taxon
from app.schemas import Suggestion

RANKS = {"subsp.", "subsp", "ssp.", "var.", "var", "f.", "cv."}


def norm_name(name: str) -> str:
    """Lower-case genus and epithet, plus the infraspecific name after a rank marker; drops the
    hybrid sign and any authorship."""
    words = name.replace("×", " ").lower().split()
    words = [w for w in words if w != "x"]
    out = words[:2]
    if len(words) > 3 and words[2] in RANKS:
        out += [words[2].rstrip(".") + ".", words[3]]
    return " ".join(out)


def match_taxon(name: str, by_name: dict[str, Taxon]) -> Taxon | None:
    n = norm_name(name)
    if n in by_name:
        return by_name[n]
    species = " ".join(n.split()[:2])  # infraspecific name not in our list: the species
    return by_name.get(species)


def merge(
    results: dict[str, list[tuple[str, float]]],
    species: list[Taxon],
    in_collection: dict[str, bool],
    boost: float,
    top_n: int,
    min_score: float = 0.01,
) -> list[Suggestion]:
    """Best score per taxon over the engines; +boost for taxa in the collection here; top n.

    Results below min_score are noise and dropped before the boost, so the boost cannot fill the
    list with taxa the engines gave no weight to."""
    by_name = {norm_name(t.scientific_name): t for t in species if t.scientific_name}
    best: dict[str, Suggestion] = {}
    for engine, scored in results.items():
        for name, score in scored:
            if score < min_score:
                continue
            t = match_taxon(name, by_name)
            key = t.taxon_id if t else "name:" + norm_name(name)
            s = Suggestion(
                rank=0,
                scientific_name=t.scientific_name if t else name,
                score=score,
                engine=engine,
                taxon_id=t.taxon_id if t else None,
                inhouse_code=t.inhouse_code if t else None,
                iucn_category=t.iucn_category if t else None,
                sensitive=t.sensitive if t else False,
                common_name=t.common_name if t else None,
                in_collection=in_collection.get(t.taxon_id) if t else False,
            )
            if key not in best or s.score > best[key].score:
                best[key] = s
    out = list(best.values())
    for s in out:
        if s.in_collection:
            s.score = min(1.0, s.score + boost)
        s.score = round(s.score, 4)
    out.sort(key=lambda s: (-s.score, s.scientific_name))
    out = out[:top_n]
    for i, s in enumerate(out, 1):
        s.rank = i
    return out


def candidate_names(results: dict[str, list[tuple[str, float]]], species: list[Taxon]) -> list[str]:
    by_name = {norm_name(t.scientific_name): t for t in species if t.scientific_name}
    ids = []
    for scored in results.values():
        for name, _ in scored:
            t = match_taxon(name, by_name)
            if t and t.taxon_id not in ids:
                ids.append(t.taxon_id)
    return ids
