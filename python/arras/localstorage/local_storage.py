from __future__ import annotations

import hashlib
import json
import os
import struct
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .ascii85 import decode as a85_decode, encode as a85_encode, build_decode_table
from .chacha import generate_key as _generate_key

_ENCRYPT_TABLE = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    "!$%&()+,-./:;<=>?[]^{|}"
)
_DECODE_TABLE = build_decode_table(_ENCRYPT_TABLE)

_STATE_CONSTANTS = [
    3684054920433006693,
    7719281312240119090,
    -37104944818579849,
    -8740294561011147131,
    -736570361772537783,
    2857145462548429679,
]

_PACKAGE_DIR = Path(__file__).parent
_DEF_PATH = _PACKAGE_DIR.parent / "data" / "localstorage_def.json"
_TYPE_DEF: Dict[str, Any] = json.loads(_DEF_PATH.read_text())

_STATE_INT64 = [
    3684054920433006693,
    7719281312240119090,
    -37104944818579849,
    -8740294561011147131,
    -736570361772537783,
    2857145462548429679,
]

def _unpack_state_constants() -> List[int]:
    state: List[int] = []
    for val in _STATE_INT64:
        low, high = struct.unpack("<ii", struct.pack("<q", val))
        state.append(low)
        state.append(high)
    return state

def _decrypt_raw(input_bytes: bytes) -> bytes:
    raw = a85_decode(input_bytes.decode("ascii"), _DECODE_TABLE)
    data = raw[:-16]
    size = len(data)

    state = _unpack_state_constants() + [0, 0, 0, 0]
    state[14] = struct.unpack_from("<i", raw, size + 8)[0]
    state[15] = struct.unpack_from("<i", raw, size + 12)[0]

    out = bytearray(size)
    for i in range(0, size, 64):
        state[12] = i // 64
        chunk_key = _generate_key(state)
        key_bytes = b"".join(struct.pack("<I", v) for v in chunk_key)
        for j in range(64):
            if i + j < size:
                out[i + j] = data[i + j] ^ key_bytes[j]

    return bytes(out)

def _encrypt_raw(data: bytes) -> bytes:
    size = len(data)
    n = int.from_bytes(os.urandom(4), "little") % 1_000_000_000
    m = int.from_bytes(os.urandom(4), "little") % 1_000_000_000

    state = _unpack_state_constants() + [0, 0, 0, 0]
    state[14] = n
    state[15] = m

    encrypted = bytearray(size + 16)
    for i in range(0, size, 64):
        state[12] = i // 64
        chunk_key = _generate_key(state)
        key_bytes = b"".join(struct.pack("<I", v) for v in chunk_key)
        for j in range(64):
            if i + j < size:
                encrypted[i + j] = data[i + j] ^ key_bytes[j]

    hash_input = bytearray(size + 40)
    hash_input[:size] = encrypted[:size]
    struct.pack_into("<q", hash_input, size, _STATE_INT64[2])
    struct.pack_into("<q", hash_input, size + 8, _STATE_INT64[3])
    struct.pack_into("<q", hash_input, size + 16, _STATE_INT64[4])
    struct.pack_into("<q", hash_input, size + 24, _STATE_INT64[5])
    struct.pack_into("<i", hash_input, size + 32, n)
    struct.pack_into("<i", hash_input, size + 36, m)
    h = hashlib.sha256(bytes(hash_input)).digest()

    struct.pack_into("<q", encrypted, size, struct.unpack_from("<q", h, 0)[0])
    struct.pack_into("<i", encrypted, size + 8, n)
    struct.pack_into("<i", encrypted, size + 12, m)

    return a85_encode(bytes(encrypted), _ENCRYPT_TABLE)

def _resolve_type(key: str, defn: Dict[str, Any]) -> str:
    return defn.get(key, "")

def _decode_value(raw_bytes: bytes, type_hint: str, is_color: bool) -> Any:
    if type_hint == "bool":
        return raw_bytes[0] == 1
    if type_hint == "int":
        v = 0
        for b in raw_bytes:
            v = (v << 8) | b
        return v
    if type_hint == "float64":
        return struct.unpack("<d", raw_bytes[:8])[0]
    if type_hint == "string":
        return raw_bytes.decode("utf-8", errors="replace")
    if all(0x20 <= b <= 0x7E or b == 0x0A for b in raw_bytes):
        return raw_bytes.decode("utf-8", errors="replace")
    if len(raw_bytes) <= 6:
        v = 0
        for b in raw_bytes:
            v = (v << 8) | b
        return v
    v = 0
    for b in raw_bytes:
        v = (v << 8) | b
    return v

def _encode_value(value: Any, key: str) -> bytes:
    if isinstance(value, bool):
        return bytes([1 if value else 0])
    if isinstance(value, int):
        if "color" in key:
            return bytes([(value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF])
        return bytes([value & 0xFF])
    if isinstance(value, float):
        return struct.pack("<d", value)
    if isinstance(value, str):
        return value.encode("ascii", errors="replace")
    raise TypeError(f"Unsupported value type: {type(value)}")

def _flatten(obj: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
    flat: Dict[str, Any] = {}
    for k, v in obj.items():
        full = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            flat.update(_flatten(v, full))
        else:
            flat[full] = v
    return flat

def _build_nested(flat: Dict[str, Any]) -> Dict[str, Any]:
    root: Dict[str, Any] = {}
    for dotted_key, value in flat.items():
        parts = dotted_key.split(".")
        node = root
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = value
    return root

class ArrasLocalStorage:
    def decode(self, encrypted: str) -> Dict[str, Any]:
        raw = _decrypt_raw(encrypted.encode("ascii"))
        buf = bytearray(raw)
        total = struct.unpack_from("<h", buf, 0)[0]

        output: Dict[str, Any] = {}
        i = 2
        while i < total:
            key_len = struct.unpack_from("<h", buf, i)[0]
            i += 2
            key = buf[i : i + key_len].decode("ascii", errors="replace")
            i += key_len

            val_len = struct.unpack_from("<h", buf, i)[0]
            i += 2
            val_raw = bytes(buf[i : i + val_len])
            i += val_len

            parts = key.split(".")
            defn_node = _TYPE_DEF
            out_node = output
            for p in parts[:-1]:
                out_node = out_node.setdefault(p, {})
                defn_node = defn_node.get(p, {}) if isinstance(defn_node, dict) else {}

            last = parts[-1]
            hint = ""
            if isinstance(defn_node, dict):
                hint = defn_node.get(last, "")

            out_node[last] = _decode_value(val_raw, hint, "color" in key)

        return output

    def encode(self, settings: Dict[str, Any]) -> str:
        flat = _flatten(settings)
        buf = bytearray(8176)
        i = 2

        for key, value in flat.items():
            key_bytes = key.encode("ascii")
            struct.pack_into("<h", buf, i, len(key_bytes))
            i += 2
            buf[i : i + len(key_bytes)] = key_bytes
            i += len(key_bytes)

            val = _encode_value(value, key)
            struct.pack_into("<h", buf, i, len(val))
            i += 2
            buf[i : i + len(val)] = val
            i += len(val)

        struct.pack_into("<h", buf, 0, i)
        return _encrypt_raw(bytes(buf[: i + 2]))

    def decode_flat(self, encrypted: str) -> Dict[str, Any]:
        return _flatten(self.decode(encrypted))
