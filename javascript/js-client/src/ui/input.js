import { getKeyCode, isEditingKeybind } from "./keybinds.js";

const MOVEMENT_IDS = [
    ["up", "KEY_UP"],
    ["down", "KEY_DOWN"],
    ["left", "KEY_LEFT"],
    ["right", "KEY_RIGHT"],
];

export class InputHandler {
    constructor(canvasEl, sendCommand) {
        this.sendCommand = sendCommand;
        this.keys = { up: false, down: false, left: false, right: false };
        this.mouse = { x: 0, y: 0 };
        this.lmb = false;
        this.rmb = false;
        this.enabled = false;
        this.chatOpen = false;
        this.dead = false;
        this.sandboxHeld = false;
        this.onUpgrade = null;
        this.onSkill = null;
        this.onRespawn = null;
        this.onSuicide = null;
        this.onToggle = null;
        this.onChatOpen = null;
        this.onShowMore = null;
        this.onSaveScore = null;
        this.onSandboxKey = null;
        this.onBeforeMouseDown = null;
        this.statMaxing = false;
        this._bind(canvasEl);
    }

    _bind(el) {
        el.addEventListener("mousemove", (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            if (this.enabled) this.send();
        });
        el.addEventListener("mousedown", (e) => {
            if (!this.enabled) return;
            if (this.onBeforeMouseDown && this.onBeforeMouseDown(e)) return;
            if (e.button === 0) this.lmb = true;
            if (e.button === 2) this.rmb = true;
            this.send();
        });
        el.addEventListener("mouseup", (e) => {
            if (e.button === 0) this.lmb = false;
            if (e.button === 2) this.rmb = false;
            if (this.enabled) this.send();
        });
        el.addEventListener("contextmenu", (e) => e.preventDefault());
        window.addEventListener("keydown", (e) => this._keyDown(e));
        window.addEventListener("keyup", (e) => this._keyUp(e));
        window.addEventListener("blur", () => this._releaseAll());
    }

    _releaseAll() {
        if (this.sandboxHeld) {
            this.sandboxHeld = false;
            if (this.onSandboxKey) this.onSandboxKey("Self", false);
        }
        if (this.keys.up || this.keys.down || this.keys.left || this.keys.right || this.lmb || this.rmb) {
            this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
            this.lmb = this.rmb = false;
            this.send();
        }
    }

    _keyDown(e) {
        if (this.chatOpen || isEditingKeybind()) {
            if (this.chatOpen && e.code === "Escape") this.onChatOpen(false);
            return;
        }
        if (!this.enabled) return;
        if (e.code === getKeyCode("KEY_SPECIAL")) {
            if (!this.sandboxHeld) {
                this.sandboxHeld = true;
                if (this.onSandboxKey) this.onSandboxKey("Self", true);
            }
            e.preventDefault();
            return;
        }
        if (this.sandboxHeld) {
            if (this.onSandboxKey) this.onSandboxKey(e.code, true);
            e.preventDefault();
            return;
        }
        if (e.code === "Enter") {
            e.preventDefault();
            if (this.dead && this.onRespawn) this.onRespawn();
            else if (this.onChatOpen) this.onChatOpen(true);
            return;
        }
        for (const [dir, keyId] of MOVEMENT_IDS) {
            if (e.code === getKeyCode(keyId)) {
                this.keys[dir] = true;
                e.preventDefault();
                this.send();
                return;
            }
        }
        if (e.code === getKeyCode("KEY_PRIMARY_CONTROL")) {
            this.lmb = true;
            e.preventDefault();
            this.send();
            return;
        }
        if (e.code === getKeyCode("KEY_SECONDARY_CONTROL")) {
            this.rmb = true;
            e.preventDefault();
            this.send();
            return;
        }
        if (this.onToggle && e.code === getKeyCode("KEY_AUTO_FIRE")) { this.onToggle("autofire"); return; }
        if (this.onToggle && e.code === getKeyCode("KEY_AUTO_SPIN")) { this.onToggle("autospin"); return; }
        if (this.onToggle && e.code === getKeyCode("KEY_OVERRIDE")) { this.onToggle("override"); return; }
        if (this.onShowMore && e.code === getKeyCode("KEY_PING")) this.onShowMore();
        if (this.onSuicide && e.code === getKeyCode("KEY_SUICIDE")) this.onSuicide();
        if (this.onSaveScore && e.code === getKeyCode("KEY_SPIN_LOCK")) this.onSaveScore();
        if (this.onToggle && e.code === getKeyCode("KEY_REVERSE_MOUSE")) { this.rmb = !this.rmb; this.send(); return; }
        if (this.onToggle && e.code === getKeyCode("KEY_REVERSE_TANK")) { this.onToggle("reverse"); return; }
        for (let i = 1; i <= 12; i++) {
            if (this.onUpgrade && e.code === getKeyCode(`KEY_UPGRADE_${i}`)) this.onUpgrade(i - 1);
        }
        for (let i = 1; i <= 10; i++) {
            if (this.onSkill && e.code === getKeyCode(`KEY_SKILL_${i}`)) this.onSkill(i - 1, this.statMaxing);
        }
        if (e.code === getKeyCode("KEY_SKILL_MAX")) { this.statMaxing = true; return; }
    }

    _keyUp(e) {
        if (e.code === getKeyCode("KEY_SPECIAL")) {
            if (this.sandboxHeld) {
                this.sandboxHeld = false;
                if (this.onSandboxKey) this.onSandboxKey("Self", false);
            }
            return;
        }
        if (this.sandboxHeld) {
            if (this.onSandboxKey) this.onSandboxKey(e.code, false);
            return;
        }
        if (e.code === getKeyCode("KEY_SKILL_MAX")) { this.statMaxing = false; return; }
        if (isEditingKeybind()) return;
        for (const [dir, keyId] of MOVEMENT_IDS) {
            if (e.code === getKeyCode(keyId)) {
                this.keys[dir] = false;
                this.send();
                return;
            }
        }
        if (e.code === getKeyCode("KEY_PRIMARY_CONTROL")) {
            this.lmb = false;
            this.send();
            return;
        }
        if (e.code === getKeyCode("KEY_SECONDARY_CONTROL")) {
            this.rmb = false;
            this.send();
            return;
        }
    }

    setChat(open) {
        this.chatOpen = open;
        if (open) {
            this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
            this.lmb = this.rmb = false;
            this.send();
        }
    }

    send() {
        this.sendCommand({
            up: this.keys.up,
            down: this.keys.down,
            left: this.keys.left,
            right: this.keys.right,
            lmb: this.lmb,
            rmb: this.rmb,
        }, this.mouse);
    }
}
