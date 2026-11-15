"use strict";

const FIELD_COUNT = 14;
const BUILD_ENTRIES = 10;
const MAX_TIMESTAMP = 0xffffffff;

const CHECKSUM_RE = /^[0-9a-fA-F]+$/;
const SERVER_RE = /^#[A-Za-z0-9]+$/;
const SIGNATURE_RE = /^[A-Za-z0-9+/=_-]+$/;

function uint(text, name) {
  if (!/^\d+$/.test(text)) throw new Error(`${name}: not an unsigned integer (${text})`);
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new Error(`${name}: out of range (${text})`);
  return value;
}

function parseSaveCode(code) {
  let text = String(code ?? "").trim();
  if (text.startsWith("(") && text.endsWith(")")) text = text.slice(1, -1).trim();
  if (!text || text.includes("(") || text.includes(")")) {
    throw new Error("save code must be wrapped in a single (...) pair");
  }

  const fields = text.split(":");
  if (fields.length !== FIELD_COUNT) {
    throw new Error(`save code has ${fields.length} fields, expected ${FIELD_COUNT}`);
  }

  const [checksum, serverId, mode, tank, buildText, scoreText, ...rest] = fields;
  const reservedText = rest.slice(0, 6);
  const [timestampText, signature] = rest.slice(6);

  if (!CHECKSUM_RE.test(checksum)) throw new Error(`checksum: not hex (${checksum})`);
  if (!SERVER_RE.test(serverId)) throw new Error(`server id: expected '#' prefix (${serverId})`);
  if (!mode) throw new Error("mode: empty");
  if (!tank) throw new Error("tank: empty");

  const buildParts = buildText.split("/");
  if (buildParts.length !== BUILD_ENTRIES) {
    throw new Error(`build: ${buildParts.length} entries, expected ${BUILD_ENTRIES}`);
  }
  const build = buildParts.map((entry, index) => uint(entry, `build[${index}]`));

  const score = uint(scoreText, "score");
  const reserved = reservedText.map((entry, index) => uint(entry, `reserved[${index}]`));
  const timestamp = uint(timestampText, "timestamp");
  const today = Math.floor(Date.now() / 1000);
  if (timestamp < 1 || timestamp > MAX_TIMESTAMP || timestamp > today + 86400) {
    throw new Error(`timestamp: out of range (${timestampText})`);
  }
  if (!SIGNATURE_RE.test(signature)) {
    throw new Error(`signature: unexpected characters (${signature || "empty"})`);
  }

  return {
    checksum,
    server_id: serverId,
    mode,
    tank,
    build,
    score,
    reserved,
    timestamp,
    created_at: new Date(timestamp * 1000).toISOString(),
    signature,
  };
}

module.exports = { FIELD_COUNT, BUILD_ENTRIES, parseSaveCode };
