import { ArrasCipher, x25519, x25519Base } from "../protocol/crypto.js";
import { randomBytes } from "../protocol/sha256.js";
import { decodePacket, encodePacket } from "../protocol/codec.js";
import { SERVER_PACKETS } from "../protocol/packets.js";

const DEFAULT_BUILD = "fc3fa85eb58aebd0";
const storedBuild = typeof localStorage !== "undefined" ? localStorage.getItem("arrasBuild") : null;
export const BUILD = storedBuild && /^[0-9a-f]{16}$/.test(storedBuild) ? storedBuild : DEFAULT_BUILD;
export const PROTOCOLS = ["arras.io#v1.4+sls+et0", "arras.io"];

function handshakeFrame() {
    const frame = new Uint8Array(12);
    frame.set([0, 1, 0, 1]);
    for (let i = 0; i < 8; i++) {
        frame[4 + i] = parseInt(BUILD.slice((7 - i) * 2, (7 - i) * 2 + 2), 16);
    }
    return frame;
}

export class ArrasConnection {
    constructor(host, handlers = {}) {
        this.host = host;
        this.handlers = handlers;
        this.cipher = null;
        this.ws = null;
        this.closed = false;
    }

    connect() {
        const url = `wss://${this.host}/?a=3&b=${BUILD}&t=${Math.floor(Date.now() / 1000)}`;
        this.ws = new WebSocket(url, PROTOCOLS);
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = () => {
            this.handlers.onOpen?.();
            this.ws.send(handshakeFrame());
        };
        this.ws.onmessage = (e) => this._onFrame(new Uint8Array(e.data));
        this.ws.onerror = () => this.handlers.onError?.();
        this.ws.onclose = (e) => {
            if (!this.closed) this.handlers.onClose?.(e.code, e.reason);
            this.closed = true;
        };
    }

    _onFrame(payload) {
        if (!this.cipher) {
            if (payload.length < 32) {
                this.handlers.onProtocolError?.(`unexpected first frame (${payload.length}B)`);
                return;
            }
            const serverPub = payload.slice(0, 32);
            const priv = randomBytes(32);
            const shared = x25519(priv, serverPub);
            this.cipher = new ArrasCipher(shared);
            this.ws.send(x25519Base(priv).slice().buffer);
            this.handlers.onReady?.();
            return;
        }
        let raw;
        try {
            raw = this.cipher.decrypt(payload.subarray(0, payload.length - 6));
            var fields = decodePacket(raw);
        } catch (e) {
            this.handlers.onProtocolError?.(`decode failed: ${e.message}`);
            return;
        }
        const tag = fields[0];
        const cls = SERVER_PACKETS[tag];
        try {
            if (!cls) {
                this.handlers.onUnknownPacket?.(tag, fields.slice(1));
                return;
            }
            this.handlers.onPacket?.(cls.parse(fields.slice(1)));
        } catch (e) {
            this.handlers.onProtocolError?.(`parse ${tag} failed: ${e.message}`);
        }
    }

    send(packetFields) {
        if (!this.cipher || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        const data = encodePacket(packetFields);
        this.ws.send(this.cipher.encrypt(data).buffer);
        return true;
    }

    close() {
        this.closed = true;
        try { this.ws?.close(); } catch (e) {  }
    }
}
