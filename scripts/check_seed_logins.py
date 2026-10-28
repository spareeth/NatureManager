"""Check that every seeded user can sign in by magic link and sees their own membership.

Uses the local Supabase stack and .env.local. For each user: admin generate_link (no email is
sent, so the local email rate limit does not apply), verify the token like the magic link does,
then read membership with the user's session through RLS.

    python scripts/check_seed_logins.py
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "owner@terra.test": ["owner"],
    "manager@terra.test": ["manager"],
    "fieldmanager@terra.test": ["field_manager"],
    "curator@terra.test": ["curator"],
    "green1@terra.test": ["green_team"],
    "green2@terra.test": ["green_team"],
    "engineer1@terra.test": ["field_engineer"],
}


def load_env() -> dict[str, str]:
    env = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def call(method: str, url: str, headers: dict[str, str], body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def main() -> int:
    env = load_env()
    base, anon, service = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"]
    admin = {"apikey": service, "Authorization": f"Bearer {service}"}
    failures = 0
    for email, roles in EXPECTED.items():
        try:
            link = call("POST", f"{base}/auth/v1/admin/generate_link", admin,
                        {"type": "magiclink", "email": email})
            token_hash = link.get("hashed_token") or link["properties"]["hashed_token"]
            session = call("POST", f"{base}/auth/v1/verify", {"apikey": anon},
                           {"type": "magiclink", "token_hash": token_hash})
            user = {"apikey": anon, "Authorization": f"Bearer {session['access_token']}"}
            rows = call("GET", f"{base}/rest/v1/membership?select=roles,organisation(slug)&user_id=eq.{session['user']['id']}", user)
            got = [(r["organisation"]["slug"], r["roles"]) for r in rows]
            ok = got == [("terra", roles)]
            print(f"{'ok ' if ok else 'FAIL'} {email:26} {got}")
            failures += not ok
        except Exception as exc:  # noqa: BLE001 - report and continue with the next user
            print(f"FAIL {email:26} {exc}")
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
