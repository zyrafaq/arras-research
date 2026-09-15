import { Canvas } from "./canvas.js";
import { colorByIndex, getColor, mixColors, getBorderColor, getColorDark, getCurrentThemeName, setColorTheme } from "./color.js";
import { drawBody, drawGun, drawText, drawGuiRect, drawGuiCircle } from "./gameDraw.js";
import { BUILD } from "../net/transport.js";
import { advancedSmoothBar, lerpSmoothBar, setAnimFps } from "../state/anim.js";
import { computeMockupPosition } from "./mockupDims.js";
import { getKeyCode, getKeyName } from "../ui/keybinds.js";
import { getSettings } from "../ui/options.js";

const COLOR_MAP = {
    0: "teal", 1: "lgreen", 2: "orange", 3: "yellow", 4: "aqua",
    5: "pink", 6: "vlgrey", 7: "lgrey", 8: "guiwhite", 9: "black",
    10: "blue", 11: "green", 12: "red", 13: "gold", 14: "purple",
    15: "magenta", 16: "grey", 17: "dgrey", 18: "white", 19: "guiblack",
    20: "blue", 21: "green", 22: "red", 23: "purple", 24: "orange",
    25: "mustard", 26: "tangerine", 27: "brown", 28: "cyan",
    29: "teal", 30: "pink", 31: "gold", 32: "magenta",
    33: "aqua", 34: "yellow", 35: "lgreen", 36: "orange",
};

function resolveColor(colorIndex) {
    if (colorIndex == null || colorIndex === undefined) return getColor("grey");
    if (typeof colorIndex === "string" && colorIndex.startsWith("#")) return colorIndex;
    if (typeof colorIndex === "number" && colorIndex < -1) {
        return "#" + ((colorIndex >>> 0) & 0xFFFFFF).toString(16).padStart(6, "0");
    }
    const name = COLOR_MAP[colorIndex];
    return name ? getColor(name) : getColor("grey");
}

const WALL_SCALE = 1.4;
const GRID_SIZE = 25;
const FONT_BOOST = 1.4;
const CHAT_DURATION = 7000;

function isWallMockup(m) {
    if (!m) return false;
    return m.entityType === 2 || /(^|[^a-z])(wall|maze)([^a-z]|$)/i.test(m.name || "");
}

export class Renderer {
    constructor() {
        this.canvas = new Canvas();
        this.frame = 0;
        this.leaderboardEntries = {};
        this._lbGlide = advancedSmoothBar(0, 0.3, 1.5);
        this._leaderboardUpdate = 0;
        this._mockupDims = new Map();
        this.showMore = false;
        this._fps = null;
        this._lastFrameTime = null;
        this._posHistory = [];
        this._speedDx = 0;
        this._speedDy = 0;
        this._upgradeGlide = lerpSmoothBar(0, 0.08);
        this._upgradeHoverIdx = -1;
        this._upgradeHitRects = [];
        this._upgradeDismissed = false;
        this._upgradeSuppressed = false;
        this._prevUpgradeCount = 0;
        this._statBarGlide = lerpSmoothBar(0, 0.08);
        this._statBarHitRects = [];
        this._statBarHoverIdx = -1;
    }

    toggleShowMore() {
        this.showMore = !this.showMore;
    }

    render(state, mousePos) {
        const ctx = this.canvas.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const fov = state.getFov() || 2000;
        this._lastState = state;
        this._mousePos = mousePos || { x: -9999, y: -9999 };
        const opts = getSettings();
        this._opts = opts;

        this._trackFps();
        setAnimFps(this._fps || 60);
        const gunDt = this._lastFrameTime ? (performance.now() - this._lastFrameTime) : 33.33;
        for (const ent of state.entities.values()) {
            if (ent._gunContainer) ent._gunContainer.update(gunDt);
        }
        if (state.spawned && !state.died) {
            this._updateSpeed(state);
        } else {
            this._posHistory.length = 0;
            this._speedDx = 0;
            this._speedDy = 0;
        }

        ctx.fillStyle = getColor("guiblack");
        ctx.globalAlpha = 0.1;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;

        if (!state.spawned && !state.died) {
            if (state.disconnected) this._drawDisconnectedScreen(ctx, state, w, h);
            else if (state.connecting) this._drawConnectingScreen(ctx, state, w, h);
            this.frame++;
            return;
        }

        ctx.fillStyle = getColor("white");
        ctx.fillRect(0, 0, w, h);

        this.canvas.beginCamera(state.bodyX, state.bodyY, fov);

        if (opts.backgroundGrid) this._drawGrid(ctx, state);
        this._drawMazeWalls(ctx, state);
        this._drawArenaBorder(ctx, state);
        this._drawEntities(ctx, state);

        this.canvas.endCamera();

        if (opts.minimap) {
            this._drawMinimap(ctx, state, w, h);
            if (opts.extraInfo) this._drawMinimapInfo(ctx, state, w, h);
        }
        let max = 1;
        for (const e of state.leaderboard || []) {
            if ((e.score || 0) > max) max = e.score;
        }
        if (opts.leaderboard) this._drawLeaderboard(ctx, state, w, h, max);
        this._drawHUD(ctx, state, w, h, max);
        if (opts.upgrades) {
            this._drawStatBar(ctx, state, w, h);
            this._drawUpgradePanel(ctx, state, w, h);
        }
        this._drawServerMessages(ctx, state, w, h);

        if (state.died) this._drawDeathScreen(ctx, state, w, h);
        this.frame++;
    }

    _drawGrid(ctx, state) {
        const r = this.canvas.ratio;
        const spacing = GRID_SIZE;
        const gridSize = spacing * r;
        if (gridSize < 2.5) return;
        const halfW = this.canvas.width / r / 2;
        const halfH = this.canvas.height / r / 2;
        const x0 = Math.floor((state.bodyX - halfW) / spacing) * spacing;
        const x1 = Math.ceil((state.bodyX + halfW) / spacing) * spacing;
        const y0 = Math.floor((state.bodyY - halfH) / spacing) * spacing;
        const y1 = Math.ceil((state.bodyY + halfH) / spacing) * spacing;
        ctx.strokeStyle = getColor("guiblack");
        ctx.globalAlpha = 0.04;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += spacing) {
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
        }
        for (let y = y0; y <= y1; y += spacing) {
            ctx.moveTo(x0, y);
            ctx.lineTo(x1, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    _drawMazeWalls(ctx, state) {
        if (!state.room || !state.room.tiles) return;
        const rm = state.room;
        const tiles = rm.tiles;
        const h = tiles.length;
        const w = tiles[0]?.length || 0;
        if (w === 0 || h === 0) return;

        const cellW = (rm.roomX2 - rm.roomX1) / w;
        const cellH = (rm.roomY2 - rm.roomY1) / h;

        const halfW = this.canvas.width / this.canvas.ratio / 2;
        const halfH = this.canvas.height / this.canvas.ratio / 2;
        const x0 = state.bodyX - halfW - cellW;
        const x1 = state.bodyX + halfW + cellW;
        const y0 = state.bodyY - halfH - cellH;
        const y1 = state.bodyY + halfH + cellH;

        const startX = Math.max(0, Math.floor((x0 - rm.roomX1) / cellW));
        const endX = Math.min(w - 1, Math.ceil((x1 - rm.roomX1) / cellW));
        const startY = Math.max(0, Math.floor((y0 - rm.roomY1) / cellH));
        const endY = Math.min(h - 1, Math.ceil((y1 - rm.roomY1) / cellH));

        ctx.globalAlpha = 0.3;
        for (let ty = startY; ty <= endY; ty++) {
            for (let tx = startX; tx <= endX; tx++) {
                const tile = tiles[ty][tx];
                if (tile < 0) continue;
                ctx.fillStyle = resolveColor(tile);
                ctx.fillRect(rm.roomX1 + tx * cellW, rm.roomY1 + ty * cellH, cellW, cellH);
            }
        }
        ctx.globalAlpha = 1;

        const sw = cellW * WALL_SCALE;
        const sh = cellH * WALL_SCALE;
        ctx.fillStyle = resolveColor(7);
        ctx.strokeStyle = getColor("guiblack");
        ctx.lineWidth = 3;
        const wallPath = new Path2D();
        let anyWall = false;
        for (let ty = startY; ty <= endY; ty++) {
            for (let tx = startX; tx <= endX; tx++) {
                if (tiles[ty][tx] !== -1) continue;
                anyWall = true;
                const cx = rm.roomX1 + tx * cellW + cellW / 2;
                const cy = rm.roomY1 + ty * cellH + cellH / 2;
                wallPath.rect(cx - sw / 2, cy - sh / 2, sw, sh);
            }
        }
        if (anyWall) {
            ctx.fill(wallPath);
            ctx.stroke(wallPath);
        }
    }

    _drawArenaBorder(ctx, state) {
        if (!state.room) return;
        const rm = state.room;
        const x1 = rm.roomX1, y1 = rm.roomY1, x2 = rm.roomX2, y2 = rm.roomY2;
        ctx.strokeStyle = getColor("black");
        ctx.lineWidth = 10;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }

    _drawEntities(ctx, state) {
        const sorted = [...state.entities.values()].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
        for (const ent of sorted) {
            this._drawEntity(ctx, ent, state);
        }
        for (const ent of state.dyingEntities.values()) {
            const fade = ent._fadeAlpha || 0;
            if (fade <= 0) continue;
            const savedSize = ent.size;
            if (this._opts.fadingAnimation) {
                ent.size = savedSize * (1 + 0.5 * (1 - fade));
            } else {
                ent.size = savedSize * (1 - 2 * (1 - fade));
                if (ent.size < 0) ent.size = 0;
            }
            this._drawEntityCore(ctx, ent, state, undefined, fade);
            ent.size = savedSize;
            const drawSize = ent.size ?? 25;
            const x = ent.x ?? 0;
            const y = ent.y ?? 0;
            const nameFade = fade * fade;
            const name = ent.name || "";
            const health = ent.health;
            const shield = ent.shield;
            if (this._opts.healthBars && nameFade > 0.01) {
                const damaged = (health !== undefined && health < 0.999) || (shield !== undefined && shield > 0 && shield < 0.999);
                if (damaged) {
                    ctx.globalAlpha = nameFade;
                    this._drawBar(ctx, x, y + drawSize + 8, drawSize * 1.6, 4.5,
                        health === undefined ? 1 : health, getColor("lgreen"), getColor("grey"));
                    if (shield > 0 && this._opts.separateShieldBar) {
                        this._drawBar(ctx, x, y + drawSize + 15, drawSize * 1.6, 3, shield, getColor("teal"), getColor("grey"));
                    }
                }
            }
            if (name && drawSize > 5 && nameFade > 0.01 && this._opts.playerNames) {
                const fontSize = Math.max(8, drawSize * 0.5);
                ctx.globalAlpha = nameFade;
                drawText(ctx, name, x, y - drawSize - fontSize * 0.6, fontSize, getColor("guiwhite"), "center", true);
            }
            if (ent.score && drawSize > 10 && nameFade > 0.01 && this._opts.playerScores) {
                const scoreFontSize = Math.max(6, drawSize * 0.35);
                ctx.globalAlpha = nameFade;
                drawText(ctx, this._formatScore(ent.score), x, y - drawSize - (name && this._opts.playerNames ? drawSize * 0.5 + 10 : 0) - scoreFontSize * 0.6, scoreFontSize, getColor("guiwhite"), "center", true);
            }
            ctx.globalAlpha = 1;
        }
    }

    _drawEntity(ctx, ent, state) {
        this._drawEntityCore(ctx, ent, state);

        const mockup = state.getMockup(ent.mockupIndex);
        const drawSize = ent.size ?? 25;
        const x = ent.x ?? 0;
        const y = ent.y ?? 0;
        const opts = this._opts;

        const mockupForHealth = state.getMockup(ent.mockupIndex);
        const mName = (mockupForHealth?.name || "").toLowerCase();
        const isProjectile = /^(\[?[a-z ]*\]?-)?(bullet|trap|drone|swarm|crusher|mini)/i.test(mName) ||
            (mockupForHealth?.entityType === 1 && !(mockupForHealth.guns || []).length && !mockupForHealth.turrets?.length);
        const isWall = isWallMockup(mockupForHealth);
        if (!isProjectile && !isWall) {
            const health = ent.health;
            const shield = ent.shield;
            const damaged = (health !== undefined && health < 0.999) || (shield !== undefined && shield > 0 && shield < 0.999);
            if (damaged && opts.healthBars) {
                this._drawBar(ctx, x, y + drawSize + 8, drawSize * 1.6, 4.5,
                    health === undefined ? 1 : health, getColor("lgreen"), getColor("grey"));
                if (shield > 0 && opts.separateShieldBar) {
                    this._drawBar(ctx, x, y + drawSize + 15, drawSize * 1.6, 3, shield, getColor("teal"), getColor("grey"));
                }
            }
        }

        const isSelf = ent.id === state.entityId;

        const name = ent.name || "";
        if (name && drawSize > 5 && !isSelf && opts.playerNames) {
            const fontSize = Math.max(8, drawSize * 0.5);
            drawText(ctx, name, x, y - drawSize - fontSize * 0.6, fontSize, getColor("guiwhite"), "center", true);
        }

        const score = ent.score;
        if (score && drawSize > 10 && !isSelf && opts.playerScores) {
            const scoreFontSize = Math.max(6, drawSize * 0.35);
            drawText(ctx, this._formatScore(score), x, y - drawSize - (name && opts.playerNames ? drawSize * 0.5 + 10 : 0) - scoreFontSize * 0.6, scoreFontSize, getColor("guiwhite"), "center", true);
        }

        this._drawEntityChat(ctx, ent, state);
    }

    _drawEntityChat(ctx, ent, state) {
        if (!this._opts.chatMessages) return;
        const list = state.chats?.[ent.id];
        if (!list || list.length === 0) return;
        const now = performance.now();
        for (let i = list.length - 1; i >= 0; i--) {
            const chat = list[i];
            if (chat.erased && chat.alpha.get() <= 0.001) { list.splice(i, 1); continue; }
            if (!chat.erased && now - chat.time > CHAT_DURATION) {
                chat.erased = true;
                chat.alpha.set(0);
            }
        }
        if (list.length === 0) return;

        const ratio = this.canvas.ratio;
        const gPx = Math.max(20, (ent.size ?? 25) * ratio);
        const g = gPx / ratio;
        const x = ent.x ?? 0;
        const y = ent.y ?? 0;

        const textSize = 0.5 * g;
        const padX = 0.45 * g;
        const bh = 0.9 * g;
        const radius = 0.5 * bh;
        const stackSpacing = 1.05 * g;
        const baseY = y - 2.6 * g;
        const bubbleColor = getColorDark(resolveColor(ent.color ?? 16));

        for (let r = 0; r < list.length; r++) {
            const chat = list[list.length - 1 - r];
            chat.slide.set(r * stackSpacing);
            const slide = chat.slide.get();
            const valpha = chat.alpha.get();
            if (valpha <= 0) continue;
            const text = chat.text;
            const bubbleCenter = baseY - slide - bh / 2;
            const bw = this._measureText(ctx, text, textSize) + 2 * padX;
            const bx = x - bw / 2;
            const by = bubbleCenter - bh / 2;

            ctx.globalAlpha = 0.65 * valpha;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, radius);
            ctx.fillStyle = bubbleColor;
            ctx.fill();
            ctx.globalAlpha = valpha;
            drawText(ctx, text, x, bubbleCenter, textSize, getColor("guiwhite"), "center", false);
            ctx.globalAlpha = 1;
        }
    }

    _drawEntityCore(ctx, ent, state, strokeWidthOverride, baseAlpha) {
        const mockup = state.getMockup(ent.mockupIndex);
        const alpha = (ent.alpha ?? 1) * (baseAlpha ?? 1);
        if (alpha <= 0) return;
        const x = ent.x ?? 0;
        const y = ent.y ?? 0;
        let rot = ent.facing ?? 0;
        if (ent.id === state.entityId && Number.isFinite(state.aimX) && Number.isFinite(state.aimY)) {
            rot = Math.atan2(state.aimY, state.aimX);
        }
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(rot)) return;
        let drawSize = ent.size ?? 25;
        if (isWallMockup(mockup)) drawSize *= WALL_SCALE;
        if (!(drawSize >= 0.1) || !(drawSize < 1e6)) return;

        const initStrokeWidth = strokeWidthOverride ?? Math.max(0.5, this.canvas.ratio * 6);

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = initStrokeWidth;

        const turrets = mockup ? mockup.turrets || [] : [];
        const guns = mockup ? mockup.guns || [] : [];

        for (let i = 0; i < turrets.length; i++) {
            if (turrets[i].renderOnTop) continue;
            this._drawTurret(ctx, turrets[i], i, x, y, drawSize, rot, initStrokeWidth, state, ent, strokeWidthOverride);
        }

        const bodyColor = resolveColor(ent.color ?? (mockup ? mockup.color : 16));
        const gunPositions = ent._gunContainer ? ent._gunContainer.getPositions() : null;
        for (let gi = 0; gi < guns.length; gi++) {
            const g = guns[gi];
            const gunAngle = (g.angle || 0) + rot;
            const mountAngle = gunAngle + (g.y || 0);
            const baseR = (g.x || 0) * drawSize;
            const bx = x + Math.cos(mountAngle) * baseR;
            const by = y + Math.sin(mountAngle) * baseR;
            if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(gunAngle)) continue;
            const gunColor = getColor("grey");
            ctx.fillStyle = gunColor;
            ctx.strokeStyle = getBorderColor(gunColor);
            ctx.globalAlpha = alpha;
            const recoilPos = gunPositions && gi < gunPositions.length ? drawSize * gunPositions[gi] : 0;
            drawGun(
                ctx,
                bx,
                by,
                drawSize * (g.length ?? 1) / 2,
                drawSize * (g.width ?? 1) / 2,
                g.aspect ?? 1,
                gunAngle,
                false,
                true,
                alpha,
                1,
                recoilPos,
            );
        }

        ctx.fillStyle = bodyColor;
        ctx.strokeStyle = getBorderColor(bodyColor);
        ctx.globalAlpha = alpha;
        ctx.lineWidth = initStrokeWidth;
        drawBody(ctx, x, y, drawSize, mockup ? mockup.shape : 0, rot);

        for (let i = 0; i < turrets.length; i++) {
            if (!turrets[i].renderOnTop) continue;
            this._drawTurret(ctx, turrets[i], i, x, y, drawSize, rot, initStrokeWidth, state, ent, strokeWidthOverride);
        }

        ctx.globalAlpha = 1;
    }

    _drawTurret(ctx, t, tIndex, px, py, parentDrawSize, masterRot, initStrokeWidth, state, parentEnt, strokeWidthOverride) {
        const mi = t.mockupIndex ?? t.size;
        const tMockup = state.getMockup(mi);
        if (!tMockup) return;
        const ang = (t.direction || 0) + (t.angle || 0) + masterRot;
        const len = (t.offset || 0) * parentDrawSize;
        const childDrawSize = parentDrawSize * (t.scale || 1);
        const tx = px + len * Math.cos(ang);
        const ty = py + len * Math.sin(ang);

        let facing = masterRot + (t.direction || 0) + (t.angle || 0);
        let turretEnt = null;
        if (parentEnt && parentEnt.turrets && typeof parentEnt.turrets === "object") {
            const te = parentEnt.turrets[tIndex];
            if (te) {
                turretEnt = te;
                if (te.facing !== undefined && parentEnt.id !== state.entityId) facing = te.facing;
            }
        }
        const subEnt = {
            x: tx, y: ty,
            size: childDrawSize,
            facing,
            color: turretEnt && turretEnt.color !== undefined ? turretEnt.color : tMockup.color,
            health: turretEnt?.health,
            shield: turretEnt?.shield,
            alpha: turretEnt && turretEnt.alpha !== undefined ? turretEnt.alpha : 1,
            turrets: turretEnt?.turrets,
            name: "",
            score: undefined,
            mockupIndex: mi,
        };
        this._drawEntityCore(ctx, subEnt, state, strokeWidthOverride);
    }

    _drawBar(ctx, x, y, width, height, value, fillColor, bgColor) {
        const barX = x - width / 2;
        ctx.lineCap = "round";
        ctx.lineWidth = height + 3;
        ctx.strokeStyle = getBorderColor(bgColor);
        ctx.beginPath();
        ctx.moveTo(barX, y);
        ctx.lineTo(barX + width, y);
        ctx.stroke();
        ctx.lineWidth = height;
        ctx.strokeStyle = bgColor;
        ctx.beginPath();
        ctx.moveTo(barX, y);
        ctx.lineTo(barX + width, y);
        ctx.stroke();
        if (value > 0) {
            ctx.strokeStyle = fillColor;
            ctx.beginPath();
            ctx.moveTo(barX, y);
            ctx.lineTo(barX + width * Math.max(0, Math.min(1, value)), y);
            ctx.stroke();
        }
    }

    _minimapGeom(state, w, h) {
        const mw = 200;
        const pad = 15;
        let mh = mw;
        const rm = state?.room;
        if (rm) {
            const rw = (rm.roomX2 - rm.roomX1) || 1;
            const rh = (rm.roomY2 - rm.roomY1) || 1;
            mh = Math.max(40, Math.min((mw * rh) / rw, h - pad * 2));
        }
        return { x: w - mw - pad, y: h - mh - pad, w: mw, h: mh };
    }

    _drawMinimap(ctx, state, w, h) {
        if (!state.room) return;
        const g = this._minimapGeom(state, w, h);
        const x = g.x, y = g.y;
        const size = g.w, sizeH = g.h;
        const rm = state.room;
        const rw = rm.roomX2 - rm.roomX1 || 1;
        const rh = rm.roomY2 - rm.roomY1 || 1;

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = getColor("white");
        ctx.strokeStyle = getColor("grey");
        ctx.lineWidth = 3;
        ctx.fillRect(x, y, size, sizeH);
        ctx.strokeRect(x, y, size, sizeH);
        ctx.globalAlpha = 1;

        const tiles = rm.tiles;
        if (tiles && tiles.length && tiles[0].length) {
            const th = tiles.length, tw = tiles[0].length;
            const cw = size / tw, chh = sizeH / th;
            const paths = new Map();
            for (let ty = 0; ty < th; ty++) {
                for (let tx = 0; tx < tw; tx++) {
                    const tile = tiles[ty][tx];
                    if (tile === 18) continue;
                    let path = paths.get(tile);
                    if (!path) {
                        path = new Path2D();
                        paths.set(tile, path);
                    }
                    path.rect(x + tx * cw, y + ty * chh, cw + 0.5, chh + 0.5);
                }
            }
            ctx.globalAlpha = 0.4;
            for (const [tile, path] of paths) {
                ctx.fillStyle = tile === -1 ? getColor("lgrey") : resolveColor(tile);
                ctx.fill(path);
            }
            ctx.globalAlpha = 1;
        }

        for (const dot of (state.minimap || [])) {
            const dx = x + dot.x * size;
            const dy = y + dot.y * sizeH;
            if (dx < x - 20 || dx > x + size + 20 || dy < y - 20 || dy > y + sizeH + 20) continue;
            ctx.fillStyle = resolveColor(dot.color);
            if (dot.type === 2) {
                const trueSize = ((dot.size || 0) + 2) / 1.1283791671;
                const s = (trueSize / rw) * size;
                ctx.fillRect(dx - s, dy - s, s * 2, s * 2);
            } else if (dot.type === 1) {
                const s = Math.max(1.5, ((dot.size || 0) / rw) * size);
                ctx.beginPath();
                ctx.arc(dx, dy, s, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(dx, dy, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const px = x + ((state.bodyX - rm.roomX1) / rw) * size;
        const py = y + ((state.bodyY - rm.roomY1) / rh) * sizeH;
        ctx.fillStyle = getColor("guiblack");
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    _trackFps() {
        const now = performance.now();
        if (this._lastFrameTime != null) {
            const dt = now - this._lastFrameTime;
            if (dt > 0 && dt < 500) {
                const instant = 1000 / dt;
                this._fps = this._fps == null ? instant : this._fps * 0.9 + instant * 0.1;
            }
        }
        this._lastFrameTime = now;
    }

    _updateSpeed(state) {
        const now = performance.now();
        const hist = this._posHistory;
        const last = hist[hist.length - 1];
        if (last && (Math.hypot(state.bodyX - last.x, state.bodyY - last.y) > 500 || now - last.t > 3000)) {
            hist.length = 0;
            this._speedDx = 0;
            this._speedDy = 0;
        }
        hist.push({ t: now, x: state.bodyX, y: state.bodyY });
        while (hist.length > 120 || (hist.length > 1 && now - hist[0].t > 1000)) hist.shift();
        const a = hist[0], b = hist[hist.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (hist.length > 1 && dt >= 0.25) {
            this._speedDx = (b.x - a.x) / dt / GRID_SIZE;
            this._speedDy = (b.y - a.y) / dt / GRID_SIZE;
        }
    }

    _updateMemory() {
        if (typeof performance.memory?.usedJSHeapSize === "number") {
            this._memText = (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + " MiB";
            return;
        }
        if (typeof performance.measureUserAgentSpecificMemory === "function" && !this._memPolling) {
            this._memPolling = true;
            const poll = () => performance.measureUserAgentSpecificMemory()
                .then((m) => { this._memText = (m.bytes / 1048576).toFixed(1) + " MiB"; })
                .catch(() => {});
            poll();
            setInterval(poll, 30000);
        }
        if (this._memText == null) this._memText = "n/a";
    }

    _minimapInfoLines(state) {
        const lines = [];
        lines.push({ text: "arras.io", size: 15, title: true });
        const players = state.clientCount;
        if (players != null && Number.isFinite(players)) {
            lines.push({ text: `${players} player${players === 1 ? "" : "s"}`, size: 11 });
        }
        const si = state.serverInfo || {};
        if (this.showMore) {
            const rm = state.room;
            if (rm) {
                const cx = Math.round(state.bodyX / GRID_SIZE);
                const cy = Math.round(state.bodyY / GRID_SIZE);
                lines.push({ text: `Coordinates: (${cx}, ${cy})`, size: 11 });
            }
            const speed = Math.hypot(this._speedDx, this._speedDy);
            lines.push({ text: `Speed: ${speed.toFixed(2)} u/s`, size: 11 });
            lines.push({ text: `Rendering: o-${Math.round(state.bodyX)};z-${Math.round(state.bodyFov)} t-0-0 h`, size: 11 });
            this._updateMemory();
            if (this._memText) lines.push({ text: `Memory: ${this._memText}`, size: 11 });
            lines.push({ text: `Build ID: ${BUILD}`, size: 11 });
        }
        const fps = this._fps != null ? Math.round(this._fps) : "--";
        const mspt = typeof si.mspt === "number" ? si.mspt : parseFloat(si.mspt);
        const fpsLine = Number.isFinite(mspt)
            ? `${fps} FPS / ${mspt.toFixed(1)} mspt`
            : `${fps} FPS`;
        lines.push({ text: fpsLine, size: 11 });
        const pingMs = typeof state.ping === "number" ? state.ping : 0;
        const modeStr = si.gamemodeRaw || "";
        const codeStr = si.code || "";
        const bottom = `${pingMs.toFixed(1)} ms  ${modeStr} ${codeStr}`.trim();
        if (bottom) lines.push({ text: bottom, size: 11 });
        return lines;
    }

    _drawMinimapInfo(ctx, state, w, h) {
        const g = this._minimapGeom(state, w, h);
        const xRight = g.x + g.w;
        let y = g.y - 8;
        const lines = this._minimapInfoLines(state);
        for (let i = lines.length - 1; i >= 0; i--) {
            const ln = lines[i];
            const color = ln.title ? getColor("guiblack") : getColor("guiwhite");
            const stroke = !ln.title;
            drawText(ctx, ln.text, xRight, y, ln.size, color, "right", stroke);
            y -= ln.size + 5;
        }
    }

    _drawLeaderboard(ctx, state, w, h, max) {
        const lb = [...(state.leaderboard || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
        const vspacing = 4;
        const len = 200;
        const height = 14;
        const BAR_CHUNK = 5;
        let x = w - 20 - 10;
        let y = 20 + height + 13;
        this._lbGlide.set(lb.length > 0);
        x -= len * this._lbGlide.get();

        drawText(ctx, "Leaderboard", Math.round(x + len / 2) + 0.5,
            Math.round(y - 6) + 0.5 - 0.35 * (height + 3.5 + 1.4),
            height + 3.5 + 1.4, getColor("guiwhite"), "center", true, 5.5, getColor("black"));
        y += 7;

        const update = ++this._leaderboardUpdate;
        const entries = this.leaderboardEntries;
        for (let i = 0; i < lb.length; i++) {
            const entry = lb[i];
            let lbEntry = entries[entry.id];
            if (!lbEntry) {
                lbEntry = entries[entry.id] = {
                    ...entry,
                    scoreBar: lerpSmoothBar(entry.score || 0, 0.03),
                    animX: lerpSmoothBar(0, 0.045),
                    animY: lerpSmoothBar(0, 0.045),
                    x: 0,
                    y: i,
                    targetX: 1,
                    targetY: i,
                    visible: true,
                };
            }
            if (lbEntry.y !== i && lbEntry.targetY !== i) lbEntry.targetY = i;

            lbEntry.barColor = entry.barColor;
            lbEntry.score = entry.score;
            lbEntry.scoreBar.set(entry.score || 0);
            lbEntry.nameColor = entry.nameColor;
            lbEntry.visible = true;
            lbEntry.update = update;
        }
        for (const id in entries) {
            const entry = entries[id];
            if (entry.update !== update && entry.targetX !== 0) entry.targetX = 0;
            if (entry.update === update && entry.targetX === 0) entry.targetX = 1;
            if (entry.animX.get() > 0.999) {
                entry.animX.force(0);
                entry.x = entry.targetX;
                if (entry.x === 0) {
                    entry.visible = false;
                    delete entries[id];
                }
            }
            if (entry.animY.get() > 0.999) {
                entry.animY.force(0);
                entry.y = entry.targetY;
            }
            if (entry.x !== entry.targetX) entry.animX.set(1);
            if (entry.y !== entry.targetY) entry.animY.set(1);

            if (entry.visible) {
                const mockup = entry.mockupIndex !== undefined ? state.getMockup(entry.mockupIndex) : null;
                const position = mockup ? this._mockupPosition(mockup, state) : null;
                const scale = position ? height / position.axis : 0;
                const fullX = w + 1.5 * height +
                    (position ? scale * position.middle.x * Math.SQRT1_2 : 0) + 10;
                let entryX = entry.x ? x : fullX;
                if (entry.x !== entry.targetX) {
                    entryX += entry.animX.get() * ((entry.targetX ? x : fullX) - entryX);
                }
                let entryPos = entry.y;
                if (entry.y !== entry.targetY) {
                    entryPos = entry.y + entry.animY.get() * (entry.targetY - entry.y);
                }
                const entryY = y + (vspacing + height) * entryPos;

                this._msgBar(ctx, entryX, entryX + len, entryY + height / 2 - 0.7,
                    height - 3 + BAR_CHUNK, getColor("black"));
                this._msgBar(ctx, entryX, entryX + len, entryY + height / 2 - 0.7,
                    height - 3, getColor("grey"));
                const shownScore = entry.scoreBar.get();
                const shift = max ? Math.min(1, shownScore / max) : 1;
                this._msgBar(ctx, entryX, entryX + len * shift, entryY + height / 2 - 0.7,
                    height - 3.5, resolveColor(entry.barColor));

                const nameColor = getColor("guiwhite");
                const tankName = mockup ? mockup.name : "";
                let label = entry.name ? entry.name + (tankName ? " - " + tankName : "") : tankName;
                if (!label) label = "unnamed";
                const score = Math.round(shownScore);
                const text = label.includes("#")
                    ? label.replace("##", String(score)).replace("#s", 1 === score ? "" : "s")
                    : label + ": " + this._handleLargeNumber(score);
                drawText(ctx, text, entryX + len / 2,
                    entryY + height / 2 - 0.035 * (height - 4.5 + 1.4),
                    height - 4.5 + 1.4, nameColor, "center", true, 4.5, getColor("black"));

                if (mockup && position) {
                    const xx = entryX - 1.5 * height - scale * position.middle.x * Math.SQRT1_2;
                    const yy = entryY + 0.5 * height - scale * position.middle.y * Math.SQRT1_2;
                    this._drawEntityCore(ctx, {
                        x: xx, y: yy, size: scale, facing: -Math.PI / 4,
                        alpha: 1, mockupIndex: entry.mockupIndex,
                        color: entry.color,
                        name: "", score: undefined,
                    }, state, Math.max(0.5, scale * 0.24));
                }
            }
        }
    }

    _mockupPosition(mockup, state) {
        let dims = this._mockupDims.get(mockup.mockupIndex);
        if (!dims) {
            dims = computeMockupPosition(mockup, (i) => state.getMockup(i));
            this._mockupDims.set(mockup.mockupIndex, dims);
        }
        return dims;
    }

    _handleLargeNumber(a, cullZeroes = false) {
        if (cullZeroes && a == 0) return "";
        if (a < 1e3) return "" + a.toFixed(0);
        if (a < 1e6) return (a / 1e3).toFixed(2) + "k";
        if (a < 1e9) return (a / 1e6).toFixed(2) + "m";
        if (a < 1e12) return (a / 1e9).toFixed(2) + "b";
        if (a < 1e15) return (a / 1e12).toFixed(2) + "t";
        return (a / 1e15).toFixed(2) + "q";
    }
    _drawHUD(ctx, state, w, h, max) {
        if (!state.spawned || state.died) return;

        const BAR_CHUNK = 5;

        state.updateScore();

        let width = 440,
            scorewidth = 70,
            scorelength = 0,
            height = 25.5,
            x = (w - width) / 2,
            y = h - 22 - height;
        ctx.lineWidth = 10;
        let extraHeight = 3;

        this._msgBar(ctx, x, x + width, y + height / 2, height - 3 + BAR_CHUNK, getColor("black"));
        this._msgBar(ctx, x, x + width, y + height / 2, height - 3, getColor("grey"));
        const progress = state.getProgress();
        if (progress > 0) {
            this._msgBar(ctx, x, x + width * progress, y + height / 2, height - 3.5, getColor("gold"));
        }
        drawText(ctx, "Level " + state.getLevel() + " " + state.tankName,
            x + width / 2, y + height / 2 + 9 - 0.35 * (21 + FONT_BOOST),
            21 + FONT_BOOST, getColor("guiwhite"), "center", true, 6, getColor("black"));

        height = 17;
        y -= height + 5;
        scorewidth = 70;
        scorelength = 0;

        this._msgBar(ctx, x + scorewidth - scorelength, x + width - scorewidth - scorelength,
            y + height / 2, height - extraHeight + BAR_CHUNK, getColor("black"));
        this._msgBar(ctx, x + scorewidth - scorelength, x + width - scorewidth - scorelength,
            y + height / 2, height - extraHeight, getColor("grey"));
        const score = state.getScore();
        const scoreFill = max ? Math.min(1, score / max) : 1;
        if (scoreFill > 0) {
            this._msgBar(ctx, x + scorewidth - scorelength,
                x - scorelength + width * ((scorewidth / width) + ((width - scorewidth * 2) / width) * scoreFill),
                y + height / 2, height - extraHeight - 0.5, getColor("green"));
        }
        drawText(ctx, "Score: " + this._handleLargeNumber(Math.round(score)),
            x + width / 2 - scorelength, y + height / 2 + 6 - 0.35 * (13 + FONT_BOOST),
            13, getColor("guiwhite"), "center", true);

        const name = state.playerName;
        if (name) {
            ctx.lineWidth = 4;
            drawText(ctx, name, Math.round(x + width / 2) + 1.5, Math.round(y - 10 - 4) - 1,
                31, getColor("guiwhite"), "center", true);
        }
    }

    _groupDigits(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    _measureText(ctx, text, fontSize) {
        fontSize += 1.4;
        ctx.font = "bold " + fontSize + "px Ubuntu";
        return ctx.measureText(text).width;
    }

    _msgBar(ctx, x1, x2, y, width, color) {
        ctx.beginPath();
        ctx.lineCap = "round";
        ctx.lineWidth = width;
        if (color) ctx.strokeStyle = color;
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
    }

    _msgBox(ctx, x1, x2, y, width, color, h2) {
        ctx.beginPath();
        ctx.roundRect(x1 - width / 2, y - width / 2, x2 - x1 + width, h2 + width, [width / 2]);
        ctx.fillStyle = color;
        ctx.fill();
    }

    _getUpgradeKeyName(index) {
        const keyId = `KEY_UPGRADE_${index + 1}`;
        const code = getKeyCode(keyId);
        if (code === null) return null;
        const name = getKeyName(keyId);
        return name || null;
    }

    _getIconColor(index) {
        const ICON_COLORS = [10, 11, 12, 15, 13, 2, 14, 4, 5, 1, 0, 3];
        return ICON_COLORS[index % ICON_COLORS.length];
    }

    _drawUpgradePanel(ctx, state, w, h) {
        const upgrades = state.upgrades || [];
        if (this._upgradeSuppressed) {
            this._upgradeGlide.set(-1);
            this._upgradeHitRects = [];
            this._prevUpgradeCount = 0;
            return;
        }
        if (upgrades.length === 0) {
            if (this._prevUpgradeCount > 0) {
                this._upgradeDismissed = true;
            } else {
                this._upgradeDismissed = false;
            }
            this._upgradeGlide.set(-1);
            this._upgradeHitRects = [];
            this._prevUpgradeCount = 0;
            return;
        }

        if (this._prevUpgradeCount === 0 && upgrades.length > 0) {
            this._upgradeDismissed = false;
        }
        this._prevUpgradeCount = upgrades.length;

        if (this._upgradeDismissed) {
            this._upgradeGlide.set(-1);
            if (this._upgradeGlide.get() < -0.99) {
                this._upgradeDismissed = false;
            }
            this._upgradeHitRects = [];
            return;
        }

        this._upgradeGlide.set(0);

        const len = 80;
        const height = 80;
        const internalSpacing = 10;
        const columnCount = Math.max(3, Math.floor(upgrades.length ** 0.55));
        const glide = this._upgradeGlide.get();

        this._upgradeHitRects = [];

        const upgradeSpin = Date.now() * 0.0005;
        const spin = upgradeSpin - Math.floor(upgradeSpin / Math.PI / 2) * Math.PI * 2;

        let x = glide * (len + internalSpacing) * columnCount + 12;
        let y = 15;
        let xStart = x;
        let ticker = 0;
        let upgradeNum = 0;
        let colorIndex = 0;

        const mouse = this._mousePos || { x: -9999, y: -9999 };
        this._upgradeHoverIdx = -1;

        for (let i = 0; i < upgrades.length; i++) {
            if (ticker === columnCount) {
                x = xStart;
                y += height + internalSpacing;
                ticker = 0;
            } else if (ticker > 0) {
                x += len + internalSpacing;
            }

            const rect = { x, y, w: len, h: height };
            this._upgradeHitRects.push(rect);

            if (mouse.x >= x && mouse.x <= x + len && mouse.y >= y && mouse.y <= y + height) {
                this._upgradeHoverIdx = i;
            }

            const mockup = state.getMockup(upgrades[i]);
            const upgradeKey = this._getUpgradeKeyName(upgradeNum);

            this._drawUpgradeIcon(ctx, mockup, x, y, len, height,
                spin, 0.75, colorIndex, upgradeKey,
                this._upgradeHoverIdx === upgradeNum);

            ticker++;
            upgradeNum++;
            colorIndex++;
        }

        let lastX = xStart;
        let lastY = y;
        if (ticker > 0) {
            lastX = x + len;
        }

        this._drawDonUpgradeButton(ctx, state, w, h,
            xStart, lastY + height + internalSpacing, lastX, mouse);
    }

    _drawUpgradeIcon(ctx, mockup, x, y, len, height, angle, alpha, colorIndex, upgradeKey, hover) {
        const position = mockup ? this._mockupPosition(mockup, this._lastState) : { axis: 1, middle: { x: 0, y: 0 } };
        const scale = (0.6 * len) / (position.axis || 1);
        const entityX = x + 0.5 * len;
        const entityY = y + 0.5 * height;

        const xShift = position.middle.x * Math.cos(angle) - position.middle.y * Math.sin(angle);
        const yShift = position.middle.x * Math.sin(angle) + position.middle.y * Math.cos(angle);

        ctx.globalAlpha = alpha;
        const iconColor = resolveColor(this._getIconColor(colorIndex));
        ctx.fillStyle = iconColor;
        drawGuiRect(ctx, x, y, len, height);

        if (hover) {
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = getColor("guiwhite");
            drawGuiRect(ctx, x, y, len, height);
        }
        ctx.globalAlpha = 0.2 * alpha;
        ctx.fillStyle = getColor("black");
        drawGuiRect(ctx, x, y + height * 0.6, len, height * 0.4);
        ctx.globalAlpha = 1;

        if (mockup) {
            const bodyColor = resolveColor(this._lastState.bodyColor ?? mockup.color ?? 16);
            this._drawEntityCore(ctx, {
                x: entityX - scale * xShift,
                y: entityY - scale * yShift,
                size: scale,
                facing: angle,
                alpha: 1,
                mockupIndex: mockup.mockupIndex,
                color: this._lastState.bodyColor ?? mockup.color,
                name: "",
                score: undefined,
            }, this._lastState, Math.max(0.4, scale * 0.22));
        }

        const name = mockup ? mockup.name : "?";
        const nameX = upgradeKey ? x + 0.9 * len / 2 : x + len / 2;
        drawText(ctx, name, nameX, y + height * 0.94, height / 10, getColor("guiwhite"), "center", true);

        if (upgradeKey) {
            drawText(ctx, `[${upgradeKey}]`, x + len - 4, y + height - 6, Math.min(10, height / 8), getColor("guiwhite"), "right", true);
        }

        ctx.strokeStyle = getColor("black");
        ctx.lineWidth = 3;
        drawGuiRect(ctx, x, y, len, height, true, false);
    }

    _drawDonUpgradeButton(ctx, state, w, h, gridX, gridY, gridRight, mouse) {
        const msg = "Don't Upgrade";
        const textHeight = 13;
        const btnW = this._measureText(ctx, msg, textHeight) + 10;
        const btnH = 20;
        const btnX = gridX + (gridRight - gridX - btnW) / 2;
        const btnY = gridY;

        const hover = mouse.x >= btnX && mouse.x <= btnX + btnW &&
            mouse.y >= btnY && mouse.y <= btnY + btnH;
        this._donUpgradeBtn = { x: btnX, y: btnY, w: btnW, h: btnH };

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = getColor("vlgrey");
        drawGuiRect(ctx, btnX, btnY, btnW, btnH);

        if (hover) {
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = getColor("guiwhite");
            drawGuiRect(ctx, btnX, btnY, btnW, btnH);
        }

        ctx.globalAlpha = 0.1;
        ctx.fillStyle = getColor("black");
        drawGuiRect(ctx, btnX, btnY + btnH * 0.6, btnW, btnH * 0.4);
        ctx.globalAlpha = 1;

        drawText(ctx, msg, btnX + btnW / 2, btnY + btnH / 2, textHeight - 3, getColor("guiwhite"), "center", true);

        ctx.strokeStyle = getColor("black");
        ctx.lineWidth = 3;
        drawGuiRect(ctx, btnX, btnY, btnW, btnH, true, false);
    }

    _drawStatBar(ctx, state, w, h) {
        if (!state.spawned || state.died) return;
        const points = state.skillPoints;
        const skills = state.skills;
        const maxSkills = state.maxSkills;
        if (!skills || !maxSkills) return;

        const STAT_NAMES = [
            "Body Damage", "Max Health", "Bullet Speed", "Bullet Health",
            "Bullet Penetration", "Bullet Damage", "Reload", "Movement Speed",
            "Shield Regeneration", "Shield Capacity",
        ];
        const STAT_COLORS = [
            "orange", "gold", "teal", "green",
            "yellow", "red", "lgreen", "blue",
            "pink", "purple",
        ];

        const spacing = 20;
        const height = 14;
        const vspacing = 5;
        const gap = 44.5;

        const skaTable = [];
        for (let i = 1; i <= 256; i++) {
            skaTable.push((i - 2) * 0.01 + Math.log(4 * (i / 9) + 1) / 1.513);
        }
        const ska = (x) => skaTable[x] || 0;

        const hasAnyPoints = points > 0;
        const canSkill = hasAnyPoints && maxSkills.some((cap, i) => cap > 0 && skills[i] < cap);
        const show = canSkill;

        this._statBarGlide.set(show ? 1 : 0);
        const glide = this._statBarGlide.get();
        if (glide < 0.01) {
            this._statBarHitRects = [];
            return;
        }

        const maxCap = Math.max(...maxSkills.filter(c => c > 0));
        const len = 130;

        const x = Math.round(spacing + 3 + (1 - glide) * (len + 50));
        let y = h - spacing - 5.5 - height;
        this._statBarHitRects = [];
        this._statBarHoverIdx = -1;
        const mouse = this._mousePos || { x: -9999, y: -9999 };

        for (let i = 9; i >= 0; i--) {
            const cap = maxSkills[i];
            if (!cap) continue;
            const level = skills[i];
            const col = getColor(STAT_COLORS[i]);
            const name = STAT_NAMES[i];

            const barEnd = len * ska(cap);
            const hitRect = { x, y, w: barEnd, h: height };
            this._statBarHitRects.push({ ...hitRect, skillIndex: i });
            if (mouse.x >= x && mouse.x <= x + barEnd && mouse.y >= y && mouse.y <= y + height) {
                this._statBarHoverIdx = i;
            }

            const textcolor = level === cap ? col : !hasAnyPoints ? getColor("grey") : getColor("guiwhite");

            this._msgBar(ctx, x + height / 2, x - height / 2 + barEnd - 14, y + height / 2,
                height - 2.8 + 5, getColor("black"));
            this._msgBar(ctx, x + height / 2, x + height / 2 + barEnd - gap, y + height / 2,
                height - 3, getColor("grey"));

            if (level > 0) {
                const fillEnd = len * ska(level);
                this._msgBar(ctx, x + height / 2, x + height / 2 + fillEnd - gap, y + height / 2,
                    height - 5.5 + 5, getColor("black"));
                this._msgBar(ctx, x + height / 2, x + height / 2 + fillEnd - gap, y + height / 2,
                    height - 3.5, col);
            }

            ctx.strokeStyle = getColor("black");
            ctx.lineWidth = 1;
            for (let j = 1; j < level + 1; j++) {
                const dx = x + len * ska(j) - gap;
                ctx.beginPath();
                ctx.moveTo(dx, y + 1.5);
                ctx.lineTo(dx, y - 3 + height);
                ctx.stroke();
            }

            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(x + height / 2, y + height / 2, 3.5, 0, Math.PI * 2);
            ctx.fill();

            const textLen = len * ska(cap);
            drawText(ctx, name, Math.round(x + textLen / 2) - 5.5, y + height / 2,
                height - 4.1, textcolor, "center", true);

            const keyName = getKeyName(`KEY_SKILL_${10 - i}`);
            if (keyName) {
                drawText(ctx, `[${keyName}]`, Math.round(x + textLen - height * 0.25) - 14.5,
                    y + height / 2, height - 6, textcolor, "right", true);
            }

            if (level) {
                drawText(ctx, "+" + level, Math.round(x + textLen + 4) - 5.5,
                    y + height / 2, height - 5, col, "left", true);
            }

            y -= height + vspacing;
        }

        if (hasAnyPoints) {
            const fullLen = len * ska(maxCap);
            drawText(ctx, "x" + points, Math.round(x + fullLen - 2) - 13,
                Math.round(y + height - 4) + 2, 18.5, getColor("guiwhite"), "right", true);
        }
    }

    _drawServerMessages(ctx, state, w, h) {
        const msgs = state.serverMessages || [];
        if (msgs.length === 0) return;
        const now = performance.now();
        const height = 18;
        const yy = 20;
        const x = w / 2;
        let y = 25;
        for (let i = msgs.length - 1; i >= 0; i--) {
            const msg = msgs[i];
            const elapsed = now - msg.time;
            const remaining = (msg.duration || 10000) - elapsed;
            if (remaining <= 0) { msgs.splice(i, 1); continue; }

            const K = Math.max(0, Math.min(1, elapsed / 300, remaining / 300));
            const textCenterOffset = -0.35 * (height - 4.3);
            if (msg.textJSON) {
                let len = 0;
                for (const txt of msg.textJSON) {
                    const wLine = this._measureText(ctx, txt, height - 4.25);
                    if (len < wLine) len = wLine;
                }
                ctx.globalAlpha = 0.5 * K;
                this._msgBox(ctx, x - len / 2, x + len / 2, y + yy / 2, height,
                    getColor("black"), 17.5 * msg.textJSON.length - 17.5 + 1);
                ctx.globalAlpha = K;
                msg.textJSON.forEach((txt, index) => {
                    drawText(ctx, txt, x - len / 2 + 2,
                        y + 16 + 17.5 * index + textCenterOffset,
                        height - 4.3, getColor("guiwhite"), "left", 5.5, getColor("black"));
                });
                y += 23 * K + 17.5 * (3 - 2 * K) * (msg.textJSON.length - 1) * K * K;
            } else {
                if (msg.len == null) msg.len = this._measureText(ctx, msg.text, height - 4.3);
                ctx.globalAlpha = 0.5 * K;
                this._msgBar(ctx, x - msg.len / 2, x + msg.len / 2, y + yy / 2, height + 2, getColor("black"));
                ctx.globalAlpha = K;
                drawText(ctx, msg.text, x, y + yy / 1.3 + textCenterOffset,
                    height - 4.3, getColor("guiwhite"), "center", 5.5, getColor("black"));
                y += 23 * (3 - 2 * K) * K * K;
            }
        }
        ctx.globalAlpha = 1;
    }

    _timeForHumans(x) {
        let seconds = x % 60;
        x /= 60;
        x = Math.floor(x);
        let minutes = x % 60;
        x /= 60;
        x = Math.floor(x);
        let hours = x % 24;
        x /= 24;
        x = Math.floor(x);
        let days = x;
        let y = '';
        function weh(z, text) {
            if (z) {
                y = y + ((y === '') ? '' : ', ') + z + ' ' + text + ((z > 1) ? 's' : '');
            }
        }
        weh(days, 'day');
        weh(hours, 'hour');
        weh(minutes, 'minute');
        weh(seconds, 'second');
        if (y === '') y = 'less than a second';
        return y;
    }

    _getKillsText(state) {
        const fk = state._finalKills;
        const labels = [" kills", " assists", " visitors defeated", " polygons destroyed"];
        const weights = [1, 0.5, 3, 0.05];
        let destruction = 0;
        const parts = [];
        for (let i = 0; i < 4; i++) {
            const val = Math.round(fk[i].get());
            if (val) {
                destruction += val * weights[i];
                parts.push(val + labels[i]);
            }
        }
        const emoji = destruction === 0 ? "\u{1F33C}"
            : destruction < 4 ? "\u{1F3AF}"
            : destruction < 8 ? "\u{1F4A5}"
            : destruction < 15 ? "\u{1F4A2}"
            : destruction < 25 ? "\u{1F525}"
            : destruction < 50 ? "\u{1F4A3}"
            : destruction < 75 ? "\u{1F479}"
            : destruction < 100 ? "\u{1F336}\uFE0F" : "\u{1F4AF}";
        const text = !parts.length ? "A true pacifist"
            : parts.length === 1 ? parts.join(" and ")
            : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
        return emoji + " " + text;
    }

    _getDeathText(state) {
        const di = state.deathInfo;
        if (!di) return "";
        if (di.killers && di.killers.length) {
            let txt = "\u{1F52A} Succumbed to";
            for (const k of di.killers) {
                const tankName = k.tank || "unknown";
                const article = /^[aeiou]/i.test(tankName[0]) ? "an" : "a";
                txt += " " + article + " " + tankName + " and";
            }
            return txt.slice(0, -4);
        }
        if (di.deathType === "dumb_death" || di.deathType === "self_destruct") {
            return "\u{1F937} Well that was kinda dumb huh";
        }
        if (di.killInfo && di.killInfo.type === "player" && di.killInfo.name) {
            return "\u{1F52A} Succumbed to " + di.killInfo.name;
        }
        return "\u{1F52A} Succumbed to the arena";
    }

    _getTipText(state) {
        const di = state.deathInfo;
        if (di && di.killers && di.killers.length) {
            return "\u{2753} lol you died";
        }
        return "\u{2753} Kill players and polygons to get more score";
    }

    _drawDeathScreen(ctx, state, w, h) {
        const di = state.deathInfo;
        if (!di) return;

        ctx.save();

        if (getColor("guiwhite") === "#000000" && getColor("white") === "#000000") {
            setColorTheme("normal");
        }

        const glide = state._deathAnimation.get();
        const progress = Math.min(1, glide);
        const x = w / 2;
        const yFinal = Math.max(100, Math.min(h / 2 - 60, h - 250));
        const y = yFinal - 800 * (1 - progress);

        ctx.fillStyle = getColor("black");
        ctx.globalAlpha = 0.1 + 0.15 * Math.min(1, progress * 2);
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;

        const len = 140;
        const mockup = state.getMockup(state.bodyMockupIndex);
        if (mockup) {
            const position = this._mockupPosition(mockup, state);
            const scale = len / (position.axis || 1);
            const xx = x - scale * (position.middle?.x || 0) * Math.SQRT1_2;
            const yy = y + scale * (position.middle?.y || 0) * Math.SQRT1_2;
            const tankX = (xx - 190 - len / 2 + 0.5) | 0;
            const tankY = (yy + 5 + 0.5) | 0;
            this._drawEntityCore(ctx, {
                x: tankX, y: tankY, size: scale,
                facing: -Math.PI / 4, alpha: 1,
                mockupIndex: state.bodyMockupIndex,
                color: state.bodyColor,
                name: "", score: undefined,
            }, state, Math.max(0.5, scale * 0.24));

            drawText(ctx, "Level " + state.getLevel(), x - 275, y + 80, 14, getColor("guiwhite"), "center");
            drawText(ctx, mockup.name, x - 275, y + 110, 24, getColor("guiwhite"), "center");
        }

        drawText(ctx, state._deathTimestamp + '', x, y - 80, 10, getColor("guiwhite"), "center");

        const playerName = state.playerName;
        const scoreLabel = playerName ? playerName + "'s Score: " : "Your Score: ";
        drawText(ctx, scoreLabel, x - 170, y - 30, 24, getColor("guiwhite"), "left");

        drawText(ctx, this._groupDigits(Math.round(state._finalScore.get())), x - 170, y + 25, 50, getColor("guiwhite"), "left");

        ctx.globalAlpha = Math.min(1, Math.max(0, (progress - 0.25) / 0.75));
        drawText(ctx, "\u{231A} Survived for " + this._timeForHumans(Math.round(state._finalLifetime.get())), x - 170, y + 55, 16, getColor("guiwhite"), "left");

        ctx.globalAlpha = Math.min(1, Math.max(0, (progress - 0.3) / 0.7));
        drawText(ctx, this._getKillsText(state), x - 170, y + 77, 16, getColor("guiwhite"), "left");

        ctx.globalAlpha = Math.min(1, Math.max(0, (progress - 0.35) / 0.65));
        drawText(ctx, this._getDeathText(state), x - 170, y + 99, 16, getColor("guiwhite"), "left");

        ctx.globalAlpha = Math.min(1, Math.max(0, (progress - 0.4) / 0.6));
        drawText(ctx, this._getTipText(state), x - 170, y + 122, 16, getColor("guiwhite"), "left");

        ctx.globalAlpha = Math.min(1, Math.max(0, (progress - 0.45) / 0.55));
        const serverActivity = di.serverActivity != null ? (100 * di.serverActivity).toFixed(0) : "100";
        drawText(ctx, "\u{1F986} The server was alive for " + serverActivity + "% for the run", x - 170, y + 144, 16, getColor("guiwhite"), "left");

        ctx.globalAlpha = 1;

        const btnAlpha = Math.min(1, Math.max(0, (progress - 0.75) / 0.25));
        const btnW = 130, btnH = 30;
        this._deathBtns = [
            { x: x - 80 - btnW / 2, y: y + 195, w: btnW, h: btnH, label: "Back", action: "select" },
            { x: x + 80 - btnW / 2, y: y + 195, w: btnW, h: btnH, label: "Respawn", action: "respawn" },
        ];
        for (const btn of this._deathBtns) {
            const hover = this._deathHover === btn.action;
            ctx.globalAlpha = 0.5 * btnAlpha;
            ctx.fillStyle = hover ? getColor("orange") : getColor("grey");
            ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
            if (hover) {
                ctx.globalAlpha = (this._discDown ? 0.2 : 0.15) * btnAlpha;
                ctx.fillStyle = this._discDown ? getColor("black") : getColor("guiwhite");
                ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
            }
            ctx.globalAlpha = 0.1 * btnAlpha;
            ctx.fillStyle = getColor("black");
            ctx.fillRect(btn.x, btn.y + btn.h * 0.6, btn.w, btn.h * 0.4);
            ctx.globalAlpha = 1 * btnAlpha;
            drawText(ctx, btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2, 15 + FONT_BOOST, getColor("guiwhite"), "center", true, 4.5, getColor("black"));
            ctx.strokeStyle = getColor("black");
            ctx.lineWidth = 3;
            ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
        }

        ctx.restore();
    }

    _lerp(a, b, x) {
        return a + x * (b - a);
    }

    _formatScore(n) {
        if (n < 1e3) return String(n);
        if (n < 1e6) return (n / 1e3).toFixed(2) + "k";
        if (n < 1e9) return (n / 1e6).toFixed(2) + "m";
        return (n / 1e9).toFixed(2) + "b";
    }

    _drawConnectingScreen(ctx, state, w, h) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = getColor("white");
        ctx.fillRect(0, 0, w, h);
        const lines = [
            ["Connecting...", 0, 30, getColor("guiwhite")],
            [state.connectMessage, 30, 15, getColor("lgreen")],
            [state.connectTip, 60, 15, getColor("guiwhite")],
        ];
        for (const [text, dy, base, color] of lines) {
            if (!text) continue;
            const size = base + FONT_BOOST;
            drawText(ctx, text, w / 2, h / 2 + dy - 0.35 * size, size, color, "center", true, 4.5, getColor("black"));
        }
    }

    _drawDisconnectedScreen(ctx, state, w, h) {
        ctx.globalAlpha = this._discInGame ? 0.25 : 1;
        ctx.fillStyle = mixColors(getColor("red"), getColor("guiblack"), 0.3);
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;

        if (state.disconnectTime) {
            const ts = state.disconnectTime.toISOString().replace(/\.\d{3}Z$/, "Z");
            drawText(ctx, ts, w / 2, h * 0.28, 11 + FONT_BOOST, getColor("guiwhite"), "center", false);
        }

        let titleSize = 30 + FONT_BOOST;
        drawText(ctx, "Disconnected", w / 2, h / 2 - 0.35 * titleSize, titleSize, getColor("guiwhite"), "center", true, 4.5, getColor("black"));
        const reason = state.disconnectReason || "The connection has closed. You may attempt to regain score or reload the game.";
        let reasonSize = 15 + FONT_BOOST;
        const reasonLines = reason.split("\n");
        const lineSpacing = reasonSize * 1.3;
        const reasonTop = h / 2 + 30 - 0.35 * reasonSize;
        for (let i = 0; i < reasonLines.length; i++) {
            drawText(ctx, reasonLines[i], w / 2, reasonTop + i * lineSpacing, reasonSize, getColor("orange"), "center", true, 4.5, getColor("black"));
        }

        const bw = 130, bh = 30, by = h / 2 + 135 + (reasonLines.length - 1) * lineSpacing;
        this._discBtns = [
            { x: w / 2 - 80 - bw / 2, y: by, w: bw, h: bh, label: "Back", action: "exit" },
            { x: w / 2 + 80 - bw / 2, y: by, w: bw, h: bh, label: "Reconnect", action: "reconnect" },
        ];
        for (const b of this._discBtns) {
            const hover = this._discHover === b.action;
            ctx.fillStyle = getColor("grey");
            ctx.globalAlpha = 0.5;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            if (hover) {
                ctx.fillStyle = this._discDown ? getColor("guiblack") : getColor("guiwhite");
                ctx.globalAlpha = this._discDown ? 0.2 : 0.15;
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
            ctx.fillStyle = getColor("guiblack");
            ctx.globalAlpha = 0.1;
            ctx.fillRect(b.x, b.y + b.h * 0.6, b.w, b.h * 0.4);
            ctx.globalAlpha = 1;
            drawText(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, 15 + FONT_BOOST, getColor("guiwhite"), "center", true, 4.5, getColor("black"));
            ctx.strokeStyle = getColor("guiblack");
            ctx.lineWidth = 3;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
        }
    }
}
