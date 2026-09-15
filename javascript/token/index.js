#!/usr/bin/env node
"use strict";

const ID_OFFSET = 0;
const EXPIRY_OFFSET = 16;

function decode(token) {
  const raw = Buffer.from(token.trim(), "base64");
  if (raw.length < EXPIRY_OFFSET + 8) {
    throw new Error(`token too short: ${raw.length} bytes`);
  }
  const userId = raw.readBigUInt64LE(ID_OFFSET);
  const expiresAt = new Date(Number(raw.readBigInt64LE(EXPIRY_OFFSET) / 1000n));
  return { userId, expiresAt, expired: expiresAt <= new Date() };
}

module.exports = { decode };

if (require.main === module) {
  const [token, ...flags] = process.argv.slice(2);
  if (!token) {
    console.error("usage: node index.js <token|-> [--json]");
    process.exit(2);
  }
  const text = token === "-" ? require("fs").readFileSync(0, "utf8") : token;
  try {
    const { userId, expiresAt, expired } = decode(text);
    if (flags.includes("--json")) {
      console.log(JSON.stringify({
        user_id: userId.toString(),
        expires_at: expiresAt.toISOString(),
        expired,
      }, null, 2));
    } else {
      const stamp = expiresAt.toISOString()
        .replace("T", " ").replace(/\.\d+Z/, " UTC");
      console.log(`discord id : ${userId}\nexpires    : ${stamp}\n` +
                  `status     : ${expired ? "expired" : "valid"}`);
    }
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
