import { ArrasConnection } from "./net/transport.js";
import { fetchClientCount } from "./net/status.js";
import { ServerSelector } from "./ui/serverSelector.js";
import { InputHandler } from "./ui/input.js";
import { initKeybindGUI } from "./ui/keybinds.js";
import { initOptions, getSettings } from "./ui/options.js";
import { initThemeUI } from "./ui/theme.js";
import { randomTip, loadTips } from "./ui/tips.js";
import { loadChangelog } from "./ui/changelog.js";
import { WorldState } from "./state/bridge.js";
import { Renderer } from "./render/renderer.js";
import { ClientPackets } from "./protocol/packets.js";
import { Sha256 } from "./protocol/sha256.js";

function log(msg) {
    console.log(`[client] ${msg}`);
}

function _deriveRegionFromCode(code) {
    if (!code) return "";
    const parts = code.split("-");
    const loc = (parts[1] || "").toLowerCase();
    if (loc.startsWith("hil")) return "US West";
    if (loc.startsWith("kci")) return "US Central";
    if (loc.startsWith("fsn")) return "Europe";
    if (loc.startsWith("syd")) return "Oceania";
    if (loc.startsWith("sgp")) return "Asia";
    if (code.includes("hetzner")) return "Europe";
    if (code.includes("ovh-hil")) return "US West";
    if (code.includes("wsi-kci")) return "US Central";
    if (code.includes("ovh-syd")) return "Oceania";
    if (code.includes("contabo-sgp")) return "Asia";
    return "";
}

window.addEventListener("error", (e) => log(`error: ${e.message}`));

class GameClient {
    constructor() {
        this.state = new WorldState();
        this.renderer = new Renderer();
        this.connection = null;
        this.input = null;
        this.name = "";
        this.party = "";
        this.upgradesOffered = [];
        this._commandTimer = null;
        this._playerId = "";
        this._playerToken = "";
        this._travelToken = "";
        this.lastHost = "";
        this._hashServerId = "";
        this._pendingKickReason = null;
        this.selector = new ServerSelector((opts) => this.start(opts));
    }

    _serverInfoFromRecord(host, rec) {
        rec = rec || {};
        const raw = (typeof rec.gamemode === "string" && rec.gamemode.trim())
            ? rec.gamemode.trim()
            : String(rec.code ?? "").split("-").slice(2).join("-").trim();
        const mspt = parseFloat(rec.mspt);
        const code = String(rec.code ?? "");
        const region = _deriveRegionFromCode(code);
        return {
            id: String(rec.name ?? String(host).split("/")[1] ?? ""),
            gamemodeRaw: raw,
            mspt: Number.isFinite(mspt) ? mspt : null,
            region,
            code,
        };
    }

    start({ host, name, party, server }) {
        if (this.connection) {
            this.connection.close();
            clearInterval(this._commandTimer);
        }
        this.name = name;
        this.party = party;
        this.lastHost = host;
        this._sessionLive = false;
        this._spawnAnnounced = false;
        this._isTraveling = false;
        this.state.reset();
        this.renderer.showMore = false;
        this.renderer._upgradeSuppressed = false;
        this.state.serverInfo = this._serverInfoFromRecord(host, server);
        const rawHash = location.hash ? location.hash.slice(1) : "";
        let hashServerId = "";
        if (rawHash) {
            for (const s of (this.selector.availableServers || [])) {
                if (s.id && rawHash.startsWith(s.id) && s.id.length > hashServerId.length) {
                    hashServerId = s.id;
                }
            }
        }
        this._hashServerId = hashServerId || this.state.serverInfo.id || "";
        this.state.clientCount = Number.isFinite(server?.clients) ? server.clients : null;
        log(`connecting to ${host}…`);
        document.getElementById("mainWrapper").style.display = "none";
        document.getElementById("gameAreaWrapper").style.display = "";
        document.getElementById("gameCanvas").style.display = "block";
        document.getElementById("optionsArrow").style.display = "";
        hideAllPanels();
        this.state.connecting = true;
        this.state.disconnected = false;
        this.state.connectMessage = host;
        this.state.connectTip = randomTip();
        this.connection = new ArrasConnection(host, {
            onOpen: () => log("ws open, handshake sent"),
            onReady: () => {
                log("keys exchanged, session live");
                this._sessionLive = true;
                this.send(ClientPackets.key(this._playerId, this._playerToken, this._travelToken));
                this.selector.hide();
                if (!this.input) {
                    this.input = new InputHandler(document.getElementById("gameCanvas"),
                        (actions, mouse) => this._onInput(actions, mouse));
                    this.input.onUpgrade = (i) => this._upgradeTank(i);
                    this.input.onSkill = (i, max) => this.send(ClientPackets.skillUpgrade(i, max ? "max" : "add"));
                    this.input.onRespawn = () => this.spawn();
                    this.input.onSuicide = () => this.send(ClientPackets.suicide());
                    this.input.onToggle = (a) => this.send(ClientPackets.toggle(a));
                    this.input.onChatOpen = (open) => this._setChat(open);
                    this.input.onShowMore = () => this.renderer.toggleShowMore();
                    this.input.onSaveScore = () => this.send(ClientPackets.saveScore());
                    this.input.onSandboxKey = (code, down) => this.send(ClientPackets.keyPress(code, down));
                    this.input.onBeforeMouseDown = (e) => this._isOverUpgradeUI(e);
                }
                this.input.enabled = false;
                this._startCommandLoop();
                this._startClientCountPolling();
            },
            onPacket: (pkt) => this._onPacket(pkt),
            onClose: (code, reason) => {
                log(`connection closed (${code}) ${reason || ""}`);
                this._sessionLive = false;
                clearInterval(this._commandTimer);
                clearInterval(this._clientCountTimer);
                const wasTraveling = this._isTraveling;
                const hadSpawned = this.state.spawned;
                this.state.reset();
                this.state.connecting = false;
                if (this.input) { this.input.enabled = false; this.input.dead = false; }
                this._setChat(false);
                if (wasTraveling) return;
                if (hadSpawned || code !== 1000) {
                    this.renderer._discInGame = hadSpawned;
                    const kickReason = this._pendingKickReason;
                    this._pendingKickReason = null;
                    this.state.disconnectReason = kickReason || reason || `connection closed (code ${code})`;
                    this.state.disconnectTime = new Date();
                    this.state.disconnected = true;
                    document.getElementById("optionsArrow").style.display = "";
                    document.getElementById("gameCanvas").style.cursor = "default";
                } else {
                    this._exitToMenu();
                }
            },
            onError: () => log("ws error"),
            onUnknownPacket: (tag) => log(`unknown packet ${JSON.stringify(tag)}`),
            onProtocolError: (msg) => log(`protocol error: ${msg}`),
        });
        this.connection.connect();
    }

    _exitToMenu() {
        this.state.connecting = false;
        this.state.disconnected = false;
        document.getElementById("mainWrapper").style.display = "none";
        document.getElementById("gameAreaWrapper").style.display = "none";
        document.getElementById("gameCanvas").style.display = "none";
        document.getElementById("optionsArrow").style.display = "";
        hideAllPanels();
        document.getElementById("gameCanvas").style.cursor = "";
        if (this.connection) { this.connection.close(); clearInterval(this._commandTimer); clearInterval(this._clientCountTimer); }
        this._sessionLive = false;
        this.state.reset();
        this.selector.show();
    }

    _updatePlayersTabVisibility() {
        const btn = document.getElementById("playersArrowBtn");
        if (!btn) return;
        const isOperator = this.state.operatorLevel >= 1;
        const hasPlayers = this.state.playerList.size > 0;
        btn.style.display = (isOperator && hasPlayers) ? "" : "none";
        if (!isOperator && playersPanel) {
            playersPanel.style.display = "none";
            btn.classList.remove("panel-open");
        }
    }

    _updatePlayersPanel() {
        const container = document.getElementById("playersList");
        if (!container) return;
        const players = this.state.playerList;
        if (players.size === 0) {
            container.innerHTML = '<div class="players-empty">No players</div>';
            return;
        }
        let html = "";
        for (const [socketId, p] of players) {
            const isSelf = p.self;
            const level = p.operatorLevel;
            const levelLabel = level === 3 ? "AO" : level === 2 ? "AS" : level === 1 ? "AC" : "";
            const levelClass = level === 3 ? "level-ao" : level === 2 ? "level-as" : level === 1 ? "level-ac" : "level-none";
            const selfClass = isSelf ? " self" : "";
            html += `<div class="player-row${selfClass}" data-socket-id="${socketId}">`;
            html += `<span class="player-name">${this._escapeHtml(p.name || "Unnamed")}</span>`;
            if (levelLabel) {
                html += `<span class="player-level ${levelClass}">${levelLabel}</span>`;
            }
            if (!isSelf && this.state.operatorLevel > 0) {
                html += `<span class="player-actions">`;
                html += `<button class="player-action-btn btn-promote" data-action="promote" data-sid="${socketId}" title="Promote">▲</button>`;
                html += `<button class="player-action-btn btn-demote" data-action="demote" data-sid="${socketId}" title="Demote">▼</button>`;
                html += `<button class="player-action-btn btn-kick" data-action="kick" data-sid="${socketId}" title="Kick">✕</button>`;
                html += `</span>`;
            }
            html += `</div>`;
        }
        container.innerHTML = html;
        for (const btn of container.querySelectorAll(".player-action-btn")) {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const sid = parseInt(btn.dataset.sid, 10);
                if (action && !isNaN(sid)) {
                    this.send(ClientPackets.playerAction(action, sid));
                }
            });
        }
    }

    _escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    _setChat(open) {
        const bar = document.getElementById("chatBar");
        const input = document.getElementById("chatInput");
        if (!this.input) return;
        this.input.setChat(open);
        bar.style.display = open ? "block" : "none";
        if (open) {
            input.value = "";
            setTimeout(() => input.focus(), 0);
        } else {
            input.blur();
        }
    }

    send(fields) {
        return this.connection?.send(fields);
    }

    spawn() {
        const opts = getSettings();
        log(`spawning as "${this.name}"`);
        this.send(ClientPackets.spawn(this.name, this.party, opts.autoLevelUp, opts.incognitoMode));
    }

    _reconnect() {
        if (!this.lastHost) return;
        log("reconnecting to " + this.lastHost);
        this.start({ host: this.lastHost, name: this.name, party: this.party });
    }

    _onPacket(pkt) {
        const tag = pkt.constructor.TAG;
        switch (tag) {
            case "w":
                this._playerId = pkt.playerId;
                this.state.playerId = pkt.playerId;
                log(`welcome, playerId=${JSON.stringify(pkt.playerId)}`);
                this.spawn();
                this.state.recordPingSend();
                this.send(ClientPackets.ping());
                break;
            case "p":
                this.state.recordPongReceive();
                this.state.recordPingSend();
                this.send(ClientPackets.ping());
                break;
            case "k":
                this._playerToken = pkt.playerToken;
                this.state.playerToken = pkt.playerToken;
                break;
            case "r":
                this._travelToken = pkt.travelToken;
                this.state.travelToken = pkt.travelToken;
                log(`travel: ${pkt.server} token=${pkt.travelToken}`);
                this._travelTo(pkt.server, pkt.travelToken);
                break;
            case "e":
                this._answerEval(pkt.id, pkt.code);
                break;
            case "C":
                this._answerPow(pkt.input);
                break;
            case "J":
                this.state.handleMockups(pkt);
                log(`received ${pkt.mockups.length} mockups`);
                break;
            case "R":
                this.state.handleRoom(pkt);
                if (this.state.serverInfo) {
                    if (pkt.info.gamemode) {
                        this.state.serverInfo.gamemodeRaw = pkt.info.gamemode;
                    }
                    if (pkt.info.host && !this.state.serverInfo.id) {
                        const infoHost = pkt.info.host;
                        for (const s of (this.selector.availableServers || [])) {
                            if (s.id && infoHost.includes(s.id)) {
                                this.state.serverInfo.id = s.id;
                                this.state.serverInfo.code = s.code || "";
                                this._hashServerId = s.id;
                                break;
                            }
                        }
                    }
                    if (pkt.info.code && !this.state.serverInfo.code) {
                        this.state.serverInfo.code = pkt.info.code;
                    }
                }
                log(`room ${JSON.stringify(pkt.info)} bounds=(${pkt.roomX1},${pkt.roomY1})-(${pkt.roomX2},${pkt.roomY2})`);
                break;
            case "u":
                this.state.handleUpdate(pkt);
                if (pkt.mspt != null && this.state.serverInfo) {
                    this.state.serverInfo.mspt = pkt.mspt;
                }
                {
                    this.party = this.state.partyCode || "";
                    const serverId = this._hashServerId || this.state.serverInfo?.id || "";
                    const party = this.state.partyCode || "";
                    const hash = serverId + party;
                    if (location.hash.slice(1) !== hash) {
                        history.replaceState(null, "", "#" + hash);
                    }
                }
                if (!this.state.spawned && !this._spawnAnnounced && this.state.entityId) {
                    this._spawnAnnounced = true;
                }
                this._updatePlayersTabVisibility();
                break;
            case "c":
                this.state.handleCamera(pkt);
                log(`camera x=${pkt.bodyX} y=${pkt.bodyY} fov=${pkt.bodyFov}`);
                this.state.connecting = false;
                document.getElementById("mainWrapper").style.display = "none";
                document.getElementById("gameAreaWrapper").style.display = "";
                document.getElementById("gameCanvas").style.display = "block";
                document.getElementById("optionsArrow").style.display = "";
                if (this.input) { this.input.enabled = true; this.input.dead = false; }
                break;
            case "P":
                this.state.handlePlayerList(pkt);
                this._updatePlayersTabVisibility();
                this._updatePlayersPanel();
                break;
            case "b":
                this.state.handleBroadcast(pkt);
                break;
            case "M": {
                const ent = this.state.entities.get(pkt.entityId);
                const sender = ent?.name || "unknown";
                log(`chat [${sender}]: ${pkt.message}`);
                this.state.handleChat(pkt);
                break;
            }
            case "m": {
                if (pkt.type === "svInfo" && pkt.args.length >= 1) {
                    if (this.state.serverInfo) {
                        this.state.serverInfo.gamemodeRaw = pkt.args[0] || "";
                        if (pkt.args[1] != null) {
                            const v = parseFloat(pkt.args[1]);
                            this.state.serverInfo.mspt = Number.isFinite(v) ? v : null;
                        }
                    }
                    log(`svInfo: gamemode=${pkt.args[0]} mspt=${pkt.args[1]}`);
                } else if (pkt.type === "gSvInfo" && pkt.args.length >= 1) {
                    this.state.clientCount = Number.isFinite(Number(pkt.args[0])) ? Number(pkt.args[0]) : this.state.clientCount;
                    log(`gSvInfo: players=${pkt.args[0]}`);
                } else {
                    const msg = this.state.handleMessage(pkt);
                    log(`server message: ${msg.text}`);
                }
                break;
            }
            case "K":
                log(`kicked: ${pkt.reason}`);
                this.state.handleKick(pkt.reason);
                this._pendingKickReason = pkt.reason;
                break;
            case "F":
                this.state.handleDeath(pkt);
                log(`death score=${pkt.score} respawn in ${pkt.respawnTime}ms`);
                if (this.input) this.input.dead = true;
                this._setChat(false);
                break;
            default:
                break;
        }
    }

    _sendCommands(actions, mouse) {
        if (mouse && Number.isFinite(mouse.x) && Number.isFinite(mouse.y)) {
            this._mouse = mouse;
            this._lastActions = actions;
        }
        if (!this._mouse) return;
        const cam = this.state;
        const world = this.renderer.canvas.screenToWorld(this._mouse.x, this._mouse.y,
            cam.bodyX, cam.bodyY, cam.bodyFov);
        const aimX = world.x - cam.bodyX;
        const aimY = world.y - cam.bodyY;
        this.state.aimX = aimX;
        this.state.aimY = aimY;
        this.send(ClientPackets.command(
            Math.round(aimX),
            Math.round(aimY),
            this._lastActions || { up: false, down: false, left: false, right: false, lmb: false, rmb: false },
        ));
    }

    _onInput(actions, mouse) {
        this._sendCommands(actions, mouse);
    }

    _startCommandLoop() {
        clearInterval(this._commandTimer);
        this._commandTimer = setInterval(() => {
            if (!this._sessionLive) return;
            this._sendCommands(null, null);
        }, 100);
    }

    _startClientCountPolling() {
        clearInterval(this._clientCountTimer);
        const poll = async () => {
            if (!this._sessionLive || !this.lastHost) return;
            try {
                this.state.clientCount = await fetchClientCount(this.lastHost, log);
            } catch (e) {
                if (this.state.clientCount == null && this.state.playerList.size > 0) {
                    this.state.clientCount = this.state.playerList.size;
                }
            }
        };
        poll();
        this._clientCountTimer = setInterval(poll, 10000);
    }

    _upgradeTank(index) {
        log(`tank upgrade index=${index}`);
        this.send(ClientPackets.tankUpgrade(index));
    }

    _isOverUpgradeUI(e) {
        if (!this.state.spawned || this.state.died) return false;
        const upgrades = this.state.upgrades || [];
        if (upgrades.length === 0) return false;
        const cv = document.getElementById("gameCanvas");
        const rect = cv.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        for (const r of this.renderer._upgradeHitRects) {
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
        }
        const donBtn = this.renderer._donUpgradeBtn;
        if (donBtn && x >= donBtn.x && x <= donBtn.x + donBtn.w && y >= donBtn.y && y <= donBtn.y + donBtn.h) return true;
        return false;
    }

    _travelTo(host, travelToken) {
        const { playerId, playerToken } = this.state;
        this._isTraveling = true;
        if (this.connection) {
            this.connection.close();
            clearInterval(this._commandTimer);
            clearInterval(this._clientCountTimer);
        }
        this._sessionLive = false;
        this._spawnAnnounced = false;
        this.state.reset();
        this.renderer._upgradeSuppressed = false;
        let travelServerId = "";
        let travelServerCode = "";
        const servers = this.selector.availableServers || [];
        for (const s of servers) {
            if (s.host === host) { travelServerId = s.id; travelServerCode = s.code; break; }
        }
        if (!travelServerId) {
            for (const s of servers) {
                if (host.includes(s.id)) { travelServerId = s.id; travelServerCode = s.code; break; }
            }
        }
        this._hashServerId = travelServerId;
        this.state.serverInfo = {
            id: travelServerId,
            code: travelServerCode,
            gamemodeRaw: "",
            mspt: null,
        };
        this.state.clientCount = null;
        this.state.playerId = playerId;
        this.state.playerToken = playerToken;
        this.selector.hide();
        document.getElementById("gameAreaWrapper").style.display = "";
        document.getElementById("gameCanvas").style.display = "block";
        document.getElementById("optionsArrow").style.display = "";
        hideAllPanels();
        this.state.connecting = true;
        this.state.disconnected = false;
        this.state.connectMessage = host;
        this.state.connectTip = randomTip();
        log(`traveling to ${host}…`);
        this.connection = new ArrasConnection(host, {
            onOpen: () => log("ws open, handshake sent"),
            onReady: () => {
                log("keys exchanged, session live");
                this._isTraveling = false;
                this._sessionLive = true;
                this.send(ClientPackets.key(this.state.playerId, this.state.playerToken, travelToken));
                this._startCommandLoop();
                this._startClientCountPolling();
            },
            onPacket: (pkt) => this._onPacket(pkt),
            onClose: (code, reason) => {
                log(`connection closed (${code}) ${reason || ""}`);
                this._sessionLive = false;
                clearInterval(this._commandTimer);
                clearInterval(this._clientCountTimer);
                const wasTraveling = this._isTraveling;
                const hadSpawned = this.state.spawned;
                this.state.reset();
                this.state.connecting = false;
                if (this.input) { this.input.enabled = false; this.input.dead = false; }
                this._setChat(false);
                if (wasTraveling) return;
                if (hadSpawned || code !== 1000) {
                    this.renderer._discInGame = hadSpawned;
                    const kickReason = this._pendingKickReason;
                    this._pendingKickReason = null;
                    this.state.disconnectReason = kickReason || reason || `connection closed (code ${code})`;
                    this.state.disconnectTime = new Date();
                    this.state.disconnected = true;
                    document.getElementById("optionsArrow").style.display = "";
                    document.getElementById("gameCanvas").style.cursor = "default";
                } else {
                    this._exitToMenu();
                }
            },
            onError: () => log("ws error"),
            onUnknownPacket: (tag) => log(`unknown packet ${JSON.stringify(tag)}`),
            onProtocolError: (msg) => log(`protocol error: ${msg}`),
        });
        this.connection.connect();
    }

    _answerEval(id, code) {
        let result;
        try {
            result = String(Function(`return (()=>{${code}})();`)());
        } catch (err) {
            result = "undefined";
        }
        log(`eval challenge id=${JSON.stringify(id)} -> ${result.slice(0, 60)}`);
        this.send(ClientPackets.evalAnswer(id, result));
    }

    async _answerPow(inputStr) {
        const t0 = performance.now();
        const solution = await powSolveAsync(inputStr);
        log(`pow solved "${solution}" in ${(performance.now() - t0).toFixed(0)}ms`);
        this.send(ClientPackets.powAnswer(inputStr, solution));
    }
}

const _yieldToLoop = (() => {
    if (typeof MessageChannel === "undefined") {
        return () => new Promise((r) => setTimeout(r, 0));
    }
    const ch = new MessageChannel();
    let resolve = null;
    ch.port1.onmessage = () => { const r = resolve; resolve = null; r(); };
    return () => new Promise((r) => { resolve = r; ch.port2.postMessage(null); });
})();

async function powSolveAsync(inputStr) {
    const encoder = new TextEncoder();
    const suffix = encoder.encode(inputStr);
    const CHUNK = 1500;
    for (let i = 0; i < 2 ** 22;) {
        const end = Math.min(i + CHUNK, 2 ** 22);
        do {
            let v = i;
            const d = [0, 0, 0, 0, 0, 0];
            for (let j = 0; j < 6; j++) {
                d[5 - j] = v % 64;
                v = Math.floor(v / 64);
            }
            const s = String.fromCharCode(...d.map((x) => x + 48));
            const prefix = encoder.encode(s);
            const combined = new Uint8Array(prefix.length + suffix.length);
            combined.set(prefix);
            combined.set(suffix, prefix.length);
            const hash = new Sha256().update(combined).digest();
            if (hash[0] === 0 && hash[1] === 0) return s;
            i++;
        } while (i < end);
        await _yieldToLoop();
    }
    throw new Error("pow not solved in 2^22 tries");
}

const game = new GameClient();
window.__gameClient = game;
initKeybindGUI();
initOptions();
initThemeUI();
loadTips();
loadChangelog();
game.selector.show();

document.getElementById("chatInput").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.code === "Enter") {
        const text = document.getElementById("chatInput").value.trim();
        if (text && game._sessionLive) {
            game.send(ClientPackets.chat(text));
            log(`chat: ${text}`);
        }
        game._setChat(false);
    }
});

document.getElementById("gameCanvas").addEventListener("click", (e) => {
    const cv = document.getElementById("gameCanvas");
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (game.state.disconnected && game.renderer._discBtns) {
        for (const btn of game.renderer._discBtns) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                if (btn.action === "exit") game._exitToMenu();
                else if (btn.action === "reconnect") game._reconnect();
                return;
            }
        }
        return;
    }
    if (game.state.died && game.renderer._deathBtns) {
        for (const btn of game.renderer._deathBtns) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                if (btn.action === "select") {
                    game._setChat(false);
                    game._exitToMenu();
                } else if (btn.action === "respawn") {
                    game.spawn();
                }
                return;
            }
        }
        return;
    }
    if (game.state.spawned && !game.state.died && (game.state.upgrades || []).length > 0) {
        const hitRects = game.renderer._upgradeHitRects;
        for (let i = 0; i < hitRects.length; i++) {
            const r = hitRects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                game._upgradeTank(i);
                return;
            }
        }
        const donBtn = game.renderer._donUpgradeBtn;
        if (donBtn && x >= donBtn.x && x <= donBtn.x + donBtn.w && y >= donBtn.y && y <= donBtn.y + donBtn.h) {
            game.renderer._upgradeSuppressed = true;
            return;
        }
    }
    if (game.state.spawned && !game.state.died && game.state.skillPoints > 0) {
        const statRects = game.renderer._statBarHitRects;
        for (let i = 0; i < statRects.length; i++) {
            const r = statRects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                game.send(ClientPackets.skillUpgrade(r.skillIndex));
                return;
            }
        }
    }
});

document.getElementById("gameCanvas").addEventListener("mousemove", (e) => {
    const cv = document.getElementById("gameCanvas");
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let hover = null;
    const btns = game.state.disconnected ? game.renderer._discBtns
        : game.state.died ? game.renderer._deathBtns : null;
    for (const btn of btns || []) {
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
            hover = btn.action; break;
        }
    }
    if (game.state.disconnected) game.renderer._discHover = hover;
    else game.renderer._deathHover = hover;
});

document.getElementById("gameCanvas").addEventListener("mousedown", () => {
    game.renderer._discDown = true;
});

window.addEventListener("mouseup", () => {
    game.renderer._discDown = false;
});

const optionsArrow = document.getElementById("optionsArrow");
const optionsArrowBtn = document.getElementById("optionsArrowBtn");
const optionsPanel = document.getElementById("optionsPanel");
const closeOptionsPanel = document.getElementById("closeOptionsPanel");
const playersArrowBtn = document.getElementById("playersArrowBtn");
const playersPanel = document.getElementById("playersPanel");
const closePlayersPanel = document.getElementById("closePlayersPanel");

function hideAllPanels() {
    if (optionsPanel) { optionsPanel.style.display = "none"; }
    if (playersPanel) { playersPanel.style.display = "none"; }
    if (optionsArrowBtn) { optionsArrowBtn.classList.remove("panel-open"); }
    if (playersArrowBtn) { playersArrowBtn.classList.remove("panel-open"); }
    if (optionsArrow) { optionsArrow.classList.remove("expanded"); }
}

if (optionsArrowBtn && optionsPanel) {
    optionsArrowBtn.addEventListener("click", () => {
        if (optionsPanel.style.display === "none") {
            optionsPanel.style.display = "flex";
            optionsArrowBtn.classList.add("panel-open");
            optionsArrow.classList.add("expanded");
            playersPanel.style.display = "none";
            playersArrowBtn.classList.remove("panel-open");
        } else {
            optionsPanel.style.display = "none";
            optionsArrowBtn.classList.remove("panel-open");
            optionsArrow.classList.remove("expanded");
        }
    });

    closeOptionsPanel.addEventListener("click", () => {
        optionsPanel.style.display = "none";
        optionsArrowBtn.classList.remove("panel-open");
        optionsArrow.classList.remove("expanded");
    });

    const tabs = optionsPanel.querySelectorAll(".options-panel-tabs span");
    const tabContents = optionsPanel.querySelectorAll(".options-panel-content");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tabContents.forEach(c => c.style.display = "none");
            tab.classList.add("active");
            const targetId = tab.dataset.tab;
            const target = document.getElementById(targetId);
            if (target) target.style.display = "block";
        });
    });
}

if (playersArrowBtn && playersPanel) {
    playersArrowBtn.addEventListener("click", () => {
        if (playersPanel.style.display === "none") {
            playersPanel.style.display = "flex";
            playersArrowBtn.classList.add("panel-open");
            optionsArrow.classList.add("expanded");
            optionsPanel.style.display = "none";
            optionsArrowBtn.classList.remove("panel-open");
        } else {
            playersPanel.style.display = "none";
            playersArrowBtn.classList.remove("panel-open");
            optionsArrow.classList.remove("expanded");
        }
    });

    closePlayersPanel.addEventListener("click", () => {
        playersPanel.style.display = "none";
        playersArrowBtn.classList.remove("panel-open");
        optionsArrow.classList.remove("expanded");
    });
}

function loop() {
    game.state._tickDyingEntities();
    const mousePos = game.input ? game.input.mouse : null;
    game.renderer.render(game.state, mousePos);
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
