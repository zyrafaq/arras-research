# token

Decodes an arras.io player token. The token is base64; the first little-endian
64-bit field is the linked Discord user id, and the field at byte 16 is an
expiry timestamp in microseconds.

```bash
node index.js <token>
node index.js <token> --json
node index.js - < token.txt        # read from stdin
```

No dependencies — Node's `Buffer` does the base64 and integer reads.

The Python equivalent lives in `python/arras/token/` (`python3 -m arras.token`).
