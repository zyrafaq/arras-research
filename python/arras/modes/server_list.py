#!/usr/bin/env python3

from __future__ import annotations

import argparse
import gzip
import json
import os
import ssl
import sys
import urllib.request
import zlib

from .modes import format_mode


BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

STATUS_CANDIDATES = [
    "https://qrp6ujau11f36bnm-c.uvwx.xyz:8443/2222/status",
    "https://ak7oqfc2u4qqcu6i-c.uvwx.xyz:8443/2222/status",
    "https://c.uvwx.xyz:8443/2222/status",
    "https://arras.io/status",
]

_REGION_PREFIXES = {
    "hil": "US West",
    "kci": "US Central",
    "fsn": "Europe",
    "syd": "Oceania",
    "sgp": "Asia",
}


def _fetch_raw_status() -> tuple[list | dict, str]:
    ctx = ssl.create_default_context()
    urls = [u for u in [os.environ.get("ARRAS_STATUS", "")] + STATUS_CANDIDATES if u]
    errs: list[str] = []
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": BROWSER_UA,
                "Accept": "*/*",
                "Referer": "https://arras.io/",
                "Origin": "https://arras.io",
            })
            with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
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

def normalize_status(servers: list | dict) -> list[dict]:
    if isinstance(servers, dict):
        items: list[dict] = []
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
    return servers  # type: ignore[return-value]

def _derive_region(code: str) -> str:
    if not code:
        return "Other"
    parts = code.split("-")
    loc = (parts[1] if len(parts) > 1 else "").lower()
    for prefix, region in _REGION_PREFIXES.items():
        if loc.startswith(prefix):
            return region
    lower = code.lower()
    if "hetzner" in lower:
        return "Europe"
    if "ovh-hil" in lower:
        return "US West"
    if "wsi-kci" in lower:
        return "US Central"
    if "ovh-syd" in lower:
        return "Oceania"
    if "contabo-sgp" in lower:
        return "Asia"
    return "Other"

def _extract_gamemode(server: dict) -> str:
    gm = server.get("gamemode", "")
    if gm:
        return gm
    code = server.get("code", "")
    if code:
        suffix = "-".join(code.split("-")[2:]).strip()
        if suffix:
            return suffix
    return ""

def fetch_servers() -> list[dict]:
    raw, _src = _fetch_raw_status()
    items = normalize_status(raw)
    result: list[dict] = []
    for s in items:
        gamemode = _extract_gamemode(s)
        code = s.get("code", "")
        rec = dict(s)
        rec["gamemode"] = gamemode
        rec["display_mode"] = format_mode(gamemode) or gamemode or "Unknown"
        rec["region"] = _derive_region(code)
        result.append(rec)
    return result

def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch and display the arras.io server list with mode names.")
    parser.add_argument("--json", action="store_true",
                        help="Output raw JSON instead of a table")
    parser.add_argument("--server", metavar="NAME",
                        help="Show only the server matching this name or code")
    parser.add_argument("--translate", metavar="MODE_ID",
                        help="Translate a raw mode ID to display text and exit")
    args = parser.parse_args()

    if args.translate:
        display = format_mode(args.translate)
        print(f"{args.translate!r} -> {display!r}")
        return

    try:
        servers = fetch_servers()
    except ConnectionError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    if args.server:
        key = args.server.lower()
        servers = [s for s in servers
                   if key in (s.get("name") or "").lower()
                   or key in (s.get("code") or "").lower()]
        if not servers:
            print(f"no server matching {args.server!r}", file=sys.stderr)
            sys.exit(1)

    if args.json:
        print(json.dumps(servers, indent=2, ensure_ascii=False))
        return

    hdr = f"{'#':<4} {'Name':<16} {'Region':<14} {'Gamemode':<28} {'Display':<40} {'Players':<8} {'mspt':<6}"
    print(hdr)
    print("-" * len(hdr))
    for i, s in enumerate(servers):
        name = s.get("name") or "?"
        code = s.get("code") or "?"
        gamemode = s.get("gamemode", "?")
        display = s.get("display_mode", "?")
        region = s.get("region", "Other")
        clients = s.get("clients", 0)
        mx = s.get("maxClients", 0)
        mspt = s.get("mspt", "")
        print(f"{i:<4} #{name:<15} {region:<14} {gamemode:<28} {display:<40} {clients}/{mx:<6} {mspt}")

    print(f"\n{len(servers)} servers total.")

if __name__ == "__main__":
    _cli()
