"""Pl@ntNet identify API (docs/AI_INTEGRATION.md). Results are cached by image hash."""

import hashlib
from collections import OrderedDict

import httpx

from app.engines import Image, Scored

PLANTNET_ORGANS = {"leaf", "flower", "fruit", "bark", "habit", "auto"}


class PlantNetError(Exception):
    pass


class PlantNet:
    def __init__(self, api_key: str, url: str, client: httpx.AsyncClient, cache_size: int = 500):
        self.api_key, self.url, self.client = api_key, url, client
        self._cache: OrderedDict[str, Scored] = OrderedDict()
        self.cache_size = cache_size

    @staticmethod
    def cache_key(images: list[Image]) -> str:
        h = hashlib.sha256()
        for im in images:
            h.update(hashlib.sha256(im.data).digest())
            h.update(im.organ.encode())
        return h.hexdigest()

    async def identify(self, images: list[Image]) -> Scored:
        key = self.cache_key(images)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        files = [
            ("images", (f"img{i}.jpg", im.data, im.content_type)) for i, im in enumerate(images)
        ]
        data = {"organs": [im.organ if im.organ in PLANTNET_ORGANS else "auto" for im in images]}
        try:
            res = await self.client.post(
                self.url,
                params={"api-key": self.api_key, "nb-results": 10, "lang": "en"},
                files=files,
                data=data,
                timeout=30,
            )
        except httpx.HTTPError as e:
            raise PlantNetError(str(e)) from e
        if res.status_code == 404:  # Pl@ntNet: "Species not found"
            out: Scored = []
        elif res.status_code != 200:
            raise PlantNetError(f"status {res.status_code}")
        else:
            out = [
                (r["species"]["scientificNameWithoutAuthor"], float(r["score"]))
                for r in res.json().get("results", [])
            ]
        self._cache[key] = out
        if len(self._cache) > self.cache_size:
            self._cache.popitem(last=False)
        return out
