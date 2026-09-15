import { Sha256 } from "./sha256.js";

const _P = 2n ** 255n - 19n;
const _A24 = 121665n;
const _CHACHA_CONSTS = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

function _rotl32(x, n) {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function _quarterRound(s, a, b, c, d) {
    s[a] = (s[a] + s[b]) >>> 0;
    s[d] = _rotl32(s[d] ^ s[a], 16);
    s[c] = (s[c] + s[d]) >>> 0;
    s[b] = _rotl32(s[b] ^ s[c], 12);
    s[a] = (s[a] + s[b]) >>> 0;
    s[d] = _rotl32(s[d] ^ s[a], 8);
    s[c] = (s[c] + s[d]) >>> 0;
    s[b] = _rotl32(s[b] ^ s[c], 7);
}

function _chachaBlock(state) {
    const out = new Int32Array(state);
    for (let i = 0; i < 10; i++) {
        _quarterRound(out, 0, 4, 8, 12);
        _quarterRound(out, 1, 5, 9, 13);
        _quarterRound(out, 2, 6, 10, 14);
        _quarterRound(out, 3, 7, 11, 15);
        _quarterRound(out, 0, 5, 10, 15);
        _quarterRound(out, 1, 6, 11, 12);
        _quarterRound(out, 2, 7, 8, 13);
        _quarterRound(out, 3, 4, 9, 14);
    }
    const ks = new Uint8Array(64);
    const dv = new DataView(ks.buffer);
    for (let i = 0; i < 16; i++) {
        dv.setUint32(i * 4, (out[i] + state[i]) >>> 0, true);
    }
    return ks;
}

export function chachaCrypt(data, key, packetIndex, decrypt) {
    const state = new Int32Array(16);
    for (let i = 0; i < 4; i++) state[i] = _CHACHA_CONSTS[i];
    const kd = new DataView(key.buffer, key.byteOffset, key.byteLength);
    for (let i = 0; i < 8; i++) state[4 + i] = kd.getInt32(i * 4, true);
    state[13] = 0;
    state[14] = packetIndex | 0;
    state[15] = decrypt ? -2147483648 : 0;
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 64) {
        state[12] = (i / 64) | 0;
        const ks = _chachaBlock(state);
        for (let j = 0; j < 64 && i + j < data.length; j++) {
            out[i + j] = data[i + j] ^ ks[j];
        }
    }
    return out;
}

function _u64le(n) {
    const b = new Uint8Array(8);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, n >>> 0, true);
    dv.setUint32(4, Math.floor(n / 2 ** 32) >>> 0, true);
    return b;
}

export class ArrasCipher {
    constructor(sharedKey) {
        this.key = sharedKey instanceof Uint8Array ? sharedKey : new Uint8Array(sharedKey);
        this.sent = 0;
        this.received = 0;
    }

    encrypt(packet) {
        const idx = this.sent++;
        const cipher = chachaCrypt(packet, this.key, idx, false);
        const hasher = new Sha256();
        hasher.update(cipher);
        hasher.update(this.key);
        hasher.update(_u64le(idx));
        const mac = hasher.digest().subarray(0, 6);
        const result = new Uint8Array(cipher.length + 6);
        result.set(cipher);
        result.set(mac, cipher.length);
        return result;
    }

    decrypt(packet) {
        const idx = this.received++;
        return chachaCrypt(packet, this.key, idx, true);
    }
}

function _modpow(base, exp, mod) {
    let result = 1n;
    base %= mod;
    while (exp > 0n) {
        if (exp & 1n) result = (result * base) % mod;
        base = (base * base) % mod;
        exp >>= 1n;
    }
    return result;
}

export function x25519(k, u) {
    const kb = new Uint8Array(32);
    kb.set((k instanceof Uint8Array ? k : new Uint8Array(k)).slice(0, 32));
    kb[0] &= 248;
    kb[31] &= 127;
    kb[31] |= 64;
    const uv = u instanceof Uint8Array ? u : new Uint8Array(u);
    let hex = "";
    for (let i = 31; i >= 0; i--) hex += uv[i].toString(16).padStart(2, "0");
    const x1 = BigInt("0x" + hex);
    let x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0n;
    for (let t = 254; t >= 0; t--) {
        const kt = BigInt((kb[t >> 3] >> (t & 7)) & 1);
        swap ^= kt;
        if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
        swap = kt;
        const a = (x2 + z2) % _P;
        const aa = (a * a) % _P;
        const b = (x2 - z2) % _P;
        const bb = (b * b) % _P;
        const e = (aa - bb) % _P;
        const c = (x3 + z3) % _P;
        const d = (x3 - z3) % _P;
        const da = (d * a) % _P;
        const cb = (c * b) % _P;
        const sum = (da + cb) % _P;
        const diff = ((da - cb) % _P + _P) % _P;
        x3 = (sum * sum) % _P;
        z3 = (diff * diff * x1) % _P;
        x2 = (aa * bb) % _P;
        z2 = (e * ((aa + _A24 * e) % _P)) % _P;
    }
    if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
    const res = (x2 * _modpow(z2, _P - 2n, _P)) % _P;
    const hexStr = res.toString(16).padStart(64, "0");
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        out[i] = parseInt(hexStr.slice((31 - i) * 2, (31 - i) * 2 + 2), 16);
    }
    return out;
}

export function x25519Base(k) {
    const base = new Uint8Array(32);
    base[0] = 9;
    return x25519(k, base);
}
