# save-codes

Decoder for arras.io save (score) codes:

```text
(checksum:server:mode:tank:build:score:r1:r2:r3:r4:r5:r6:timestamp:signature)
```

```bash
node index.js decode "(12ab3c45:#we:w33oldscdreadnoughts2:Basic:9/9/9/9/9/9/9/9/9/9:5000000:1234:1:2:3:123:1:0123456789:ABCd12efG3+hIjkl)" --json
echo "<code>" | node index.js decode -
```

- `savecodes.js` — `parseSaveCode(code)`, returns a plain object.
- `index.js` — the `decode` CLI.

Decode only: codes are issued and signed by the server, so there is nothing to
encode locally. No dependencies. Structural only — the checksum and signature
are shape-checked, never cryptographically verified. The six middle numbers are
exposed as `reserved` (semantics unverified).

The Python equivalent lives in `python/arras/savecodes/`
(`python3 -m arras.savecodes decode <code>`), which emits the same keys plus a
`mode_display` filled in from `arras.modes`. Format and the Discord workflow
(`$claim`, `$scores`/`$saves`, `#restore`) are documented in
[docs/save-codes.md](../../docs/save-codes.md). Never commit real codes — the
example above is the public wiki shape.
