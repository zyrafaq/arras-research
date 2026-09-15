import gzip
import json
import os
import ssl
import sys
import threading
import time
import urllib.request
import zlib
from urllib.request import urlopen

from .config import BROWSER_UA, STOP, log

STATUS_CANDIDATES = [
    "https://qrp6ujau11f36bnm-c.uvwx.xyz:8443/2222/status",
    "https://ak7oqfc2u4qqcu6i-c.uvwx.xyz:8443/2222/status",
    "https://c.uvwx.xyz:8443/2222/status",
    "https://arras.io/status",
]


def fetch_status():
    ctx = ssl.create_default_context()
    urls = [os.environ.get("ARRAS_STATUS", "")] + STATUS_CANDIDATES
    errs = []
    for url in urls:
        if not url:
            continue
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": BROWSER_UA,
                "Accept": "*/*",
                "Referer": "https://arras.io/",
                "Origin": "https://arras.io",
            })
            with urlopen(req, timeout=20, context=ctx) as r:
                raw = r.read()
                enc = (r.headers.get("Content-Encoding") or "").lower()
                if enc == "gzip":
                    raw = gzip.decompress(raw)
                elif enc == "deflate":
                    raw = zlib.decompress(raw)
            data = json.loads(raw)
            servers = data.get("status") if isinstance(data, dict) else data
            if servers:
                return servers, url
            errs.append(f"{url}: empty list")
        except Exception as e:
            errs.append(f"{url}: {e}")
    raise ConnectionError("no status endpoint reachable:\n  " + "\n  ".join(errs))

def fetch_status_interruptible():
    result = {"servers": None, "src": None, "error": None}
    found = threading.Event()

    def worker():
        try:
            result["servers"], result["src"] = fetch_status()
        except Exception as e:
            result["error"] = e
        finally:
            found.set()

    t = threading.Thread(target=worker, daemon=True,
                         name="status-fetch")
    t.start()
    deadline = time.time() + 15
    while not found.is_set() and not STOP.is_set():
        remaining = deadline - time.time()
        if remaining <= 0:
            log.warning("== status fetch timed out after 15s — continuing without server list")
            break
        t.join(min(0.2, remaining))
    if STOP.is_set():
        return None, None, None
    if not found.is_set():
        return None, None, None
    if result["error"] is not None:
        raise result["error"]
    return result["servers"], result["src"], None

def normalize_status(servers):
    if isinstance(servers, dict):
        items = []
        for name, v in servers.items():
            if isinstance(v, str):
                items.append({"name": name, "host": v})
            elif isinstance(v, dict):
                rec = dict(v)
                rec.setdefault("name", name)
                items.append(rec)
            else:
                items.append({"name": name, "host": str(v)})
        return items
    return servers

def resolve_server(spec, servers=None):
    spec = spec.strip()
    is_id = spec.startswith("#")
    if is_id:
        srv_id = spec[1:].strip()
    elif "." not in spec and ":" not in spec and spec:
        srv_id = spec
    else:
        return spec
    if servers is None:
        raise ValueError(f"server #{srv_id}: no status list available to look it up in")
    norm = normalize_status(servers)
    for s in norm:
        if s.get("name") == srv_id or s.get("code") == srv_id:
            host = s.get("host")
            if host:
                return host
            raise ValueError(f"server #{srv_id}: no host in status record")
    ids = ", ".join(f"#{s.get('name')}" for s in norm[:10])
    raise ValueError(f"server #{srv_id} not found in status list (first ids: {ids}...)")

def pick_server(servers):
    log.info(f"=== arras.io status: {len(servers)} servers ===")
    for i, s in enumerate(servers[:40]):
        host = s.get("host", "?")
        name = s.get("name") or s.get("code") or s.get("gamemode") or "?"
        clients, mx = s.get("clients", 0), s.get("maxClients", 0)
        log.info(f"[{i:2d}] #{str(name):<16} host={str(host):<28} {clients}/{mx} mspt={s.get('mspt', '?')}")
    if len(servers) > 40:
        log.info(f"  ... ({len(servers) - 40} more)")
    choice = input("\npick number, or <enter> for first: ").strip().lower()
    if choice in ("q", "quit"):
        sys.exit(0)
    if choice == "":
        idx = 0
    else:
        try:
            idx = int(choice)
        except ValueError:
            return resolve_server("#" + choice, servers)
    return servers[idx] if isinstance(servers[idx], str) else servers[idx].get("host", servers[idx])
