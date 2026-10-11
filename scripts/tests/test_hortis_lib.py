import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "hortis"))
import hortis_lib as h


def test_dates_and_iucn() -> None:
    assert h.parse_date("2026/2/25") == "2026-02-25"
    assert h.parse_date("") is None
    assert [h.iucn_code(x) for x in ["Not Evaluated", "Least Concern", "Near Threatened", "Data Deficient", "Endangered", ""]] == [
        "NE", "LC", "NT", "DD", "EN", None]
    with pytest.raises(ValueError):
        h.iucn_code("Probably fine")


def test_names() -> None:
    assert h.parse_name("Prosopis cineraria") == h.TaxonName("Prosopis", "cineraria", None, "species")
    assert h.parse_name("Citrus × limon") == h.TaxonName("Citrus", "× limon", None, "species")
    assert h.parse_name("Ziziphus spina-christi christi") == h.TaxonName("Ziziphus", "spina-christi", "christi", "species")
    assert h.parse_name("Aloe") == h.TaxonName("Aloe", None, None, "genus")


def test_tags_and_types() -> None:
    assert h.tag_bed("SG03-T34_MON") == "SG-03"
    assert h.tag_bed("bad") is None
    assert h.bed_prefix("WG-07") == "WG07"
    assert h.asset_type_code("WG07-T04_PRO", "Shrub|Tree") == "TREE"
    assert h.asset_type_code("WG07-T04_PRO", "Shrub") == "PLANT"
    assert h.asset_type_code("", "Tree") == "GROUP"
    assert h.legacy_key("2026-0086", "A") == "2026-0086.A"


def test_propose_codes_unique_and_deterministic() -> None:
    taken = {"ACA", "PRO", "CIT"}
    names = ["Acacia tortilis", "Aloe vera", "Aloe dhufarensis", "Citrus × limon", "Prosopis juliflora"]
    codes = h.propose_codes(names, taken)
    assert len(set(codes.values())) == len(names)
    assert not set(codes.values()) & taken
    assert codes["Aloe dhufarensis"] == "ALO"  # sorted first, takes the genus code
    assert codes["Aloe vera"] == "AVE"
    assert codes["Citrus × limon"] == "CLI"  # hybrid sign ignored
    assert codes == h.propose_codes(reversed(names), taken)


def test_assign_tags() -> None:
    records = [
        {"key": "2026-0001.A", "tag": "SG03-T10_PHO", "location": "SG-03", "taxon": "Phoenix dactylifera"},
        {"key": "2026-0001.B", "tag": "SG03-T10_PHO", "location": "SG-03", "taxon": "Phoenix dactylifera"},
        {"key": "2026-0002.A", "tag": "SG03-T34_MON", "location": "SG-11", "taxon": "Morus nigra"},
        {"key": "2026-0003.A", "tag": "", "location": "SG-03", "taxon": "Aloe vera"},
        {"key": "2026-0003.B", "tag": "", "location": "SG-03", "taxon": "Aloe vera"},
    ]
    res = h.assign_tags(records, {"Phoenix dactylifera": "PHO", "Morus nigra": "MON", "Aloe vera": "ALO"})
    assert res["2026-0001.A"].tag == "SG03-T10_PHO" and res["2026-0001.A"].flags == []
    assert res["2026-0001.B"].tag == "SG03-T35_PHO"  # next free T in SG03 after T34
    assert res["2026-0001.B"].flags[0][0] == "duplicate_tag"
    assert res["2026-0002.A"].tag == "SG03-T34_MON"  # kept as printed
    assert res["2026-0002.A"].flags == [("tag_bed_mismatch", {"hortis_tag": "SG03-T34_MON", "tag_bed": "SG-03", "location": "SG-11"})]
    assert [res["2026-0003.A"].tag, res["2026-0003.B"].tag] == ["SG03-G01_ALO", "SG03-G02_ALO"]


def test_retag_proposal() -> None:
    assert h.retag_proposal("SG03-T34_MON", "SG-11", set()) == "SG11-T34_MON"
    assert h.retag_proposal("SG03-T34_MON", "SG-11", {"SG11-T34_MON", "SG11-T35_MON"}) == "SG11-T36_MON"
