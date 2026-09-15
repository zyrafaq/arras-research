function _signExtend(value, bits) {
    const signBit = 1 << (bits - 1);
    return value & signBit ? value - (1 << bits) : value;
}

const _textDecoder = new TextDecoder();
const _textEncoder = new TextEncoder();

export function decodePacket(data) {
    const out = [String.fromCharCode(data[0])];
    let i = 1;
    const n = data.length;
    while (i < n) {
        const dt = data[i];
        if (dt <= 0xbf) {
            out.push({ t: "n", u: dt, s: dt <= 96 ? dt : dt - 192 });
            i += 1;
        } else if (dt >= 0xc0 && dt <= 0xdf) {
            const ln = dt - 0xc0;
            out.push({ t: "s", v: _textDecoder.decode(data.subarray(i + 1, i + 1 + ln)) });
            i += 1 + ln;
        } else if (dt >= 0xe0 && dt <= 0xef) {
            const v = ((dt - 0xe0) << 8) | data[i + 1];
            out.push({ t: "n", u: v, s: _signExtend(v, 12) });
            i += 2;
        } else if (dt >= 0xf0 && dt <= 0xf7) {
            const v = ((dt - 0xf0) << 16) | (data[i + 1] << 8) | data[i + 2];
            out.push({ t: "n", u: v, s: _signExtend(v, 19) });
            i += 3;
        } else if (dt === 0xf8) {
            const v = (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
            out.push({ t: "n", u: v, s: _signExtend(v, 25) });
            i += 4;
        } else if (dt === 0xf9) {
            const v = 0x1000000 + ((data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]);
            out.push({ t: "n", u: v, s: _signExtend(v, 25) });
            i += 4;
        } else if (dt === 0xfc) {
            const v = ((data[i + 1] << 24) | (data[i + 2] << 16) | (data[i + 3] << 8) | data[i + 4]) >>> 0;
            out.push({ t: "n", u: v, s: v >= 2 ** 31 ? v - 2 ** 32 : v });
            i += 5;
        } else if (dt === 0xfe) {
            let ln = data[i + 1] | (data[i + 2] << 8);
            i += 3;
            if (ln === 0) {
                ln = (data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24)) >>> 0;
                i += 4;
            }
            out.push({ t: "s", v: _textDecoder.decode(data.subarray(i, i + ln)) });
            i += ln;
        } else if (dt === 0xff) {
            const dv = new DataView(data.buffer, data.byteOffset + i + 1, 4);
            const v = dv.getFloat32(0, true);
            out.push({ t: "n", u: v, s: v });
            i += 5;
        } else {
            throw new Error(`unknown packet code 0x${dt.toString(16)} at byte ${i}`);
        }
    }
    return out;
}

function _writeStr(bytes, s) {
    const b = _textEncoder.encode(s);
    const ln = b.length;
    if (ln >= 65536) {
        bytes.push(0xfe, 0, 0);
        _pushU32le(bytes, ln);
    } else if (ln >= 32) {
        bytes.push(0xfe, ln & 0xff, (ln >> 8) & 0xff);
    } else {
        bytes.push(0xc0 + ln);
    }
    for (let i = 0; i < ln; i++) bytes.push(b[i]);
}

function _pushU32le(bytes, v) {
    bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
}

function _writeNum(bytes, value, signed = false, isFloat = false) {
    if (isFloat) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setFloat32(0, value, true);
        bytes.push(0xff, b[0], b[1], b[2], b[3]);
        return;
    }
    value = Math.trunc(value);
    if (!signed) {
        if (!(value >= 0 && value < 2 ** 32)) throw new Error(`number out of range: ${value}`);
        if (value <= 191) {
            bytes.push(value);
        } else if (value < 2 ** 12) {
            bytes.push(0xe0 + (value >> 8), value & 0xff);
        } else if (value < 2 ** 19) {
            bytes.push(0xf0 + (value >> 16), (value >> 8) & 0xff, value & 0xff);
        } else if (value < 2 ** 24) {
            bytes.push(0xf8, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
        } else if (value < 2 ** 25) {
            bytes.push(0xf9, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
        } else {
            bytes.push(0xfc,
                (value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
        }
    } else {
        if (value >= -95 && value <= 96) {
            bytes.push(value >= 0 ? value : value + 192);
        } else if (value >= -(2 ** 11) && value < 2 ** 11) {
            const v = value < 0 ? value + 2 ** 12 : value;
            bytes.push(0xe0 + (v >> 8), v & 0xff);
        } else if (value >= -(2 ** 18) && value < 2 ** 18) {
            const v = value < 0 ? value + 2 ** 19 : value;
            bytes.push(0xf0 + (v >> 16), (v >> 8) & 0xff, v & 0xff);
        } else if (value >= -(2 ** 24) && value < 2 ** 24) {
            const v = value < 0 ? value + 2 ** 25 : value;
            bytes.push(v & 0x1000000 ? 0xf9 : 0xf8, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
        } else if (value >= -(2 ** 31) && value < 2 ** 31) {
            const v = value < 0 ? value + 2 ** 32 : value;
            bytes.push(0xfc, (v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
        } else {
            throw new Error(`number out of range: ${value}`);
        }
    }
}

export function encodePacket(packet) {
    const bytes = [packet[0].charCodeAt(0)];
    for (let i = 1; i < packet.length; i++) {
        const f = packet[i];
        if (typeof f === "string") {
            _writeStr(bytes, f);
        } else if (typeof f === "number") {
            if (Number.isInteger(f)) _writeNum(bytes, f, false);
            else _writeNum(bytes, f, false, true);
        } else if (f && typeof f === "object") {
            if ("s" in f) _writeStr(bytes, f.s);
            else if ("u" in f) _writeNum(bytes, f.u, false);
            else if ("i" in f) _writeNum(bytes, f.i, true);
            else if ("f" in f) _writeNum(bytes, f.f, false, true);
            else throw new Error(`cannot encode ${JSON.stringify(f)}`);
        } else {
            throw new Error(`cannot encode ${String(f)}`);
        }
    }
    return Uint8Array.from(bytes);
}

export class Cursor {
    constructor(fields) {
        this.fields = fields;
        this.i = 0;
    }

    unsigned() {
        return this.fields[this.i++].u;
    }

    signed() {
        return this.fields[this.i++].s;
    }

    peekSigned() {
        return this.fields[this.i].s;
    }

    boolean() {
        return this.fields[this.i++].s !== 0;
    }

    string() {
        return this.fields[this.i++].v;
    }

    remaining() {
        return this.fields.length - this.i;
    }
}
