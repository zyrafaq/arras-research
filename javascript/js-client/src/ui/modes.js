export const MODIFIERS = { g: "Growth", a: "Arms Race", p: "Portal", o: "Open", m: "Maze", r: "Rock" };
const MODIFIER_ORDER = ["g", "a", "p", "o", "m", "r"];
const TEAM_COUNT = { f: "FFA", d: "Duos", s: "Squads", c: "Clan Wars" };
const WIN_CONDITIONS = {
    d: "Domination", m: "Mothership", a: "Assault", s: "Siege",
    t: "Tag", p: "Pandemic", b: "Soccer", g: "Grudge Ball",
    e: "Elimination", c: "Capture the Flag", z: "Sandbox",
};

const MODE_NAME_TOKENS = [
    ["dreadnoughts", "Dreadnoughts"],
    ["labyrinth", "Labyrinth"],
    ["stronghold", "Stronghold"],
    ["mothership", "Mothership"],
    ["domination", "Domination"],
    ["elimination", "Elimination"],
    ["pandemic", "Pandemic"],
    ["retrograde", "Retrograde"],
    ["blackout", "Blackout"],
    ["halloween", "Halloween"],
    ["outbreak", "Outbreak"],
    ["tartarus", "Tartarus"],
    ["manhunt", "Manhunt"],
    ["citadel", "Citadel"],
    ["fortress", "Fortress"],
    ["sandbox", "Sandbox"],
    ["assault", "Assault"],
    ["blitz", "Blitz"],
    ["bunker", "Bunker"],
    ["limbo", "Limbo"],
    ["nexus", "Nexus"],
    ["forge", "Forge"],
    ["siege", "Siege"],
    ["space", "Space"],
    ["diep", "Diep"],
    ["fast", "Fast"],
].sort((a, b) => b[0].length - a[0].length);

function looksLikeJunk(leftover) {
    return leftover === ""
        || /^[a-z]$/.test(leftover)
        || /^\d+$/.test(leftover)
        || /^x\d+[a-z]?$/.test(leftover);
}

function parseSkeleton(s, requireTeamCount) {
    let i = 0;
    const mods = [];
    let lastRank = -1;
    while (i < s.length) {
        const rank = MODIFIER_ORDER.indexOf(s[i]);
        if (rank === -1 || rank <= lastRank) break;
        mods.push(s[i]);
        lastRank = rank;
        i++;
    }
    let teamCount = null;
    if (requireTeamCount) {
        const ch = s[i];
        if (TEAM_COUNT[ch]) teamCount = TEAM_COUNT[ch];
        else if (ch === "1") teamCount = "1";
        else if (/[2-9]/.test(ch || "")) teamCount = `${ch} Teams`;
        else throw new Error(`missing/invalid team count at ${i} in "${s}"`);
        i++;
    }
    const wins = [];
    for (; i < s.length; i++) {
        const w = WIN_CONDITIONS[s[i]];
        if (!w || wins.includes(w)) break;
        wins.push(w);
    }
    return {
        modifiers: mods.map((m) => MODIFIERS[m]),
        teamCount,
        winConditions: wins,
        leftover: s.slice(i),
    };
}

export function parseMode(id) {
    if (typeof id !== "string" || !id.length) return null;
    let s = id.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!s.length) throw new Error(`empty mode id "${id}"`);

    s = s.replace(/^e\d+/, "");

    const spans = [];
    for (const [key, label] of MODE_NAME_TOKENS) {
        let idx;
        while ((idx = s.indexOf(key)) !== -1) {
            spans.push([idx, idx + key.length, label]);
            s = s.slice(0, idx) + "\u0000".repeat(key.length) + s.slice(idx + key.length);
        }
    }
    spans.sort((a, b) => a[0] - b[0]);
    const names = spans.map(([, , label]) => label);
    const raw = id.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^e\d+/, "");
    const oldSeries = [...raw.matchAll(/olds|old/g)].some(
        (m) => !spans.some(([a, b]) => m.index >= a && m.index < b)
    );
    const skeleton = s.replace(/\u0000+/g, "");

    let parsed = null;
    let strictError = null;
    try {
        parsed = parseSkeleton(skeleton, true);
        if (!looksLikeJunk(parsed.leftover)) {
            parsed = null;
        }
    } catch (e) {
        strictError = e;
    }
    if (!parsed) {
        const loose = parseSkeleton(skeleton, false);
        if (!looksLikeJunk(loose.leftover)) loose.winConditions = [];
        parsed = loose;
    }
    void strictError;

    return {
        modifiers: parsed.modifiers,
        teamCount: parsed.teamCount,
        winConditions: parsed.winConditions,
        names,
        old: oldSeries,
    };
}

export function formatMode(id) {
    try {
        const parsed = parseMode(id);
        if (!parsed) return null;
        const parts = [...parsed.modifiers];
        if (parsed.teamCount && parsed.teamCount !== "1") parts.push(parsed.teamCount);
        parts.push(...parsed.winConditions);
        if (parsed.names.length) {
            const [first, ...rest] = parsed.names;
            parts.push(parsed.old ? `Old ${first}` : first, ...rest);
        }
        return parts.join(" ") || null;
    } catch {
        return null;
    }
}
