# theme-codes

Node CLI for converting arras.io theme codes. It auto-detects the input
(theme code, theme JSON, or the TIGER_JSON export) and can write v0 or v1
theme codes.

```bash
node index.js decode <code>                       # theme code to JSON
node index.js convert <code|json> --to v1         # to a v0/v1 code
node index.js roundtrip <code>
```

Use `-` to read from stdin.

- `theme.js` - the parsers/stringifiers.
- `index.js` - the CLI.

The binary/JSON formats and the color palette order are documented in
[docs/theme-codes.md](../../docs/theme-codes.md).
