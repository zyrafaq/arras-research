from __future__ import annotations

import struct
from typing import List, Optional

_ASCII85_BASE = 85
_ASCII85_CODE_START = 33
_ASCII85_GROUP_SPACE_CODE = 0x20202020
_ASCII85_NULL_STRING = b"\x00\x00\x00\x00"
_ASCII85_GROUP_SPACE_STRING = b"    "
_ASCII85_DECODING_GROUP_LENGTH = 5
_ASCII85_ENCODING_GROUP_LENGTH = 4

def build_decode_table(encode_table: str) -> List[int]:
    table: List[int] = [-1] * (1 << 8)
    for i, ch in enumerate(encode_table):
        table[ord(ch)] = i
    return table

def _encode_chunk(value: int, table: str) -> str:
    parts: List[str] = []
    v = value
    for _ in range(_ASCII85_DECODING_GROUP_LENGTH):
        parts.append(table[v % _ASCII85_BASE])
        v //= _ASCII85_BASE
    return "".join(reversed(parts))

def encode(data: bytes, table: str) -> str:
    output: List[str] = []
    cur = 0
    digits = 0

    for b in data:
        cur = (cur << 8) | b
        digits += 1
        if digits % _ASCII85_ENCODING_GROUP_LENGTH != 0:
            continue
        if cur == _ASCII85_GROUP_SPACE_CODE:
            output.append("y")
        else:
            output.append(_encode_chunk(cur, table))
        cur = 0
        digits = 0

    if digits:
        padding = _ASCII85_ENCODING_GROUP_LENGTH - digits
        for _ in range(padding):
            cur <<= 8
        chunk = _encode_chunk(cur, table)
        output.append(chunk[: _ASCII85_DECODING_GROUP_LENGTH - padding])

    return "".join(output)

def decode(text: str, table: Optional[List[int]] = None) -> bytes:
    if table is None:
        table = _build_default_decode_table()

    enable_zero = table[ord("z")] == -1
    enable_group_space = table[ord("y")] == -1

    output = bytearray()
    cur = 0
    digits = 0

    for ch in text:
        c = ord(ch)
        if enable_zero and c == ord("z"):
            output.extend(_ASCII85_NULL_STRING)
            continue
        if enable_group_space and c == ord("y"):
            output.extend(_ASCII85_GROUP_SPACE_STRING)
            continue
        if table[c] == -1:
            continue

        cur = cur * _ASCII85_BASE + table[c]
        digits += 1

        if digits % _ASCII85_DECODING_GROUP_LENGTH != 0:
            continue

        output.extend(struct.pack(">I", cur & 0xFFFFFFFF))
        cur = 0
        digits = 0

    if digits:
        padding = _ASCII85_DECODING_GROUP_LENGTH - digits
        for _ in range(padding):
            cur = cur * _ASCII85_BASE + (_ASCII85_BASE - 1)
        raw = struct.pack(">I", cur & 0xFFFFFFFF)
        output.extend(raw[: _ASCII85_ENCODING_GROUP_LENGTH - padding])

    return bytes(output)

def _build_default_decode_table() -> List[int]:
    table: List[int] = [-1] * (1 << 8)
    for i in range(_ASCII85_BASE):
        table[_ASCII85_CODE_START + i] = i
    return table
