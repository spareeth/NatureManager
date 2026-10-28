"""Database connection for the migration scripts (pg8000, BSD-3). Reads DATABASE_URL from the
environment or the repo's .env.local. The scripts connect as the database owner: staging
tables are not exposed to clients, and promote writes for one named organisation."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import unquote, urlparse

import pg8000.native

ROOT = Path(__file__).resolve().parents[2]


def database_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("DATABASE_URL not set (see .env.example)")


def connect() -> pg8000.native.Connection:
    u = urlparse(database_url())
    return pg8000.native.Connection(
        user=unquote(u.username or "postgres"),
        password=unquote(u.password or ""),
        host=u.hostname or "127.0.0.1",
        port=u.port or 5432,
        database=(u.path or "/postgres").lstrip("/"),
    )


def rows(con: pg8000.native.Connection, sql: str, **params) -> list[dict]:
    result = con.run(sql, **params)
    cols = [c["name"] for c in con.columns] if con.columns else []
    return [dict(zip(cols, r, strict=True)) for r in result or []]
