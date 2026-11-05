from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_", env_file="../../.env.local", extra="ignore")

    allowed_origins: str = "http://localhost:5173"
    supabase_url: str = Field(
        "http://127.0.0.1:54321",
        validation_alias=AliasChoices("AI_SUPABASE_URL", "VITE_SUPABASE_URL"),
    )
    supabase_anon_key: str = Field(
        "", validation_alias=AliasChoices("AI_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
    )
    plantnet_api_key: str = Field(
        "", validation_alias=AliasChoices("AI_PLANTNET_API_KEY", "PLANTNET_API_KEY")
    )
    plantnet_url: str = "https://my-api.plantnet.org/v2/identify/all"
    bioclip_model: str = "hf-hub:imageomics/bioclip-2"
    bioclip_enabled: bool = True
    location_boost: float = 0.1
    low_confidence: float = 0.35
    collection_radius_m: float = 25
    top_n: int = 5

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
