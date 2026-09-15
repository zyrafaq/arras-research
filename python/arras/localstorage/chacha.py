from __future__ import annotations
from typing import List

MASK = 0xFFFFFFFF

def _rotl32(x: int, n: int) -> int:
    x &= MASK
    return ((x << n) | (x >> (32 - n))) & MASK

def generate_key(state: List[int]) -> List[int]:
    b = [s & MASK for s in state]

    for _ in range(10):
        b[3] = (b[7] + b[3]) & MASK
        b[15] = _rotl32(b[3] ^ b[15], 16)
        b[11] = (b[15] + b[11]) & MASK
        b[7] = _rotl32(b[11] ^ b[7], 12)
        b[2] = (b[6] + b[2]) & MASK
        b[14] = _rotl32(b[2] ^ b[14], 16)
        b[10] = (b[14] + b[10]) & MASK
        b[6] = _rotl32(b[10] ^ b[6], 12)
        b[1] = (b[5] + b[1]) & MASK
        b[13] = _rotl32(b[1] ^ b[13], 16)
        b[9] = (b[13] + b[9]) & MASK
        b[5] = _rotl32(b[9] ^ b[5], 12)
        b[1] = (b[5] + b[1]) & MASK
        b[13] = _rotl32(b[1] ^ b[13], 8)

        f = (b[13] + b[9]) & MASK

        b[2] = (b[6] + b[2]) & MASK
        c = _rotl32(b[2] ^ b[14], 8)

        old_b4_for_xor = b[4]
        b[0] = (b[0] + b[4]) & MASK
        b[4] = _rotl32(b[0] ^ b[12], 16)
        b[12] = (b[4] + b[8]) & MASK
        left_val = _rotl32(old_b4_for_xor ^ b[12], 12)
        b[8] = left_val

        old_b12_for_add = b[12]
        e = (b[0] + b[8]) & MASK
        new_b12 = _rotl32(e ^ b[4], 8)
        b[12] = new_b12
        right_val = (old_b12_for_add + new_b12) & MASK
        b[8] = right_val

        b[4] = _rotl32(left_val ^ right_val, 7)

        d = (b[7] + b[3]) & MASK
        b[9] = (d + b[4]) & MASK

        b[14] = _rotl32(c ^ b[9], 16)

        b[0] = (f + b[14]) & MASK

        b[4] = _rotl32(b[0] ^ b[4], 12)
        b[3] = (b[4] + b[9]) & MASK
        b[14] = _rotl32(b[14] ^ b[3], 8)
        b[9] = (b[0] + b[14]) & MASK

        b[4] = _rotl32(b[9] ^ b[4], 7)

        outer_b8_for_add = b[8]
        old_b13_for_rotl = b[13]
        b[15] = _rotl32(b[15] ^ d, 8)
        b[0] = (b[15] + b[11]) & MASK
        b[8] = _rotl32(b[0] ^ b[7], 7)
        b[13] = (b[8] + b[2]) & MASK
        b[11] = _rotl32(old_b13_for_rotl ^ b[13], 16)
        b[7] = (outer_b8_for_add + b[11]) & MASK

        old_b7_for_add = b[7]
        b[7] = _rotl32(b[7] ^ b[8], 12)
        b[2] = (b[7] + b[13]) & MASK
        b[13] = _rotl32(b[11] ^ b[2], 8)
        b[8] = (old_b7_for_add + b[13]) & MASK

        b[7] = _rotl32(b[8] ^ b[7], 7)

        old_b12_for_rotl = b[12]
        b[10] = (b[10] + c) & MASK
        b[6] = _rotl32(b[10] ^ b[6], 7)
        b[12] = (b[6] + b[1]) & MASK
        b[11] = _rotl32(old_b12_for_rotl ^ b[12], 16)

        b[0] = (b[11] + b[0]) & MASK

        old_b0_for_add = b[0]
        b[6] = _rotl32(b[0] ^ b[6], 12)
        b[1] = (b[6] + b[12]) & MASK
        b[12] = _rotl32(b[11] ^ b[1], 8)
        b[11] = (old_b0_for_add + b[12]) & MASK

        b[6] = _rotl32(b[11] ^ b[6], 7)

        old_b10_for_add = b[10]
        b[0] = _rotl32(b[5] ^ f, 7)
        b[10] = (b[0] + e) & MASK
        b[15] = _rotl32(b[10] ^ b[15], 16)
        b[5] = (old_b10_for_add + b[15]) & MASK

        old_b5_for_add = b[5]
        f = _rotl32(b[5] ^ b[0], 12)
        b[0] = (f + b[10]) & MASK
        b[15] = _rotl32(b[15] ^ b[0], 8)
        b[10] = (old_b5_for_add + b[15]) & MASK

        b[5] = _rotl32(b[10] ^ f, 7)

    return [(state[i] + b[i]) & MASK for i in range(16)]
