import { Cursor, decodePacket, encodePacket } from "./codec.js";

export { decodePacket, encodePacket };

function u(field) {
    return field.t === "s" ? field.v : field.u;
}

function s(field) {
    return field.s;
}

class ServerPacket {
    static TAG = "?";
    static parse(fields) {
        throw new Error("not implemented");
    }
}

export class WelcomePacket extends ServerPacket {
    static TAG = "w";
    constructor(playerId) {
        super();
        this.playerId = playerId;
    }
    static parse(fields) {
        return new this(fields[0].t === "s" ? fields[0].v : "");
    }
}

export class KeyPacket extends ServerPacket {
    static TAG = "k";
    constructor(playerToken) {
        super();
        this.playerToken = playerToken;
    }
    static parse(fields) {
        return new this(fields.length && fields[0].t === "s" ? fields[0].v : "");
    }
}

export class TravelPacket extends ServerPacket {
    static TAG = "r";
    constructor(server, travelToken) {
        super();
        this.server = server;
        this.travelToken = travelToken;
    }
    static parse(fields) {
        return new this(u(fields[0]), u(fields[1]));
    }
}

export class PingRequestPacket extends ServerPacket {
    static TAG = "p";
    static parse() {
        return new this();
    }
}

export class PowChallengePacket extends ServerPacket {
    static TAG = "C";
    constructor(inputStr) {
        super();
        this.input = inputStr;
    }
    static parse(fields) {
        return new this(u(fields[0]));
    }
}

export class EvalChallengePacket extends ServerPacket {
    static TAG = "e";
    constructor(idStr, code) {
        super();
        this.id = idStr;
        this.code = code;
    }
    static parse(fields) {
        const strings = fields.filter((f) => f.t === "s").map((f) => f.v);
        return new this(strings[0], strings.length > 1 ? strings[1] : "");
    }
}

export class RoomPacket extends ServerPacket {
    static TAG = "R";
    constructor(info, roomX1, roomY1, roomX2, roomY2, tiles) {
        super();
        this.info = info;
        this.roomX1 = roomX1;
        this.roomY1 = roomY1;
        this.roomX2 = roomX2;
        this.roomY2 = roomY2;
        this.tiles = tiles;
    }
    static parse(fields) {
        const c = new Cursor(fields);
        const info = {};
        for (const part of c.string().split(",")) {
            if (part.includes("=")) {
                const idx = part.indexOf("=");
                info[part.slice(0, idx)] = part.slice(idx + 1);
            }
        }
        const x1 = c.signed(), y1 = c.signed(), x2 = c.signed(), y2 = c.signed();
        c.string();
        const w = c.unsigned(), h = c.unsigned();
        const tiles = [];
        for (let y = 0; y < h; y++) {
            const row = [];
            for (let x = 0; x < w; x++) row.push(c.signed());
            tiles.push(row);
        }
        return new this(info, x1, y1, x2, y2, tiles);
    }
}

export class PlayerListPacket extends ServerPacket {
    static TAG = "P";
    constructor(removed, changed) {
        super();
        this.removed = removed;
        this.changed = changed;
    }
    static parse(fields) {
        const c = new Cursor(fields);
        const removed = [];
        const removedCount = c.unsigned();
        for (let i = 0; i < removedCount; i++) removed.push({ socketId: c.unsigned() });
        const changed = [];
        const n = c.unsigned();
            for (let i = 0; i < n; i++) {
            const socketId = c.unsigned();
            const flag = c.unsigned();
            changed.push({
                socketId,
                self: Boolean(flag & 1),
                operatorLevel: ((flag & 1 ? flag - 1 : flag)) / 2,
                name: c.string(),
                mockupIndex: c.signed(),
            });
        }
        return new this(removed, changed);
    }
}

export class ServerMessagePacket extends ServerPacket {
    static TAG = "m";
    constructor(type, args) {
        super();
        this.type = type;
        this.args = args;
        this.message = type;
    }
    static parse(fields) {
        const type = u(fields[0]);
        const args = [];
        for (let i = 1; i < fields.length; i++) {
            args.push(u(fields[i]));
        }
        return new this(type, args);
    }
}

export class MockupsPacket extends ServerPacket {
    static TAG = "J";
    constructor(mockups) {
        super();
        this.mockups = mockups;
    }
    static parse(fields) {
        const c = new Cursor(fields);
        const mockups = [];
        const mockupCount = c.unsigned();
        for (let n = 0; n < mockupCount; n++) {
            const m = { mockupIndex: c.unsigned() };
            m.name = c.string().replace(/(\s*\/[ND])+\s*$/, "");
            m.scoreText = c.string();
            m.color = c.signed();
            let shape = c.signed();
            if (shape === 0x800) {
                shape = [];
                const pointCount = c.unsigned();
                for (let i = 0; i < pointCount; i++) {
                    shape.push([c.signed(), c.signed()]);
                }
            }
            m.shape = shape;
            m.entityType = c.unsigned();
            m.shootsType = c.unsigned();
            m.offset = c.signed();
            m.size = c.signed();
            m.upgrades = [];
            const upgradeCount = c.unsigned();
            for (let i = 0; i < upgradeCount; i++) {
                m.upgrades.push({ tier: c.unsigned(), mockupIndex: c.unsigned() });
            }
            m.guns = [];
            const gunCount = c.unsigned();
            for (let i = 0; i < gunCount; i++) {
                m.guns.push({
                    x: c.signed(),
                    y: c.signed(),
                    length: c.signed(),
                    width: c.signed(),
                    aspect: c.signed(),
                    angle: c.signed(),
                });
            }
            m.turrets = [];
            const turretCount = c.unsigned();
            for (let i = 0; i < turretCount; i++) {
                m.turrets.push({
                    mockupIndex: c.unsigned(),
                    scale: c.signed(),
                    offset: c.signed(),
                    direction: c.signed(),
                    renderOnTop: c.boolean(),
                    angle: c.signed(),
                });
            }
            mockups.push(m);
        }
        return new this(mockups);
    }
}

export class UpdatePacket extends ServerPacket {
    static TAG = "u";
    constructor(bodyX, bodyY, bodyFov, updateFlags, body, dead, removed, changed) {
        super();
        this.bodyX = bodyX;
        this.bodyY = bodyY;
        this.bodyFov = bodyFov;
        this.updateFlags = updateFlags;
        this.body = body;
        this.dead = dead;
        this.removed = removed;
        this.changed = changed;
    }
    static parse(fields) {
        const c = new Cursor(fields);
        const out = {
            bodyX: c.signed(),
            bodyY: c.signed(),
            bodyFov: c.unsigned(),
            dead: [],
            removed: [],
            changed: [],
        };
        const updateFlags = c.unsigned();
        if (updateFlags & (1 << 0)) out.mspt = c.unsigned();
        if (updateFlags & (1 << 1)) out.speed = c.unsigned();
        if (updateFlags & (1 << 2)) {
            out.mockupIndex = c.unsigned();
            c.signed();
        }
        if (updateFlags & (1 << 3)) {
            out.color = c.signed();
            out.id = c.unsigned();
        }
        if (updateFlags & (1 << 4)) out.score = c.unsigned();
        if (updateFlags & (1 << 5)) {
            out.kills = {
                player: c.unsigned(),
                assist: c.unsigned(),
                boss: c.unsigned(),
                food: c.unsigned(),
            };
        }
        if (updateFlags & (1 << 6)) out.skillPoints = c.unsigned();
        if (updateFlags & (1 << 7)) {
            out.maxSkills = [];
            for (let i = 0; i < 10; i++) out.maxSkills.push(c.unsigned());
        }
        if (updateFlags & (1 << 8)) {
            out.skills = [];
            for (let i = 0; i < 10; i++) out.skills.push(c.unsigned());
        }
        if (updateFlags & (1 << 9)) {
            out.upgrades = [];
            const n = c.unsigned();
            for (let i = 0; i < n; i++) out.upgrades.push(c.unsigned());
        }
        if (updateFlags & (1 << 10)) out.partyCode = c.string();
        if (updateFlags & (1 << 11)) out.operatorLevel = c.unsigned();

        while (c.peekSigned() !== -1) out.dead.push({ id: c.unsigned() });
        c.unsigned();
        while (c.peekSigned() !== -1) out.removed.push({ id: c.unsigned() });
        c.unsigned();

        while (c.remaining() > 1) {
            const entityId = c.unsigned();
            const entity = UpdatePacket._parseEntity(c);
            entity.id = entityId;
            out.changed.push(entity);
        }

        return new this(out.bodyX, out.bodyY, out.bodyFov, updateFlags,
            out, out.dead, out.removed, out.changed);
    }

    static _parseEntity(c) {
        const entity = {};
        const entityFlags = c.unsigned();
        if (entityFlags & (1 << 0)) {
            entity.deltaX = c.signed() / 4;
            entity.deltaY = c.signed() / 4;
        }
        if (entityFlags & (1 << 1)) {
            entity.deltaFacing = (c.signed() * Math.PI) / 512;
        }
        if (entityFlags & (1 << 2)) entity.mockupIndex = c.unsigned();
        if (entityFlags & (1 << 3)) {
            entity.guns = {};
            while (c.peekSigned() !== -1) {
                const gunIndex = c.unsigned();
                const gunFlags = c.unsigned();
                const gun = {};
                if (gunFlags & (1 << 0)) gun.time = c.unsigned();
                if (gunFlags & (1 << 1)) gun.power = c.unsigned();
                entity.guns[gunIndex] = gun;
            }
            c.unsigned();
        }
        if (entityFlags & (1 << 4)) {
            entity.turrets = {};
            while (c.peekSigned() !== -1) {
                const turretIndex = c.unsigned();
                entity.turrets[turretIndex] = UpdatePacket._parseEntity(c);
            }
            c.unsigned();
        }
        if (entityFlags & (1 << 5)) {
            const dataFlags = c.unsigned();
            entity.autoSpin = Boolean(dataFlags & (1 << 0));
            entity.reverseTank = Boolean(dataFlags & (1 << 1));
            entity.invuln = Boolean(dataFlags & (1 << 3));
            entity.damage = Boolean(dataFlags & (1 << 4));
        }
        if (entityFlags & (1 << 6)) entity.health = c.unsigned() / 255;
        if (entityFlags & (1 << 7)) entity.shield = c.unsigned() / 255;
        if (entityFlags & (1 << 8)) entity.alpha = c.unsigned() / 255;
        if (entityFlags & (1 << 9)) entity.size = c.unsigned() * 0.0625;
        if (entityFlags & (1 << 10)) entity.score = c.unsigned();
        if (entityFlags & (1 << 11)) entity.name = c.string();
        if (entityFlags & (1 << 12)) entity.color = c.signed();
        if (entityFlags & (1 << 13)) entity.layer = c.signed();
        return entity;
    }
}

export class BroadcastPacket extends ServerPacket {
    static TAG = "b";
    constructor(minimapRemoved, minimapChanged, teamMinimapRemoved, teamMinimapChanged,
        leaderboardRemoved, leaderboardChanged) {
        super();
        this.minimapRemoved = minimapRemoved;
        this.minimapChanged = minimapChanged;
        this.teamMinimapRemoved = teamMinimapRemoved;
        this.teamMinimapChanged = teamMinimapChanged;
        this.leaderboardRemoved = leaderboardRemoved;
        this.leaderboardChanged = leaderboardChanged;
    }
    static parse(fields) {
        const c = new Cursor(fields);

        function listLength() {
            const f = c.fields[c.i++];
            return f.s === -1 ? -1 : f.u;
        }

        const minimapRemoved = [];
        for (let i = listLength(); i > 0; i--) minimapRemoved.push({ id: c.unsigned() });
        const minimapChanged = [];
        for (let i = listLength(); i > 0; i--) {
            minimapChanged.push({
                id: c.unsigned(),
                type: c.unsigned(),
                x: c.signed() / 255,
                y: c.signed() / 255,
                color: c.signed(),
                size: c.unsigned(),
            });
        }
        const teamMinimapRemoved = [];
        for (let i = listLength(); i > 0; i--) teamMinimapRemoved.push({ id: c.unsigned() });
        const teamMinimapChanged = [];
        for (let i = listLength(); i > 0; i--) {
            teamMinimapChanged.push({
                id: c.unsigned(),
                x: c.signed() / 255,
                y: c.signed() / 255,
                color: c.signed(),
            });
        }
        const leaderboardRemoved = [];
        for (let i = listLength(); i > 0; i--) leaderboardRemoved.push({ id: c.unsigned() });
        const leaderboardChanged = [];
        for (let i = listLength(); i > 0; i--) {
            leaderboardChanged.push({
                id: c.unsigned(),
                score: c.unsigned(),
                mockupIndex: c.unsigned(),
                name: c.string(),
                color: c.signed(),
                barColor: c.signed(),
            });
        }
        return new this(minimapRemoved, minimapChanged,
            teamMinimapRemoved, teamMinimapChanged,
            leaderboardRemoved, leaderboardChanged);
    }
}

export class CameraPacket extends ServerPacket {
    static TAG = "c";
    constructor(bodyX, bodyY, bodyFov) {
        super();
        this.bodyX = bodyX;
        this.bodyY = bodyY;
        this.bodyFov = bodyFov;
    }
    static parse(fields) {
        return new this(s(fields[0]), s(fields[1]), u(fields[2]));
    }
}

export class ChatPacket extends ServerPacket {
    static TAG = "M";
    constructor(entityId, message, isGlobal) {
        super();
        this.entityId = entityId;
        this.message = message;
        this.isGlobal = isGlobal;
    }
    static parse(fields) {
        return new this(u(fields[0]), u(fields[1]), fields[2].s !== 0);
    }
}

export class KickPacket extends ServerPacket {
    static TAG = "K";
    constructor(reason) {
        super();
        this.reason = reason;
    }
    static parse(fields) {
        return new this(fields.length && fields[0].t === "s" ? fields[0].v : "");
    }
}

export class DeathPacket extends ServerPacket {
    static TAG = "F";
    constructor(time, score, timeAlive, kills, killInfo, killers, deathType,
        serverActivity, serversTraveled, respawnTime, saveCode) {
        super();
        this.time = time;
        this.score = score;
        this.timeAlive = timeAlive;
        this.kills = kills;
        this.killInfo = killInfo;
        this.killers = killers;
        this.deathType = deathType;
        this.serverActivity = serverActivity;
        this.serversTraveled = serversTraveled;
        this.respawnTime = respawnTime;
        this.saveCode = saveCode;
    }
    static parse(fields) {
        const c = new Cursor(fields);
        const time = c.unsigned();
        const score = c.unsigned();
        const timeAlive = c.unsigned();
        const kills = {
            player: c.unsigned(),
            assist: c.unsigned(),
            boss: c.unsigned(),
            food: c.unsigned(),
        };
        const killType = c.unsigned();
        const killInfo = { type: ["none", "food", "player"][killType] };
        if (killType === 1) {
            killInfo.amount = c.signed();
        } else if (killType === 2) {
            killInfo.amount = c.signed();
            killInfo.name = c.string();
        }
        const deathType = c.unsigned();
        const killers = [];
        if (deathType === 0) {
            const killerCount = c.unsigned();
            for (let i = 0; i < killerCount; i++) {
                killers.push({ name: c.string(), tank: c.string() });
            }
        }
        return new this(
            time, score, timeAlive, kills, killInfo, killers,
            ["killed", "dumb_death", "self_destruct", "surrender_control", "save_score"][deathType],
            c.unsigned(), c.unsigned(), c.unsigned() + 2000, c.string(),
        );
    }
}

export const SERVER_PACKETS = {
    [WelcomePacket.TAG]: WelcomePacket,
    [KeyPacket.TAG]: KeyPacket,
    [TravelPacket.TAG]: TravelPacket,
    [PingRequestPacket.TAG]: PingRequestPacket,
    [PowChallengePacket.TAG]: PowChallengePacket,
    [EvalChallengePacket.TAG]: EvalChallengePacket,
    [RoomPacket.TAG]: RoomPacket,
    [PlayerListPacket.TAG]: PlayerListPacket,
    [ServerMessagePacket.TAG]: ServerMessagePacket,
    [MockupsPacket.TAG]: MockupsPacket,
    [UpdatePacket.TAG]: UpdatePacket,
    [BroadcastPacket.TAG]: BroadcastPacket,
    [CameraPacket.TAG]: CameraPacket,
    [ChatPacket.TAG]: ChatPacket,
    [KickPacket.TAG]: KickPacket,
    [DeathPacket.TAG]: DeathPacket,
};

export const ClientPackets = {
    key(playerId = "", playerToken = "", travelToken = "") {
        return ["k", playerId, playerToken, travelToken];
    },
    ping() {
        return ["p"];
    },
    spawn(name = "", partyId = "", autoLevelUp = true, incognito = false) {
        return ["s", name, partyId, Number(Boolean(autoLevelUp)) | (Number(Boolean(incognito)) << 1)];
    },
    evalAnswer(id, result) {
        return ["e", id, result];
    },
    powAnswer(input, result) {
        return ["R", input, result];
    },
    tankUpgrade(index) {
        return ["U", { u: index }];
    },
    skillUpgrade(index, type = "add", value = null) {
        if (type === "add") return ["x", { u: index }, { i: -1 }];
        if (type === "max") return ["x", { u: index }, { i: 255 }];
        return ["x", { u: index }, { i: value }];
    },
    command(x, y, { up = false, down = false, left = false, right = false,
        lmb = false, rmb = false } = {}) {
        const action = (Number(Boolean(up)) | (Number(Boolean(down)) << 1) |
            (Number(Boolean(left)) << 2) | (Number(Boolean(right)) << 3) |
            (Number(Boolean(lmb)) << 4) | (Number(Boolean(rmb)) << 6));
        return ["C", { i: x }, { i: y }, { u: action }];
    },
    toggle(action) {
        return ["t", { u: ["autofire", "autospin", "override", "reverse"].indexOf(action) }];
    },
    levelUpCheat() {
        return ["L"];
    },
    keyPress(keyCode, isKeyDown) {
        return ["0", keyCode, { u: Number(Boolean(isKeyDown)) }];
    },
    chat(message) {
        return ["M", message];
    },
    suicide() {
        return ["K"];
    },
    ability() {
        return ["A"];
    },
    saveScore() {
        return ["D"];
    },
    playerAction(action, socketId) {
        return ["P", { u: ["promote", "demote", "kick"].indexOf(action) }, { u: socketId }];
    },
};
