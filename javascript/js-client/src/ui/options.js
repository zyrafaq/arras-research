const STORAGE_KEY = 'arrasOptions';

const DEFAULTS = {
    playerNames: true,
    chatMessages: true,
    playerScores: true,
    healthBars: true,
    backgroundGrid: true,
    separateShieldBar: false,
    sharpTraps: false,
    curvyTraps: false,
    sharpPolygons: false,
    tankSkins: false,
    upgrades: true,
    leaderboard: true,
    playerBars: true,
    minimap: true,
    killBar: false,
    extraInfo: true,
    chatFilter: 'regular',
    smoothCamera: false,
    fadingAnimation: true,
    autoLevelUp: true,
    incognitoMode: false,
    unscaledOldSpawnPanel: false,
    performance: 'auto',
    lowResolution: false,
};

const DOM_MAP = {
    playerNames:          { id: 'optRenderNames',     type: 'checkbox' },
    chatMessages:         { id: 'optChatMessages',    type: 'checkbox' },
    playerScores:         { id: 'optRenderScores',    type: 'checkbox' },
    healthBars:           { id: 'optRenderHealth',    type: 'checkbox' },
    backgroundGrid:       { id: 'optNoGrid',          type: 'checkbox' },
    separateShieldBar:    { id: 'optSeparateShield',  type: 'checkbox' },
    sharpTraps:           { id: 'optPointy',          type: 'checkbox' },
    curvyTraps:           { id: 'optCurvyTraps',      type: 'checkbox' },
    sharpPolygons:        { id: 'optSharpPolygons',   type: 'checkbox' },
    tankSkins:            { id: 'optTankSkins',       type: 'checkbox' },
    upgrades:             { id: 'optRenderGui',       type: 'checkbox' },
    leaderboard:          { id: 'optRenderLeaderboard', type: 'checkbox' },
    playerBars:           { id: 'optPlayerBars',      type: 'checkbox' },
    minimap:              { id: 'optRenderMinimap',   type: 'checkbox' },
    killBar:              { id: 'optKillBar',         type: 'checkbox' },
    extraInfo:            { id: 'optExtraInfo',       type: 'checkbox' },
    chatFilter:           { id: 'optChatFilter',      type: 'select' },
    smoothCamera:         { id: 'smoothCamera',       type: 'checkbox' },
    fadingAnimation:      { id: 'optFading',          type: 'checkbox' },
    autoLevelUp:          { id: 'autoLevelUp',        type: 'checkbox' },
    incognitoMode:        { id: 'optIncognito',       type: 'checkbox' },
    unscaledOldSpawnPanel:{ id: 'optUnscaledSpawn',   type: 'checkbox' },
    performance:          { id: 'optPerformance',     type: 'select' },
    lowResolution:        { id: 'optLowResolution',   type: 'checkbox' },
};

let settings = { ...DEFAULTS };
let listeners = [];

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && raw.startsWith('{')) {
            const saved = JSON.parse(raw);
            Object.assign(settings, DEFAULTS, saved);
        }
    } catch (e) {}
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}
}

function notify() {
    for (const fn of listeners) fn(settings);
}

function readFromDOM() {
    for (const [key, map] of Object.entries(DOM_MAP)) {
        const el = document.getElementById(map.id);
        if (!el) continue;
        if (map.type === 'checkbox') {
            const val = el.checked;
            settings[key] = map.invert ? !val : val;
        } else if (map.type === 'select') {
            settings[key] = el.value;
        }
    }
}

function writeToDOM() {
    for (const [key, map] of Object.entries(DOM_MAP)) {
        const el = document.getElementById(map.id);
        if (!el) continue;
        if (map.type === 'checkbox') {
            el.checked = map.invert ? !settings[key] : settings[key];
        } else if (map.type === 'select') {
            el.value = settings[key];
        }
    }
}

export function initOptions() {
    load();
    writeToDOM();
    readFromDOM();

    for (const [key, map] of Object.entries(DOM_MAP)) {
        const el = document.getElementById(map.id);
        if (!el) continue;
        const event = map.type === 'checkbox' ? 'change' : 'change';
        el.addEventListener(event, () => {
            readFromDOM();
            save();
            notify();
        });
    }
}

export function getSettings() {
    return settings;
}

export function onOptionsChange(fn) {
    listeners.push(fn);
}
