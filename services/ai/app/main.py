import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import settings
from app.engines import Image
from app.engines.bioclip import BioClip
from app.engines.plantnet import PlantNet, PlantNetError
from app.identify import candidate_names, merge
from app.platform import Forbidden, Platform
from app.schemas import IdentifyResponse

log = logging.getLogger("ai")

MAX_BYTES = 10 * 1024 * 1024
ORGANS = {"leaf", "flower", "fruit", "bark", "habit", "auto"}

_http = httpx.AsyncClient()
_bioclip = BioClip(settings.bioclip_model) if settings.bioclip_enabled else None
_plantnet = (
    PlantNet(settings.plantnet_api_key, settings.plantnet_url, _http)
    if settings.plantnet_api_key
    else None
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load BioCLIP 2 in the background so the first identify is not slow."""
    if _bioclip is not None:
        asyncio.get_running_loop().run_in_executor(None, _bioclip.warm)
    yield


app = FastAPI(title="Terra Garden AI service", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def get_engines() -> dict:
    return {"plantnet": _plantnet, "bioclip2": _bioclip}


def get_platform(authorization: Annotated[str | None, Header()] = None) -> Platform:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "sign in required")
    return Platform(settings.supabase_url, settings.supabase_anon_key, authorization[7:], _http)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.post("/identify", response_model=IdentifyResponse)
async def identify(
    organisation_id: Annotated[uuid.UUID, Form()],
    kind: Annotated[str, Form()],
    files: Annotated[list[UploadFile], File()],
    platform: Annotated[Platform, Depends(get_platform)],
    engines: Annotated[dict, Depends(get_engines)],
    organs: Annotated[list[str] | None, Form()] = None,
    lat: Annotated[float | None, Form()] = None,
    lon: Annotated[float | None, Form()] = None,
    observed_at: Annotated[datetime | None, Form()] = None,
    location_id: Annotated[uuid.UUID | None, Form()] = None,
) -> IdentifyResponse:
    if kind in ("camera_trap", "audio"):
        raise HTTPException(501, f"{kind} is not available yet")
    if kind not in ("plant", "animal"):
        raise HTTPException(422, "kind is plant, animal, camera_trap or audio")
    if not 1 <= len(files) <= 5:
        raise HTTPException(422, "1 to 5 images")
    organs = organs or []
    images = []
    for i, f in enumerate(files):
        data = await f.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "an image is larger than 10 MB")
        if not (f.content_type or "").startswith("image/"):
            raise HTTPException(422, "images only")
        organ = organs[i] if i < len(organs) and organs[i] in ORGANS else "auto"
        images.append(Image(data, organ, f.content_type or "image/jpeg"))

    org = str(organisation_id)
    try:
        await platform.check_member(org)
        species = await platform.species_list(org, "Plantae" if kind == "plant" else "Animalia")
    except Forbidden as e:
        raise HTTPException(403, str(e)) from e

    warnings: list[str] = []
    chain: list[str] = []
    results: dict[str, list[tuple[str, float]]] = {}

    plantnet, bioclip = engines.get("plantnet"), engines.get("bioclip2")
    if kind == "plant":
        if plantnet is None:
            warnings.append("plantnet_not_configured")
        else:
            chain.append("plantnet")
            try:
                results["plantnet"] = await plantnet.identify(images)
            except PlantNetError as e:
                log.warning("plantnet failed: %s", e)
                warnings.append("plantnet_unavailable")
    if bioclip is None:
        warnings.append("bioclip2_not_configured")
    elif not species:
        warnings.append("species_list_empty")
    else:
        chain.append("bioclip2")
        names = [t.scientific_name for t in species]
        try:
            results["bioclip2"] = await asyncio.to_thread(
                bioclip.identify, [im.data for im in images], names
            )
        except Exception as e:  # model missing, bad image
            log.warning("bioclip2 failed: %s", e)
            warnings.append("bioclip2_unavailable")

    in_coll: dict[str, bool] = {}
    if kind == "plant" and (location_id or (lat is not None and lon is not None)):
        in_coll = await platform.in_collection(
            org,
            candidate_names(results, species),
            str(location_id) if location_id else None,
            lon,
            lat,
            settings.collection_radius_m,
        )
    suggestions = merge(results, species, in_coll, settings.location_boost, settings.top_n)
    if kind != "plant":
        for s in suggestions:
            s.in_collection = None
    if not suggestions:
        warnings.append("no_result")
    elif suggestions[0].score < settings.low_confidence:
        warnings.append("low_confidence")
    return IdentifyResponse(engine_chain=chain, suggestions=suggestions, warnings=warnings)
