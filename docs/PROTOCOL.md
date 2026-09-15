# arras.io Network Protocol — Consolidated Documentation

Single reference for everything needed to implement an arras.io client or bot,
consolidated from the two working implementations in this workspace:

| Source | Role |
|---|---|
| `arras-reverse-engineering/client/client.js` | Reference client (Node.js): `ArrasClient`, `ArrasProtocol`, `clientPackets`, `serverPackets` |
| `arras_client.py` | Headless Python bot: session flow, status fetch, WebSocket, eval/PoW solvers |
| `arras_packets.py` | Python wire codec (`decode_packet` / `encode_packet`) + typed packet classes |
| `arras_crypto.py` | Pure-stdlib transport crypto: X25519 + ChaCha20 + SHA-256 trailer |

The two implementations are kept in sync; where they differ (build string,
decrypt-state quirk) both values are noted. This doc describes the **original
binary protocol** — do not confuse it with the msgpack/string-opcode protocol
used by `open-source-arras/`.

---

## Table of contents

1. [Overview](#1-overview)
2. [Server discovery (status API)](#2-server-discovery-status-api)
3. [Connection bootstrap](#3-connection-bootstrap)
4. [Handshake & key exchange](#4-handshake--key-exchange)
5. [Transport crypto (per-packet)](#5-transport-crypto-per-packet)
6. [Field codec (wire encoding)](#6-field-codec-wire-encoding)
7. [Client → server packets](#7-client--server-packets)
8. [Server → client packets](#8-server--client-packets)
9. [Session state machine](#9-session-state-machine)
10. [Challenges: eval & proof of work](#10-challenges-eval--proof-of-work)
11. [Implementation notes & gotchas](#11-implementation-notes--gotchas)

---

## 1. Overview

arras.io speaks a compact binary protocol over a WebSocket connection:

```
HTTPS GET /status ──► server list (JSON)
        │
        ▼
WSS connect (?a=3&b=<BUILD>&t=<unix-ts>, subprotocols)
        │
        ▼
fixed handshake frame          [0,1,0,1] + reversed(build bytes)   (plaintext)
        │
        ▼
server frame #1                32B X25519 server public key         (plaintext)
        │
        ▼
client reply                   raw 32B X25519 client public key     (plaintext)
        │
        ▼
shared key = X25519(client_priv, server_pub)
        │
        ▼
every further message          ChaCha20(shared_key)-encrypted packet
                               + 6-byte SHA-256 trailer             (encrypted)
```

Key properties:

* All integers on the wire are big-endian *inside* field encodings, but the
  ChaCha20 state and the MAC input use little-endian words/ints.
* Packet counters are strictly positional: each side numbers its packets
  `0,1,2,…`; nothing may be skipped or replayed.
* The first encrypted packet the client sends must be `k` (key/auth request).
* The build string is part of the handshake and must match what the server
  expects.

### Build strings observed

| Implementation | BUILD | Notes |
|---|---|---|
| Reference client (`client.js`) | `2c170ae5c3f70dd0` | pinned at time of writing |
| Python bot (`arras_client.py`) | `fc3fa85eb58aebd0` | default; overridable via `ARRAS_BUILD` env var |

The build is sent as hex bytes in two places (see §3 and §4).

---

## 2. Server discovery (status API)

Before connecting, the client fetches a JSON server list. The Python bot tries
these URLs in order (first one with a non-empty list wins):

```text
https://qrp6ujau11f36bnm-c.uvwx.xyz:8443/2222/status
https://ak7oqfc2u4qqcu6i-c.uvwx.xyz:8443/2222/status
https://c.uvwx.xyz:8443/2222/status
https://arras.io/status
```

(`ARRAS_STATUS` env var overrides/prepends a custom URL.)

Request headers mimic a browser:

```text
User-Agent: <browser UA>
Accept: */*
Referer: https://arras.io/
Origin: https://arras.io
```

`gzip` / `deflate` response bodies are decompressed.

Response shape — either `{"status": [...]}` or a bare list of records:

```jsonc
{
  "name": "epn",            // server id used by --server #epn lookups
  "code": "…",              // alternative id key
  "gamemode": "…",
  "host": "1.2.3.4:8443/5002",  // host[:port][/path] for the wss URL
  "clients": 12,
  "maxClients": 40,
  "mspt": 16.7
}
```

Only `host` is required to connect; the rest feeds the picker UI.

---

## 3. Connection bootstrap

```
URL:           wss://{host}/?a=3&b={BUILD}&t={unix_seconds}
Subprotocols:  ["arras.io#v1.4+sls+et0", "arras.io"]
```

Both implementations request these two subprotocols in this order; the server
echoes one back in the 101 response (logging only — either is accepted).

Notable headers sent by the Python client:

```text
Sec-WebSocket-Version: 13
Sec-WebSocket-Key: <16 random bytes, base64>
Sec-WebSocket-Protocol: arras.io#v1.4+sls+et0, arras.io
Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits
Origin: https://arras.io
Referer: https://arras.io/
User-Agent: <browser UA>
Cache-Control: no-cache
Sec-Fetch-Site: cross-site
Sec-Fetch-Mode: websocket
Sec-Fetch-Dest: empty
```

> **Note:** `permessage-deflate` is offered in the header but the Python
> client never negotiates/uses it; frames are plain binary regardless.

WebSocket details that matter:

* Client→server data frames are **masked** (RFC 6455), opcode `0x2` (binary).
* Server pings (opcode `9`) are answered with matching pongs (opcode `10`);
  close frames (opcode `8`) carry a 2-byte code + UTF-8 reason.
* Frame lengths use the standard 7-bit / u16 / u64 forms; payloads larger than
  one TCP segment are reassembled by the reader loop.
* Optional HTTP CONNECT or SOCKS5 proxying happens below TLS (the bot tunnels
  before the upgrade request).

---

## 4. Handshake & key exchange

All three handshake messages are plaintext binary WebSocket frames.

**Step 1 — client hello.**

```python
frame = bytes([0, 1, 0, 1]) + bytes.fromhex(BUILD)[::-1]
# e.g. BUILD fc3fa85eb58aebd0 -> fc 3f a8 5e b5 8a eb d0 reversed ->
#       d0 eb 8a b5 5e a8 3f fc
# total length: 4 + len(build_bytes) = 12 bytes
```

**Step 2 — server public key.**
The next binary frame from the server begins with the 32-byte X25519 server
public key. Any trailing bytes are ignored.

**Step 3 — client public key.**
The client generates an ephemeral X25519 keypair (RFC 7748) and sends the raw
32-byte little-endian public key (`X25519(priv, basepoint u=9)`).

**Shared key.**
`shared = X25519(client_priv, server_pub)` — 32 bytes, used directly as the
ChaCha20 key and as MAC key material. There is no KDF, no salt, no nonce
exchange beyond the packet counters.

Immediately after sending its public key the client sends the first encrypted
packet, `k` (§7).

---

## 5. Transport crypto (per-packet)

Mirrored in `arras_crypto.py` (`ArrasCipher`) from `ArrasProtocol` in
`client.js`. Both sides keep two independent counters:

```text
sent_packet_count     starts at 0, incremented BEFORE use (index = count-1)
received_packet_count same, independently of sent
```

### 5.1 ChaCha20 state layout

The state is a 64-byte buffer interpreted as 16 little-endian int32 words:

| Bytes | Words | Content |
|---|---|---|
| 0–15 | 0–3 | sigma constants `"expand 32-byte k"` written as two uint64 LE: `3684054920433006693` (= `0x3320646E61707865`) at offset 0 and `7719281312240119090` (= `0x6B20657479622D32`) at offset 8 |
| 16–47 | 4–11 | shared key (4× uint64 LE) |
| 48–51 | 12 | block counter within the packet — set to `chunk_index` (= byte offset / 64) before each keystream block |
| 52–55 | 13 | always `0` |
| 56–59 | 14 | packet index, low 32 bits (LE) |
| 60–63 | 15 | packet index, high 32 bits (LE) — see asymmetry below |

**Encrypt vs decrypt asymmetry** (faithful to both implementations):

* *Encrypt*: word 14 gets `int32(packet_index)`, word 15 gets
  `int32(packet_index >> 32)`.
* *Decrypt*: word 14 gets the low 32 bits of the receive counter, but word 15
  is initialized once to `-2147483648` (`0x80000000`) at construction and
  **never updated** afterwards. Only offset 56 is rewritten per packet.

This works because real-world packet indices stay far below 2³¹, so the high
word contributes nothing on encrypt and a constant on decrypt.

Keystream generation is textbook ChaCha20: 10 double rounds (20 rounds) of
column + diagonal quarter-rounds, output = working state + original state,
XORed against the payload in 64-byte chunks.

### 5.2 Encrypting a packet

```text
1. idx   = sent_packet_count++            (0-based)
2. cipher= chacha20_xor(packet_body, key, idx, chunk_counter=word12)
3. mac   = SHA256( cipher || shared_key(32B) || uint64_le(idx) )
4. frame = cipher || mac[0:6]             <- exactly 6 trailer bytes
```

The MAC hashes the **ciphertext**, then the raw 32-byte key, then the packet
index as an unsigned 64-bit little-endian integer. Only the first 6 digest
bytes are appended.

### 5.3 Decrypting a packet

```text
1. idx    = received_packet_count++
2. body   = frame[0:-6]                  strip the 6-byte trailer
3. plain  = chacha20_xor(body, key, idx, chunk_counter=word12)
```

(The reference client optionally verifies `plain[0] ^ ks[0]` against an
expected tag set and aborts early without decrypting the rest — a pure
optimization, not part of the protocol.)

There is no explicit MAC verification in either implementation; a corrupted
stream simply decodes into garbage tags and errors out.

---

## 6. Field codec (wire encoding)

A packet body is: `[tag_byte, field, field, …]`. The tag byte is the ASCII code
of the packet name (e.g. `"k"` → `0x6B`). Fields are self-describing, chosen
from this table (`dt` = first byte of the field):

| Range | Type | Layout | Value |
|---|---|---|---|
| `0x00`–`0xBF` | small number | 1 byte | `v = dt` (unsigned); signed view: `v ≤ 96 ? v : v − 192` |
| `0xC0`–`0xDF` | short string | 1 + N bytes | N = `dt − 0xC0` (0–31), UTF-8 |
| `0xE0`–`0xEF` | 12-bit number | 2 bytes BE | `(dt−0xE0)<<8 \| b₁`, sign-extend 12 bits |
| `0xF0`–`0xF7` | 19-bit number | 3 bytes BE | `(dt−0xF0)<<16 \| b₁<<8 \| b₂`, sign-extend 19 bits |
| `0xF8` | 24-bit number | 4 bytes | `b₁<<16 \| b₂<<8 \| b₃` (BE), signed view sign-extends 25 bits |
| `0xF9` | 25-bit number | 4 bytes | `0x1000000 + (b₁<<16 \| b₂<<8 \| b₃)`, signed view sign-extends 25 bits |
| `0xFC` | 32-bit number | 5 bytes | uint32 BE; signed view is int32 two's complement |
| `0xFE` | long string | variable | u16 **LE** length L; if L == 0, read u32 **LE** length instead; then L bytes UTF-8 |
| `0xFF` | float | 5 bytes | float32 LE |

`0xFD` is unused — encountering it means desync/corruption ("unknown packet
code").

Decoded fields keep both views (raw unsigned + signed interpretation);
readers pick per context (`Cursor.unsigned()` vs `Cursor.signed()` in Python,
`.number.unsigned` / `.number.signed` in JS).

### Encoding rules (writer side)

Strings (UTF-8 length L):

```text
L < 32      -> 0xC0 + L, bytes
L < 65536   -> 0xFE, uint16_le(L), bytes
L >= 65536  -> 0xFE, 0x00, 0x00, uint32_le(L), bytes
```

Unsigned integers — smallest representation that fits:

```text
≤ 2^8−1 (191)      1 byte literal
< 2^12             0xE0+(v>>8), v&0xFF
< 2^19             0xF0+(v>>16), …
< 2^24             0xF8 + 3 bytes BE
< 2^25             0xF9 + low 3 bytes BE
< 2^32             0xFC + 4 bytes BE
else               error
```

Signed integers — map negative `v` to `v + 2^bits`, then emit the unsigned form
of that width:

| Range | Bits |
|---|---|
| −95 … 96 | implicit sign via the ≤96 rule (single byte) |
| −2¹¹ … 2¹¹−1 | 12-bit |
| −2¹⁸ … 2¹⁸−1 | 19-bit |
| −2²⁴ … 2²⁴−1 | 24/25-bit (0xF8 if bit 24 clear after offset, else 0xF9) |
| −2³¹ … 2³¹−1 | 32-bit (0xFC) |

Non-integer numbers encode as `0xFF` + float32 LE.

The Python codec exposes typed tuples when the caller must force a width:
`("u", v)` unsigned, `("i", v)` signed, `("n", raw, signed, is_float)`;
plain `str`/`int`/`float` values get the automatic rules above.

---

## 7. Client → server packets

All fields in order. `u(n)` = unsigned integer, `i(n)` = signed integer,
`s` = string. Tag is the ASCII letter shown.

### `k` — key verification / auth *(first packet of every session)*

```js
["k", playerId /*s*/, playerToken /*s*/, travelToken /*s*/]
```

* `playerId`: persistent player identity, previously issued by a server in the
  `w` packet (stored in `arrasLocalStorage.id`). Empty string for a new player.
* `playerToken`: Discord-linked token handed out by the server's `k` packet
  after `$auth` login (stored in `arrasLocalStorage.token`). Usually empty.
* `travelToken`: 8-char hex token from an `r` packet when being redirected
  between servers. Empty otherwise.

### `T` — tracking data *(optional, second packet)*

```js
["T", JSON.stringify(data) /*s*/]
```

Documented JSON shape (from `client.js` comments):

```jsonc
{
  "adblock": bool,
  "mobile": bool,
  "storage": { /* arras local storage contents */ },
  "overseer": {
    "features": {
      "wasm": [], "rtc": "", "wt": bool, "sw": bool, "gpu": bool,
      "credentialless": bool, "ua": "", "hc": 0,
      "renderer": "", "webgl": "", "experimental-webgl": "", "webgl2": ""
    },
    "window": { "innerWidth": 0, "innerHeight": 0 },
    "fingerprints": { "canvas": "", "unicode": "" },
    "report": ""   // toString() of addEventListener, canvas.addEventListener,
                   // WebAssembly.instantiate(Streaming), requestAnimationFrame,
                   // Function, plus an error stack
  }
}
```

Servers use mismatches here for bot detection; the Python bot does not send it.

### `p` — ping

```js
["p"]
```

Sent as a reply to the server's `p` packet, and once right after receiving `w`.

### `s` — spawn request

```js
["s", name /*s*/, partyId /*s*/, flags /*u*/]
flags = autoLevelUp ? 1 : 0  |  incognito ? 2 : 0     // bit0 autoLevelUp, bit1 incognito
```

Sent after `w` (welcome). `partyId` spawns straight into a party/team code.

### `e` — eval answer *(required to spawn)*

```js
["e", id /*s*/, result /*s*/]
```

Reply to the server's `e` challenge; `result` is `.toString()` of the evaluated
code (see §10.1).

### `R` — proof-of-work answer *(required to spawn)*

```js
["R", input /*s*/, result /*s*/]
```

Reply to the server's `C` challenge; see §10.2.

### `U` — tank upgrade

```js
["U", index /*u*/]
```

Index into the currently offered upgrade list (`upgrades` from the `u` packet /
UI slot order). The Python bot treats configured indices as 1-based and
subtracts 1 before sending.

### `x` — skill upgrade

```js
["x", index /*u 0-based skill slot*/, value /*i*/]

value = -1   -> add one point
value = 255  -> max the skill
value = n    -> set points to n
```

### `C` — command (movement + aim) *(sent continuously while playing)*

```js
["C", x /*i*/, y /*i*/, action /*u*/]

(x, y)  world-space point the tank aims/moves toward
action  bitmask: up=1<<0 down=1<<1 left=1<<2 right=1<<3 lmb=1<<4 rmb=1<<6
        (bit 5 unused)
```

Movement keys emulate WASD; `lmb` fires toward `(x,y)`. The Python bot derives
key bits from an 8-sector compass around `(dx,dy)` each tick (~10 Hz) so
movement always follows the aim direction.

### `t` — toggle

```js
["t", actionIndex /*u*/]
actions = ["autofire", "autospin", "override", "reverse"]
```

### `L` — level-up cheat (sandbox only)

```js
["L"]
```

### `0` — key event (sandbox keys only)

```js
["0", keyCode /*s, KeyboardEvent.code*/, isKeyDown /*u 0|1*/]
```

Only transmitted while the sandbox key (backtick, code `"Self"`) is held.

### `M` — chat message

```js
["M", message /*s*/]
```

### `P` — player action (operator only)

```js
["P", actionIndex /*u*/, socketId /*u*/]
actions = ["promote", "demote", "kick"]
```

### `K` — suicide

```js
["K"]
```

Kills the own body (leads to an `F` death packet).

### `A` — ability

```js
["A"]
```

Runs the F-key ability.

### `D` — save score / pause

```js
["D"]
```

Saves the current score (pairs with the `save_score` death type).

### `G` — turnstile captcha answer *(response to server `G` challenge)*

```js
["G", sessionToken /*s*/, turnstileToken /*s*/, "" /*s*/]
```

* `sessionToken`: echoed from the server's `G` challenge (the session identifier).
* `turnstileToken`: Cloudflare Turnstile response token produced by the widget.
* Third field: always empty string (unused, kept for wire compatibility).

---

## 8. Server → client packets

Parsed positionally after the tag byte. Scaling factors applied by the parsers
are noted inline.

### `w` — welcome

```text
playerId: s
```

Assigns the persistent player id (echo it back in future sessions' `k`).
Client responds with `s` (spawn) + `p` (ping).

### `p` — ping request

```text
(no fields) — reply with ["p"]
```

### `e` — eval challenge

```text
id: s    code: s
```

See §10.1. Answering is required to spawn.

### `C` — proof-of-work challenge

```text
input: s
```

See §10.2. Also required to spawn.

### `k` — auth token

```text
playerToken: s
```

Issued after `$auth` with a valid Discord login token; store and send in `k`.

### `r` — server travel

```text
server: s        destination host string
travelToken: s   8-char hex token
```

Redirect: reconnect to `server` and pass `travelToken` in the next `k` packet.

### `m` — server message

```text
message: s
```

System text shown in chat (e.g. `"You have spawned: welcome to the game"` —
the Python bot uses this as its spawn-confirmation signal).

### `M` — chat message from a player

```text
entityId: u    message: s    isGlobal: u(bool)
```

`isGlobal` distinguishes global chat from team/scope chat.

### `K` — kick

```text
reason: s
```

Player was kicked/banned; treat as session end.

### `G` — turnstile captcha challenge

```text
sessionToken: s       session identifier (echo back in the answer)
siteId: s             Cloudflare Turnstile site key (e.g. "0x4AAAAAAEYGNrfm0kQjg7Rk")
```

Server requests a Cloudflare Turnstile proof. The client must solve the
widget and reply with a `G` packet (§7) before the server will allow
spawning. Not all builds/servers issue this challenge.

### `c` — camera (spawn confirmation)

```text
bodyX: i    bodyY: i    bodyFov: u
```

Sent when the player spawns; the Python bot marks `spawned = true` here.

### `R` — room info

```text
info: s                 comma-separated k=v pairs
roomX1, roomY1: i       map bounds
roomX2, roomY2: i
unknown: s              ignored
tileWidth: u
tileHeight: u
tiles[tileHeight][tileWidth]: i   row-major, y outer loop then x
```

### `P` — player list delta

```text
removedLength: u
removed[]:      { socketId: u }                       × removedLength
changedLength: u
changed[]:      { socketId: u,
                  flag: u        bit0 = isSelf, flag>>1 = operatorLevel,
                  name: s,
                  mockupIndex: i }                    × changedLength
```

### `J` — mockup (tank definition) dump

Repeated per mockup, all inside one packet:

```text
length: u
each mockup:
  mockupIndex: u
  name: s
  scoreText: s
  color: i
  shape: i
      if shape == 0x800 (custom polygon):
          pathLength: u
          path[]: { x: i, y: i } × pathLength
  entityType: u
  shootsType: u
  offset: i
  size: i
  upgradesLength: u
  upgrades[]: { tier: u, mockupIndex: u }
  gunsLength: u
  guns[]: { x: i, y: i, length: i, width: i, aspect: i, angle: i }
  turretsLength: u
  turrets[]: { mockupIndex: u, scale: i, offset: i, direction: i,
               renderOnTop: u(bool), angle: i }
```

### `b` — broadcast (minimap / leaderboard deltas)

Six sections, each preceded by a length field read as **signed**: a value of
`-1` means "no change for this section" (skip). Coordinates are normalized
(`/255`).

```text
minimapRemovedLength        (-1 = skip)
minimapRemoved[]:        { id: u }

minimapChangedLength     (-1 = skip)
minimapChanged[]:        { id: u, type: u, x: i/255, y: i/255, color: i, size: u }

teamMinimapRemovedLength (-1 = skip)
teamMinimapRemoved[]:    { id: u }

teamMinimapChangedLength (-1 = skip)
teamMinimapChanged[]:    { id: u, x: i/255, y: i/255, color: i }

leaderboardRemovedLength (-1 = skip)
leaderboardRemoved[]:    { id: u }

leaderboardChangedLength (-1 = skip)
leaderboardChanged[]:    { id: u, score: u, mockupIndex: u, name: s,
                           color: i, barColor: i }
```

### `F` — death summary

```text
time: u                score: u                timeAlive: u
kills.player: u        kills.assist: u
kills.boss: u          kills.food: u

killType: u
  0 none
  1 food   -> amount: i
  2 player -> amount: i, name: s

deathType: u  ->  ["killed", "dumb_death", "self_destruct",
                   "surrender_control", "save_score"][deathType]

if deathType == 0 (killed):
    killersLength: u
    killers[]: { name: s, tank: s }

serverActivity: u
serversTraveled: u
respawnTime: u         (+2000 ms added client-side)
saveCode: s
```

The Python bot respawns immediately upon `F`.

### `u` — world update *(the main gameplay packet, ~30 Hz)*

```text
bodyX: i               own body position
bodyY: i
bodyFov: u
updateFlags: u         which body blocks follow
<flag-gated body blocks, in bit order — see below>

dead[]:    ids until a -1 sentinel (sentinel consumed)
removed[]: ids until a -1 sentinel (sentinel consumed)
changed[]: repeated { id: u, entity... } until one field remains
```

Update flag blocks (bit → fields, in ascending bit order):

| Bit | Fields |
|---|---|
| 0 | `mspt: u` |
| 1 | `speed: u` |
| 2 | `mockupIndex: u` **plus one extra signed field (unknown, skipped)** |
| 3 | `color: i`, `id: u` (own entity id!) |
| 4 | `score: u` |
| 5 | kills ×4: `player: u, assist: u, boss: u, food: u` |
| 6 | `skillPoints: u` |
| 7 | `maxSkills: u ×10` |
| 8 | `skills: u ×10` |
| 9 | `upgradesLength: u`, then `upgradeIndex: u × upgradesLength` |
| 10 | `partyCode: s` |
| 11 | `operatorLevel: u` |

Entity record (recursive — turrets embed full entities):

```text
entityFlags: u
bit 0:  deltaX: i (/4), deltaY: i (/4)
bit 1:  deltaFacing: i (× π / 512)
bit 2:  mockupIndex: u
bit 3:  guns list until -1 sentinel:
            gunIndex: u, gunFlags: u
            gunFlags bit0 -> time: u
            gunFlags bit1 -> power: u
bit 4:  turrets list until -1 sentinel:
            turretIndex: u, then a nested entity record
bit 5:  dataFlags: u
            bit0 autoSpin, bit1 reverseTank, bit2 unknown,
            bit3 invuln, bit4 damage, bit5 unknown
bit 6:  health: u (/255)
bit 7:  shield: u (/255)
bit 8:  alpha: u (/255)
bit 9:  size: u (× 0.0625)
bit 10: score: u
bit 11: name: s
bit 12: color: i
bit 13: layer: i
```

Termination rule for `changed[]`: parse entities while more than one decoded
field remains (the trailing field is padding).

---

## 9. Session state machine

Complete happy path, as implemented in `client.js` (`ArrasClient`) and
mirrored by `arras_bot.run()` in `arras_client.py`:

```text
connect wss
  ├─ send handshake [0,1,0,1]+rev(build)
  ├─ recv server pubkey (first 32B of first frame)
  ├─ derive X25519 shared key, send client pubkey
  ├─ send k(playerId?, playerToken?, travelToken?)
  │
  ├─ recv w ──► store playerId; send s(name, partyId, flags); send p
  ├─ recv C ──► solve PoW ─────────────────────────► send R(input, result)
  ├─ recv e ──► eval code sandbox ────────────────► send e(id, result)
  ├─ recv c ──► spawned (camera position known)
  ├─ recv u ──► update world model / own position
  ├─ recv b ──► minimap + leaderboard deltas
  ├─ recv M ──► chat display
  ├─ recv m ──► system message ("You have spawned…" confirms spawn)
  ├─ recv p ──► send p (keepalive echo)
  ├─ recv P ──► merge player-list delta
  ├─ recv J ──► cache tank mockups
  │
  ├─ recv F ──► death screen stats ───────────────► send s(...) (respawn)
  ├─ recv r ──► reconnect to packet.server,
  │              carry travelToken into next k
  ├─ recv K ──► kicked; end session
  └─ close ──► if welcome was received: reconnect after delay
               else: give up (never reached the game)
```

Spawn requirements: answer both challenges (`e` and `C`) if/when they arrive;
they are typically issued right after `k`/`w`. Skipping them stalls the spawn.

---

## 10. Challenges: eval & proof of work

### 10.1 Eval challenge (`e`)

The server sends arbitrary JavaScript. The client executes:

```js
(() => { code })()
```

inside a sandboxed VM whose global object contains stubs: `chrome`,
`localStorage` (pre-seeded with an `"arras.io"` entry), `document`
(`querySelector` returns a fake canvas whose `toDataURL` yields a fixed PNG).
The reply is `result.toString()`, sent back with the original challenge id.

The Python bot runs the same wrapper through Node
(`node arras_eval_runner.js <codefile>`, 20 s timeout) because most payloads
are JS-specific. If Node is unavailable it falls back to a pure-Python AST
evaluator supporting single math expressions (`+ - * / // % **`, unary ±,
`Math.*` functions incl. `random`, comparisons via bool ops), formatting the
result like JS (`NaN`, `Infinity`). Last-resort answer: `"0"`.

Eval payloads observed so far are collected in `eval_dump.txt` /
`server_eval.js` study material.

### 10.2 Proof of work (`C`)

Given `input`, find a 6-character string `s` such that:

```text
sha256(s + input) starts with two zero bytes   (uint16_le(digest[0:2]) == 0)
```

Candidate generation (identical in both implementations — must match, since
the server presumably verifies deterministically-looking solutions):

```text
for i in 0 .. 64^6-1:
    s[i-th char j] = chr((i // 64^(5-j)) % 64 + 48)
```

i.e. digits run over chars `chr(48 + n)` for n in 0..63 → `'0'..'o'`.
Typical solution times are well under a second in optimized JS; the pure-Python
solver caps at 2²² iterations (~4 M sha256 calls).

Answer: `["R", input, solution]`.

---

## 11. Implementation notes & gotchas

* **Counters are positional.** Every encrypted frame consumes exactly one
  slot of `sent` or `received`. Dropping a frame, replaying, or interleaving
  two cipher instances corrupts everything after it. The Python bot guards
  sends with a lock for this reason.
* **Trailer handling differs by direction.** When *sending*, you append 6
  bytes. When *receiving*, strip the last 6 bytes of the frame payload before
  decrypting (`payload[:-6]`).
* **Decrypt-state high word.** Keep the decrypt ChaCha state's word 15 fixed
  at `0x80000000` (init-time only) and only ever write the low 32 bits of the
  receive counter to word 14. This mirrors the original implementation; using
  the full 64-bit index there would break decryption of packets ≥ 2³¹ (never
  happens in practice, but byte-exact compatibility costs nothing).
* **BE vs LE mixing.** Field payloads inside packets are big-endian; the
  string-length prefixes of `0xFE` and the ChaCha/MAC integers are
  little-endian. This bites everyone once.
* **`0xFE` length zero trick.** A leading u16 length of 0 means "next 4 bytes
  are a u32 LE length". Strings ≥ 65536 bytes must use it.
* **Signed single-byte range.** Values −95…96 share the 0x00–0xBF space
  (negative v maps to v+192); anything outside needs the wider forms even if
  it would fit a byte unsigned.
* **Build string matters.** The handshake carries the build hex reversed; a
  mismatched/stale build can be rejected or served different behavior. The
  live game updates builds; the bot's default is overridable with
  `ARRAS_BUILD`.
* **Status endpoints rotate.** The `<prefix>-c.uvwx.xyz` hosts change
  occasionally; `ARRAS_STATUS` lets you pin a working one without editing
  code.
* **No compression in practice.** Despite advertising `permessage-deflate`,
  neither implementation negotiates it; don't enable it unless you also
  implement RFC 7692 correctly.
* **Unknown tags.** Log-and-continue is safe for inbound tags not listed
  here (the server adds types over time), but any unknown *field code* inside
  a packet means the stream is desynced — reconnect rather than guess.

---

## Quick reference: packet tag index

| Tag | Direction | Meaning |
|-----|-----------|---------|
| `k` | C→S / S→C | auth key request / auth token |
| `T` | C→S | tracking/fingerprint report |
| `p` | C→S / S→C | ping reply / ping request |
| `s` | C→S | spawn request |
| `e` | C→S / S→C | eval answer / eval challenge |
| `R` | C→S | PoW answer |
| `C` | C→S / S→C | movement+aim command / PoW challenge |
| `U` | C→S | tank upgrade |
| `x` | C→S | skill upgrade |
| `t` | C→S | toggle autofire/autospin/override/reverse |
| `L` | C→S | level-up cheat (sandbox) |
| `0` | C→S | sandbox key press/release |
| `M` | C→S / S→C | send chat / chat message |
| `P` | C→S / S→C | operator action / player list delta |
| `K` | C→S / S→C | suicide / kick notice |
| `A` | C→S | F-key ability |
| `D` | C→S | save score |
| `G` | C→S / S→C | turnstile captcha answer / turnstile captcha challenge |
| `w` | S→C | welcome (playerId) |
| `r` | S→C | server travel redirect |
| `m` | S→C | system message |
| `c` | S→C | camera/spawn confirm |
| `R` | S→C | room/map info |
| `J` | S→C | tank mockups |
| `b` | S→C | minimap/leaderboard broadcast |
| `F` | S→C | death summary |
| `u` | S→C | world update |
