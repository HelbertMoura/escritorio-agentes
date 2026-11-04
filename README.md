> 🇺🇸 English | [🇧🇷 Português (Brasil)](./README.pt-BR.md)

<div align="center">

# Escritório de agentes

### A live pixel-art office for your [agentes.chat](https://agentes.chat) team

**See who is at their desk, who is playing pool in the lounge and who is waiting for your approval. Read-only, every 15 seconds, no AI and no tokens spent.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](./LICENSE)
![Python 3.10+ stdlib only](https://img.shields.io/badge/Python-3.10%2B%20stdlib-3776ab?labelColor=1a1a1d)
![No build step](https://img.shields.io/badge/front--end-vanilla%20JS%20%2B%20canvas-f7df1e?labelColor=1a1a1d)
[![Made for agentes.chat](https://img.shields.io/badge/made%20for-agentes.chat-f5b83d?labelColor=1a1a1d)](https://agentes.chat)

<img src="./docs/screenshots/01-escritorio-dia.png" alt="The demo office by day: a pixel-art building with six team rooms, a meeting room, a lounge with games and a kitchen, a street with cars below, and the 'Waiting for you' and 'Working now' panels under the map" width="900">

[Features](#features) · [Screenshots](#screenshots) · [Install](#install) · [Customize](#customize-white-label) · [Security](#security) · [Architecture](#architecture) · [Development](#development) · [Contributing](./CONTRIBUTING.md) · [Code of Conduct](./CODE_OF_CONDUCT.md)

</div>

---

## What it is

Escritório de agentes ("agents' office") is a small self-hosted web page that turns your agentes.chat workspace into a living office. It reads agentes.chat through the external apps connector (MCP, **read-only** OAuth scope) every 15 seconds and draws your team as pixel-art people in a building that assembles itself from your teams.

It **does not call any AI model** and does not spend tokens. Approving and answering always happens in agentes.chat: the office only shows what is going on and links you there.

**Who it is for:** teams and companies that run agents on [agentes.chat](https://agentes.chat) and want a glanceable, fun view of the team: on a wall screen, a second monitor or a phone. It is white-label: any company can install its own copy and brand it.

## Features

- 🏢 **A building made from your teams:** reception with your logo, one room per team (it grows with the number of agents), corridor, meeting room, lounge and kitchen. A new agent gets a desk in the "New" room.
- 🧑‍💻 **Live map:** agents go to their desk and type when they get a task. When they are free they play arcade, video games, pool, foosball and ping-pong, play the piano, grab a coffee or chat in pairs. They arrive in the morning and leave at night through the front door.
- ✋ **Approvals at a glance:** a "!" or "?" over anyone waiting for your approval or answer, and a **"Waiting for you"** list with how long each request has been waiting. Each one opens the right request in agentes.chat (approving is always done there).
- 🎵 **Life and sounds:** 16 poses, games in pairs with a scoreboard, darts, basketball, a jukebox and more. Optional sounds (keyboard, "simlish" chatter with a voice per agent, games, alerts, rain and thunder), with a volume control and on/off per category. Audio only starts after you interact with the page.
- 🌦️ **Real time and weather:** day and night follow the real clock, empty rooms turn their lights off and windows show the sky of the hour. Real weather for your city ([Open-Meteo](https://open-meteo.com), no key): rain, drizzle, thunderstorm, snow, fog, overcast.
- 🎉 **Holidays:** Christmas, New Year (fireworks), Carnival and Easter (calculated), Lunar New Year, Halloween, Festa Junina, Brazilian Independence Day, Programmers' Day, Diwali and more, with decorations, hats and lines.
- 🎨 **Customization:** company name, accent color and logo from the **Customize** screen; teams, rooms, floors, walls, icons and avatars in `times.json`.
- 🕹️ **Simulation:** a panel to preview the office on another date, time or weather (Christmas at night in the snow, for example). Nothing is saved: it only changes the URL of that tab, and a "Simulation" banner stays visible with "Back to real".
- 🧊 **3D diorama (optional):** a voxel view of the same office, built with three.js and loaded only when you open it (needs WebGL 2; without it the button does not show up).
- 📸 **Photo mode:** hides the interface and saves a PNG of the office.
- 🧪 **Demo mode:** `?demo=1` shows fictional agents and an accelerated day, with nothing sent to or read from the server. Good for trying it out and for screenshots.
- 🎥 **Camera:** zoom with the wheel or pinch, drag, double-click to focus a room, "Go to…" an agent (`/` or `Ctrl+K`), and keyboard shortcuts (`+`, `-`, `0`).
- 📱 **Phone friendly**, with clickable objects that also work with the keyboard and touch.
- 🔒 **Login** with username and password, published **only on your Tailscale network**.

## Screenshots

All screenshots come from **demo mode** (fictional agents and data), never from a real workspace. The full list, with how each one was taken, is in [`docs/screenshots/README.md`](./docs/screenshots/README.md).

<table>
  <tr>
    <td width="50%" align="center">
      <a href="./docs/screenshots/02-esperando-voce.png"><img src="./docs/screenshots/02-esperando-voce.png" alt="Approvals at a glance: a '!' over Bento, who is waiting for approval, and a '?' over Aurora, who has a question; the 'Waiting for you' list shows both requests with Review and Answer buttons" width="100%"></a>
      <p><em>Approvals at a glance: "!" and "?" on the map and the "Waiting for you" list.</em></p>
    </td>
    <td width="50%" align="center">
      <a href="./docs/screenshots/03-noite-chuva.png"><img src="./docs/screenshots/03-noite-chuva.png" alt="The office at night in the rain: dark, empty team rooms, street lamps on and the whole team chatting and playing in the lounge" width="100%"></a>
      <p><em>Night and rain: lights go off in empty rooms and the street lamps come on.</em></p>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="./docs/screenshots/04-natal-neve.png"><img src="./docs/screenshots/04-natal-neve.png" alt="Christmas night in the snow: a Christmas tree at reception and in the lounge, agents chatting in the meeting room and in the lounge with speech bubbles" width="100%"></a>
      <p><em>Holidays: Christmas night in the snow, from the Simulation panel.</em></p>
    </td>
    <td width="50%" align="center">
      <a href="./docs/screenshots/05-maquete-3d.png"><img src="./docs/screenshots/05-maquete-3d.png" alt="The 3D diorama: a voxel version of the same office, rooms, furniture, trees and the street, seen at an angle from above under a blue sky" width="100%"></a>
      <p><em>The optional 3D diorama, built with three.js.</em></p>
    </td>
  </tr>
</table>

<p align="center">
  <img src="./docs/screenshots/09-celular.png" alt="The office on a phone: the map at the top with agents and speech bubbles, and the 'Waiting for you' list with Review and Answer buttons below" width="300">
</p>

## Install

Requirements: Linux with systemd, Python 3.10+ and [Tailscale](https://tailscale.com) with MagicDNS and HTTPS enabled.

**DNS:** the service only reaches the public internet. Its systemd unit blocks private addresses (`IPAddressDeny`), and that includes a DNS resolver on a private IP, such as the VPC resolver on AWS or `169.254.169.254` on GCP and Oracle. The systemd-resolved stub (`127.0.0.53`) and Tailscale MagicDNS (`100.100.100.100`) are allowed. Without a resolver it can reach, the office never reads agentes.chat, and `journalctl -u escritorio` shows name-resolution errors. To fix it, use systemd-resolved (with `/etc/resolv.conf` pointing to `127.0.0.53`) or allow only your resolver's address in a drop-in, which survives reinstalls (`sudo systemctl edit escritorio`):

```ini
[Service]
IPAddressAllow=<your resolver IP>/32
```

On GCP and Oracle, `169.254.169.254` is also the metadata server, so prefer systemd-resolved there.

```bash
sudo AGENTES_ORG=<your organization id> bash instalar.sh
```

At the end, in a terminal, the installer shows the **first-access code**. To see it again, run `sudo escritorio-codigo`. The code works once, only while no user exists, and does not expire. When the output is not a terminal (automation, `| tee`), the code is not printed: run `sudo escritorio-codigo` afterwards.

The organization id is what comes after `/org/` in your agentes.chat address. Without it neither the installer nor the server starts: it is what filters links to your organization.

The service listens on `127.0.0.1:737`, a privileged port, so no regular user on the machine can grab it while the service restarts. To use another one, pass `ESCRITORIO_PORTA=<port below 1024>`. The installer stops if `net.ipv4.ip_unprivileged_port_start` is below 1024, and the service will not start in that case either.

The source-code address the page offers its users (AGPL section 13) is this repository by default; if you run a modified version, pass `ESCRITORIO_FONTE=<https address of your code>` (a plain `https://` address, up to 200 characters, without quotes or spaces; the installer refuses anything else).

The installer publishes the `/` path of port 443 of this machine on your tailnet (`tailscale serve`). If that route already publishes something else, it stops without changing anything, so it never takes down what is already there. This also applies when reinstalling with another `ESCRITORIO_PORTA`: free port 443 first (see `tailscale serve status`).

**Reinstalling or updating:** run the installer again with the same variables. It rewrites `/etc/escritorio.env` every time, so `ESCRITORIO_PORTA` and `ESCRITORIO_FONTE` go back to their defaults when left out (in a fork, the source-code link would point back to this repository). Users, sessions, tokens and `/opt/escritorio/times.json` are kept.

Open `https://<your-machine>.<your-tailnet>.ts.net/`, use the code to create your username and password, then open `/oauth/conectar` to authorize read access in agentes.chat. On a phone, the Tailscale app turned on is all you need.

## Customize (white-label)

From the **Customize** screen: company name, accent color and logo (PNG, JPEG or WEBP).

In `times.json` (start by copying `times.exemplo.json`; the installer does that if there is no `times.json`):

| Field | What for |
|---|---|
| `empresa`, `cor` | default name and color (the Customize screen overrides them). Without a name anywhere, the page shows a placeholder name tagged "example" |
| `times[]` | `nome`, `tipo` (`mesas`, `ops`, `gabinete`), `cor`, `icone` (`codigo`, `megafone`, `servidor`, `coroa`, `grafico`, `pincel`, `estrela`…), `parede` (0–5), `piso` (0–9) and `agentes` (agentes.chat handles) |
| `aparencia` | per handle: `color`, `eyes`, `accessory`, the same as in agentes.chat. Anyone not listed gets an automatic look of their own |
| `clima` | `cidade`, `lat`, `lon` for real weather, from Open-Meteo (see the terms in [Third-party](#third-party)). Without `clima`, the weather is off and the sky stays clear |

To test without waiting, add to the URL: `?hora=21.5`, `?clima=tempestade` (`chuva`, `garoa`, `neve`, `neblina`, `nublado`, `limpo`), `?data=2026-12-25` and `?visao=maquete` (3D). The **Simulation** panel builds these for you.

## Security

In short: the office is reachable **only on your tailnet**, it **fails closed** when its user file cannot be read, and **no secret ever reaches the browser**: the agentes.chat token stays on the server, and the browser only holds an HttpOnly session cookie.

- **Read-only on agentes.chat:** OAuth scope `read`. A token with more permissions is refused.
- **Passwords and sessions:**
  - passwords are stored as scrypt hashes (N=2^15, r=8, p=1), and the session travels in a `__Host-esc_sessao` cookie, HttpOnly, SameSite=Lax and Secure;
  - every form submission is checked by origin;
  - there is an attempt limit: 8 errors every 15 minutes per user (non-existent users share one limit, and the first access has its own). The counter lives in memory, so restarting the service resets it.
- **Revoke sessions** (for example, after changing computers or suspecting theft):

  ```bash
  sudo systemctl stop escritorio
  sudo rm /var/lib/escritorio/sessoes.json
  sudo systemctl start escritorio
  ```

  To start from scratch, also delete `usuarios.json`: the service creates a new first-access code, and no old session works again, even if you recreate the same username.
- **The first-access code leaked** before you created your user: create the user right away, which deletes the code. Or replace the code:

  ```bash
  sudo rm /var/lib/escritorio/codigo-primeiro-acesso.txt
  sudo systemctl restart escritorio
  sudo escritorio-codigo
  ```
- **Unreadable `usuarios.json`:** if the file exists and cannot be read (permissions, empty file or broken JSON), the service does not start and the journal says why (`journalctl -u escritorio`). This way a corrupted file never reopens the first access. To get out: fix the owner and permissions (`escritorio`, 0600) or restore the backup. To start from scratch, delete the file.
- **Branding on the sign-in screen:** the company name, color and logo are shown to anyone who reaches the page on the tailnet, before login. The logo only accepts PNG, JPEG and WEBP, up to 600 KB. Prefer an image without sensitive metadata (EXIF, GPS).
- **Network:** the service listens only on 127.0.0.1, on a privileged port, and Tailscale publishes it.
- **System:** runs as its own user with a hardened systemd unit. Tokens, passwords and the logo live in `/var/lib/escritorio` (0700).

Found a vulnerability? Please read [SECURITY.md](./SECURITY.md) and report it privately.

## Architecture

```
agentes.chat (MCP, OAuth "read")
        ▲  every 15 s
        │
escritorio.py ── 127.0.0.1:737 ── tailscale serve (HTTPS, tailnet only) ──▶ browser
   │  stdlib HTTP server, login, OAuth + PKCE, MCP reader, weather, branding
   └─ acesso.py: users (scrypt), sessions, first access
```

- **Server:** Python 3 standard library only (`escritorio.py`, `acesso.py`). No database: a few files in the data folder.
- **Front-end:** vanilla JavaScript and canvas, no build step (`static/`). `app.js` (UI, camera, panels), `mapa.js` (procedural building, furniture collision, doors), `vida.js` (agent life), `avatar.js`, `efeitos.js`, `ceu.js`, `clima.js`, `festas.js`, `som.js` (WebAudio), `simular.js`, `brincar.js` (clickable objects, photo mode, demo), `personalizar.js`, `maquete.js` (3D, loaded on demand) and `entrar.*` (sign-in).
- **Install:** `instalar.sh` sets up the user, files, a hardened systemd unit and `tailscale serve`.

### Transition log

On every read (15 s), the server compares tasks with the previous read, by `run_id`, and keeps in memory since when each one has been in its current status. That produces the recent events (at most 50): `comecou`, `pediu_aprovacao`, `pediu_resposta`, `voltou_a_trabalhar` and `terminou`, with time, agent handle and `run_id`, without any conversation content. The first read after starting is only the baseline, with no events. Nothing goes to disk: restarting the service clears the log, and "since" starts again at the first read.

## Development

```bash
python -m unittest test_escritorio
ESCRITORIO_TIMES=times.exemplo.json python ferramentas/previa.py ferramentas/previa.exemplo.json   # local preview at http://127.0.0.1:7372, no login
python -B ferramentas/checar_seguranca.py .  # checks login, origin, cookie and attempt limit
node ferramentas/estresse_vida.mjs [url] [--minutos 40] [--acoes]  # agent-life regression on the preview (headless Chrome/Edge); exits 1 if it finds something
```

`ferramentas/previa.exemplo.json` holds fictional MCP responses (`agents` and `tasks`, with the handles of `times.exemplo.json`) to test without connecting; `ESCRITORIO_TIMES` makes the rooms of the example show up. To test with your own workspace, copy its responses to `dados.json`, which git ignores, and run `python ferramentas/previa.py dados.json`. The preview rereads the file when it changes: to see events live, change a task's `status` or remove and add tasks. Another port: `PREVIA_PORTA=7373`.

### Art

- Furniture and objects: generated with [PixelLab](https://pixellab.ai) for this project (`arte/pixellab`).
- Floors, walls, desks, avatars, sky, weather and procedural decorations: drawn in code.
- Default logo (`static/logo.png`, also the favicon): drawn in code, with `python ferramentas/montar_tema.py --logo`.

To change the art, build another atlas with `python ferramentas/montar_tema.py <PNG folder>`; the map uses the atlas names and skips whatever is missing.

The art (`arte/pixellab` and `static/tema`) is released under the same license as the project, the AGPL-3.0-or-later. The [PixelLab terms of service](https://www.pixellab.ai/termsofservice) (updated on 2026-10-30) give whoever generates the images their ownership and allow them to "use, modify, and distribute the outputs from our tools for any purpose", except for training other models without PixelLab's explicit permission.

## Third-party

- **three.js 0.186.1** (MIT, license in `static/vendor/three-0.186.1/LICENSE`): `three.module.js` and `three.core.js` copied unchanged from `build/` of the npm package `three@0.186.1`, served only after login and with an immutable cache (the version is in the path). No CDN.

  | File | sha256 |
  |---|---|
  | `three.module.js` | `9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea` |
  | `three.core.js` | `9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6` |
  | `LICENSE` | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |

  `test_escritorio.py` checks these hashes. To update: `npm pack three@<version>`, compare the tarball `integrity` with the registry's, copy `package/build/three.module.js`, `package/build/three.core.js` and `package/LICENSE` into a new folder `static/vendor/three-<version>/` and change the path in `ARQUIVOS` (escritorio.py), in `instalar.sh`, in the diorama import and in the hashes of the test and of this table.
- **Fonts** Figtree, Silkscreen, Source Sans 3 and Doto: SIL Open Font License 1.1 (`static/fontes`, licenses in `static/fontes/OFL-*.txt`).
- **Weather:** [Open-Meteo](https://open-meteo.com) (no key), with data under CC BY 4.0. Its free API is **for non-commercial use only** ([terms](https://open-meteo.com/en/terms)): a company, or a site with subscriptions or ads, needs a paid Open-Meteo plan or its own Open-Meteo server ([open source](https://github.com/open-meteo/open-meteo)). This server calls the free address (`api.open-meteo.com`, in the `Clima` class of `escritorio.py`), so either option means changing that address (and adding the plan's key). Otherwise, turn the weather off: remove `clima` from `times.json` (`/opt/escritorio/times.json` after installing) and restart the service.

## License

Copyright (C) 2026 Dev Maniac's. Licensed under the [GNU Affero General Public License v3.0 or later](./LICENSE). If you run a modified version of this office for other people over a network, the AGPL requires you to offer them the source code of your version (section 13): set `ESCRITORIO_FONTE` to it (see [Install](#install)).

## Made for agentes.chat

Built for [agentes.chat](https://agentes.chat), with permission from its developers. A partnership **agentes.chat + [Dev Maniac's](https://devmaniacs.com.br)**.

## Acknowledgements

- The agentes.chat team, for the read-only MCP connector and for supporting an open-source office.
- [three.js](https://threejs.org), [Open-Meteo](https://open-meteo.com), [Tailscale](https://tailscale.com) and [PixelLab](https://pixellab.ai).
- The designers of Figtree, Silkscreen, Source Sans 3 and Doto, for releasing them under the OFL.
