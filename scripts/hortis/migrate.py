"""Run the whole Hortis migration in order (docs/HORTIS_MIGRATION.md section 1, steps 2 to 7).

    python scripts/hortis/migrate.py --org terra --dry-run   # stage, transform, validate, promote rolled back
    python scripts/hortis/migrate.py --org terra             # ... promote committed, then reconcile

Stops before promote if validation finds rejects. Safe to re-run (upserts on legacy keys).
"""

from __future__ import annotations

import argparse
import sys

import promote
import reconcile
import stage
import transform
import validate


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--org", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print("stage:", stage.stage(stage.RAW))
    print("transform:", transform.transform())
    flags = validate.validate(args.org)
    print("validate:", flags)
    if flags["REJECTS"]:
        print("rejects found: fix them, nothing promoted", file=sys.stderr)
        return 1
    for k, v in promote.promote(args.org, args.dry_run).items():
        print(f"promote {k:11} inserted {v['inserted']:4d} updated {v['updated']:4d}")
    if args.dry_run:
        print("DRY RUN: promote rolled back; reconciliation skipped")
        return 0
    entities, checks, ok = reconcile.reconcile(args.org)
    print("reconciliation:", reconcile.write(entities, checks, ok, args.org), "OK" if ok else "COUNTS DIFFER")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
