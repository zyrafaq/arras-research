#!/usr/bin/env node
"use strict";

const fs = require("fs");

const { parseTheme, stringifyTheme, toJson } = require("./theme");

const USAGE = [
  "usage:",
  "  node index.js decode <code>              decode a theme code to JSON",
  "  node index.js convert <code|json> [--to v0|v1]",
  "  node index.js roundtrip <code>",
  "  ('-' reads stdin)",
].join("\n");

function readInput(input) {
  if (!input || input === "-") return fs.readFileSync(0, "utf8");
  if (fs.existsSync(input)) return fs.readFileSync(input, "utf8");
  return input;
}

function parseOrFail(input) {
  const parsed = parseTheme(input.trim());
  if (!parsed) {
    process.stderr.write("error: could not parse theme input\n");
    return null;
  }
  return parsed;
}

function parseArgs(rest) {
  const positional = [];
  let target = "v1";
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--to") {
      target = rest[i + 1];
      i++;
    } else {
      positional.push(rest[i]);
    }
  }
  return { positional, target };
}

function main(argv) {
  const [command, ...rest] = argv;
  const { positional, target } = parseArgs(rest);
  const input = positional[0];

  if (command === "decode") {
    if (!input) {
      process.stderr.write(USAGE + "\n");
      return 2;
    }
    const parsed = parseOrFail(readInput(input));
    if (!parsed) return 1;
    process.stdout.write(JSON.stringify(
      { format: parsed.format, theme: toJson(parsed.theme) }, null, 2) + "\n");
    return 0;
  }

  if (command === "convert" || command === "encode") {
    if (!input) {
      process.stderr.write(USAGE + "\n");
      return 2;
    }
    const parsed = parseOrFail(readInput(input));
    if (!parsed) return 1;
    const code = stringifyTheme(parsed.theme, target);
    if (!code) {
      process.stderr.write(`error: unknown output format ${target}\n`);
      return 1;
    }
    process.stdout.write(code + "\n");
    return 0;
  }

  if (command === "roundtrip") {
    if (!input) {
      process.stderr.write(USAGE + "\n");
      return 2;
    }
    const parsed = parseOrFail(readInput(input));
    if (!parsed) return 1;
    const code = stringifyTheme(parsed.theme, "v1");
    const again = parseTheme(code);
    const match = again &&
      JSON.stringify(again.theme) === JSON.stringify(parsed.theme);
    process.stdout.write(
      `format:     ${parsed.format}\n` +
      `re-encoded: ${code}\n` +
      `match:      ${match}\n`);
    return match ? 0 : 1;
  }

  process.stderr.write(USAGE + "\n");
  return 2;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main };
