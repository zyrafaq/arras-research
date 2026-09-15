"use strict";

const PALETTE_KEYS = [
  "teal", "lgreen", "orange", "yellow", "lavender", "pink",
  "vlgrey", "lgrey", "guiwhite", "black",
  "blue", "green", "red", "gold", "purple", "magenta",
  "grey", "dgrey", "white", "guiblack",
];

const V1_MAGIC = "\x6a\xba\xda\xb3\xf0";

function decodeBase64(text) {
  return Buffer.from(text.replace(/\s+/g, ""), "base64").toString("latin1");
}

function encodeBase64(binary) {
  return Buffer.from(binary, "latin1").toString("base64").replace(/=+$/, "");
}

function hexToInt(hex) {
  return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex)
    ? parseInt(hex.slice(1), 16)
    : null;
}

const parsers = {
  json(input) {
    const output = JSON.parse(input);
    if (typeof output !== "object" || output === null) return null;
    const { name, author, content } = output;
    if (typeof content !== "object" || content === null) return null;

    const table = PALETTE_KEYS.map((key) => hexToInt(content[key]));
    if (table.some((color) => color === null)) return null;
    table[4] = table[0];
    table[7] = table[16];

    const blend = Math.min(1, Math.max(0, content.border));
    return {
      name: String(name || "").trim().slice(0, 40) || "Unknown Theme",
      author: String(author || "").trim().slice(0, 40),
      table,
      specialTable: [table[9]],
      blend,
      neon: false,
    };
  },

  v0(input) {
    let data = decodeBase64(input);
    if (data.startsWith(V1_MAGIC)) return null;

    let index = data.indexOf("\x00");
    if (index === -1) return null;
    const name = (data.slice(0, index) || "").trim().slice(0, 40) || "Unknown Theme";
    data = data.slice(index + 1);

    index = data.indexOf("\x00");
    if (index === -1) return null;
    const author = (data.slice(0, index) || "").trim().slice(0, 40);
    data = data.slice(index + 1);

    const blend = data.charCodeAt(0) / 0xff;
    data = data.slice(1);

    const paletteSize = Math.floor(data.length / 3);
    const table = [];
    for (let i = 0; i < paletteSize; i++) {
      const red = data.charCodeAt(i * 3);
      const green = data.charCodeAt(i * 3 + 1);
      const blue = data.charCodeAt(i * 3 + 2);
      table.push((red << 16) | (green << 8) | blue);
    }
    table[4] = table[0];
    table[7] = table[16];

    return {
      name,
      author,
      table,
      specialTable: [table[9]],
      blend,
      neon: false,
    };
  },

  tiger(input) {
    if (!input.startsWith("TIGER_JSON")) return null;
    const output = JSON.parse(input.replace("TIGER_JSON", ""));
    if (typeof output !== "object" || output === null) return null;

    const {
      themeDetails: { name, author },
      config: {
        graphical: { darkBorders, neon },
        themeColor: { table: colors, border },
      },
    } = output;

    const table = colors.map((hex) => hexToInt(hex) ?? 0);
    table[4] = table[0];
    table[7] = table[16];

    const blend = Math.min(1, Math.max(0, border));
    return {
      name: String(name || "").trim().slice(0, 40) || "Unknown Theme",
      author: String(author || "").trim().slice(0, 40),
      table,
      specialTable: [table[neon ? 18 : 9]],
      blend: darkBorders ? 1 : blend,
      neon: !!neon,
    };
  },

  v1(input) {
    const data = decodeBase64(input);
    if (!data.startsWith(V1_MAGIC)) return null;

    let off = 5;
    const version = data.charCodeAt(off); off += 1;
    if (version !== 1) return null;

    const nameLen = data.charCodeAt(off); off += 1;
    const name = data.slice(off, off + nameLen); off += nameLen;

    const authorLen = data.charCodeAt(off); off += 1;
    const author = data.slice(off, off + authorLen); off += authorLen;

    const tableLen = data.charCodeAt(off); off += 1;
    const table = [];
    for (let i = 0; i < tableLen; i++) {
      table.push(
        (data.charCodeAt(off) << 16) |
        (data.charCodeAt(off + 1) << 8) |
        data.charCodeAt(off + 2));
      off += 3;
    }

    const specialLen = data.charCodeAt(off); off += 1;
    const specialTable = [];
    for (let i = 0; i < specialLen; i++) {
      specialTable.push(
        (data.charCodeAt(off) << 16) |
        (data.charCodeAt(off + 1) << 8) |
        data.charCodeAt(off + 2));
      off += 3;
    }

    const blend = data.charCodeAt(off) / 0xff; off += 1;
    const neon = data.charCodeAt(off) === 1;

    return {
      name: name || "Unknown Theme",
      author,
      table,
      specialTable,
      blend,
      neon,
    };
  },
};

const stringifiers = {
  v0(theme) {
    const { name, author, table, blend } = theme;
    let binary = name + "\x00" + author + "\x00";
    binary += String.fromCharCode(blend >= 1 ? 255 : blend < 0 ? 0 : Math.floor(blend * 0x100));
    for (const color of table) {
      binary += String.fromCharCode(color >> 16, (color >> 8) & 0xff, color & 0xff);
    }
    return encodeBase64(binary);
  },

  v1(theme) {
    const { name, author, table, specialTable, blend, neon } = theme;
    let binary = V1_MAGIC;
    binary += String.fromCharCode(1);
    binary += String.fromCharCode(name.length) + name;
    binary += String.fromCharCode(author.length) + author;
    binary += String.fromCharCode(table.length);
    for (const color of table) {
      binary += String.fromCharCode(color >> 16, (color >> 8) & 0xff, color & 0xff);
    }
    binary += String.fromCharCode(specialTable.length);
    for (const color of specialTable) {
      binary += String.fromCharCode(color >> 16, (color >> 8) & 0xff, color & 0xff);
    }
    binary += String.fromCharCode(blend >= 1 ? 255 : blend < 0 ? 0 : Math.floor(blend * 0x100));
    binary += String.fromCharCode(neon ? 1 : 0);
    return encodeBase64(binary);
  },
};

function parseTheme(input) {
  for (const [format, parser] of Object.entries(parsers)) {
    try {
      const theme = parser(input);
      if (theme) return { theme, format };
    } catch (e) {}
  }
  return null;
}

function stringifyTheme(theme, format) {
  if (Object.prototype.hasOwnProperty.call(stringifiers, format)) {
    return stringifiers[format](theme);
  }
  return "";
}

function toJson(theme) {
  const content = {};
  theme.table.forEach((color, i) => {
    const key = PALETTE_KEYS[i] || `idx_${i}`;
    content[key] = "#" + (color & 0xffffff).toString(16).padStart(6, "0");
  });
  return {
    name: theme.name,
    author: theme.author,
    content,
    paletteSize: theme.table.length,
    border: theme.blend,
    neon: theme.neon,
  };
}

module.exports = {
  PALETTE_KEYS,
  parsers,
  stringifiers,
  parseTheme,
  stringifyTheme,
  toJson,
};
