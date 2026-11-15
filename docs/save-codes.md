# Arras.io Save Codes (Score Save / Restore)

Save codes preserve a run's score so it can be restored later by moderators.
They are issued on the save-score death screen and claimed/restored through
the Arras Discord bot. This note documents the observable wire format and
the Discord workflow. Numeric fields in the middle of the code are
**structurally parsed but semantically unverified** — names below marked
`reserved` are placeholders, not confirmed meanings.

> Privacy: never paste an unclaimed code in public. Claim it first with
> `$claim`. Outside a bot DM, `$scores`/`$saves` redacts the signature as
> `[REDACTED]`. Do not commit real codes to this repo.

## 1. Lifecycle (from the community Score Restore guide)

1. Join the Arras Discord (`https://discord.com/invite/arras`).
2. In-game, AFK for 5 minutes without autofire: do not move or shoot, or the
   timer restarts. Press `G` to check the timer; after 5 idle minutes, `G`
   self-destructs into the save-score death screen.
3. On the death screen press **Copy**, then in `#restore` or `#commands`
   run `$claim (<code>)` (note the space after `$claim`) to bind the code to
   your Discord account before anyone else can use it.
4. To restore later: DM the Arras bot (`arras#8547`) with `$scores` or
   `$saves` to get the full code (with signature), then post in `#restore`:
   `Name:`, `ID:` (from in-game `$id`, optional), `Server ID:` (above the
   minimap; bottom-right on mobile), `Code: (<full code>)`, `@Restore Perms`,
   plus a screenshot of the save-score death screen.

Rules learned from the guide:

- First save of a run: 60-day timer to restore it. Later saves of the same
  run have no such timer.
- Same run can be restored multiple times, but you must gain 500,000 score
  between each save/restore.
- Minimums: 750k for normal TDM modes; 5m for Dreadnought modes (the guide
  states a 5m minimum for saving score, and 5 minutes AFK for dreadnoughts).
- Growth mode score cannot be restored.
- Dreadnought restores teleport: new dreads restore from Europe Nexus even
  if saved in Labyrinth/Forge (you are evolved into your dreadnought in the
  Forge); old dreads restore from inside the base as a regular tank into the
  dreads-only nexus.
- Server location example: Europe nexus is `#en`. Save the server ID with
  the code (e.g. in a doc) — restores are server-routed.

## 2. Format

One line, wrapped in literal parentheses, 14 colon-separated fields:

```text
(checksum:server:mode:tank:build:score:r1:r2:r3:r4:r5:r6:timestamp:signature)
```

Public-shape example (from the community wiki; values are illustrative):

```text
(12ab3c45:#we:w33oldscdreadnoughts2:Basic:9/9/9/9/9/9/9/9/9/9:5000000:1234:1:2:3:123:1:0123456789:ABCd12efG3+hIjkl)
```

### Field table

| # | Name | Example | Meaning / validation |
|---|------|---------|----------------------|
| 0 | `checksum` | `12ab3c45` | Hex integrity prefix, 8–16 hex chars observed. Algorithm unknown — treat as opaque. Must match `/^[0-9a-fA-F]+$/`. |
| 1 | `server_id` | `#we` | Server/instance ID shown above the minimap. Pattern `/^#[A-Za-z0-9]+$/` (observed: `#` + 2 lowercase letters, e.g. `#en`, `#we`, `#wb`). Opaque routing hint for restores. |
| 2 | `mode` | `w33oldscdreadnoughts2` | Mode ID per [modes.md](modes.md) grammar + live extensions (`e<digits>` event slot, `old`/`olds` series, named modes like `nexus`, version params like `x15`). Keep raw; use `format_mode()` for display only. Must be non-empty, no `:`/`(`/`)`. |
| 3 | `tank` | `Basic` | Tank display name (`Triple Auto-Pen`, `Engineer`, …). Non-empty, no `:`. |
| 4 | `build` | `9/9/9/9/9/9/9/9/9/9` | 10 slash-separated stat rows, each a non-negative int (typically 0–9; last two are usually `0/0`, reserved). Exactly 10 entries. |
| 5 | `score` | `5000000` | Integer score `>= 0`. Restore minimums apply (see §1). |
| 6–11 | `reserved[6]` | `1234:1:2:3:123:1` | Six unsigned ints, semantics **unverified** (hypotheses: survival time, kill/assist/boss/polygon counters, server-uptime — cf. the death-screen stats and the `F` packet in [PROTOCOL.md](PROTOCOL.md) §8; do not rely on any mapping). Parsed as ints, exposed positionally. |
| 12 | `timestamp` | `0123456789` | Unix seconds. Exposed as `created_at` UTC ISO-8601. Parser accepts `1 .. 2^32-1` and rejects far-future stamps (`> now + 1 day`); values before the 2017 arras.io release (like this wiki placeholder) parse but are flagged by callers as illustrative, not real. |
| 13 | `signature` | `ABCd12efG3+hIjkl` | Claim secret. Base64-ish (`[A-Za-z0-9+/=]` observed, `+` attested). Required to restore; redacted as `[REDACTED]` outside DMs. Non-empty, no `:`/`(`/`)`/whitespace. Parser is structural only — no signature verification (algorithm unknown). |

Notes:

- Outer parentheses are part of the code. Parsers accept input with or
  without them (and surrounding whitespace) but `stringify` always emits
  them.
- No field may contain `:` (the field separator) or parentheses, except the
  wrapper. `tank`/`mode`/`signature` must not contain whitespace either.
- Splitting is positional: `(` strip → `)` strip → split on `:` → expect
  exactly 14 parts. `build` is then split on `/` → expect exactly 10 ints.
- This is a **display/claim format**, not a network packet: it never appears
  on the WebSocket wire. The `F` (death) packet in [PROTOCOL.md](PROTOCOL.md)
  carries a `saveCode: s` trailer — that string is what this document
  describes.

## 3. Parsers in this repo

| Language | Location | Library | CLI |
|----------|----------|---------|-----|
| Python | `python/arras/savecodes/` | `arras.savecodes.parse(code) -> SaveCode`, `SaveCode.to_dict()`, `format_savecode(d)` | `python3 -m arras.savecodes decode|explain <code> [--json]` |
| JavaScript | `javascript/save-codes/` | `parseSaveCode(code) -> save object` | `node index.js decode <code> [--json]` |

Both parsers implement the same grammar (§2) and reject the same malformed
inputs. The JavaScript side is decode-only — a code is signed by the server, so
there is nothing useful to encode — and returns the fields directly with no
`mode_display`; Python fills that in via `arras.modes`. `created_at` formatting
may differ in offset style (`+00:00` vs `Z`) — the canonical value is the
integer `timestamp`. Neither verifies `checksum`/`signature` cryptographically
(algorithms unknown) — they validate shape only.

## 4. References

- Community guide: `Score Restore` on the arras.io wiki (AFK/G flow,
  `$claim`, `$scores`/`$saves`, `#restore` request shape, limits above).
- `docs/modes.md` — mode-ID grammar used by field 2.
- `docs/PROTOCOL.md` §8 `F` packet — `saveCode: s` death-summary trailer.
