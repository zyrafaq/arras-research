# javascript

JS bits for arras.io.

> **Recent update:** servers now send a Cloudflare Turnstile challenge before
> you can spawn. The `js-client` does not implement it, so it does not work
> right now. It is also still work in progress.

## theme-codes/

Node CLI for converting arras.io theme codes.

- `index.js` — CLI (`node index.js decode|convert|roundtrip`).
- `theme.js` — parsers/stringifiers for the theme formats.
- See [../docs/theme-codes.md](../docs/theme-codes.md) for the format analysis.

## token/

Small CLI that decodes an arras.io player token (linked Discord id + expiry).

- `index.js` — no-dependency decoder (`node index.js <token>`).

## localstorage/

Encoder/decoder for the encrypted `localStorage["arras.io"]` settings blob.

- `index.js` — `decode`/`encode`/`decodeFlat` plus a CLI.
- `ascii85.js` — ASCII85 codec with the arras alphabet.
- `key-schedule.js` — ChaCha-style key expansion.
- `localstorage_def.json` — key/type definitions.

## js-client/

Browser client that talks the original binary protocol.

- `src/` — transport, protocol, rendering, UI.
- `tools/` — selftest and headless-browser scripts.
- `docs/` — mode reference and notes.
- See [js-client/README.md](js-client/README.md).
