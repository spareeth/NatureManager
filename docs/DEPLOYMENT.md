# Deploying a test server

How to put the pilot on one Linux server for testing (not production). A formatted version of this guide
is published at https://claude.ai/artifact/PofS4oaPjBxSXZBWh3pF9a. Everything runs on one virtual
machine with Docker: the database and sign-in (self-hosted Supabase), the web app (static files), the
species identify service and a web server (Caddy) that adds HTTPS.

Tested before writing (10 Nov 2026): a fresh install from the migrations and seed, the Hortis import, all
automated tests (database 548, web 234, AI service 13), a browser smoke test of every page for manager,
green team (phone) and curator, and the main field flows (offline observation, work order from an
observation, sensitive species, QR labels). See section 9 for what is known to be incomplete.

## 1. What you need

| Item | Notes |
| --- | --- |
| A Linux server | Ubuntu 24.04, 4 vCPU, 8 GB RAM (16 GB if the species model runs there), 80 GB disk. A Hetzner CX42/CPX41 or similar is enough. |
| Three DNS names pointing to it | for example `nature.example.org` (app), `api.nature.example.org` (database and sign-in), `ai.nature.example.org` (species identify). |
| An email sending account (SMTP) | Sign-in is by magic link, so the server must send email: Microsoft 365, SendGrid, Amazon SES or similar. Without it nobody can sign in. |
| This repository and the git-ignored data | `data/hortis/raw/2026-04-27/` (Hortis export) and `apps/web/public/tiles/` (map layers, about 80 MB). Copy them from your PC. |
| Optional keys | Google Map Tiles API key (Google satellite base map; restrict it to your app domain), Pl@ntNet API key (plant identification). |

Open only ports 22 (SSH), 80 and 443 on the server firewall.

## 2. Prepare the server

```bash
# as a sudo user on the server
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl postgresql-client python3 python3-venv
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt -y install nodejs   # for npx supabase
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out and in again
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

Install Caddy: follow https://caddyserver.com/docs/install#debian-ubuntu-raspbian (one apt repository).

```bash
git clone git@github.com:spareeth/NatureManager.git ~/terragarden_platform
cd ~/terragarden_platform && git checkout phase-3
```

The repository is private: add the server's SSH key to GitHub (Settings, SSH keys) or use a deploy key
first.

## 3. Database and sign-in (self-hosted Supabase)

Follow Supabase's guide for Docker: https://supabase.com/docs/guides/self-hosting/docker. In short:

```bash
git clone --depth 1 https://github.com/supabase/supabase ~/supabase
mkdir -p ~/supabase-project && cp -rf ~/supabase/docker/* ~/supabase-project
cp ~/supabase/docker/.env.example ~/supabase-project/.env
cd ~/supabase-project
```

Edit `~/supabase-project/.env`:

| Setting | Value |
| --- | --- |
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `DASHBOARD_PASSWORD` | new strong values (the guide shows how to generate the JWT secret and the matching `ANON_KEY` and `SERVICE_ROLE_KEY`) |
| `SITE_URL` | `https://nature.example.org` |
| `ADDITIONAL_REDIRECT_URLS` | `https://nature.example.org/**` |
| `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` | `https://api.nature.example.org` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME` | your email account (sender name: Nature OS) |
| `ENABLE_EMAIL_SIGNUP` | `true` (needed for magic links) |
| `DISABLE_SIGNUP` | `true`: only people you add (step 6) can sign in |

In `docker-compose.yml`, set the database image to the same Postgres 17 image used in development
(`supabase/postgres:17.6.1.171` or a later 17.x); the migrations were written and tested on Postgres 17
with PostGIS 3.3 and pg_cron 1.6. Then:

```bash
docker compose pull && docker compose up -d
docker compose ps      # all services healthy; the database container is usually "supabase-db"
```

Keep Studio (the database dashboard on the API address) behind its dashboard password, or block it in
Caddy and use an SSH tunnel.

## 4. Schema, seed and Hortis data

From the repository on the server:

```bash
cd ~/terragarden_platform
export PSQL="docker exec -i supabase-db psql -U postgres -d postgres"

# 4.1 All migrations, in order, recorded so that later updates apply only the new ones.
#     The database port must be reachable from where you run this: expose 5432 to localhost only in the
#     Supabase compose file, or use an SSH tunnel from your PC (ssh -L 54329:localhost:5432 server).
npx supabase@2 db push --db-url "postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres"

# 4.2 Terra, the site, asset types and the 48 beds (no demo users)
scripts/deploy/seed_server.sh

# 4.3 Hortis (77 taxa, 77 accessions, 666 plants); copy data/hortis/raw/2026-04-27/ from your PC first.
#     The scripts need the database port: on the server it is 5432 inside Docker; expose it to localhost
#     only, or run them from your PC through an SSH tunnel (ssh -L 54329:localhost:5432 server).
python3 -m venv ~/.venv-hortis && ~/.venv-hortis/bin/pip install pg8000
DATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres \
  ~/.venv-hortis/bin/python scripts/hortis/migrate.py --org terra
```

Check: `$PSQL -qAt -c "select count(*) from asset"` gives 666.

Later updates: `git pull`, then the same `npx supabase@2 db push --db-url ...`; it applies only the
migrations the server does not have yet. Never edit a migration that is already on the server.

## 5. Web app

Build on your PC (or on the server with Node 22), with the server addresses. Create `.env.server` in the
repository root (git-ignored; never commit keys):

```
VITE_SUPABASE_URL=https://api.nature.example.org
VITE_SUPABASE_ANON_KEY=<ANON_KEY from step 3>
VITE_AI_SERVICE_URL=https://ai.nature.example.org
VITE_PUBLIC_BASE_URL=https://nature.example.org
VITE_GOOGLE_MAPS_API_KEY=<optional>
```

```bash
cp .env.server .env.production.local      # Vite reads it for the production build
npm ci && npm run build -w @terragarden/web
rm .env.production.local
# copy the build and the map layers to the server
rsync -a apps/web/dist/ server:/srv/terragarden/web/
rsync -a apps/web/public/tiles/ server:/srv/terragarden/web/tiles/
```

`VITE_PUBLIC_BASE_URL` is printed on QR labels: set it to the real address before printing any label.

## 6. Map layers, people

```bash
cd ~/terragarden_platform
# Satellite overlays, base maps (CAD plan, Dec 2025 image), per-bed values and tree loss
python3 -m venv ~/.venv-img && ~/.venv-img/bin/pip install pmtiles   # only for building; loading needs none
python3 scripts/imagery/load_layers.py | $PSQL -q -1 -v ON_ERROR_STOP=1
python3 scripts/trees/load_tree_loss.py | $PSQL -q -1 -v ON_ERROR_STOP=1   # needs data/trees/ from your PC

# People: one line per person (they sign in with the link emailed to them)
export SUPABASE_URL=https://api.nature.example.org SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
scripts/deploy/add_member.sh you@expocitydubai.ae manager "Your Name"
scripts/deploy/add_member.sh someone@expocitydubai.ae green_team "Their Name" "Green Team East"
```

`load_layers.py` reads per-bed values from `data/imagery/stats/`; copy `data/imagery/stats/` and
`data/trees/isolated/` from your PC (small files) if you want those values on the server.

## 7. Species identify service and HTTPS

```bash
cd ~/terragarden_platform
export APP_DOMAIN=nature.example.org API_DOMAIN=api.nature.example.org AI_DOMAIN=ai.nature.example.org
export ANON_KEY=<ANON_KEY> PLANTNET_API_KEY=<optional>
docker compose -f deploy/ai.compose.yml up -d --build      # first build downloads about 2.5 GB
curl -s localhost:8088/health                              # {"status":"ok",...}

sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i "s/app.example.org/$APP_DOMAIN/; s/api.example.org/$API_DOMAIN/; s/ai.example.org/$AI_DOMAIN/" /etc/caddy/Caddyfile
sudo mkdir -p /srv/terragarden/web && sudo chown -R $USER /srv/terragarden
sudo systemctl reload caddy
```

The identify service needs about 3 GB of memory for the BioCLIP model. On a small server, leave it out:
the app still works, and "Identify species" says the service did not answer.

## 8. Check it works

1. Open `https://nature.example.org`: the sign-in page loads over HTTPS.
2. Sign in as the manager you added: the email arrives, the link opens the map with 48 beds and 666 plants.
3. More, Biodiversity and Water: figures and maps load; switch the overlay and the base map.
4. On a phone: open the app, add it to the home screen, sign in as a green team member, open My day,
   Observe a plant, take a photo, Identify species, Save. Turn on flight mode, save another observation,
   turn it off: the bar shows the change sent.
5. Work orders: report a problem from the map; as manager, schedule it; as the green team member,
   start and complete it; as field manager, verify it.
6. Print a QR label from an asset page and scan it with the phone camera: the asset opens.
7. Every night at 00:30 Dubai the preventive jobs are generated (pg_cron); the next morning, check
   Planning for new jobs.

Backups: on the server, a daily dump with
`docker exec supabase-db pg_dump -U postgres -Fc postgres > ~/backups/nature_$(date +%F).dump`
(add it to `crontab -e`), and copy the dumps off the server.

## 9. Known limits of this test build

- The test server is for testing only: no high availability, backups as above.
- The main web bundle is 1.6 MB (475 kB compressed); first load on a slow phone connection takes a few
  seconds. Splitting it by page is a later improvement.
- react-router 6 has a moderate advisory (open redirect via a backslash in links); the app builds its own
  links, so the exposure is low. Upgrade to version 7 later.
- Members cannot be added in the app yet: use `scripts/deploy/add_member.sh`.
- Map layers in `/tiles/` are readable by anyone who knows the address (no sign-in). Fine for a test;
  for production, serve them behind sign-in.
- The satellite analyses (vegetation change, tree loss) are exploratory research layers; see their notes.
- Push notifications, sensor data and the Darwin Core export (tasks 3.7, 3.8, Phase 4) are not built yet.
