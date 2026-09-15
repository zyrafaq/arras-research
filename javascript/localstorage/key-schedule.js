"use strict";

function rotl(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function add(a, b) {
  return (a + b) >>> 0;
}

function expandKey(state) {
  const b = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    b[i] = state[i] >>> 0;
  }

  for (let round = 0; round < 10; round++) {
    b[3] = add(b[7], b[3]);
    b[15] = rotl(b[3] ^ b[15], 16);
    b[11] = add(b[15], b[11]);
    b[7] = rotl(b[11] ^ b[7], 12);
    b[2] = add(b[6], b[2]);
    b[14] = rotl(b[2] ^ b[14], 16);
    b[10] = add(b[14], b[10]);
    b[6] = rotl(b[10] ^ b[6], 12);
    b[1] = add(b[5], b[1]);
    b[13] = rotl(b[1] ^ b[13], 16);
    b[9] = add(b[13], b[9]);
    b[5] = rotl(b[9] ^ b[5], 12);
    b[1] = add(b[5], b[1]);
    b[13] = rotl(b[1] ^ b[13], 8);

    const f = add(b[13], b[9]);

    b[2] = add(b[6], b[2]);
    const c = rotl(b[2] ^ b[14], 8);

    const prevB4 = b[4];
    b[0] = add(b[0], b[4]);
    b[4] = rotl(b[0] ^ b[12], 16);
    b[12] = add(b[4], b[8]);
    const left = rotl(prevB4 ^ b[12], 12);
    b[8] = left;

    const prevB12 = b[12];
    const e = add(b[0], b[8]);
    const nextB12 = rotl(e ^ b[4], 8);
    b[12] = nextB12;
    const right = add(prevB12, nextB12);
    b[8] = right;

    b[4] = rotl(left ^ right, 7);

    const d = add(b[7], b[3]);
    b[9] = add(d, b[4]);
    b[14] = rotl(c ^ b[9], 16);
    b[0] = add(f, b[14]);

    b[4] = rotl(b[0] ^ b[4], 12);
    b[3] = add(b[4], b[9]);
    b[14] = rotl(b[14] ^ b[3], 8);
    b[9] = add(b[0], b[14]);

    b[4] = rotl(b[9] ^ b[4], 7);

    const outerB8 = b[8];
    const prevB13 = b[13];
    b[15] = rotl(b[15] ^ d, 8);
    b[0] = add(b[15], b[11]);
    b[8] = rotl(b[0] ^ b[7], 7);
    b[13] = add(b[8], b[2]);
    b[11] = rotl(prevB13 ^ b[13], 16);
    b[7] = add(outerB8, b[11]);

    const prevB7 = b[7];
    b[7] = rotl(b[7] ^ b[8], 12);
    b[2] = add(b[7], b[13]);
    b[13] = rotl(b[11] ^ b[2], 8);
    b[8] = add(prevB7, b[13]);

    b[7] = rotl(b[8] ^ b[7], 7);

    const prevB12b = b[12];
    b[10] = add(b[10], c);
    b[6] = rotl(b[10] ^ b[6], 7);
    b[12] = add(b[6], b[1]);
    b[11] = rotl(prevB12b ^ b[12], 16);

    b[0] = add(b[11], b[0]);

    const prevB0 = b[0];
    b[6] = rotl(b[0] ^ b[6], 12);
    b[1] = add(b[6], b[12]);
    b[12] = rotl(b[11] ^ b[1], 8);
    b[11] = add(prevB0, b[12]);

    b[6] = rotl(b[11] ^ b[6], 7);

    const prevB10 = b[10];
    b[0] = rotl(b[5] ^ f, 7);
    b[10] = add(b[0], e);
    b[15] = rotl(b[10] ^ b[15], 16);
    b[5] = add(prevB10, b[15]);

    const prevB5 = b[5];
    const fNext = rotl(b[5] ^ b[0], 12);
    b[0] = add(fNext, b[10]);
    b[15] = rotl(b[15] ^ b[0], 8);
    b[10] = add(prevB5, b[15]);

    b[5] = rotl(b[10] ^ fNext, 7);
  }

  const out = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = add(state[i] >>> 0, b[i]);
  }
  return out;
}

module.exports = { expandKey };
