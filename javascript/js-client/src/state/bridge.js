import { advancedSmoothBar, lerpSmoothBar } from "./anim.js";
import { createGunContainer } from "./gunAnim.js";

import { translateServerMessage } from "../ui/serverMessageTranslator.js";

const TELEPORT_DISTANCE_SQ = 500 * 500;

function wrapAngle(a) {
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
}

export class WorldState {
    constructor() {
        this.reset();
    }

    reset() {
        this.entities = new Map();
        this.dyingEntities = new Map();
        this.mockups = new Map();
        this.playerId = "";
        this.playerToken = "";
        this.travelToken = "";
        this.entityId = null;
        this.selfSocketId = null;
        this.bodyX = 0;
        this.bodyY = 0;
        this.bodyFov = 2000;
        this._prevBodyX = 0;
        this._prevBodyY = 0;
        this._fovGlide = lerpSmoothBar(2000, 0.08);
        this.spawned = false;
        this.died = false;
        this.kicked = false;
        this.kickReason = "";
        this.serverInfo = null;
        this.clientCount = null;
        this.room = null;
        this.playerList = new Map();
        this.leaderboard = [];
        this.minimap = [];
        this._minimapDots = new Map();
        this._leaderboardMap = new Map();
        this.chats = {};
        this.serverMessages = [];
        this.deathInfo = null;
        this.kills = { player: 0, assist: 0, boss: 0, food: 0 };
        this.partyCode = null;
        this.upgrades = [];
        this.skillPoints = 0;
        this.skills = new Array(10).fill(0);
        this.maxSkills = new Array(10).fill(0);
        this.operatorLevel = 0;
        this.ping = 0;
        this._pingSentAt = 0;
        this._latencyBuffer = [];
        this._mockupMemo = new Map();
        this._scoreBar = advancedSmoothBar(0);
        this._level = 1;
        this._deduction = 0;
        this._levelscore = 0;
        this._deathTimestamp = 0;
        this._finalScore = advancedSmoothBar(0, 1.5);
        this._finalLifetime = advancedSmoothBar(0, 3);
        this._finalKills = [
            advancedSmoothBar(0, 4),
            advancedSmoothBar(0, 5.5),
            advancedSmoothBar(0, 2.5),
            advancedSmoothBar(0, 6),
        ];
        this._deathAnimation = advancedSmoothBar(0, 4, 1);
        this._deathAnimation.force(4);
    }

    recordPingSend() {
        this._pingSentAt = performance.now();
    }

    recordPongReceive() {
        if (this._pingSentAt > 0) {
            const rtt = performance.now() - this._pingSentAt;
            this._pingSentAt = 0;
            const buf = this._latencyBuffer;
            buf.push(rtt);
            if (buf.length > 16) buf.shift();
            this.ping = buf.reduce((a, b) => a + b, 0) / buf.length;
        }
    }

    setScore(d) {
        if (d) {
            this._scoreBar.set(d);
            if (this._deduction > this._scoreBar.get()) {
                this._deduction = 0;
                this._level = 0;
            }
        } else {
            this._levelscore = 3;
            this._deduction = 0;
            this._level = 0;
            this._scoreBar = advancedSmoothBar(0);
        }
    }

    updateScore() {
        let levelscore = Math.ceil(Math.pow(this._level, 3) * 0.3083);
        levelscore -= this._deduction;
        this._levelscore = levelscore;
        const s = this._scoreBar.get();
        if (s >= this._deduction + levelscore) {
            this._deduction += levelscore;
            this._level++;
        } else if (s < this._deduction) {
            const d = this._level - 1;
            let ded = Math.ceil(Math.pow(this._level, 3) * 0.3083);
            ded -= levelscore - ded * d;
            this._deduction = ded;
            this._level--;
        }
    }

    getFov() {
        return this._fovGlide.get();
    }

    getScore() {
        return this._scoreBar.get();
    }

    getLevel() {
        return this._level;
    }

    getProgress() {
        if (!this._levelscore) return 0;
        const p = (this.getScore() - this._deduction) / this._levelscore;
        return Math.min(1, Math.max(0, p));
    }

    get playerName() {
        const ent = this.entityId != null ? this.entities.get(this.entityId) : null;
        if (ent && ent.name) return ent.name;
        for (const p of this.playerList.values()) {
            if (p.self && p.name) return p.name;
        }
        return "";
    }

    get tankName() {
        const m = this.bodyMockupIndex !== undefined ? this.getMockup(this.bodyMockupIndex) : null;
        return m ? m.name : "";
    }

    handleUpdate(packet) {
        this._prevBodyX = this.bodyX;
        this._prevBodyY = this.bodyY;
        this.bodyX = packet.bodyX;
        this.bodyY = packet.bodyY;
        this.bodyFov = packet.bodyFov;
        const isTeleport = (this.bodyX - this._prevBodyX) ** 2 + (this.bodyY - this._prevBodyY) ** 2 > TELEPORT_DISTANCE_SQ;
        if (isTeleport) {
            this._fovGlide.force(this.bodyFov);
        } else {
            this._fovGlide.set(this.bodyFov);
        }
        if (packet.body.id !== undefined) this.entityId = packet.body.id;
        if (packet.body.mockupIndex !== undefined) this.bodyMockupIndex = packet.body.mockupIndex;
        if (packet.body.size !== undefined) this.bodySize = packet.body.size;
        if (packet.body.color !== undefined) this.bodyColor = packet.body.color;
        if (packet.body.score !== undefined) this.setScore(packet.body.score);
        if (packet.body.kills !== undefined) this.kills = packet.body.kills;
        if (packet.body.partyCode !== undefined) this.partyCode = packet.body.partyCode;
        if (packet.body.skillPoints !== undefined) this.skillPoints = packet.body.skillPoints;
        if (packet.body.skills !== undefined) this.skills = packet.body.skills;
        if (packet.body.maxSkills !== undefined) this.maxSkills = packet.body.maxSkills;
        if (packet.body.upgrades !== undefined) this.upgrades = packet.body.upgrades;
        if (packet.body.operatorLevel !== undefined) this.operatorLevel = packet.body.operatorLevel;

        const wasDead = this.died;
        for (const ent of packet.changed) {
            this._mergeEntity(ent);
        }
        if (this.entityId != null) {
            const self = this.entities.get(this.entityId);
            if (self) {
                self.x = this.bodyX;
                self.y = this.bodyY;
            }
        }
        for (const gone of packet.dead) {
            const ent = this.entities.get(gone.id);
            if (ent) {
                const now = performance.now();
                if (!this._isWallEntity(ent)) {
                    ent._dyingAt = now;
                    ent._fadeAlpha = 1;
                    this.dyingEntities.set(gone.id, ent);
                }
            }
            this.entities.delete(gone.id);
            delete this.chats[gone.id];
            if (gone.id === this.entityId) this.died = true;
        }
        for (const gone of packet.removed) {
            const ent = this.entities.get(gone.id);
            if (ent) {
                const now = performance.now();
                if (!this._isWallEntity(ent)) {
                    ent._dyingAt = now;
                    ent._fadeAlpha = 1;
                    this.dyingEntities.set(gone.id, ent);
                }
            }
            this.entities.delete(gone.id);
            delete this.chats[gone.id];
        }
        if (wasDead && !this.died && this.entityId) {
            this.spawned = true;
        }
        if (!this.entityId && !this.died) {
            let best = null, bestD = Infinity;
            for (const e of this.entities.values()) {
                const d = Math.hypot(e.x - this.bodyX, e.y - this.bodyY);
                if (d < bestD) { bestD = d; best = e; }
            }
            if (best && bestD < 500) this.entityId = best.id;
        }
    }

    _tickDyingEntities() {
        const FADE_DURATION = 300;
        const now = performance.now();
        const dt = this._lastTickTime ? (now - this._lastTickTime) : 0;
        this._lastTickTime = now;
        const TICK_MS = 20;
        for (const [id, ent] of this.dyingEntities) {
            const elapsed = now - ent._dyingAt;
            ent._fadeAlpha = Math.max(0, 1 - elapsed / FADE_DURATION);
            if (dt > 0) {
                if (ent.vx !== undefined) ent.x += ent.vx * (dt / TICK_MS);
                if (ent.vy !== undefined) ent.y += ent.vy * (dt / TICK_MS);
                if (ent.vfacing !== undefined) ent.facing = wrapAngle(ent.facing + ent.vfacing * (dt / TICK_MS));
            }
            if (ent._fadeAlpha <= 0) {
                this.dyingEntities.delete(id);
            }
        }
    }

    _isWallEntity(ent) {
        if (!ent) return false;
        const mi = ent.mockupIndex ?? this._mockupMemo.get(ent.id);
        const m = this.getMockup(mi);
        if (!m) return false;
        return m.entityType === 2 || /(^|[^a-z])(wall|maze)([^a-z]|$)/i.test(m.name || "");
    }

    _mergeEntity(ent) {
        const id = ent.id;
        const existing = this.entities.get(id);
        if (ent.mockupIndex !== undefined) {
            this._mockupMemo.set(id, ent.mockupIndex);
            if (this._mockupMemo.size > 4096) {
                for (const k of this._mockupMemo.keys()) {
                    this._mockupMemo.delete(k);
                    if (this._mockupMemo.size <= 2048) break;
                }
            }
        }
        if (!existing) {
            const mi = ent.mockupIndex ?? this._mockupMemo.get(id);
            const newEnt = {
                x: ent.deltaX || 0,
                y: ent.deltaY || 0,
                facing: ent.deltaFacing || 0,
                vx: ent.deltaX || 0,
                vy: ent.deltaY || 0,
                vfacing: ent.deltaFacing || 0,
                ...(mi !== undefined ? { mockupIndex: mi } : {}),
                ...this._cleanEnt(ent),
            };
            if (mi !== undefined) {
                const m = this.getMockup(mi);
                if (m && m.guns && m.guns.length) {
                    newEnt._gunContainer = createGunContainer(m.guns.length);
                }
            }
            this.entities.set(id, newEnt);
            if (ent.guns && newEnt._gunContainer) {
                for (const [gi, gd] of Object.entries(ent.guns)) {
                    if (gd.time !== undefined) {
                        newEnt._gunContainer.fire(+gi, gd.power);
                    }
                }
            }
            return;
        }
        if (ent.deltaX !== undefined) { existing.vx = ent.deltaX; existing.x += ent.deltaX; }
        if (ent.deltaY !== undefined) { existing.vy = ent.deltaY; existing.y += ent.deltaY; }
        if (ent.deltaFacing !== undefined) { existing.vfacing = ent.deltaFacing; existing.facing = wrapAngle(existing.facing + ent.deltaFacing); }
        if (ent.mockupIndex !== undefined) {
            const prevMockup = existing.mockupIndex;
            existing.mockupIndex = ent.mockupIndex;
            if (ent.mockupIndex !== prevMockup) {
                const m = this.getMockup(ent.mockupIndex);
                if (m && m.guns && m.guns.length) {
                    existing._gunContainer = createGunContainer(m.guns.length);
                } else {
                    existing._gunContainer = null;
                }
            }
        }
        if (ent.health !== undefined) existing.health = ent.health;
        if (ent.shield !== undefined) existing.shield = ent.shield;
        if (ent.alpha !== undefined) existing.alpha = ent.alpha;
        if (ent.size !== undefined) existing.size = ent.size;
        if (ent.score !== undefined) existing.score = ent.score;
        if (ent.name !== undefined) existing.name = ent.name;
        if (ent.color !== undefined) existing.color = ent.color;
        if (ent.layer !== undefined) existing.layer = ent.layer;
        if (ent.autoSpin !== undefined) existing.autoSpin = ent.autoSpin;
        if (ent.reverseTank !== undefined) existing.reverseTank = ent.reverseTank;
        if (ent.invuln !== undefined) existing.invuln = ent.invuln;
        if (ent.damage !== undefined) existing.damage = ent.damage;
        if (ent.guns) {
            if (!existing.guns) existing.guns = {};
            for (const [gi, gd] of Object.entries(ent.guns)) {
                existing.guns[gi] = { ...existing.guns[gi], ...gd };
                if (gd.time !== undefined) {
                    if (!existing._gunContainer) {
                        const m = this.getMockup(existing.mockupIndex);
                        if (m && m.guns && m.guns.length) {
                            existing._gunContainer = createGunContainer(m.guns.length);
                        }
                    }
                    if (existing._gunContainer) {
                        existing._gunContainer.fire(+gi, gd.power);
                    }
                }
            }
        }
        if (ent.turrets) {
            if (!existing.turrets) existing.turrets = {};
            for (const [ti, td] of Object.entries(ent.turrets)) {
                this._mergeTurret(existing, ti, td);
            }
        }
    }

    _mergeTurret(parent, index, td) {
        const existing = parent.turrets?.[index];
        if (!existing) {
            parent.turrets[index] = { x: td.deltaX || 0, y: td.deltaY || 0, facing: td.deltaFacing || 0, ...this._cleanEnt(td) };
            return;
        }
        if (td.deltaX !== undefined) existing.x += td.deltaX;
        if (td.deltaY !== undefined) existing.y += td.deltaY;
        if (td.deltaFacing !== undefined) {
            existing.facing = wrapAngle(existing.facing + td.deltaFacing);
        }
        if (td.health !== undefined) existing.health = td.health;
        if (td.shield !== undefined) existing.shield = td.shield;
        if (td.alpha !== undefined) existing.alpha = td.alpha;
        if (td.size !== undefined) existing.size = td.size;
        if (td.mockupIndex !== undefined) existing.mockupIndex = td.mockupIndex;
    }

    _cleanEnt(ent) {
        const e = {};
        for (const [k, v] of Object.entries(ent)) {
            if (k !== "deltaX" && k !== "deltaY" && k !== "deltaFacing") e[k] = v;
        }
        return e;
    }

    handlePlayerList(packet) {
        for (const p of packet.removed) {
            this.playerList.delete(p.socketId);
        }
        for (const p of packet.changed) {
            this.playerList.set(p.socketId, p);
            if (p.self) {
                this.selfSocketId = p.socketId;
                if (p.operatorLevel !== undefined) {
                    this.operatorLevel = p.operatorLevel;
                }
            }
        }
    }

    handleBroadcast(packet) {
        if (!(this._minimapDots instanceof Map)) this._minimapDots = new Map();
        if (!(this._leaderboardMap instanceof Map)) this._leaderboardMap = new Map();
        for (const r of packet.minimapRemoved) this._minimapDots.delete(r.id);
        for (const d of packet.minimapChanged) {
            this._minimapDots.set(d.id, Object.assign({}, this._minimapDots.get(d.id), d));
        }
        for (const r of packet.teamMinimapRemoved) {}
        for (const r of packet.leaderboardRemoved) this._leaderboardMap.delete(r.id);
        for (const d of packet.leaderboardChanged) {
            this._leaderboardMap.set(d.id, Object.assign({}, this._leaderboardMap.get(d.id), d));
        }
        this.minimap = [...this._minimapDots.values()];
        this.leaderboard = [...this._leaderboardMap.values()];
    }

    handleRoom(packet) {
        this.room = packet;
    }

    handleMockups(packet) {
        for (const m of packet.mockups) {
            this.mockups.set(m.mockupIndex, m);
        }
        for (const ent of this.entities.values()) {
            if (ent._gunContainer || ent.mockupIndex === undefined) continue;
            const m = this.getMockup(ent.mockupIndex);
            if (m && m.guns && m.guns.length) {
                ent._gunContainer = createGunContainer(m.guns.length);
            }
        }
    }

    handleChat(packet) {
        const entityId = packet.entityId;
        const list = this.chats[entityId] || (this.chats[entityId] = []);
        const alpha = advancedSmoothBar(0, 0.3, 1.5);
        const slide = lerpSmoothBar(0, 0.4);
        list.push({
            text: packet.message,
            isGlobal: packet.isGlobal,
            id: (this._chatId = (this._chatId || 0) + 1),
            time: performance.now(),
            alpha: alpha,
            slide: slide,
            erased: false,
        });
        alpha.set(1);
        if (list.length > 16) list.splice(0, list.length - 16);
    }

    handleMessage(packet) {
        const raw = packet.message;
        const msg = { text: translateServerMessage(raw), raw, time: performance.now(), duration: 10000 };
        if (raw.trimStart().startsWith('[')) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    msg.textJSON = parsed.map((line) => translateServerMessage(String(line)));
                    msg.text = msg.textJSON.join(' ');
                }
            } catch {}
        }
        if (!msg.textJSON && raw.includes('\n')) {
            msg.textJSON = raw.replace(/\r/g, '').split('\n').map((line) => translateServerMessage(line));
            msg.text = msg.textJSON.join(' ');
        }
        this.serverMessages.push(msg);
        if (this.serverMessages.length > 8) this.serverMessages.shift();
        return msg;
    }

    handleCamera(packet) {
        this.bodyX = packet.bodyX;
        this.bodyY = packet.bodyY;
        this.bodyFov = packet.bodyFov;
        this._fovGlide.force(this.bodyFov);
        this.spawned = true;
        this.died = false;
        if (this.entityId != null) {
            const self = this.entities.get(this.entityId);
            if (self) {
                self.x = this.bodyX;
                self.y = this.bodyY;
                self.vx = 0;
                self.vy = 0;
            }
        }
    }

    handleDeath(packet) {
        this.died = true;
        this.spawned = false;
        this.deathInfo = packet;
        this._deathTimestamp = Math.floor(Date.now() / 1000);
        this._deathAnimation = advancedSmoothBar(0, 4, 1);
        this._deathAnimation.set(4);
        this._finalScore = advancedSmoothBar(0, 1.5);
        this._finalScore.set(packet.score || 0);
        this._finalLifetime = advancedSmoothBar(0, 3);
        this._finalLifetime.set(packet.timeAlive || 0);
        const k = packet.kills || {};
        this._finalKills = [
            advancedSmoothBar(0, 4),
            advancedSmoothBar(0, 5.5),
            advancedSmoothBar(0, 2.5),
            advancedSmoothBar(0, 6),
        ];
        this._finalKills[0].set(k.player || 0);
        this._finalKills[1].set(k.assist || 0);
        this._finalKills[2].set(k.boss || 0);
        this._finalKills[3].set(k.food || 0);
    }

    handleKick(reason) {
        this.kicked = true;
        this.kickReason = reason;
    }

    getMockup(index) {
        return this.mockups.get(index) || null;
    }
}
