const STORAGE_KEY = 'keybinds';

const DEFS = {
    KEY_UP: ['W', 'KeyW'],
    KEY_LEFT: ['A', 'KeyA'],
    KEY_DOWN: ['S', 'KeyS'],
    KEY_RIGHT: ['D', 'KeyD'],
    KEY_AUTO_FIRE: ['E', 'KeyE'],
    KEY_AUTO_SPIN: ['C', 'KeyC'],
    KEY_OVERRIDE: ['R', 'KeyR'],
    KEY_LEVEL_UP: ['N', 'KeyN'],
    KEY_REVERSE_TANK: ['V', 'KeyV'],
    KEY_REVERSE_MOUSE: ['B', 'KeyB'],
    KEY_SCREENSHOT: ['Q', 'KeyQ'],
    KEY_SKILL_MAX: ['M', 'KeyM'],
    KEY_CLASS_TREE: ['T', 'KeyT'],
    KEY_RECORD: ['Z', 'KeyZ'],
    KEY_SUICIDE: ['O', 'KeyO'],
    KEY_PING: ['L', 'KeyL'],
    KEY_SPIN_LOCK: ['G', 'KeyG'],
    KEY_ABILITY: ['F', 'KeyF'],
    KEY_SPECIAL: ['`', 'Backquote'],
    KEY_AUTO_ALT: ['X', 'KeyX'],
    KEY_PRIMARY_CONTROL: ['Space', 'Space'],
    KEY_SECONDARY_CONTROL: ['Shift', 'ShiftLeft'],
    KEY_UPGRADE_1: ['Y', 'KeyY'],
    KEY_UPGRADE_2: ['U', 'KeyU'],
    KEY_UPGRADE_3: ['I', 'KeyI'],
    KEY_UPGRADE_4: ['H', 'KeyH'],
    KEY_UPGRADE_5: ['J', 'KeyJ'],
    KEY_UPGRADE_6: ['K', 'KeyK'],
    KEY_UPGRADE_7: ['', -1],
    KEY_UPGRADE_8: ['', -1],
    KEY_UPGRADE_9: ['', -1],
    KEY_UPGRADE_10: ['', -1],
    KEY_UPGRADE_11: ['', -1],
    KEY_UPGRADE_12: ['', -1],
    KEY_SKILL_1: ['1', 'Digit1'],
    KEY_SKILL_2: ['2', 'Digit2'],
    KEY_SKILL_3: ['3', 'Digit3'],
    KEY_SKILL_4: ['4', 'Digit4'],
    KEY_SKILL_5: ['5', 'Digit5'],
    KEY_SKILL_6: ['6', 'Digit6'],
    KEY_SKILL_7: ['7', 'Digit7'],
    KEY_SKILL_8: ['8', 'Digit8'],
    KEY_SKILL_9: ['9', 'Digit9'],
    KEY_SKILL_10: ['0', 'Digit0'],
};

const LABELS = {
    KEY_UP: 'move up',
    KEY_LEFT: 'move left',
    KEY_DOWN: 'move down',
    KEY_RIGHT: 'move right',
    KEY_AUTO_FIRE: 'auto-fire',
    KEY_AUTO_SPIN: 'auto-spin',
    KEY_OVERRIDE: 'disable AI',
    KEY_LEVEL_UP: 'level up',
    KEY_REVERSE_TANK: 'reverse tank',
    KEY_REVERSE_MOUSE: 'reverse mouse',
    KEY_SCREENSHOT: 'screenshot',
    KEY_SKILL_MAX: 'maximize stat',
    KEY_CLASS_TREE: 'show class tree',
    KEY_RECORD: 'record video',
    KEY_SUICIDE: 'self-destruct',
    KEY_PING: 'debug info',
    KEY_SPIN_LOCK: 'spin lock',
    KEY_ABILITY: 'use action',
    KEY_SPECIAL: 'sandbox',
    KEY_AUTO_ALT: 'auto-alt',
    KEY_PRIMARY_CONTROL: 'primary control',
    KEY_SECONDARY_CONTROL: 'secondary control',
    KEY_UPGRADE_1: 'upgrade 1',
    KEY_UPGRADE_2: 'upgrade 2',
    KEY_UPGRADE_3: 'upgrade 3',
    KEY_UPGRADE_4: 'upgrade 4',
    KEY_UPGRADE_5: 'upgrade 5',
    KEY_UPGRADE_6: 'upgrade 6',
    KEY_UPGRADE_7: 'upgrade 7',
    KEY_UPGRADE_8: 'upgrade 8',
    KEY_UPGRADE_9: 'upgrade 9',
    KEY_UPGRADE_10: 'upgrade 10',
    KEY_UPGRADE_11: 'upgrade 11',
    KEY_UPGRADE_12: 'upgrade 12',
    KEY_SKILL_1: 'skill 1',
    KEY_SKILL_2: 'skill 2',
    KEY_SKILL_3: 'skill 3',
    KEY_SKILL_4: 'skill 4',
    KEY_SKILL_5: 'skill 5',
    KEY_SKILL_6: 'skill 6',
    KEY_SKILL_7: 'skill 7',
    KEY_SKILL_8: 'skill 8',
    KEY_SKILL_9: 'skill 9',
    KEY_SKILL_10: 'skill 10',
};

const LAYOUT = [
    [null, 'KEY_UP', null],
    ['KEY_LEFT', 'KEY_DOWN', 'KEY_RIGHT'],
    ['KEY_AUTO_FIRE', 'KEY_AUTO_SPIN', 'KEY_OVERRIDE'],
    ['KEY_LEVEL_UP', 'KEY_REVERSE_TANK', 'KEY_REVERSE_MOUSE'],
    ['KEY_SCREENSHOT', 'KEY_SKILL_MAX', 'KEY_CLASS_TREE'],
    ['KEY_RECORD', 'KEY_SUICIDE', 'KEY_PING'],
    ['KEY_SPIN_LOCK', 'KEY_ABILITY', 'KEY_SPECIAL'],
    [null, 'KEY_AUTO_ALT', null],
    ['KEY_PRIMARY_CONTROL', null, 'KEY_SECONDARY_CONTROL'],
    ['KEY_UPGRADE_1', 'KEY_UPGRADE_2', 'KEY_UPGRADE_3'],
    ['KEY_UPGRADE_4', 'KEY_UPGRADE_5', 'KEY_UPGRADE_6'],
    ['KEY_UPGRADE_7', 'KEY_UPGRADE_8', 'KEY_UPGRADE_9'],
    ['KEY_UPGRADE_10', 'KEY_UPGRADE_11', 'KEY_UPGRADE_12'],
    ['KEY_SKILL_1', 'KEY_SKILL_2', 'KEY_SKILL_3'],
    ['KEY_SKILL_4', 'KEY_SKILL_5', 'KEY_SKILL_6'],
    ['KEY_SKILL_7', 'KEY_SKILL_8', 'KEY_SKILL_9'],
    [null, 'KEY_SKILL_10', null],
];

let controls = [];
let selected = null;
let defaults = {};
let bindings = {};
let resetButton = null;

function loadBindings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        bindings = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {};
    } catch (e) {
        bindings = {};
    }
}

function saveBindings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    } catch (e) {}
}

function clearTextSelection() {
    if (window.getSelection) window.getSelection().removeAllRanges();
}

function selectControl(control) {
    selected = control;
    control.element.parentNode.parentNode.classList.add('editing');
    if (control.code !== -1 && window.getSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(control.element);
        selection.addRange(range);
    }
}

function unselectControl() {
    if (!selected) return;
    clearTextSelection();
    selected.element.parentNode.parentNode.classList.remove('editing');
    selected = null;
}

function assignKey(control, keyName, code) {
    if (code !== control.code && code !== -1) {
        const clash = controls.find(c => c !== control && c.code === code);
        if (clash) {
            clash.keyName = control.keyName;
            clash.element.innerText = control.keyName;
            clash.code = control.code;
            bindings[clash.keyId] = [control.keyName, control.code];
        }
    }
    control.keyName = keyName;
    control.element.innerText = keyName;
    control.code = code;
    bindings[control.keyId] = [keyName, code];
    saveBindings();
    resetButton.classList.add('active');
}

function collectControls(table) {
    controls = [];
    defaults = {};
    for (const row of table.rows) {
        for (const cell of row.cells) {
            const element = cell.firstChild.firstChild;
            if (!element) continue;
            const keyId = element.dataset.key;
            defaults[keyId] = DEFS[keyId].slice();
            let [keyName, code] = DEFS[keyId];
            if (bindings[keyId]) {
                keyName = bindings[keyId][0];
                code = bindings[keyId][1];
                if (code == null) code = -1;
                resetButton.classList.add('active');
            }
            element.innerText = keyName;
            controls.push({ element, keyId, keyName, code });
        }
    }
}

export function initKeybindGUI() {
    const table = document.getElementById('controlSettings');
    resetButton = document.getElementById('resetControls');
    if (!table || !resetButton || controls.length) return;
    loadBindings();

    const tbody = table.tBodies[0];
    for (const row of LAYOUT) {
        const tr = document.createElement('tr');
        for (const keyId of row) {
            const td = document.createElement('td');
            const div = document.createElement('div');
            if (keyId) {
                const b = document.createElement('b');
                b.dataset.key = keyId;
                b.innerText = DEFS[keyId][0];
                const span = document.createElement('span');
                span.textContent = ' - ';
                div.appendChild(b);
                div.appendChild(span);
                div.appendChild(document.createTextNode(LABELS[keyId]));
            }
            td.appendChild(div);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }

    collectControls(table);

    document.addEventListener('click', event => {
        if (selected) {
            unselectControl();
        } else {
            const control = controls.find(({ element }) => element === event.target);
            if (control) selectControl(control);
        }
    });

    resetButton.addEventListener('click', () => {
        bindings = {};
        saveBindings();
        unselectControl();
        for (const control of controls) {
            control.keyName = defaults[control.keyId][0];
            control.element.innerText = control.keyName;
            control.code = defaults[control.keyId][1];
        }
        resetButton.classList.add('spin');
        setTimeout(() => {
            resetButton.classList.remove('active');
            resetButton.classList.remove('spin');
        }, 400);
    });

    document.addEventListener('keydown', event => {
        if (!selected) return;
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key.length === 1 && event.location !== 3) {
            assignKey(selected, event.key.toUpperCase(), event.code);
            event.preventDefault();
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            assignKey(selected, '', -1);
            event.preventDefault();
        }
    });
}

export function getKeybinds() {
    const out = {};
    for (const { keyId, code } of controls) out[keyId] = code === -1 ? null : code;
    return out;
}

export function getKeyCode(keyId) {
    const control = controls.find(c => c.keyId === keyId);
    return control && control.code !== -1 ? control.code : null;
}

export function getKeyName(keyId) {
    const control = controls.find(c => c.keyId === keyId);
    if (control) return control.keyName || "";
    const def = DEFS[keyId];
    if (!def || !def[0]) return "";
    const custom = bindings[keyId];
    if (custom && custom[0]) return custom[0];
    return def[0];
}

export function isEditingKeybind() {
    return selected !== null;
}
