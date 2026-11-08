> 🇺🇸 English | [🇧🇷 Português (Brasil)](./CHANGELOG.pt-BR.md)

# Changelog

All notable changes to this project are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has no version numbers yet: each entry is a milestone, with its date and commits.

## Unreleased · TV mode, visitors and newspaper

Not committed yet.

### Added
- `/api/estado` gained `config_v`: 12 hex characters that change when a configuration file changes (`times.json` and, in `dados/`, the brand, logo, floor plan, weather, holidays and team). It comes only from each file's size and date, without reading its contents. TV mode reloads the page when it changes.
- **Visitors:** `/api/estado` gained `visitantes`, the list of who else has the office open, with only an anonymous id and a color (`?invisivel=1` watches without showing up). See [Security](./README.md#security). The preview gained `--visitantes N`.

## Unreleased · Connect, Docker and Settings

Connect and Docker in commit [`cf29e8c`](https://github.com/HelbertMoura/escritorio-agentes/commit/cf29e8c); the weather city and the holidays in [`13b91a2`](https://github.com/HelbertMoura/escritorio-agentes/commit/13b91a2); the teams and Sign out of all devices, not committed yet.

### Added
- **Connect from the screen:** `/api/estado` gained the `conexao` field (`carregando`, `conectado`, `sem_conexao`, `recusada`, `pausa` or `falha`), and `/api/config` gained `base`. When you come back from the authorization, the first read happens right away. See [Connect to agentes.chat](./README.md#connect-to-agenteschat).
- **Docker and Coolify:** `Dockerfile`, `.dockerignore` (an allowlist) and a `docker-compose.yml` with no published ports, plus the new `ESCRITORIO_BIND` variable (`127.0.0.1` or `0.0.0.0`). See [Docker and Coolify](./README.md#docker-and-coolify).
- **Weather city from the screen:** search by name (Open-Meteo's geocoding, through the server, at 10 searches per minute and 200 per day), **Sem clima** and **Voltar ao times.json**, in `dados/clima.json`. Changing the city no longer needs a restart.
- **Holidays from the screen:** turn off any of the 13 built-in dates and create up to 24 of your own (every year or once, 1 to 14 days, with a theme and lines), in `dados/festas.json`.
- **Teams and appearance from the screen**, in `dados/equipe.json` (they replace the ones in `times.json`; **Voltar ao times.json** deletes the file).
- **Sign out of all devices**: with the password again, ends every session.
- `ferramentas/agentes_falso.py`: a fake agentes.chat, on `127.0.0.1` only, to test the whole Connect flow and each failure without the real account. The preview gained `--conexao <state>`.

### Changed
- HTTP 402 and 403 on the read no longer show up as a network failure: they become `recusada`, with the code and the office's own text, like 401. While the refusal goes on, the read waits from 30 s up to 5 min instead of repeating every 30 s.
- Errors on `/oauth/conectar` and `/oauth/retorno` become a short page that says why and offers to try again.
- Signing in from an address other than `ESCRITORIO_BASE` shows the right address on the sign-in screen.
- `ESCRITORIO_BASE` must be the origin only (no path or trailing slash, lowercase host). Otherwise, the service does not start and says why. A trailing slash is no longer silently cut.

### Security
- The `error_description` and the body of agentes.chat responses never reach the screen, and the log keeps only the error code.
- `POST /api/clima` and `POST /api/festas` follow the `POST /api/planta` mold: strict origin, a session, JSON only, a body cap, all or nothing (no `NaN`, `Infinity` or `true` as a number) and an atomic write under a lock; the holidays with `rev`. The city search only talks to Open-Meteo, without redirects, and the log keeps neither the city nor the search.
- With `ESCRITORIO_BIND=0.0.0.0`, `ESCRITORIO_BASE` is required. The image runs as its own user, with no shell, and the compose file runs it read-only, with no capabilities and limited memory. The README now covers what changes with a [public address](./README.md#public-address).

## 2026-11-06 · Construction mode v1

Release [`v2026.11.06`](https://github.com/HelbertMoura/escritorio-agentes/releases/tag/v2026.11.06), with the launch video (narrated in Brazilian Portuguese, with subtitles). Commits [`4860c88`](https://github.com/HelbertMoura/escritorio-agentes/commit/4860c88) and [`26192a6`](https://github.com/HelbertMoura/escritorio-agentes/commit/26192a6).

### Added
- **Construction mode** (`construir.html`, opened from **Customize**): paint the wall and the floor of each room; move, mirror, remove and add furniture from a catalog of 53 decorations (new pieces are decoration only: nobody sits on them). See [Construction mode](./README.md#construction-mode).
- Undo and redo (up to 100 steps), **Discard**, **Back to automatic** (with a confirmation dialog) and **Save**, which is blocked while a seat has no way in and marks that seat on the map.
- Everything works without dragging and from the keyboard: Tab and Enter pick a piece, the arrows move it (8 px; Shift: 1 px), `E` mirrors and `Delete` removes. Changes are announced to screen readers.
- The plan is saved on the server, in `dados/planta.json`, through `POST /api/planta`, and the same plan reaches every screen on reload. It is applied on top of the automatic building: with an empty plan, the building is identical to before.
- `construir.html?demo=1`: a demo of the editor with its own example, where nothing is saved.
- Tests in `test_planta.py` and checks for the new route in `ferramentas/checar_seguranca.py`; `ferramentas/checar_planta_mapa.mjs` compares the building with and without a plan.

### Changed
- The ping-pong table sits 12 px higher, so the player at the bottom has a way through. This changes the automatic building of every office, even without a plan.

### Security
- `POST /api/planta`: `Origin` must match the server address (no fallback to the `Referer`), a session is required, JSON only (415 otherwise), a body of up to 64 KB, all-or-nothing validation (the same on read and on save), and the current `rev` (409 when another screen saved first). Writing happens under a lock, with the atomic 0600 write; the log keeps counts, never the content.
- An unreadable or invalid `planta.json` falls back to the automatic building, with one line in the log; a bad plan never takes the page down.
- Every `POST` reads its body (up to 128 KB) before answering, so a refusal reaches the client instead of a connection reset; each route keeps its own size cap.
- The ring, the scoreboard board, the logo panel and the signs cannot be edited, and nothing moved or added may cover them.

## 2026-11-06 · Social life, part 2: strike, complaints, gossip and deliveries

Commit [`5dbdc73`](https://github.com/HelbertMoura/escritorio-agentes/commit/5dbdc73).

### Added
- **Complaints and suggestions** in speech bubbles, and **gossip** by the water cooler ("Psiu…"), with no name in the bubble. They change friendships.
- **Strike** in the lounge, at most one a day: free agents sit on the floor in front of the ring holding cardboard signs, with a notice above the map and the **Atender o pedido** ("meet the demand") button. Clicking a sign does the same.
- **Deliveries**, one per demand: the pizza rider arrives by motorbike, a courier brings coffee, a cake with a candle, a new beanbag, a router, pillows, the air conditioning at 23 or a "Sexta livre aprovada!" banner with a little party. The same on every screen, drawn in pixel art and with their own sounds.
- `POST /api/social/greve/atender`, with the same rules as the other social routes.
- Tests T-G1 to T-G5 and accessibility for the strike notice.

### Changed
- **Serious mode** also pauses strikes and deliveries. Agents who are working or waiting for you never leave their desk.

## 2026-11-06 · Social life, part 1: friendships, the Ring and the weekly scoreboard

Commit [`81ba7b5`](https://github.com/HelbertMoura/escritorio-agentes/commit/81ba7b5).

### Added
- **Friendships and rivalries** for each pair of agents, decided by the server (`social.py`) and the same on every screen.
- **The Ring** in the lounge: automatic fights and **Send to the ring** from an agent's card, with a gong, a crowd, a cartoon dust cloud, sounds, the winner's banner and making up later. Only free agents take part.
- **Weekly scoreboard** (Monday to Sunday, Brasília time), with the top 3 on a board on the ring's wall, the full ranking when you click it and last week's champion. Saved in `dados/placar.json`.
- **Serious mode** in **Customize**, which pauses the whole social life.

## 2026-11-05 · Conversations, reply mode and opening hours

Commits [`0d13e25`](https://github.com/HelbertMoura/escritorio-agentes/commit/0d13e25) and [`cdec3b7`](https://github.com/HelbertMoura/escritorio-agentes/commit/cdec3b7).

### Added
- **Conversations** page (`"conversas": "ler"`, off by default): today's list (waiting for you, working, finished today) and each task's conversation read from its thread, within the daily agentes.chat budget.
- Optional **reply mode** (`"conversas": "responder"`, off by default): send messages in the day's direct conversations, with the "read and send tasks" scope, the password asked once, a 1-hour mode (8-hour cap) per browser, limits, a log without content and protection against duplicate sends.
- **Opening hours** in **Customize**, with a banner and a sign on the map, including shifts past midnight.
- Animated demo at the top of the READMEs, with a still image for "reduce motion".

### Changed
- The full-screen map now starts below the top banner, so the controls are not covered.
- Tests isolated from local files; documentation screenshots retaken.

### Removed
- The 3D model view and three.js.

## 2026-11-04 · First public release

Commit [`54c329b`](https://github.com/HelbertMoura/escritorio-agentes/commit/54c329b).

### Added
- Live pixel-art office for agentes.chat agents: a procedural map from 1 to 20 teams, agent life and sounds, approvals with the day's history, brand customization, simulation of date, time and weather, a 3D model view, photo mode and demo mode.
- Python server (standard library only), reachable only on the tailnet, with a one-time first-access code and failing closed when the user file cannot be read.
- License AGPL-3.0-or-later.
