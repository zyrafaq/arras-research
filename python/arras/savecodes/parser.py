from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone

_CHECKSUM_RE = re.compile(r"^[0-9a-fA-F]+$")
_SERVER_RE = re.compile(r"^#[A-Za-z0-9]+$")
_SIGNATURE_RE = re.compile(r"^[A-Za-z0-9+/=_-]+$")

FIELD_COUNT = 14
BUILD_ENTRIES = 10
MAX_TIMESTAMP = 2 ** 32 - 1


class SaveCodeFormatError(ValueError):
    pass


def _parse_uint(text: str, what: str) -> int:
    if not re.fullmatch(r"\d+", text or ""):
        raise SaveCodeFormatError(f"{what} is not a non-negative integer: {text!r}")
    try:
        return int(text, 10)
    except ValueError as exc:
        raise SaveCodeFormatError(f"{what} is not a number: {text!r}") from exc


@dataclass(frozen=True)
class SaveCode:
    checksum: str
    server_id: str
    mode: str
    tank: str
    build: tuple
    score: int
    reserved: tuple
    timestamp: int
    signature: str

    @property
    def created_at(self) -> datetime:
        return datetime.fromtimestamp(self.timestamp, tz=timezone.utc)

    @property
    def mode_display(self):
        try:
            from ..modes import format_mode
            return format_mode(self.mode)
        except Exception:
            return None

    def as_dict(self) -> dict:
        return {
            "checksum": self.checksum,
            "server_id": self.server_id,
            "mode": self.mode,
            "mode_display": self.mode_display,
            "tank": self.tank,
            "build": list(self.build),
            "score": self.score,
            "reserved": list(self.reserved),
            "timestamp": self.timestamp,
            "created_at": self.created_at.isoformat(),
            "signature": self.signature,
        }

    @classmethod
    def parse(cls, code: str) -> "SaveCode":
        text = (code or "").strip()
        if not text:
            raise SaveCodeFormatError("empty save code")
        if text.startswith("(") and text.endswith(")") and len(text) >= 2:
            text = text[1:-1].strip()
        if not text or "(" in text or ")" in text:
            raise SaveCodeFormatError("save code must be wrapped in a single (...) pair")
        parts = text.split(":")
        if len(parts) != FIELD_COUNT:
            raise SaveCodeFormatError(
                f"save code has {len(parts)} colon fields, need exactly {FIELD_COUNT}")

        checksum, server_id, mode, tank, build_s, score_s = parts[0:6]
        reserved_s = parts[6:12]
        timestamp_s, signature = parts[12:14]

        if not _CHECKSUM_RE.fullmatch(checksum or ""):
            raise SaveCodeFormatError(f"bad checksum prefix: {checksum!r}")
        if not _SERVER_RE.fullmatch(server_id or ""):
            raise SaveCodeFormatError(f"bad server id: {server_id!r}")
        if not mode or ":" in mode or "(" in mode or ")" in mode:
            raise SaveCodeFormatError(f"bad mode id: {mode!r}")
        if not tank or ":" in tank:
            raise SaveCodeFormatError(f"bad tank name: {tank!r}")

        build_parts = (build_s or "").split("/")
        if len(build_parts) != BUILD_ENTRIES:
            raise SaveCodeFormatError(
                f"build has {len(build_parts)} entries, need exactly {BUILD_ENTRIES}")
        build = tuple(_parse_uint(p, f"build[{i}]") for i, p in enumerate(build_parts))

        score = _parse_uint(score_s, "score")
        reserved = tuple(_parse_uint(p, f"reserved[{i}]") for i, p in enumerate(reserved_s))
        timestamp = _parse_uint(timestamp_s, "timestamp")
        if timestamp < 1 or timestamp > MAX_TIMESTAMP or timestamp > int(time.time()) + 86400:
            raise SaveCodeFormatError(f"timestamp out of range: {timestamp!r}")

        if not signature or ":" in signature or "(" in signature or ")" in signature:
            raise SaveCodeFormatError("bad signature: must be non-empty with no colons/parens")
        if signature == "[REDACTED]":
            raise SaveCodeFormatError(
                "signature is [REDACTED]: re-run $scores/$saves in a bot DM for the full code")
        if not _SIGNATURE_RE.fullmatch(signature):
            raise SaveCodeFormatError(f"bad signature characters: {signature!r}")

        return cls(checksum, server_id, mode, tank, build, score, reserved,
                   timestamp, signature)


def parse(code: str) -> SaveCode:
    return SaveCode.parse(code)


def format_savecode(d: dict) -> str:
    build = "/".join(str(int(v)) for v in d["build"])
    reserved = ":".join(str(int(v)) for v in d["reserved"])
    return (f"({d['checksum']}:{d['server_id']}:{d['mode']}:{d['tank']}:"
            f"{build}:{int(d['score'])}:{reserved}:"
            f"{int(d['timestamp'])}:{d['signature']})")


def save_summary(save: SaveCode) -> str:
    return (f"{save.tank} @{save.server_id} {save.mode} "
            f"score={save.score} build={'/'.join(map(str, save.build))} "
            f"{save.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
