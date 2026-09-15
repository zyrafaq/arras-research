#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");

const { encode: a85Encode, decode: a85Decode } = require("./ascii85");
const { expandKey } = require("./key-schedule");
const typeDef = require("./localstorage_def.json");

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
  "!$%&()+,-./:;<=>?[]^{|}";
const STATE_CONSTANTS = [
  3684054920433006693n,
  7719281312240119090n,
  -37104944818579849n,
  -8740294561011147131n,
  -736570361772537783n,
  2857145462548429679n,
];

const decoder = new TextDecoder();
const view = (bytes) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function readBigEndian(bytes) {
  if (bytes.length === 0) return 0;
  if (bytes.length <= 6) return Buffer.from(bytes).readUIntBE(0, bytes.length);
  return [...bytes].reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
}

function makeState(n, m) {
  const state = [];
  for (const constant of STATE_CONSTANTS) {
    const word = BigInt.asUintN(64, constant);
    state.push(
      Number(BigInt.asIntN(32, word & 0xffffffffn)),
      Number(BigInt.asIntN(32, word >> 32n)));
  }
  return state.concat(0, 0, n, m);
}

function keyBytes(state) {
  const bytes = new Uint8Array(64);
  const dataView = view(bytes);
  expandKey(state).forEach((word, i) => dataView.setUint32(i * 4, word, true));
  return bytes;
}

function xorCipher(dest, src, size, n, m) {
  const state = makeState(n, m);
  for (let offset = 0; offset < size; offset += 64) {
    state[12] = offset / 64;
    const key = keyBytes(state);
    for (let i = 0; i < 64 && offset + i < size; i++) {
      dest[offset + i] = src[offset + i] ^ key[i];
    }
  }
}

function decryptRaw(text) {
  const raw = a85Decode(text.trim(), ALPHABET);
  if (raw.length < 16) throw new Error("blob too short");
  const size = raw.length - 16;
  const plain = new Uint8Array(size);
  const n = view(raw).getInt32(size + 8, true);
  const m = view(raw).getInt32(size + 12, true);
  xorCipher(plain, raw, size, n, m);
  return plain;
}

function encryptRaw(data) {
  const size = data.length;
  const n = crypto.randomBytes(4).readUInt32LE(0) % 1e9;
  const m = crypto.randomBytes(4).readUInt32LE(0) % 1e9;

  const ciphertext = new Uint8Array(size + 16);
  xorCipher(ciphertext, data, size, n, m);

  const trailer = Buffer.alloc(size + 40);
  Buffer.from(ciphertext.buffer, 0, size).copy(trailer);
  STATE_CONSTANTS.slice(2).forEach((c, i) =>
    trailer.writeBigInt64LE(c, size + i * 8));
  trailer.writeUInt32LE(n, size + 32);
  trailer.writeUInt32LE(m, size + 36);

  crypto.createHash("sha256").update(trailer).digest().copy(ciphertext, size, 0, 8);
  view(ciphertext).setUint32(size + 8, n, true);
  view(ciphertext).setUint32(size + 12, m, true);

  return a85Encode(ciphertext, ALPHABET);
}

function hintFor(dottedKey) {
  return dottedKey.split(".").reduce(
    (node, part) => (node && typeof node === "object" ? node[part] : ""),
    typeDef);
}

function fieldValue(bytes, hint) {
  switch (hint) {
    case "bool": return bytes[0] === 1;
    case "int": return readBigEndian(bytes);
    case "float64": return view(bytes).getFloat64(0, true);
    case "string": return decoder.decode(bytes);
    default: {
      const asText = [...bytes].every(
        (b) => (b >= 0x20 && b <= 0x7e) || b === 0x0a);
      return asText ? decoder.decode(bytes) : readBigEndian(bytes);
    }
  }
}

function assign(root, dottedKey, value) {
  const parts = dottedKey.split(".");
  const last = parts.pop();
  const node = parts.reduce((obj, part) => (obj[part] ??= {}), root);
  node[last] = value;
}

function decode(text) {
  const plain = decryptRaw(text);
  const total = view(plain).getInt16(0, true);
  const out = {};
  let offset = 2;

  while (offset < total) {
    const keyLength = view(plain).getInt16(offset, true);
    offset += 2;
    const key = Buffer.from(plain.subarray(offset, offset + keyLength))
      .toString("latin1");
    offset += keyLength;

    const valueLength = view(plain).getInt16(offset, true);
    offset += 2;
    const bytes = plain.subarray(offset, offset + valueLength);
    offset += valueLength;

    assign(out, key, fieldValue(bytes, hintFor(key)));
  }
  return out;
}

function flatten(object, prefix = "") {
  const flat = {};
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(flat, flatten(value, path));
    } else {
      flat[path] = value;
    }
  }
  return flat;
}

function fieldBytes(value, key) {
  if (typeof value === "boolean") return Uint8Array.of(value ? 1 : 0);
  if (typeof value === "bigint") {
    return key.includes("color")
      ? Uint8Array.of(Number((value >> 16n) & 0xffn),
                      Number((value >> 8n) & 0xffn),
                      Number(value & 0xffn))
      : Uint8Array.of(Number(value & 0xffn));
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      const bytes = new Uint8Array(8);
      view(bytes).setFloat64(0, value, true);
      return bytes;
    }
    return key.includes("color")
      ? Uint8Array.of((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff)
      : Uint8Array.of(value & 0xff);
  }
  if (typeof value === "string") return Buffer.from(value, "latin1");
  throw new TypeError(`unsupported value for ${key}: ${typeof value}`);
}

function encode(settings) {
  const buffer = new Uint8Array(8176);
  const dataView = view(buffer);
  let offset = 2;

  for (const [key, value] of Object.entries(flatten(settings))) {
    const name = Buffer.from(key, "latin1");
    dataView.setInt16(offset, name.length, true);
    offset += 2;
    buffer.set(name, offset);
    offset += name.length;

    const bytes = fieldBytes(value, key);
    dataView.setInt16(offset, bytes.length, true);
    offset += 2;
    buffer.set(bytes, offset);
    offset += bytes.length;
  }

  dataView.setInt16(0, offset, true);
  return encryptRaw(buffer.subarray(0, offset + 2));
}

const decodeFlat = (text) => flatten(decode(text));

function jsonValue(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function cli(args) {
  const [command, argument] = args;
  const stdin = () =>
    (argument && argument !== "-") ? argument : fs.readFileSync(0, "utf8");

  if (command === "decode" || command === "flat") {
    const value = command === "flat" ? decodeFlat(stdin()) : decode(stdin());
    console.log(JSON.stringify(value, jsonValue, 2));
    return 0;
  }
  if (command === "encode" && argument) {
    const text = argument === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(argument, "utf8");
    console.log(encode(JSON.parse(text)));
    return 0;
  }

  console.error("usage: node index.js decode|flat <code> | encode <file>  ('-' = stdin)");
  return 2;
}

if (require.main === module) {
  try {
    process.exitCode = cli(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { decode, encode, decodeFlat, flatten };
