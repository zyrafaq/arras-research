import { fetchStatus } from "../net/status.js";
import { formatMode } from "./modes.js";

const LAST_NAME_KEY = "arrasLastName";
const TOKEN_KEY = "arrasToken";

const KNOWN_MODE_NAMES = [
    ["labyrinth", "Labyrinth"],
    ["stronghold", "Stronghold"],
    ["blitz", "Blitz"],
    ["manhunt", "Manhunt"],
    ["citadel", "Citadel"],
    ["fortress", "Fortress"],
    ["bunker", "Bunker"],
    ["forge", "Forge"],
    ["nexus", "Nexus"],
    ["limbo", "Limbo"],
    ["mothership", "Mothership"],
    ["domination", "Domination"],
    ["tartarus", "Tartarus"],
    ["assault", "Assault"],
    ["siege", "Siege"],
    ["tag", "Tag"],
    ["pandemic", "Pandemic"],
    ["soccer", "Soccer"],
    ["grudge", "Grudge Ball"],
    ["elimination", "Elimination"],
    ["capture", "Capture the Flag"],
    ["sandbox", "Sandbox"],
    ["dreadnoughts", "Dreadnoughts"],
];

const REGION_ORDER = ["US West", "US Central", "Europe", "Asia", "Oceania"];

function deriveRegion(code) {
    if (!code) return "Other";
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
    return "Other";
}

function deriveModeLabel(code) {
    if (!code) return "Unknown";
    const suffix = code.split("-").slice(2).join("-").trim();
    const formatted = formatMode(suffix);
    if (formatted) return formatted;
    const lower = suffix.toLowerCase();
    for (const [key, label] of KNOWN_MODE_NAMES) {
        if (lower.includes(key)) return label;
    }
    return /[a-z0-9]/.test(suffix) ? suffix : "Unknown";
}

export class ServerSelector {
    constructor(onStart) {
        this.onStart = onStart;
        this.servers = [];
        this.selectedHost = null;
        this.availableServers = [];
        this.noServerRow = null;
        this.currentRegionFilter = null;
        this.currentModeFilter = null;
        this.forceVisibleId = null;

        this._bindDOM();
    }

    _bindDOM() {
        this.regionFilterEl = document.getElementById("serverFilterRegion");
        this.modeFilterEl = document.getElementById("serverFilterMode");
        this.tbody = document.getElementById("serverSelectorBody");
        this.startBtn = document.getElementById("startButton");
        this.nameInput = document.getElementById("optName");

        this.nameInput.value = localStorage.getItem(LAST_NAME_KEY) || "";

        this.startBtn.addEventListener("click", () => this._onStart());

        this.nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (!this.startBtn.disabled) this._onStart();
            }
        });

        this.tbody.addEventListener("click", (e) => {
            const tr = e.target.closest("tr");
            if (!tr || tr.classList.contains("message")) return;
            this._selectRow(tr);
        });
        this.tbody.addEventListener("dblclick", (e) => {
            const tr = e.target.closest("tr");
            if (!tr || tr.classList.contains("message")) return;
            this._selectRow(tr);
            if (!this.startBtn.disabled) this.startBtn.click();
        });

        window.addEventListener("hashchange", () => {
            const { serverId, teamCode } = this._extractHash();
            if (teamCode) this._pendingTeamCode = teamCode;
            if (!serverId) return;
            const row = this.tbody.querySelector(`tr[data-id="${CSS.escape(serverId)}"]`);
            if (row && !row.classList.contains("selected")) this._selectRow(row);
        });
    }

    _extractHash() {
        const raw = location.hash.slice(1);
        if (!raw) return { serverId: null, teamCode: null };
        let best = null;
        for (const s of this.availableServers) {
            const id = s.id;
            if (id && raw.startsWith(id) && (!best || id.length > best.length)) best = id;
        }
        if (best) return { serverId: best, teamCode: raw.slice(best.length) || null };
        return { serverId: null, teamCode: raw };
    }

    show() {
        document.getElementById("mainWrapper").style.display = "";
        document.getElementById("gameAreaWrapper").style.display = "none";
        const arrow = document.getElementById("optionsArrow");
        if (arrow) { arrow.style.display = "none"; arrow.classList.remove("expanded"); }
        const playersBtn = document.getElementById("playersArrowBtn");
        if (playersBtn) playersBtn.style.display = "none";
        this.refresh();
    }

    hide() {
        document.getElementById("mainWrapper").style.display = "none";
        const arrow = document.getElementById("optionsArrow");
        if (arrow) { arrow.style.display = ""; arrow.classList.remove("expanded"); }
    }

    async refresh() {
        this.tbody.innerHTML = "";
        this.startBtn.disabled = true;
        const loading = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.className = "tdCenter";
        td.textContent = "Loading server list...";
        loading.appendChild(td);
        loading.classList.add("message");
        this.tbody.appendChild(loading);

        try {
            const { servers, url } = await fetchStatus();
            this.servers = servers.filter((s) => s.online !== false);
            this._render();
            this._initFilters();
            this._restoreSelection();
        } catch (e) {
            this.tbody.innerHTML = "";
            const err = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 3;
            td.className = "tdCenter";
            td.textContent = e.message;
            err.appendChild(td);
            err.classList.add("message");
            this.tbody.appendChild(err);
        }
    }

    _render() {
        this.tbody.innerHTML = "";
        this.availableServers = [];

        const regionRank = (code) => {
            const idx = REGION_ORDER.indexOf(deriveRegion(code));
            return idx === -1 ? REGION_ORDER.length : idx;
        };
        const ordered = this.servers
            .map((s, i) => ({ s, i }))
            .sort((a, b) => regionRank(a.s.code) - regionRank(b.s.code) || a.i - b.i)
            .map((e) => e.s);

        for (const s of ordered) {
            const tr = document.createElement("tr");
            const region = deriveRegion(s.code);
            const modeFormatted = deriveModeLabel(s.code);
            const clients = s.clients ?? 0;
            const maxClients = s.maxClients || 0;
            const playerStr = `${clients}/80`;

            const td1 = document.createElement("td");
            td1.textContent = region;

            const td2 = document.createElement("td");
            td2.classList.add("tdCenter");
            td2.textContent = modeFormatted;

            const td3 = document.createElement("td");
            td3.textContent = playerStr;

            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.appendChild(td3);

            tr.title = `${s.host || ""} - #${s.name || ""} (${modeFormatted})`;
            tr.dataset.host = s.host || "";
            tr.dataset.id = s.name || "";
            tr.dataset.region = region;
            tr.dataset.mode = modeFormatted;
            tr.dataset.modeFormatted = modeFormatted.toLowerCase();
            const restricted = !!s.hidden || modeFormatted.toLowerCase().includes("sandbox");
            if (restricted) {
                tr.dataset.restricted = "1";
                tr.style.display = "none";
            }

            if (s.featured) tr.classList.add("featured");

            this.tbody.appendChild(tr);
            tr._record = s;
            this.availableServers.push({
                element: tr, region, mode: modeFormatted, host: s.host, id: tr.dataset.id,
                code: s.code || "", hidden: !!s.hidden,
            });
        }

        const noMatch = document.createElement("tr");
        noMatch.classList.add("message");
        noMatch.style.display = "none";
        const ntd = document.createElement("td");
        ntd.colSpan = 3;
        ntd.className = "tdCenter";
        ntd.textContent = "No Server Matches";
        noMatch.appendChild(ntd);
        this.tbody.appendChild(noMatch);
        this.noServerRow = noMatch;

        if (!this.selectedHost && this.servers.length > 0 && !this._extractHash().serverId) {
            const visible = [...this.tbody.querySelectorAll("tr[data-host]")]
                .filter((r) => r.style.display !== "none");
            if (visible.length > 0) {
                this._selectRow(visible[(Math.random() * visible.length) | 0], false);
            }
        }
    }

    _initFilters() {
        this._createFilter(this.regionFilterEl, [
            { name: "All", filter: () => true },
            { name: "USA", filter: (s) => s.region.startsWith("US") },
            { name: "Europe", filter: (s) => s.region === "Europe" },
            { name: "Asia", filter: (s) => s.region === "Asia" },
            { name: "Oceania", filter: (s) => s.region === "Oceania" },
        ]);
        this._createFilter(this.modeFilterEl, [
            { name: "All", filter: () => true },
            { name: "FFA", filter: (s) => s.mode.includes("FFA") },
            { name: "Squads", filter: (s) => s.mode.includes("Duos") || s.mode.includes("Squads") || s.mode.includes("Teams") },
            { name: "Maze", filter: (s) => s.mode.includes("Maze") },
            { name: "Sandbox", filter: (s) => s.mode.includes("Sandbox") },
            { name: "Other", filter: (s) => {
                const m = s.mode.toLowerCase();
                return !m.includes("ffa") && !m.includes("duos") && !m.includes("squads")
                    && !m.includes("teams") && !m.includes("maze") && !m.includes("sandbox");
            }},
        ]);
    }

    _createFilter(container, items) {
        container.innerHTML = "";
        container.style.display = "";
        let active = null;
        const filters = [() => true];

        for (const item of items) {
            const span = document.createElement("span");
            span.textContent = item.name;
            if (active === null) {
                active = span;
                span.classList.add("active");
            }
            span.addEventListener("click", () => {
                if (span === active) return;
                active.classList.remove("active");
                active = span;
                span.classList.add("active");
                this._applyFilters();
            });
            container.appendChild(span);
        }

        container._getActiveFilter = () => {
            const idx = [...container.children].indexOf(active);
            return items[idx]?.filter || (() => true);
        };
    }

    _isSandboxActive() {
        for (const span of this.modeFilterEl.children) {
            if (span.classList.contains("active")) return span.textContent === "Sandbox";
        }
        return false;
    }

    _activateSandboxFilter() {
        for (const span of this.modeFilterEl.children) {
            if (span.textContent === "Sandbox" && !span.classList.contains("active")) {
                span.click();
                break;
            }
        }
    }

    _applyFilters() {
        const regionF = this.regionFilterEl._getActiveFilter?.() || (() => true);
        const modeF = this.modeFilterEl._getActiveFilter?.() || (() => true);
        const sandboxOnly = this._isSandboxActive();
        let anyVisible = false;

        for (const s of this.availableServers) {
            const forced = s.id && s.id === this.forceVisibleId;
            const sandboxMode = s.element.dataset.modeFormatted?.includes("sandbox");
            const visible = forced
                || (!s.hidden && (sandboxOnly || !sandboxMode) && regionF(s) && modeF(s));
            s.element.style.display = visible ? "" : "none";
            if (visible) anyVisible = true;
        }
        if (this.noServerRow) {
            this.noServerRow.style.display = anyVisible ? "none" : "";
        }
    }

    _restoreSelection() {
        const { serverId, teamCode } = this._extractHash();
        if (teamCode) this._pendingTeamCode = teamCode;
        if (serverId) {
            const row = this.tbody.querySelector(`tr[data-id="${CSS.escape(serverId)}"]`);
            if (row) this._selectRow(row);
        }
    }

    _selectRow(tr, updateHash = true) {
        this.tbody.querySelectorAll("tr.selected").forEach((r) => r.classList.remove("selected"));
        tr.classList.add("selected");
        this.selectedHost = tr.dataset.host;
        this.selectedRecord = tr._record || null;
        this._pendingTeamCode = "";
        const forcedId = tr.dataset.restricted === "1" ? (tr.dataset.id || null) : null;
        if (forcedId !== this.forceVisibleId) {
            this.forceVisibleId = forcedId;
            if (forcedId && tr.dataset.modeFormatted?.includes("sandbox")) {
                this._activateSandboxFilter();
            }
            this._applyFilters();
        } else if (tr.style.display === "none") {
            tr.style.display = "";
        }
        if (updateHash) {
            const serverId = tr.dataset.id || "";
            if (serverId && location.hash.slice(1) !== serverId) {
                history.replaceState(null, "", "#" + serverId);
            }
        }
        this.startBtn.disabled = false;
    }

    _onStart() {
        if (!this.selectedHost) return;
        localStorage.setItem(LAST_NAME_KEY, this.nameInput.value);
        const token = document.getElementById("playerKeyInput")?.value?.trim() || "";
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
        const { teamCode } = this._extractHash();
        this.onStart({
            host: this.selectedHost,
            name: this.nameInput.value,
            party: teamCode || this._pendingTeamCode || "",
            server: this.selectedRecord || null,
        });
    }

    getToken() {
        return localStorage.getItem(TOKEN_KEY) || "";
    }
}
