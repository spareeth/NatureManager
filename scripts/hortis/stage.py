"""Step 2: load the three Hortis CSV files as text into staging_hortis (docs/HORTIS_MIGRATION.md).

    python scripts/hortis/stage.py [--raw data/hortis/raw/2026-04-27]

Each run replaces the raw_* tables. Raw files are never edited.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from db import connect
from hortis_lib import RAW, read_csv

FILES = {"raw_taxa": "taxa.csv", "raw_accessions": "accessions.csv", "raw_materials": "materials.csv"}


def col(name: str) -> str:
    """Hortis header to a SQL column name: 'Tag number' -> tag_number."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def stage(raw: Path) -> dict[str, int]:
    con = connect()
    counts = {}
    try:
        con.run("begin")
        for table, fname in FILES.items():
            data = read_csv(raw / fname)
            headers = list(data[0].keys())
            cols = [col(h) for h in headers]
            con.run(f"drop table if exists staging_hortis.{table}")
            con.run(
                f"create table staging_hortis.{table} (row_no int primary key, "
                + ", ".join(f"{c} text" for c in cols)
                + ")"
            )
            placeholders = ", ".join(f":p{i}" for i in range(len(cols) + 1))
            sql = f"insert into staging_hortis.{table} (row_no, {', '.join(cols)}) values ({placeholders})"
            for n, r in enumerate(data, start=1):
                params = {"p0": n} | {f"p{i + 1}": (r[h] or None) for i, h in enumerate(headers)}
                con.run(sql, **params)
            counts[table] = len(data)
        con.run("commit")
    except Exception:
        con.run("rollback")
        raise
    finally:
        con.close()
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, default=RAW)
    args = ap.parse_args()
    for table, n in stage(args.raw).items():
        print(f"staged {n:4d} rows into staging_hortis.{table}")


if __name__ == "__main__":
    main()
