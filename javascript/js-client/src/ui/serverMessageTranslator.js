import { getKeyName } from "./keybinds.js";

const KEY_REF = /\x01([^\x01]+)\x01/g;
const STRAY_MARKER = /\x01/g;

const ACTION_KEYS = {
    sandbox: "KEY_SPECIAL",
    special: "KEY_SPECIAL",
    autofire: "KEY_AUTO_FIRE",
    autospin: "KEY_AUTO_SPIN",
    override: "KEY_OVERRIDE",
    levelup: "KEY_LEVEL_UP",
    reversetank: "KEY_REVERSE_TANK",
    reversemouse: "KEY_REVERSE_MOUSE",
    screenshot: "KEY_SCREENSHOT",
    skillmax: "KEY_SKILL_MAX",
    maximizestat: "KEY_SKILL_MAX",
    maxstat: "KEY_SKILL_MAX",
    classtree: "KEY_CLASS_TREE",
    record: "KEY_RECORD",
    suicide: "KEY_SUICIDE",
    selfdestruct: "KEY_SUICIDE",
    ping: "KEY_PING",
    debuginfo: "KEY_PING",
    debug: "KEY_PING",
    spinlock: "KEY_SPIN_LOCK",
    ability: "KEY_ABILITY",
    useaction: "KEY_ABILITY",
    action: "KEY_ABILITY",
    autoalt: "KEY_AUTO_ALT",
};

const CODE_LABELS = {
    escape: "Esc",
    tab: "Tab",
    capslock: "Caps Lock",
    space: "Space",
    spacebar: "Space",
    enter: "Enter",
    numpadenter: "Enter",
    return: "Enter",
    backspace: "Backspace",
    delete: "Del",
    insert: "Ins",
    home: "Home",
    end: "End",
    pageup: "Page Up",
    pagedown: "Page Down",
    arrowup: "\u2191",
    arrowdown: "\u2193",
    arrowleft: "\u2190",
    arrowright: "\u2192",
    printscreen: "PrtSc",
    scrolllock: "Scroll Lock",
    pause: "Pause",
    contextmenu: "Menu",
    numlock: "Num Lock",
    shiftleft: "Shift",
    shiftright: "Shift",
    controlleft: "Ctrl",
    controlright: "Ctrl",
    altleft: "Alt",
    altright: "Alt",
    metaleft: "Meta",
    metaright: "Meta",
    backquote: "`",
    minus: "-",
    equal: "=",
    bracketleft: "[",
    bracketright: "]",
    semicolon: ";",
    quote: "'",
    backslash: "\\",
    comma: ",",
    period: ".",
    slash: "/",
    intlbackslash: "\\",
    intlro: "Ro",
    intlyen: "\u00a5",
    numpadmultiply: "Num *",
    numpadadd: "Num +",
    numpadsubtract: "Num -",
    numpaddecimal: "Num .",
    numpaddivide: "Num /",
};

function normalizeAction(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function codeLabel(name) {
    const key = name.toLowerCase();

    if (/^f([1-9]|1\d|2[0-4])$/.test(key)) return key.toUpperCase();
    if (/^digit([0-9])$/.test(key)) return key.slice(5);
    if (/^numpad([0-9])$/.test(key)) return "Num " + key.slice(6);
    if (/^key([a-z])$/.test(key)) return key.slice(3).toUpperCase();
    if (/^lang([a-z0-9]+)$/.test(key)) return key;

    return CODE_LABELS[key] ?? null;
}

export function resolveKeyReference(name) {
    const action = ACTION_KEYS[normalizeAction(name)];
    if (action) {
        const bound = getKeyName(action);
        if (bound) return bound;
    }
    const upgrade = normalizeAction(name).match(/^upgrade(1[0-2]|[1-9])$/);
    if (upgrade) {
        const bound = getKeyName(`KEY_UPGRADE_${upgrade[1]}`);
        if (bound) return bound;
    }
    const skill = normalizeAction(name).match(/^skill(10|[1-9])$/);
    if (skill) {
        const bound = getKeyName(`KEY_SKILL_${skill[1]}`);
        if (bound) return bound;
    }
    return codeLabel(name) ?? name;
}

export function translateServerMessage(raw) {
    if (!raw || raw.indexOf("\x01") === -1) return raw;
    const translated = raw.replace(KEY_REF, (_, name) => resolveKeyReference(name));
    return translated.replace(STRAY_MARKER, "");
}
