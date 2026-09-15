# python

The `arras` package: a reverse-engineered arras.io client and assorted tools.
Stdlib only (node is used only for eval challenges).

## Layout

```
arras/
├── client/          the bot, as a library
│   ├── bot.py         ArrasBot: one session (handshake, crypto, packets, nav)
│   ├── session.py     run_session / run_bots helpers
│   ├── websocket.py   minimal RFC6455 client
│   ├── status.py      status list: fetch/normalize/resolve/pick
│   ├── eval.py        server eval sandbox + proof-of-work solver
│   ├── config.py      build id, protocols, user agent, stop flag
│   └── logsetup.py    logging config
├── protocol/        the wire layer
│   ├── crypto.py      X25519 + ChaCha20
│   ├── codec.py       packet encode/decode + field cursor
│   ├── proto.py       static-analysis protocol notes
│   └── packets/       one class per packet
│       ├── base.py      ServerPacket / ClientPacket
│       ├── server.py    inbound packet classes
│       └── client.py    outbound packet classes
├── localstorage/    localStorage emulation
├── modes/           mode-ID parser + server list
├── theme/           theme code converter
├── token/           player token decoder
└── data/            localstorage_def.json, arras_eval_runner.js
```

## Library

The client is a library, not a CLI. Install the package (or run from this
directory) and import it:

```bash
pip install -e .
```

```python
from arras.client import run_session


def on_turnstile(site_id, session_token):
    return None


run_session("host:8443/5002", name="my-bot", turnstile_handler=on_turnstile)
```

`ArrasBot` drives a single connection; `run_session` adds a reconnect loop and
`run_bots` runs several in parallel. A turnstile handler receives
`(site_id, session_token)` and returns the Cloudflare Turnstile response
token, or `None` to skip. Runnable examples are in `examples/`.

## Tools

```bash
python3 -m arras.theme decode arras/...       # theme converter
python3 -m arras.token <token>                # decode a player token
python3 -m arras.modes.server_list            # server list with mode names
```

## Tests

```bash
python3 -m unittest discover -s tests
```
