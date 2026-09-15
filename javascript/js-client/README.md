# js-client

A browser client for the original arras.io servers. It speaks the real wire
protocol (status list, websocket upgrade, X25519 exchange, ChaCha20 packets
with the SHA-256 trailer) and draws the game on a canvas.

The rendering stack is adapted from the community project open-source-arras
(MIT). Everything network- and protocol-related is written here from the
reverse-engineered format.

## Layout

- `index.html`, `style.css` - entry page and styles.
- `src/main.js` - bootstrap and game client.
- `src/net/` - status fetch and websocket transport.
- `src/protocol/` - packet codec, typed packets, X25519/ChaCha20, SHA-256.
- `src/render/` - canvas, camera, draw helpers, tank mockups.
- `src/state/` - turns decoded packets into the render model, plus animations.
- `src/ui/` - server selector, mode ids, keybinds, options, input.
- `tools/` - protocol selftest and headless-browser capture/smoke scripts.
- `docs/` - mode-id reference and development notes.

## Running

ES modules need to be served over HTTP, not opened from `file://`:

```bash
python3 -m http.server 8090
# open http://localhost:8090/index.html
```

Pick a server from the list, and the client connects on its own.

## Tests

```bash
node tools/selftest.mjs
```

The browser-driven scripts in `tools/` (capture, smoke_test, input_test) need
Chrome/selenium and a running local server.

## Notes

Server ids, mode strings, and the protocol details here were derived from the
live game for interoperability and study. Not affiliated with arras.io.
