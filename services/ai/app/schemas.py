from pydantic import BaseModel


class Suggestion(BaseModel):
    rank: int
    scientific_name: str
    score: float
    engine: str
    taxon_id: str | None = None
    inhouse_code: str | None = None
    in_collection: bool | None = None
    iucn_category: str | None = None
    sensitive: bool = False
    common_name: str | None = None


class IdentifyResponse(BaseModel):
    engine_chain: list[str]
    suggestions: list[Suggestion]
    warnings: list[str]
