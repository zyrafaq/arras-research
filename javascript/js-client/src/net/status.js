const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const STATUS_CANDIDATES = [
    "https://qrp6ujau11f36bnm-c.uvwx.xyz:8443/2222/status",
    "https://ak7oqfc2u4qqcu6i-c.uvwx.xyz:8443/2222/status",
    "https://c.uvwx.xyz:8443/2222/status",
    "https://arras.io/status",
];

function statusUrls() {
    const override = localStorage.getItem("arrasStatusUrl");
    return (override ? [override] : []).concat(STATUS_CANDIDATES);
}

async function fetchOne(url) {
    const response = await fetch(url, {
        headers: {
            "Accept": "*/*",
        },
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export function normalizeStatus(data) {
    let servers;
    if (data == null) return [];
    if (typeof data === "object" && !Array.isArray(data)) {
        servers = data.status !== undefined ? data.status : data;
    } else {
        servers = data;
    }
    const items = [];
    if (Array.isArray(servers)) {
        for (const rec of servers) items.push(typeof rec === "object" ? rec : { name: String(rec) });
    } else if (typeof servers === "object") {
        for (const [name, value] of Object.entries(servers)) {
            if (value && typeof value === "object") {
                const rec = { ...value };
                if (!rec.name) rec.name = name;
                items.push(rec);
            } else {
                items.push({ name, host: String(value) });
            }
        }
    }
    return items.filter((s) => s.host || s.name);
}

export async function fetchClientCount(host, log = console) {
    const baseUrl = host.replace(/\/.*$/, "");
    try {
        const response = await fetch(`https://${baseUrl}/clientCount`, {
            headers: { "Accept": "*/*" },
            cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const n = parseInt((await response.text()).trim(), 10);
        if (!Number.isFinite(n)) throw new Error("bad clientCount payload");
        return n;
    } catch (e) {
        log.debug?.(`clientCount fetch failed for ${baseUrl}: ${e.message}`);
        throw e;
    }
}

export async function fetchStatus(log = console) {
    const errors = [];
    for (const url of statusUrls()) {
        try {
            log.debug?.(`status: trying ${url}`);
            const data = await fetchOne(url);
            const servers = normalizeStatus(data);
            if (servers.length) return { servers, url };
            errors.push(`${url}: empty list`);
        } catch (e) {
            errors.push(`${url}: ${e.message}`);
        }
    }
    throw new Error("no status endpoint reachable:\n  " + errors.join("\n  "));
}
