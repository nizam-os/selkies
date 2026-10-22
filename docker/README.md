# selkies-chromium

LinuxServer's Chromium image with the `nizam-dashboard` UI and a login gate in
front of it. The page opens on a locked screen; the right password starts the
stream, and Lock in Settings or Ctrl+Shift+L ends it again while the desktop's
apps keep running. The session opens with Claude Desktop, and ChatGPT is
installed beside it.

## Run it

Every push to `main` publishes the image for amd64 and arm64 as
`ghcr.io/nizam-os/selkies-chromium` (`.github/workflows/nizam-image.yaml`):
`latest` follows `main`, and `sha-<commit>` pins one build. On the host, in a
folder holding a copy of `compose.yaml`:

```sh
# Prompts for a password twice and prints its hash.
docker run --rm -it --entrypoint /lsiopy/bin/python3 ghcr.io/nizam-os/selkies-chromium /opt/nizam-gate/gate.py hash
# Put the printed line in .env, beside compose.yaml, as GATE_PASSWORD_HASH=scrypt:...

docker compose up -d
```

Then open `https://<host>:3001` (self-signed certificate). The desktop's home
folder is `config/` beside `compose.yaml`. `docker compose pull && docker
compose up -d` moves to the newest build. While the package is private on
GitHub, the host needs `docker login ghcr.io` with a token that can read
packages.

To run this checkout instead, `docker compose -f docker/compose.yaml up -d
--build` builds it under the same name. `docker/.env` and `docker/config/` are
git-ignored.

| Variable | Default | Meaning |
|---|---|---|
| `GATE_PASSWORD_HASH` | — | Output of `gate.py hash`. Required unless `GATE_PASSWORD` is set. |
| `GATE_PASSWORD` | — | Plain-text alternative, hashed at startup. |
| `SELKIES_MASTER_TOKEN` | random per start | Only set it to call Selkies' token API yourself. |
| `GATE_PORT` | `8099` | Loopback port of the gate behind nginx. |
| `MAIN_APP` | `claude` | The app the session opens with: a proot-apps catalog name, or `chromium` for the image's browser. |
| `INSTALL_APPS` | `claude,chatgpt` | Comma-separated proot-apps catalog names installed when a session first starts (README, "Installing apps"). `none` installs none; an empty value counts as unset. |
| `GATE_DOCK_HIDE` | `foot.desktop,foot-server.desktop,footclient.desktop,st.desktop,debian-uxterm.desktop,debian-xterm.desktop` | Comma-separated desktop file IDs kept out of the dock: by default the image's terminals. Setting it replaces the list. |

Everything else is LinuxServer's Chromium image (`CHROME_CLI`, `TITLE`,
`SUBFOLDER`, ...). Do not set `PASSWORD`: it turns on nginx basic auth in front
of the locked page.

## How the lock works

Selkies runs in secure mode, where nothing streams without a session token
from its token table. The gate (`root/opt/nizam-gate/gate.py`) is the only
holder of the master token that edits the table. The browser gets the token
only as an HttpOnly cookie, which nginx turns into what Selkies reads
(`root/defaults/nizam-gate.conf`). The address bar, the history, and the URLs
the browser requests never hold it, so a proxy logging those has nothing to
replay. WebRTC signaling would need the token in the page itself, so the image
streams over WebSockets only (`SELKIES_ENABLE_DUAL_MODE=false`).

- login: password checked, one fresh token provisioned, every older token
  dropped (another device logging in locks this one);
- lock: the table is emptied, and Selkies cuts the stream server-side;
- the page (`addons/nizam-dashboard/src/gate/`) starts the stream only in the
  tab that logged in, while its session is live, and returns to the locked
  screen within ~5 s of a lock made elsewhere; any other tab opens on the
  locked screen;
- Back or Forward locks: Back from the desktop lands on the locked screen kept
  behind it and locks the session, and Forward (or Back to a desktop left any
  other way) opens the locked screen rather than resuming. A reload keeps the
  session.

Failed logins are throttled per address: five free tries, then a doubling wait
up to 15 minutes.

## The desktop

Selkies' menu bar is gone. Instead:

- **Dock**: rest the pointer on the right edge of the screen and a vertical
  dock slides in with every installed app (each `.desktop` file a menu would
  show) and Settings. Clicking an app launches it in the session; a dot marks
  the ones running. On a touch screen, tap the grabber on the right edge.
- **Settings**: every control the old menu had, as pages of grouped rows in
  a System-Settings-style window: General (stream toggles, appearance),
  Display (full screen, gaming mode, second screen, resolution, scaling),
  Video, Audio, Clipboard, Files, Sharing, Gamepads, Shortcuts, Performance,
  and Apps (the catalog, with search), plus Lock. Ctrl+Shift+M opens and
  closes it.
- **Main app**: the session opens with Claude (`MAIN_APP`) instead of
  Chromium, which stays in the dock.

The dock's list comes from the gate's `auth/apps` endpoint, behind the same
session cookie as everything else. Launching uses Selkies' command channel,
which the image turns on unless `HARDEN_DESKTOP=true` or
`SELKIES_COMMAND_ENABLED=false`; without it the dock holds Settings only.

## The locked screen

The locked page is google.com's home page (the LMGTFY components in
`addons/nizam-dashboard/src/gate/lmgtfy/`), measured against the live page in
both themes: logo, icons, Sign in button, search box, and the classic
Google Search / I'm Feeling Lucky row. Type the password in the search box and
press Enter, either button, or AI Mode. Nothing on it mentions a desktop:

- anything that is not the password is searched on Google
  (`https://www.google.com/search?q=...`, with `btnI` for I'm Feeling Lucky
  and `udm=50` for AI Mode);
- every link goes where google.com's goes for a visitor in Canada, except
  Français (Google signs that one per visitor; this opens google.com in French)
  and Settings (a menu there; this opens its first entry, Search settings);
- nothing leaves with a referrer, so Google never sees the desktop's address;
- while logins are throttled (or the gate is down) the text stays in the box,
  so the owner can tell "not now" from "wrong";
- the tab shows google.com's title and favicon instead of Selkies' title and
  logo;
- light or dark follows the visitor's OS, also when it changes while the page
  is open.

The page loads Google Sans from fonts.gstatic.com, as google.com does. The
artwork is in `src/gate/lmgtfy/assets.tsx`; the tab's title and icon are `TITLE`
and `FAVICON` in `src/gate/Landing.tsx`.

## Installing apps

Apps installed with `selkies-proot install <app>` (LinuxServer's proot-apps)
unpack into `~/proot-apps`, which `compose.yaml` keeps in a Docker volume of its
own (`proot-apps`) rather than in `docker/config/`. A host folder shared through
Docker Desktop (virtiofs on a Mac) does not keep a directory's inode while tar
fills it, so every install there fails with `Directory renamed before its
status could be extracted` and `Error downloading ...`. The volume lives in
Docker's own Linux disk; `init-nizam-proot` hands it to the desktop user at
start.

Claude Desktop and ChatGPT (`INSTALL_APPS`) come from that same catalog.
`nizam-main-app`, which the session's autostart runs, installs whichever are
missing the first time a session starts: the main app first, so the desktop
stays empty until it has downloaded (a minute or two, once), then the rest in
the background, which join the dock as they finish. The volume keeps them, so
later starts open Claude at once. A main app that cannot be installed opens
Chromium instead; `~/.cache/nizam-apps.log` (in `docker/config/`) says why. A
config folder from before this image still has LinuxServer's stock autostart,
which only started Chromium; `init-nizam-autostart` swaps that for
`nizam-main-app` and leaves an edited autostart alone.

## Upgrading Selkies

This fork's `main` is upstream's release tag plus added files only
(`addons/nizam-dashboard/`, `docker/`, `.github/workflows/nizam-image.yaml`),
so it rebases without conflicts. The dashboard ships its own copy of the
streaming core, so it must match the Selkies server inside the base image, and
the build stops when it does not. That is also why `main` never takes
upstream's `main` (GitHub's Sync fork button merges it): it moves from one
release tag to the next.

```sh
git fetch upstream --tags
git rebase --onto <new-tag> <old-tag> main
# docker/Dockerfile: set SELKIES_RELEASE=<new-tag> and BASE_IMAGE to a chromium
# image digest that runs it (check with: pip show selkies).
git push --force-with-lease origin main
```

Upstream's dashboard changes reach `nizam-dashboard` only by hand: it started
as a copy of `selkies-dashboard-wish` at 2.0.0 (`git diff 2.0.0 -- addons/selkies-dashboard-wish`
shows what upstream changed since).
