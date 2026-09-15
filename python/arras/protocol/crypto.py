import hashlib

P = 2 ** 255 - 19
A24 = 121665

CHACHA_CONST = (0x61707865, 0x3320646e, 0x79622d32, 0x6b206574)


def x25519(k: bytes, u: bytes) -> bytes:
    k = bytearray(k[:32].ljust(32, b"\x00"))
    k[0] &= 248
    k[31] &= 127
    k[31] |= 64
    x1 = int.from_bytes(u[:32], "little")
    x2, z2 = 1, 0
    x3, z3 = x1, 1
    swap = 0
    for t in range(254, -1, -1):
        kt = (k[t // 8] >> (t % 8)) & 1
        swap ^= kt
        if swap:
            x2, x3 = x3, x2
            z2, z3 = z3, z2
        swap = kt
        a = (x2 + z2) % P
        aa = a * a % P
        b = (x2 - z2) % P
        bb = b * b % P
        e = (aa - bb) % P
        c = (x3 + z3) % P
        d = (x3 - z3) % P
        da = d * a % P
        cb = c * b % P
        x3 = (da + cb) % P
        x3 = x3 * x3 % P
        z3 = (da - cb) % P
        z3 = z3 * z3 % P
        z3 = z3 * x1 % P
        x2 = aa * bb % P
        z2 = e * (aa + A24 * e) % P
    if swap:
        x2, x3 = x3, x2
        z2, z3 = z3, z2
    return (x2 * pow(z2, P - 2, P) % P).to_bytes(32, "little")

def x25519_base(k: bytes) -> bytes:
    return x25519(k, (9).to_bytes(32, "little"))

def _rotl32(x: int, n: int) -> int:
    return ((x << n) | (x >> (32 - n))) & 0xFFFFFFFF

def _quarter_round(s, a, b, c, d):
    s[a] = (s[a] + s[b]) & 0xFFFFFFFF
    s[d] = _rotl32(s[d] ^ s[a], 16)
    s[c] = (s[c] + s[d]) & 0xFFFFFFFF
    s[b] = _rotl32(s[b] ^ s[c], 12)
    s[a] = (s[a] + s[b]) & 0xFFFFFFFF
    s[d] = _rotl32(s[d] ^ s[a], 8)
    s[c] = (s[c] + s[d]) & 0xFFFFFFFF
    s[b] = _rotl32(s[b] ^ s[c], 7)

def _chacha_block(state):
    out = list(state)
    for _ in range(10):
        _quarter_round(out, 0, 4, 8, 12)
        _quarter_round(out, 1, 5, 9, 13)
        _quarter_round(out, 2, 6, 10, 14)
        _quarter_round(out, 3, 7, 11, 15)
        _quarter_round(out, 0, 5, 10, 15)
        _quarter_round(out, 1, 6, 11, 12)
        _quarter_round(out, 2, 7, 8, 13)
        _quarter_round(out, 3, 4, 9, 14)
    return [(out[i] + state[i]) & 0xFFFFFFFF for i in range(16)]

def _state(key: bytes, packet_index: int, decrypt: bool) -> list:
    words = [int.from_bytes(key[i:i + 4], "little") for i in range(0, 32, 4)]
    return list(CHACHA_CONST) + words + [
        0,
        0,
        packet_index & 0xFFFFFFFF,
        (packet_index >> 32) & 0xFFFFFFFF if not decrypt else 0x80000000,
    ]

def _crypt(data: bytes, key: bytes, packet_index: int, decrypt: bool) -> bytes:
    out = bytearray(len(data))
    state = _state(key, packet_index, decrypt)
    for i in range(0, len(data), 64):
        state[12] = i // 64
        ks = _chacha_block(state)
        for j in range(64):
            if i + j < len(data):
                out[i + j] = data[i + j] ^ ((ks[j // 4] >> (8 * (j % 4))) & 0xFF)
    return bytes(out)

class ArrasCipher:
    def __init__(self, shared_key: bytes):
        self.key = shared_key
        self.sent = 0
        self.received = 0

    def encrypt(self, packet: bytes) -> bytes:
        idx = self.sent
        self.sent += 1
        cipher = _crypt(packet, self.key, idx, decrypt=False)
        mac = hashlib.sha256(cipher + self.key + idx.to_bytes(8, "little")).digest()
        return cipher + mac[:6]

    def decrypt(self, packet: bytes) -> bytes:
        idx = self.received
        self.received += 1
        return _crypt(packet, self.key, idx, decrypt=True)

if __name__ == "__main__":
    alice_priv = bytes.fromhex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a")
    alice_pub = bytes.fromhex("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a")
    bob_priv = bytes.fromhex("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb")
    bob_pub = bytes.fromhex("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f")
    shared = bytes.fromhex("4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742")
    assert x25519(alice_priv, bob_pub) == shared, "alice x25519 mismatch"
    assert x25519(bob_priv, alice_pub) == shared, "bob x25519 mismatch"
    assert x25519_base(alice_priv) == alice_pub, "alice base mismatch"
    assert x25519_base(bob_priv) == bob_pub, "bob base mismatch"
    print("x25519 RFC 7748 vectors: OK")

    key = bytes(range(32))
    c = ArrasCipher(key)
    pkt = bytes([0x6B, 0xC0, 0xC0, 0xC0])
    enc = c.encrypt(pkt)
    assert len(enc) == len(pkt) + 6
    c2 = ArrasCipher(key)
    dec = c2.decrypt(enc)
    assert dec == pkt, f"roundtrip mismatch: {dec.hex()}"
    print("encrypt/decrypt roundtrip: OK")
