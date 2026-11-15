"use strict";

const fs = require("fs");
const { parseSaveCode } = require("./savecodes");

const USAGE = "usage: node index.js decode <code|-> [--json]\n";

function readInput(arg) {
  if (!arg || arg === "-") return fs.readFileSync(0, "utf8");
  return fs.existsSync(arg) ? fs.readFileSync(arg, "utf8") : arg;
}

function describe(save) {
  return [
    ["tank", save.tank],
    ["server", save.server_id],
    ["mode", save.mode],
    ["build", save.build.join("/")],
    ["score", save.score],
    ["reserved", save.reserved.join(":")],
    ["timestamp", `${save.timestamp} (${save.created_at.slice(0, 19)}Z)`],
    ["checksum", save.checksum],
    ["signature", `${save.signature.slice(0, 6)}... (${save.signature.length} chars)`],
  ].map(([label, value]) => `${label.padEnd(9)}: ${value}`).join("\n");
}

function main(args) {
  const json = args.includes("--json");
  const [command, code] = args.filter((arg) => arg !== "--json");

  if (command !== "decode" || !code) {
    process.stderr.write(USAGE);
    return 2;
  }

  let save;
  try {
    save = parseSaveCode(readInput(code));
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 1;
  }

  process.stdout.write(json ? JSON.stringify(save, null, 2) : describe(save));
  process.stdout.write("\n");
  return 0;
}

process.exitCode = main(process.argv.slice(2));
