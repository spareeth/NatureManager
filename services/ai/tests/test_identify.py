import io

import httpx
import pytest
from fastapi.testclient import TestClient

from app.engines import Image
from app.engines.plantnet import PlantNet, PlantNetError
from app.identify import merge, norm_name
from app.main import app, get_engines, get_platform
from app.platform import Forbidden, Taxon

ORG = "11111111-1111-1111-1111-111111111111"
GHAF = Taxon("t-ghaf", "Prosopis cineraria", "Plantae", "PRO", "LC", False, "Ghaf")
SIDR = Taxon("t-sidr", "Ziziphus spina-christi", "Plantae", "ZIZ", "LC", False, "Sidr")
RARE = Taxon("t-rare", "Rara protecta", "Plantae", "RAR", "EN", True, None)
SPECIES = [GHAF, SIDR, RARE]


def test_norm_name() -> None:
    assert norm_name("Ziziphus spina-christi (L.) Desf.") == "ziziphus spina-christi"
    assert norm_name("Prosopis  Cineraria") == "prosopis cineraria"
    assert (
        norm_name("Prosopis cineraria var. glandulosa Foo") == "prosopis cineraria var. glandulosa"
    )
    assert norm_name("Citrus × aurantium") == "citrus aurantium"


def test_merge_best_score_boost_and_codes() -> None:
    out = merge(
        {
            "plantnet": [("Prosopis cineraria", 0.5), ("Acacia tortilis", 0.3)],
            "bioclip2": [("Prosopis cineraria", 0.7), ("Ziziphus spina-christi", 0.2)],
        },
        SPECIES,
        {"t-ghaf": True, "t-sidr": False},
        boost=0.1,
        top_n=5,
    )
    assert [s.scientific_name for s in out] == [
        "Prosopis cineraria",
        "Acacia tortilis",
        "Ziziphus spina-christi",
    ]
    top = out[0]
    assert (top.rank, top.engine, top.score, top.inhouse_code, top.in_collection) == (
        1,
        "bioclip2",
        0.8,
        "PRO",
        True,
    )
    assert out[1].taxon_id is None and out[1].in_collection is False  # not in our taxa
    assert out[2].in_collection is False and out[2].score == 0.2


def test_merge_infraspecific_falls_back_to_species_and_caps() -> None:
    out = merge(
        {"plantnet": [("Prosopis cineraria var. x", 0.95)]}, SPECIES, {"t-ghaf": True}, 0.1, 5
    )
    assert out[0].taxon_id == "t-ghaf" and out[0].score == 1.0


def test_merge_drops_noise_before_boost() -> None:
    out = merge(
        {"bioclip2": [("Prosopis cineraria", 0.9), ("Ziziphus spina-christi", 0.002)]},
        SPECIES,
        {"t-ghaf": True, "t-sidr": True},
        0.1,
        5,
    )
    assert [s.inhouse_code for s in out] == ["PRO"]


def test_merge_top_n() -> None:
    res = {"bioclip2": [(f"Genus sp{i}", 0.2 - i / 100) for i in range(8)]}
    assert len(merge(res, SPECIES, {}, 0.1, 5)) == 5


# -- Pl@ntNet adapter ------------------------------------------------------------------------------


def plantnet_with(handler) -> tuple[PlantNet, list]:
    calls = []

    async def h(req: httpx.Request) -> httpx.Response:
        await req.aread()
        calls.append(req)
        return handler(req)

    client = httpx.AsyncClient(transport=httpx.MockTransport(h))
    return PlantNet("KEY", "https://plantnet.test/v2/identify/all", client), calls


@pytest.mark.anyio
async def test_plantnet_parses_and_caches() -> None:
    body = {
        "results": [
            {"score": 0.81, "species": {"scientificNameWithoutAuthor": "Prosopis cineraria"}}
        ]
    }
    pn, calls = plantnet_with(lambda r: httpx.Response(200, json=body))
    imgs = [Image(b"abc", "leaf")]
    assert await pn.identify(imgs) == [("Prosopis cineraria", 0.81)]
    assert await pn.identify([Image(b"abc", "leaf")]) == [("Prosopis cineraria", 0.81)]
    assert len(calls) == 1  # second call from the cache
    assert b"leaf" in calls[0].content and calls[0].url.params["api-key"] == "KEY"


@pytest.mark.anyio
async def test_plantnet_not_found_and_errors() -> None:
    pn, _ = plantnet_with(lambda r: httpx.Response(404, json={"message": "Species not found"}))
    assert await pn.identify([Image(b"x", "auto")]) == []
    pn, _ = plantnet_with(lambda r: httpx.Response(429))
    with pytest.raises(PlantNetError):
        await pn.identify([Image(b"y", "auto")])


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# -- endpoint --------------------------------------------------------------------------------------


class FakePlatform:
    def __init__(self, member: bool = True):
        self.member = member
        self.checked: list = []

    async def check_member(self, org):
        if not self.member:
            raise Forbidden("not a member of this organisation")

    async def species_list(self, org, kingdom=None):
        return SPECIES if kingdom == "Plantae" else []

    async def in_collection(self, org, taxa, location_id, lon, lat, radius_m):
        self.checked.append((taxa, location_id, lon, lat, radius_m))
        return {t: t == "t-ghaf" for t in taxa}


class FakePlantNet:
    def __init__(self, result=None, fail=False):
        self.result, self.fail = result or [], fail

    async def identify(self, images):
        if self.fail:
            raise PlantNetError("down")
        return self.result


class FakeBioClip:
    def identify(self, images, names):
        assert "Prosopis cineraria" in names
        return [("Ziziphus spina-christi", 0.6), ("Prosopis cineraria", 0.3)]


def client(platform=None, engines=None) -> TestClient:
    app.dependency_overrides[get_platform] = lambda: platform or FakePlatform()
    app.dependency_overrides[get_engines] = lambda: engines or {}
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    yield
    app.dependency_overrides.clear()


def post(c: TestClient, **form):
    data = {"organisation_id": ORG, "kind": "plant", **form}
    files = [("files", ("a.jpg", io.BytesIO(b"\xff\xd8jpeg"), "image/jpeg"))]
    return c.post("/identify", data=data, files=files)


def test_identify_plant_chain() -> None:
    plat = FakePlatform()
    c = client(
        plat, {"plantnet": FakePlantNet([("Prosopis cineraria", 0.45)]), "bioclip2": FakeBioClip()}
    )
    res = post(c, lat="25.0", lon="55.1", organs="leaf")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["engine_chain"] == ["plantnet", "bioclip2"]
    top = body["suggestions"][0]
    assert top["scientific_name"] == "Ziziphus spina-christi" and top["score"] == 0.6
    ghaf = body["suggestions"][1]
    assert (ghaf["inhouse_code"], ghaf["in_collection"], ghaf["score"]) == ("PRO", True, 0.55)
    assert plat.checked[0][2:] == (55.1, 25.0, 25.0)
    assert body["warnings"] == []


def test_identify_low_confidence_and_missing_engines() -> None:
    c = client(engines={"plantnet": FakePlantNet([("Prosopis cineraria", 0.2)])})
    body = post(c).json()
    assert "bioclip2_not_configured" in body["warnings"] and "low_confidence" in body["warnings"]
    assert body["suggestions"][0]["in_collection"] is None  # no location: not checked


def test_identify_plantnet_down_still_answers() -> None:
    c = client(engines={"plantnet": FakePlantNet(fail=True), "bioclip2": FakeBioClip()})
    body = post(c).json()
    assert body["engine_chain"] == ["plantnet", "bioclip2"]
    assert "plantnet_unavailable" in body["warnings"] and body["suggestions"]


def test_identify_requires_sign_in_and_membership() -> None:
    assert (
        TestClient(app)
        .post(
            "/identify",
            data={"organisation_id": ORG, "kind": "plant"},
            files=[("files", ("a.jpg", b"x", "image/jpeg"))],
        )
        .status_code
        == 401
    )
    assert post(client(FakePlatform(member=False))).status_code == 403


def test_identify_rejects_bad_input() -> None:
    c = client()
    assert post(c, kind="audio").status_code == 501
    assert post(c, kind="mushroom").status_code == 422
    bad = c.post(
        "/identify",
        data={"organisation_id": ORG, "kind": "plant"},
        files=[("files", ("a.txt", b"x", "text/plain"))],
    )
    assert bad.status_code == 422
