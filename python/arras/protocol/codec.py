import struct


def _sign_extend(value, bits):
    sign_bit = 1 << (bits - 1)
    return value - (1 << bits) if value & sign_bit else value

def decode_packet(data):
    out = [chr(data[0])]
    i = 1
    n = len(data)
    while i < n:
        dt = data[i]
        if dt <= 0xBF:
            out.append(("n", dt, dt if dt <= 96 else dt - 192, False))
            i += 1
        elif 0xC0 <= dt <= 0xDF:
            ln = dt - 0xC0
            out.append(("s", data[i + 1:i + 1 + ln].decode("utf-8", "replace")))
            i += 1 + ln
        elif 0xE0 <= dt <= 0xEF:
            v = ((dt - 0xE0) << 8) | data[i + 1]
            out.append(("n", v, _sign_extend(v, 12), False))
            i += 2
        elif 0xF0 <= dt <= 0xF7:
            v = ((dt - 0xF0) << 16) | (data[i + 1] << 8) | data[i + 2]
            out.append(("n", v, _sign_extend(v, 19), False))
            i += 3
        elif dt == 0xF8:
            v = (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]
            out.append(("n", v, _sign_extend(v, 25), False))
            i += 4
        elif dt == 0xF9:
            v = 0x1000000 + ((data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3])
            out.append(("n", v, _sign_extend(v, 25), False))
            i += 4
        elif dt == 0xFC:
            v = int.from_bytes(data[i + 1:i + 5], "big")
            out.append(("n", v, v - 2 ** 32 if v >= 2 ** 31 else v, False))
            i += 5
        elif dt == 0xFE:
            ln = int.from_bytes(data[i + 1:i + 3], "little")
            i += 3
            if ln == 0:
                ln = int.from_bytes(data[i:i + 4], "little")
                i += 4
            out.append(("s", data[i:i + ln].decode("utf-8", "replace")))
            i += ln
        elif dt == 0xFF:
            v = struct.unpack("<f", data[i + 1:i + 5])[0]
            out.append(("n", v, v, True))
            i += 5
        else:
            raise ValueError(f"unknown packet code 0x{dt:02x} at byte {i}")
    return out

def _write_str(buf, s):
    b = s.encode("utf-8")
    ln = len(b)
    if ln >= 65536:
        buf += b"\xfe\x00\x00" + ln.to_bytes(4, "little") + b
    elif ln >= 32:
        buf += b"\xfe" + ln.to_bytes(2, "little") + b
    else:
        buf += bytes([0xC0 + ln]) + b

def _write_num(buf, value, signed=False, is_float=False):
    if is_float:
        buf += b"\xff" + struct.pack("<f", value)
        return
    if not signed:
        if value <= 191:
            buf += bytes([value])
        elif value < 2 ** 12:
            buf += bytes([0xE0 + (value >> 8), value & 0xFF])
        elif value < 2 ** 19:
            buf += bytes([0xF0 + (value >> 16), (value >> 8) & 0xFF, value & 0xFF])
        elif value < 2 ** 24:
            buf += bytes([0xF8, value >> 16, (value >> 8) & 0xFF, value & 0xFF])
        elif value < 2 ** 25:
            buf += bytes([0xF9, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF])
        elif value < 2 ** 32:
            buf += bytes([0xFC]) + value.to_bytes(4, "big")
        else:
            raise ValueError(f"number too big: {value}")
    else:
        if -95 <= value <= 96:
            buf += bytes([value if value >= 0 else value + 192])
        elif -(2 ** 11) <= value < 2 ** 11:
            v = value + 2 ** 12 if value < 0 else value
            buf += bytes([0xE0 + (v >> 8), v & 0xFF])
        elif -(2 ** 18) <= value < 2 ** 18:
            v = value + 2 ** 19 if value < 0 else value
            buf += bytes([0xF0 + (v >> 16), (v >> 8) & 0xFF, v & 0xFF])
        elif -(2 ** 24) <= value < 2 ** 24:
            v = value + 2 ** 25 if value < 0 else value
            buf += bytes([0xF8 if not v & 0x1000000 else 0xF9,
                          (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF])
        elif -(2 ** 31) <= value < 2 ** 31:
            v = value + 2 ** 32 if value < 0 else value
            buf += bytes([0xFC]) + v.to_bytes(4, "big")
        else:
            raise ValueError(f"number too big: {value}")

def encode_packet(packet):
    buf = bytearray([ord(packet[0])])
    for f in packet[1:]:
        if isinstance(f, str):
            _write_str(buf, f)
        elif isinstance(f, int):
            _write_num(buf, f, signed=False)
        elif isinstance(f, float):
            _write_num(buf, f, is_float=True)
        elif isinstance(f, tuple):
            kind = f[0]
            if kind == "s":
                _write_str(buf, f[1])
            elif kind == "n":
                _write_num(buf, f[1], signed=f[2] != f[1] and not f[3], is_float=f[3])
            elif kind == "u":
                _write_num(buf, f[1], signed=False)
            elif kind == "i":
                _write_num(buf, f[1], signed=True)
        else:
            raise ValueError(f"cannot encode {f!r}")
    return bytes(buf)

def _u(field):
    return field[1]

def _s(field):
    return field[2]

def _b(field):
    return field[2] != 0

class Cursor:
    def __init__(self, fields):
        self.fields = fields
        self.i = 0

    def unsigned(self):
        v = self.fields[self.i][1]
        self.i += 1
        return v

    def signed(self):
        v = self.fields[self.i][2]
        self.i += 1
        return v

    def peek_signed(self):
        if self.i >= len(self.fields):
            return -1
        return self.fields[self.i][2]

    def boolean(self):
        v = self.fields[self.i][2] != 0
        self.i += 1
        return v

    def string(self):
        v = self.fields[self.i][1]
        self.i += 1
        return v

    def remaining(self):
        return len(self.fields) - self.i
