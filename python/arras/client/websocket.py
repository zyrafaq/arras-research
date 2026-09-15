import base64
import secrets
import socket
import ssl
import struct
from urllib.parse import urlparse

from .config import BROWSER_UA, PROTOCOLS, log


class WSClient:
    def __init__(self, url, on_binary=None):
        u = urlparse(url)
        self.scheme = u.scheme
        self.host = u.hostname
        self.port = u.port or (443 if u.scheme == "wss" else 80)
        self.path = (u.path or "/") + (("?" + u.query) if u.query else "")
        self.on_binary = on_binary if on_binary else (lambda p: None)
        self.sock = None
        self.tail = b""

    def connect(self):
        raw = socket.create_connection((self.host, self.port), timeout=20)
        if self.scheme == "wss":
            ctx = ssl.create_default_context()
            raw = ctx.wrap_socket(raw, server_hostname=self.host)
        self.sock = raw
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        hdrs = [
            f"Sec-WebSocket-Protocol: {', '.join(PROTOCOLS)}",
            "Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits",
            "Origin: https://arras.io",
            "Referer: https://arras.io/",
            f"User-Agent: {BROWSER_UA}",
            "Accept: */*",
            "Accept-Encoding: gzip, deflate, br, zstd",
            "Accept-Language: pl,en-US;q=0.9,en;q=0.8",
            "Cache-Control: no-cache",
            "Sec-Fetch-Site: cross-site",
            "Sec-Fetch-Mode: websocket",
            "Sec-Fetch-Dest: empty",
        ]
        req = (f"GET {self.path} HTTP/1.1\r\n"
               f"Host: {self.host}:{self.port}\r\n"
               f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
               + "\r\n".join(hdrs) + "\r\n\r\n")
        log.info(f"== connecting wss://{self.host}:{self.port}{self.path}")
        self.sock.sendall(req.encode())
        head = b""
        while b"\r\n\r\n" not in head:
            head += self.sock.recv(4096)
        h, rest = head.split(b"\r\n\r\n", 1)
        self.tail = rest
        if not h.startswith(b"HTTP/1.1 101"):
            raise ConnectionError("upgrade failed: %r" % h[:160])
        echo = [ln.split(":", 1)[1].strip() for ln in h.decode("latin1").split("\r\n")
                if ln.lower().startswith("sec-websocket-protocol")]
        log.info(f"== 101 OK   subprotocol echo: {echo or '(none)'}")

    def _recv(self, n):
        while len(self.tail) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise EOFError("socket closed")
            self.tail += chunk
        out, self.tail = self.tail[:n], self.tail[n:]
        return out

    def _send(self, opcode, payload):
        mask = secrets.token_bytes(4)
        h = bytearray([0x80 | opcode])
        ln = len(payload)
        if ln < 126:
            h.append(0x80 | ln)
        elif ln < 65536:
            h.append(0x80 | 126)
            h += struct.pack(">H", ln)
        else:
            h.append(0x80 | 127)
            h += struct.pack(">Q", ln)
        masked = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
        self.sock.sendall(bytes(h) + mask + masked)

    def _read(self):
        b0 = self._recv(1)[0]
        b1 = self._recv(1)[0]
        opcode = b0 & 0x0F
        ln = b1 & 0x7F
        if ln == 126:
            ln = struct.unpack(">H", self._recv(2))[0]
        elif ln == 127:
            ln = struct.unpack(">Q", self._recv(8))[0]
        mask = self._recv(4) if (b1 & 0x80) else None
        payload = self._recv(ln)
        if mask:
            payload = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
        return opcode, payload
