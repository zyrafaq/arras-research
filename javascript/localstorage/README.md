# localstorage

Encodes and decodes the encrypted `localStorage["arras.io"]` settings blob.

The blob is a custom ASCII85 string wrapping a block cipher keyed from a
ChaCha-style schedule, with a SHA-256 trailer. `index.js` exposes `decode`,
`encode`, and `decodeFlat`; the byte layout of the plain settings is driven by
`localstorage_def.json`.

No dependencies beyond Node's `crypto`, `fs`, and `Buffer`.

```bash
node index.js decode <code>       # nested JSON
node index.js flat <code>         # flat "a.b.c" keys
node index.js encode settings.json
node index.js decode - < code.txt # read from stdin
```

As a module:

```js
const { decode, encode, decodeFlat } = require("./index.js");
const settings = decode(code);
const code2 = encode(settings);
```

## Files

- `index.js` — public API + CLI, block cipher, typed field handling.
- `ascii85.js` — ASCII85 codec with a custom alphabet.
- `key-schedule.js` — the ChaCha-style key expansion (10 rounds, 16 words).
- `localstorage_def.json` — per-key type definitions used when decoding.

The Python equivalent lives in `python/arras/localstorage/` and interoperates:
ciphertexts from either side decode on the other.
