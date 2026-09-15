#!/usr/bin/env python3

from __future__ import annotations

import re
from typing import Optional


MODIFIERS = {"g": "Growth", "a": "Arms Race", "p": "Portal",
             "o": "Open", "m": "Maze", "r": "Rock"}
MODIFIER_ORDER = ["g", "a", "p", "o", "m", "r"]

TEAM_COUNT = {"f": "FFA", "d": "Duos", "s": "Squads", "c": "Clan Wars"}

WIN_CONDITIONS = {
    "d": "Domination", "m": "Mothership", "a": "Assault", "s": "Siege",
    "t": "Tag",        "p": "Pandemic",   "b": "Soccer",  "g": "Grudge Ball",
    "e": "Elimination", "c": "Capture the Flag", "z": "Sandbox",
}

MODE_NAME_TOKENS = sorted([
    ("dreadnoughts", "Dreadnoughts"),
    ("labyrinth", "Labyrinth"),
    ("stronghold", "Stronghold"),
    ("mothership", "Mothership"),
    ("domination", "Domination"),
    ("elimination", "Elimination"),
    ("pandemic", "Pandemic"),
    ("retrograde", "Retrograde"),
    ("blackout", "Blackout"),
    ("halloween", "Halloween"),
    ("outbreak", "Outbreak"),
    ("tartarus", "Tartarus"),
    ("manhunt", "Manhunt"),
    ("citadel", "Citadel"),
    ("fortress", "Fortress"),
    ("sandbox", "Sandbox"),
    ("assault", "Assault"),
    ("blitz", "Blitz"),
    ("bunker", "Bunker"),
    ("limbo", "Limbo"),
    ("nexus", "Nexus"),
    ("forge", "Forge"),
    ("siege", "Siege"),
    ("space", "Space"),
    ("diep", "Diep"),
    ("fast", "Fast"),
], key=lambda t: -len(t[0]))

_JUNK_RE = re.compile(r"^([a-z]|\d+|x\d+[a-z]?)$")


def _looks_like_junk(leftover: str) -> bool:
    return leftover == "" or bool(_JUNK_RE.match(leftover))

def _parse_skeleton(s: str, require_team_count: bool) -> dict:
    i = 0
    mods: list[str] = []
    last_rank = -1
    while i < len(s):
        rank = MODIFIER_ORDER.index(s[i]) if s[i] in MODIFIER_ORDER else -1
        if rank == -1 or rank <= last_rank:
            break
        mods.append(s[i])
        last_rank = rank
        i += 1

    team_count: Optional[str] = None
    if require_team_count:
        ch = s[i] if i < len(s) else ""
        if ch in TEAM_COUNT:
            team_count = TEAM_COUNT[ch]
        elif ch == "1":
            team_count = "1"
        elif ch.isdigit() and "2" <= ch <= "9":
            team_count = f"{ch} Teams"
        else:
            raise ValueError(f"missing/invalid team count at {i} in \"{s}\"")
        i += 1

    wins: list[str] = []
    while i < len(s):
        w = WIN_CONDITIONS.get(s[i])
        if not w or w in wins:
            break
        wins.append(w)
        i += 1

    return {
        "modifiers": [MODIFIERS[m] for m in mods],
        "team_count": team_count,
        "win_conditions": wins,
        "leftover": s[i:],
    }

def parse_mode(mode_id: str) -> Optional[dict]:
    if not isinstance(mode_id, str) or not mode_id:
        return None

    s = re.sub(r"[^a-z0-9]", "", mode_id.lower())
    if not s:
        raise ValueError(f"empty mode id \"{mode_id}\"")

    s = re.sub(r"^e\d+", "", s)

    spans: list[tuple[int, int, str]] = []
    for key, label in MODE_NAME_TOKENS:
        idx = 0
        while True:
            idx = s.find(key, idx)
            if idx == -1:
                break
            spans.append((idx, idx + len(key), label))
            s = s[:idx] + "\x00" * len(key) + s[idx + len(key):]
            idx += len(key)
    spans.sort(key=lambda t: t[0])
    names = [label for _, _, label in spans]

    raw = re.sub(r"[^a-z0-9]", "", mode_id.lower())
    raw = re.sub(r"^e\d+", "", raw)
    old_series = False
    for m in re.finditer(r"olds|old", raw):
        if not any(a <= m.start() < b for a, b, _ in spans):
            old_series = True
            break

    skeleton = re.sub(r"\x00+", "", s)

    parsed = None
    try:
        parsed = _parse_skeleton(skeleton, require_team_count=True)
        if parsed.get("team_count") is None:
            parsed = None
    except ValueError:
        pass

    if parsed is None:
        parsed = _parse_skeleton(skeleton, require_team_count=False)
        if not _looks_like_junk(parsed["leftover"]):
            parsed["win_conditions"] = []

    return {
        "modifiers": parsed["modifiers"],
        "team_count": parsed["team_count"],
        "win_conditions": parsed["win_conditions"],
        "names": names,
        "old": old_series,
    }

def format_mode(mode_id: str) -> Optional[str]:
    try:
        parsed = parse_mode(mode_id)
        if parsed is None:
            return None
        parts: list[str] = list(parsed["modifiers"])
        tc = parsed["team_count"]
        if tc and tc != "1":
            parts.append(tc)
        parts.extend(parsed["win_conditions"])
        if parsed["names"]:
            first, *rest = parsed["names"]
            parts.append(f"Old {first}" if parsed["old"] else first)
            parts.extend(rest)
        return " ".join(parts) or None
    except Exception:
        return None

def _cli() -> None:
    import gzip
    import json
    import ssl
    import sys
    import urllib.request
    import zlib

    STATUS_URLS = [
        "https://qrp6ujau11f36bnm-c.uvwx.xyz:8443/2222/status",
        "https://ak7oqfc2u4qqcu6i-c.uvwx.xyz:8443/2222/status",
        "https://c.uvwx.xyz:8443/2222/status",
        "https://arras.io/status",
    ]
    UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
          "AppleWebKit/537.36 (KHTML, like Gecko) "
          "Chrome/131.0.0.0 Safari/537.36")

    ctx = ssl.create_default_context()
    servers = None
    for url in STATUS_URLS:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept": "*/*",
                "Referer": "https://arras.io/", "Origin": "https://arras.io",
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
                break
        except Exception:
            continue

    if not servers:
        print("error: no status endpoint reachable", file=sys.stderr)
        sys.exit(1)

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
        servers = items

    def derive_region(code: str) -> str:
        if not code:
            return "Other"
        parts = code.split("-")
        loc = (parts[1] if len(parts) > 1 else "").lower()
        if loc.startswith("hil"):
            return "US West"
        if loc.startswith("kci"):
            return "US Central"
        if loc.startswith("fsn"):
            return "Europe"
        if loc.startswith("syd"):
            return "Oceania"
        if loc.startswith("sgp"):
            return "Asia"
        if "hetzner" in code:
            return "Europe"
        if "ovh-hil" in code:
            return "US West"
        if "wsi-kci" in code:
            return "US Central"
        if "ovh-syd" in code:
            return "Oceania"
        if "contabo-sgp" in code:
            return "Asia"
        return "Other"

    print(f"{'#':<4} {'Name':<16} {'Region':<14} {'Mode ID':<28} {'Display':<40} {'Players':<8}")
    print("-" * 115)
    for i, s in enumerate(servers):
        name = s.get("name") or "?"
        code = s.get("code") or ""
        host = s.get("host", "?")
        gamemode = s.get("gamemode", "")
        if not gamemode and code:
            gamemode = "-".join(code.split("-")[2:]).strip()
        clients = s.get("clients", 0)
        mx = s.get("maxClients", 0)
        region = derive_region(code)
        display = format_mode(gamemode) or gamemode or "Unknown"
        print(f"{i:<4} #{name:<15} {region:<14} {gamemode:<28} {display:<40} {clients}/{mx}")

    print(f"\n{len(servers)} servers total.")

if __name__ == "__main__":
    _cli()
