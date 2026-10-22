"""Login, lock, and the dock's app list for the nizam dashboard.

The gate runs beside Selkies in secure mode and is the only process that uses
its master token. A login checks the password, mints a session token, and
replaces Selkies' token table with that one token: the browser that logged in
streams, and any token handed out before stops working. A lock replaces the
table with an empty one, so Selkies drops the stream at once while the desktop
and its apps keep running.

The table lives in Selkies' memory. The gate therefore resets it to empty when
the gate starts, since a restarted gate no longer knows which token it handed
out, and puts its token back when a restarted Selkies has lost it.

The token reaches the browser only as the `sid` cookie, HttpOnly and
SameSite=Strict, so no URL, page script, or response body ever holds it, and
a log of the URLs the browser requests has nothing to replay. nginx hands the
cookie to Selkies in the two forms Selkies reads (`nizam-gate.conf`), a Bearer
header and, for the WebSocket handshake, `?token=` on the proxied request.

Endpoints, under `<subfolder>auth/`:

- `POST login` with `{"password": ...}`: 204 with the cookie set, 403 for a
  wrong password, 429 while the caller is throttled.
- `POST lock` with the cookie: 204, or 403 when it is not the live session;
  either way the cookie is cleared.
- `GET session` with the cookie: 204 while it is the live session, else 403.
- `GET apps` with the cookie: the desktop's applications for the dock
  (`DesktopApps`), or 403.

None of them answers 401: the core reloads the page on any same-origin 401
that is not Selkies' own Bearer verdict (`selkies-web-core/lib/auth-guard.js`).

`gate.py hash` reads a password on stdin and prints the `GATE_PASSWORD_HASH`
value for it.
"""

import asyncio
import base64
import configparser
import getpass
import hashlib
import hmac
import ipaddress
import logging
import os
import re
import secrets
import shlex
import shutil
import sys
import time
from typing import Any, Optional

from aiohttp import ClientError, ClientSession, ClientTimeout, web

logger = logging.getLogger("gate")

CONTROLLER = {"role": "controller", "slot": 1}

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**15, 8, 1
SCRYPT_MAXMEM = 64 * 1024 * 1024

# The base image's terminals: the desktop still has them, the dock does not.
DEFAULT_DOCK_HIDE = ",".join((
    "foot.desktop", "foot-server.desktop", "footclient.desktop", "st.desktop",
    "debian-uxterm.desktop", "debian-xterm.desktop",
))
ICON_THEMES = ("hicolor", "Adwaita")
ICON_SIZES = ("scalable", "256x256", "512x512", "192x192", "128x128", "96x96", "72x72",
              "64x64", "48x48")
MAX_ICON_BYTES = 256 * 1024
APPS_TTL = 10
PROOT_RUN = re.compile(r"proot-apps run (\S+)")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    """Hashes a password into the `GATE_PASSWORD_HASH` format.

    The format is `scrypt:<n>:<r>:<p>:<salt>:<key>` with base64url fields. It
    uses colons rather than the usual dollar signs, which Compose would read as
    variable references.
    """
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R,
                         p=SCRYPT_P, maxmem=SCRYPT_MAXMEM, dklen=32)
    return f"scrypt:{SCRYPT_N}:{SCRYPT_R}:{SCRYPT_P}:{_b64(salt)}:{_b64(key)}"


class PasswordVerifier:
    """Checks passwords against one scrypt hash.

    Args:
        encoded: A `hash_password` result.

    Raises:
        ValueError: When `encoded` is not in that format.
    """

    def __init__(self, encoded: str):
        scheme, n, r, p, salt, key = encoded.strip().split(":")
        if scheme != "scrypt":
            raise ValueError(f"unknown scheme {scheme!r}")
        self._n, self._r, self._p = int(n), int(r), int(p)
        self._salt, self._key = _unb64(salt), _unb64(key)

    def verify(self, password: str) -> bool:
        """Whether `password` matches. Takes tens of milliseconds by design."""
        key = hashlib.scrypt(password.encode(), salt=self._salt, n=self._n, r=self._r,
                             p=self._p, maxmem=SCRYPT_MAXMEM, dklen=len(self._key))
        return hmac.compare_digest(key, self._key)


class Throttle:
    """Backoff on failed logins, per client address.

    The first `FREE_TRIES` failures cost nothing; each one after that doubles
    the wait before the next attempt, up to `MAX_WAIT`. IPv6 clients are keyed
    by their /64, which one host can otherwise rotate through freely.
    """

    FREE_TRIES = 5
    MAX_WAIT = 15 * 60
    FORGET_AFTER = 60 * 60

    def __init__(self) -> None:
        self._entries: dict[str, tuple[int, float, float]] = {}

    def wait(self, key: str) -> float:
        """Seconds `key` must still wait before its next attempt."""
        entry = self._entries.get(key)
        return max(0.0, entry[1] - time.monotonic()) if entry else 0.0

    def failed(self, key: str) -> float:
        """Records a failure; returns the wait it imposes."""
        now = time.monotonic()
        if len(self._entries) > 10_000:
            self._entries = {k: e for k, e in self._entries.items()
                             if now - e[2] < self.FORGET_AFTER}
        failures = self._entries.get(key, (0, 0.0, 0.0))[0] + 1
        wait = 0.0
        if failures > self.FREE_TRIES:
            wait = min(self.MAX_WAIT, 2.0 ** (failures - self.FREE_TRIES))
        self._entries[key] = (failures, now + wait, now)
        return wait

    def forget(self, key: str) -> None:
        self._entries.pop(key, None)


def client_key(request: web.Request) -> str:
    """The throttling key for a request: nginx's `X-Real-IP`, IPv6 cut to its /64."""
    raw = request.headers.get("X-Real-IP") or request.remote or ""
    try:
        address = ipaddress.ip_address(raw)
    except ValueError:
        return raw
    if address.version == 6:
        return str(ipaddress.ip_network(f"{address}/64", strict=False))
    return str(address)


def data_dirs() -> list[str]:
    """The XDG data directories, the user's first, as the desktop searches them."""
    home = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    system = os.environ.get("XDG_DATA_DIRS") or "/usr/local/share:/usr/share"
    return [home] + [d for d in system.split(":") if d]


def _read_entry(path: str) -> Optional[dict[str, str]]:
    """The `[Desktop Entry]` group of a `.desktop` file, keys case kept."""
    parser = configparser.ConfigParser(interpolation=None, strict=False)
    parser.optionxform = str  # type: ignore[assignment,method-assign]
    try:
        parser.read(path, encoding="utf-8")
        return dict(parser["Desktop Entry"])
    except (configparser.Error, KeyError, UnicodeDecodeError, OSError):
        return None


def _program(command: str) -> str:
    """The basename of the program a desktop `Exec` line runs, past any `env VAR=value`."""
    try:
        argv = shlex.split(command)
    except ValueError:
        return ""
    while argv and (argv[0] == "env" or ("=" in argv[0] and not argv[0].startswith("/"))):
        argv.pop(0)
    return os.path.basename(argv[0]) if argv else ""


def _proot_folder(command: str) -> Optional[str]:
    """The `~/proot-apps` folder a proot-apps launcher in `command` runs its app from.

    proot-apps names an app's folder after its image, with `/` and `:` made
    `_`, and takes a bare catalog name for its default repository's image.

    Returns:
        The folder's name, or None when `command` does not run a proot app.
    """
    match = PROOT_RUN.search(command)
    if not match:
        return None
    image = match.group(1)
    if "/" not in image:
        image = f"ghcr.io/linuxserver/proot-apps:{image}"
    return image.replace("/", "_").replace(":", "_")


def _find_icon(name: str, dirs: list[str]) -> Optional[str]:
    """Resolves an `Icon` value to a PNG or SVG file the browser can draw.

    A themed name is looked up in hicolor and Adwaita, scalable first and then
    from large to small, and finally in `pixmaps`. XPM icons, which browsers
    cannot decode, are skipped.
    """
    if os.path.isabs(name):
        return name if name.endswith((".png", ".svg")) and os.path.isfile(name) else None
    base, ext = os.path.splitext(name)
    if ext in (".png", ".svg", ".xpm"):
        name = base
    for directory in dirs:
        for theme in ICON_THEMES:
            for size in ICON_SIZES:
                for suffix in ((".svg", ".png") if size == "scalable" else (".png",)):
                    path = os.path.join(directory, "icons", theme, size, "apps", name + suffix)
                    if os.path.isfile(path):
                        return path
    for directory in dirs:
        for suffix in (".svg", ".png"):
            path = os.path.join(directory, "pixmaps", name + suffix)
            if os.path.isfile(path):
                return path
    return None


def _data_uri(path: str) -> Optional[str]:
    try:
        if os.path.getsize(path) > MAX_ICON_BYTES:
            return None
        with open(path, "rb") as handle:
            data = handle.read()
    except OSError:
        return None
    mime = "image/svg+xml" if path.endswith(".svg") else "image/png"
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _running_programs() -> set[str]:
    """What runs, as `DesktopApps` matches it against its entries.

    Returns:
        The basename of every readable process's `argv[0]`, and `proot:` and
        the folder name for each proot-apps app, whose proot runs it with that
        folder as `-R`.
    """
    names = set()
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as handle:
                argv = handle.read().decode(errors="replace").split("\0")
        except OSError:
            continue
        program = os.path.basename(argv[0])
        if program:
            names.add(program)
        if program == "proot" and "-R" in argv[:-1]:
            names.add("proot:" + os.path.basename(argv[argv.index("-R") + 1].rstrip("/")))
    return names


class DesktopApps:
    """The applications the desktop's `.desktop` entries offer, for the dock.

    Entries are read from every XDG data directory's `applications`, the
    user's first, so an app catalog install and a user override both count; a
    desktop ID seen once is not read again, which is how a user entry with
    `Hidden=true` removes a system one. Entries that are hidden, terminal-only,
    meant for another desktop (`OnlyShowIn`), not installed (`TryExec`), or
    listed in `hidden` are left out.

    Each app is launched through `gio launch`, which expands the entry's field
    codes as the desktop would. Whether an app is running is a best guess: its
    `Exec` program's name among the running processes' names, or, for a
    proot-apps app, whose `Exec` is the same launcher for every one, a proot
    running from that app's folder. proot-apps' entries end their names in
    ` PA`, which the dock leaves off.

    Args:
        hidden: Desktop IDs to leave out, such as `foot.desktop`.
    """

    def __init__(self, hidden: set[str]):
        self._hidden = hidden
        self._apps: list[dict[str, Any]] = []
        self._expires = 0.0

    def _scan(self) -> list[dict[str, Any]]:
        dirs = data_dirs()
        seen: set[str] = set()
        apps = []
        for directory in dirs:
            root = os.path.join(directory, "applications")
            for current, _, files in os.walk(root):
                for file in sorted(files):
                    if not file.endswith(".desktop"):
                        continue
                    path = os.path.join(current, file)
                    desktop_id = os.path.relpath(path, root).replace(os.sep, "-")
                    if desktop_id in seen:
                        continue
                    seen.add(desktop_id)
                    entry = _read_entry(path)
                    if entry is None or not self._shown(desktop_id, entry):
                        continue
                    icon = _find_icon(entry["Icon"], dirs) if entry.get("Icon") else None
                    proot_folder = _proot_folder(entry["Exec"])
                    name = entry["Name"]
                    if proot_folder and name.endswith(" PA"):
                        name = name[:-3]
                    apps.append({
                        "id": desktop_id,
                        "name": name,
                        "comment": entry.get("Comment") or entry.get("GenericName") or "",
                        "icon": _data_uri(icon) if icon else None,
                        "command": f"gio launch {shlex.quote(path)}",
                        "program": f"proot:{proot_folder}" if proot_folder else _program(entry["Exec"]),
                    })
        return sorted(apps, key=lambda app: app["name"].casefold())

    def _shown(self, desktop_id: str, entry: dict[str, str]) -> bool:
        if desktop_id in self._hidden or entry.get("Type") != "Application":
            return False
        if not entry.get("Name") or not entry.get("Exec") or entry.get("OnlyShowIn"):
            return False
        if any(entry.get(key, "").lower() == "true" for key in ("NoDisplay", "Hidden", "Terminal")):
            return False
        try_exec = entry.get("TryExec")
        return not try_exec or shutil.which(try_exec) is not None

    def list(self) -> list[dict[str, Any]]:
        """The apps, with a fresh `running` flag each call. Blocks on the filesystem."""
        if time.monotonic() >= self._expires:
            self._apps = self._scan()
            self._expires = time.monotonic() + APPS_TTL
        running = _running_programs()
        return [{**{k: v for k, v in app.items() if k != "program"},
                 "running": app["program"] in running} for app in self._apps]


class Selkies:
    """Selkies' token table, driven through its master token.

    Args:
        session: Shared HTTP client.
        base: Selkies' own address with its subfolder, e.g. `http://127.0.0.1:8082/desk`.
        master_token: `SELKIES_MASTER_TOKEN`.
    """

    def __init__(self, session: ClientSession, base: str, master_token: str):
        self._session = session
        self._base = base
        self._master = master_token

    async def provision(self, table: dict[str, Any]) -> None:
        """Replaces the token table; Selkies disconnects every token it drops.

        Raises:
            RuntimeError: When Selkies does not accept the table.
            aiohttp.ClientError: When Selkies cannot be reached.
        """
        async with self._session.post(
                f"{self._base}/api/tokens", json=table, timeout=ClientTimeout(total=5),
                headers={"Authorization": f"Bearer {self._master}"}) as response:
            if response.status != 200:
                raise RuntimeError(f"Selkies refused the token table: HTTP {response.status}")

    async def accepts(self, token: str) -> Optional[bool]:
        """Whether Selkies honors `token`; None when Selkies cannot say."""
        try:
            async with self._session.get(
                    f"{self._base}/api/sessions", timeout=ClientTimeout(total=5),
                    headers={"Authorization": f"Bearer {token}"}) as response:
                if response.status == 401:
                    return False
                return True if response.status == 200 else None
        except (ClientError, asyncio.TimeoutError):
            return None


def _error(status: int, message: str, **headers: str) -> web.Response:
    return web.json_response({"error": message}, status=status, headers=headers)


SESSION_COOKIE = "sid"


def _set_session_cookie(response: web.StreamResponse, request: web.Request, path: str,
                        token: Optional[str]) -> None:
    """Sets the session cookie to `token`, or clears it for None.

    Secure whenever the browser reached nginx over HTTPS; the plain-HTTP port
    gets a cookie it can send back, or a login there could never stream.
    """
    if token is None:
        response.del_cookie(SESSION_COOKIE, path=path)
        return
    response.set_cookie(
        SESSION_COOKIE, token, path=path, httponly=True, samesite="Strict",
        secure=request.headers.get("X-Forwarded-Proto") == "https")


class Gate:
    """The HTTP handlers and the one live session token."""

    KEEP_INTERVAL = 10

    def __init__(self, selkies: Selkies, verifier: Optional[PasswordVerifier], apps: DesktopApps,
                 cookie_path: str):
        self._selkies = selkies
        self._cookie_path = cookie_path
        self._verifier = verifier
        self._apps = apps
        self._throttle = Throttle()
        self._token: Optional[str] = None
        self._table_lock = asyncio.Lock()
        self._verifying = asyncio.Semaphore(2)
        self._ready = asyncio.Event()

    def _is_live(self, request: web.Request) -> bool:
        presented = request.cookies.get(SESSION_COOKIE, "")
        return bool(self._token and presented) and hmac.compare_digest(presented, self._token)

    async def run(self) -> None:
        """Empties the table once Selkies answers, then keeps the live token provisioned."""
        while True:
            try:
                await self._selkies.provision({})
                break
            except (ClientError, asyncio.TimeoutError, RuntimeError) as exc:
                logger.debug("Waiting for Selkies: %s", exc)
                await asyncio.sleep(2)
        self._ready.set()
        logger.info("Desktop locked until someone logs in")
        while True:
            await asyncio.sleep(self.KEEP_INTERVAL)
            token = self._token
            if not token or await self._selkies.accepts(token) is not False:
                continue
            async with self._table_lock:
                if self._token != token:
                    continue
                try:
                    await self._selkies.provision({token: CONTROLLER})
                    logger.info("Selkies lost the session token, likely a restart; provisioned it again")
                except (ClientError, asyncio.TimeoutError, RuntimeError) as exc:
                    logger.warning("Could not provision the session token again: %s", exc)

    async def login(self, request: web.Request) -> web.Response:
        if self._verifier is None:
            return _error(503, "No password is configured")
        key = client_key(request)
        wait = self._throttle.wait(key)
        if wait:
            return _error(429, "Too many attempts", **{"Retry-After": str(int(wait) + 1)})
        try:
            password = (await request.json())["password"]
            if not isinstance(password, str) or not 0 < len(password) <= 1024:
                raise ValueError
        except (ValueError, KeyError, TypeError):
            return _error(400, 'Expected {"password": "..."}')
        async with self._verifying:
            matched = await asyncio.get_running_loop().run_in_executor(
                None, self._verifier.verify, password)
        if not matched:
            wait = self._throttle.failed(key)
            logger.warning("Wrong password from %s", key)
            headers = {"Retry-After": str(int(wait) + 1)} if wait else {}
            return _error(403, "Wrong password", **headers)
        self._throttle.forget(key)
        try:
            await asyncio.wait_for(self._ready.wait(), 15)
        except asyncio.TimeoutError:
            return _error(503, "The desktop is still starting")
        token = secrets.token_urlsafe(32)
        async with self._table_lock:
            try:
                await self._selkies.provision({token: CONTROLLER})
            except (ClientError, asyncio.TimeoutError, RuntimeError) as exc:
                logger.error("Login from %s could not provision its token: %s", key, exc)
                return _error(503, "The desktop is not reachable")
            self._token = token
        logger.info("Unlocked from %s", key)
        response = web.Response(status=204, headers={"Cache-Control": "no-store"})
        _set_session_cookie(response, request, self._cookie_path, token)
        return response

    async def lock(self, request: web.Request) -> web.Response:
        async with self._table_lock:
            if not self._is_live(request):
                response = _error(403, "Not the live session")
                _set_session_cookie(response, request, self._cookie_path, None)
                return response
            try:
                await self._selkies.provision({})
            except (ClientError, asyncio.TimeoutError, RuntimeError) as exc:
                logger.error("Lock could not empty the token table: %s", exc)
                return _error(503, "The desktop is not reachable")
            self._token = None
        logger.info("Locked from %s", client_key(request))
        response = web.Response(status=204)
        _set_session_cookie(response, request, self._cookie_path, None)
        return response

    async def session(self, request: web.Request) -> web.Response:
        if self._is_live(request):
            return web.Response(status=204, headers={"Cache-Control": "no-store"})
        return _error(403, "Not the live session")

    async def apps(self, request: web.Request) -> web.Response:
        if not self._is_live(request):
            return _error(403, "Not the live session")
        apps = await asyncio.get_running_loop().run_in_executor(None, self._apps.list)
        return web.json_response({"apps": apps}, headers={"Cache-Control": "no-store"})


def route_prefix(subfolder: str) -> str:
    """Selkies' path prefix for a `SUBFOLDER`: "" for the root, else "/<name>"."""
    name = subfolder.strip("/")
    return f"/{name}" if name else ""


def load_verifier() -> Optional[PasswordVerifier]:
    """The verifier for `GATE_PASSWORD_HASH`, else for a plain `GATE_PASSWORD`."""
    encoded = os.environ.get("GATE_PASSWORD_HASH", "").strip()
    if encoded:
        return PasswordVerifier(encoded)
    plain = os.environ.get("GATE_PASSWORD", "")
    if plain:
        return PasswordVerifier(hash_password(plain))
    logger.error("Neither GATE_PASSWORD_HASH nor GATE_PASSWORD is set; nobody can log in")
    return None


async def build_app() -> web.Application:
    master_token = os.environ.get("SELKIES_MASTER_TOKEN", "")
    if not master_token:
        raise SystemExit("SELKIES_MASTER_TOKEN is not set; Selkies is not in secure mode")
    prefix = route_prefix(os.environ.get("SUBFOLDER", "/"))
    selkies_port = int(os.environ.get("CUSTOM_WS_PORT", "8082"))
    session = ClientSession()
    hidden = os.environ.get("GATE_DOCK_HIDE", DEFAULT_DOCK_HIDE)
    gate = Gate(
        Selkies(session, f"http://127.0.0.1:{selkies_port}{prefix}", master_token),
        load_verifier(),
        DesktopApps({name.strip() for name in hidden.split(",") if name.strip()}),
        f"{prefix}/",
    )
    app = web.Application(client_max_size=16 * 1024)
    app.add_routes([
        web.post(f"{prefix}/auth/login", gate.login),
        web.post(f"{prefix}/auth/lock", gate.lock),
        web.get(f"{prefix}/auth/session", gate.session),
        web.get(f"{prefix}/auth/apps", gate.apps),
    ])

    async def lifecycle(app: web.Application):
        task = asyncio.create_task(gate.run())
        yield
        task.cancel()
        await session.close()

    app.cleanup_ctx.append(lifecycle)
    return app


def read_password() -> str:
    if not sys.stdin.isatty():
        return sys.stdin.readline().rstrip("\n")
    password = getpass.getpass("Password: ")
    if getpass.getpass("Again: ") != password:
        raise SystemExit("The passwords differ")
    return password


def main() -> None:
    if sys.argv[1:] == ["hash"]:
        password = read_password()
        if not password:
            raise SystemExit("Empty password")
        print(hash_password(password))
        return
    logging.basicConfig(level=logging.INFO, format="[nizam-gate] %(levelname)s %(message)s")
    port = int(os.environ.get("GATE_PORT", "8099"))
    web.run_app(build_app(), host="127.0.0.1", port=port, access_log=None, print=None)


if __name__ == "__main__":
    main()
