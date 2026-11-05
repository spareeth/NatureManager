"""Reads from the platform with the caller's own token, so row level security applies.

The service never writes to the database (docs/AI_INTEGRATION.md).
"""

from dataclasses import dataclass

import httpx


class Forbidden(Exception):
    pass


@dataclass
class Taxon:
    taxon_id: str
    scientific_name: str
    kingdom: str
    inhouse_code: str | None
    iucn_category: str | None
    sensitive: bool
    common_name: str | None


class Platform:
    def __init__(self, base_url: str, anon_key: str, token: str, client: httpx.AsyncClient):
        self.base = base_url.rstrip("/") + "/rest/v1"
        self.client = client
        self.headers = {"apikey": anon_key, "Authorization": f"Bearer {token}"}

    async def _get(self, path: str, params: dict) -> list:
        res = await self.client.get(f"{self.base}/{path}", params=params, headers=self.headers)
        if res.status_code in (401, 403):
            raise Forbidden("not signed in")
        res.raise_for_status()
        return res.json()

    async def check_member(self, org: str) -> None:
        if not await self._get("organisation", {"select": "id", "id": f"eq.{org}"}):
            raise Forbidden("not a member of this organisation")

    async def species_list(self, org: str, kingdom: str | None = None) -> list[Taxon]:
        rows = await self._get(
            "org_taxon",
            {
                "select": "taxon_id,inhouse_code,iucn_category,sensitive,attributes,"
                "taxon(scientific_name,kingdom,rank,common_names)",
                "organisation_id": f"eq.{org}",
            },
        )
        out = []
        for r in rows:
            t = r.get("taxon") or {}
            if kingdom and t.get("kingdom") != kingdom:
                continue
            names = (r.get("attributes") or {}).get("common_names") or t.get("common_names") or {}
            en = names.get("en") or []
            out.append(
                Taxon(
                    taxon_id=r["taxon_id"],
                    scientific_name=t.get("scientific_name", ""),
                    kingdom=t.get("kingdom", ""),
                    inhouse_code=r.get("inhouse_code"),
                    iucn_category=r.get("iucn_category"),
                    sensitive=bool(r.get("sensitive")),
                    common_name=en[0] if en else None,
                )
            )
        return out

    async def in_collection(
        self,
        org: str,
        taxa: list[str],
        location_id: str | None,
        lon: float | None,
        lat: float | None,
        radius_m: float,
    ) -> dict[str, bool]:
        if not taxa:
            return {}
        res = await self.client.post(
            f"{self.base}/rpc/ai_collection_check",
            headers=self.headers,
            json={
                "p_org": org,
                "p_taxa": taxa,
                "p_location": location_id,
                "p_lon": lon,
                "p_lat": lat,
                "p_radius_m": radius_m,
            },
        )
        res.raise_for_status()
        return {r["taxon_id"]: r["in_collection"] for r in res.json()}
