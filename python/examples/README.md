# examples

Small programs that use `arras.client` as a library.

Install the package first, then run any example from the `python/` directory:

```bash
pip install -e .
python3 examples/basic.py                 # connect to a server
python3 examples/basic.py "#epn"          # by server id from the status list
python3 examples/turnstile_handler.py HOST:PORT
python3 examples/custom_bot.py HOST:PORT
```

- `basic.py` - resolve a server and run one session.
- `turnstile_handler.py` - supply a `turnstile_handler` for the Cloudflare
  Turnstile `G` challenge.
- `custom_bot.py` - subclass `ArrasBot` to hook into packets.

## Turnstile handler

When a server sends the `G` challenge, the bot calls
`turnstile_handler(site_id, session_token)`. The handler must return the
Cloudflare Turnstile response token as a string, or `None` to skip. The bot
echoes `session_token` and sends the answer back as the `G` client packet.
