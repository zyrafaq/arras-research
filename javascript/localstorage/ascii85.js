"use strict";

const RADIX = 85;
const SPACE_WORD = 0x20202020;
const ZERO_CHAR = 0x7a;
const SPACE_CHAR = 0x79;

function buildDecodeTable(alphabet) {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < alphabet.length; i++) {
    table[alphabet.charCodeAt(i)] = i;
  }
  return table;
}

function wordToBytes(value) {
  const w = BigInt(value) & 0xffffffffn;
  return [
    Number(w >> 24n),
    Number((w >> 16n) & 0xffn),
    Number((w >> 8n) & 0xffn),
    Number(w & 0xffn),
  ];
}

function encodeGroup(value, alphabet) {
  let word = value;
  let out = "";
  for (let i = 0; i < 5; i++) {
    out = alphabet[word % RADIX] + out;
    word = Math.floor(word / RADIX);
  }
  return out;
}

function encode(bytes, alphabet) {
  const parts = [];
  let word = 0;
  let pending = 0;

  for (const byte of bytes) {
    word = word * 256 + byte;
    pending++;
    if (pending < 4) continue;
    parts.push(word === SPACE_WORD ? "y" : encodeGroup(word, alphabet));
    word = pending = 0;
  }

  if (pending) {
    let tail = word;
    for (let i = pending; i < 4; i++) tail *= 256;
    parts.push(encodeGroup(tail, alphabet).slice(0, pending + 1));
  }

  return parts.join("");
}

function decode(text, alphabet) {
  const table = buildDecodeTable(alphabet);
  const expandZero = table[ZERO_CHAR] === -1;
  const expandSpace = table[SPACE_CHAR] === -1;

  const out = [];
  let word = 0;
  let pending = 0;

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (expandZero && code === ZERO_CHAR) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (expandSpace && code === SPACE_CHAR) {
      out.push(32, 32, 32, 32);
      continue;
    }
    const digit = table[code];
    if (digit === -1) continue;

    word = word * RADIX + digit;
    pending++;
    if (pending < 5) continue;
    out.push(...wordToBytes(word));
    word = pending = 0;
  }

  if (pending) {
    const missing = 5 - pending;
    for (let i = 0; i < missing; i++) word = word * RADIX + (RADIX - 1);
    out.push(...wordToBytes(word).slice(0, 4 - missing));
  }

  return Uint8Array.from(out);
}

module.exports = { encode, decode };
