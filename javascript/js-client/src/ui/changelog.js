const CHANGELOG_URL = "https://arras.io/CHANGELOG.md";

const CATEGORY_MAP = {
    "Announcement": "announcement",
    "Balance": "balance",
    "Balance Update": "balance-update",
    "Balance Update Details": "balance",
    "Event": "event",
    "Event Poll": "poll",
    "Gamemode": "event",
    "Gamemode Poll": "poll",
    "Patch": "patch",
    "Poll": "poll",
    "Update": "update",
};

function parseChangelog(text) {
    const sections = [];
    let current = null;

    for (const line of text.split("\n")) {
        if (line.length === 0) continue;
        const first = line.charAt(0);
        if (first === "#") {
            if (current) sections.push(current);
            current = [line.slice(1).trim()];
        } else if (first === "-") {
            if (current) current.push(line.slice(1).trim());
        } else {
            if (current && current.length > 0) {
                current[current.length - 1] += " " + line.trim();
            }
        }
    }
    if (current) sections.push(current);
    return sections;
}

function renderSection(parts) {
    const titleRaw = parts[0] || "";
    const match = titleRaw.match(/^([A-Za-z ]+[A-Za-z])\s*\[([0-9\-]+)\]\s*(.+)?$/);
    const name = match ? match[1] : titleRaw;
    const dateStr = match ? match[2] : null;
    const extra = match ? match[3] : null;

    const category = CATEGORY_MAP[name] || null;
    const div = document.createElement("div");
    if (category) div.classList.add(category);

    const b = document.createElement("b");
    const labelParts = [name];
    if (dateStr) {
        const ms = +new Date(dateStr + "T00:00:00Z") + 252e5;
        labelParts.push(new Date(ms).toLocaleDateString("default", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
        }));
    }
    if (extra) labelParts.push(extra);
    b.innerHTML = labelParts.join(" - ");
    div.appendChild(b);

    const ul = document.createElement("ul");
    for (let i = 1; i < parts.length; i++) {
        const li = document.createElement("li");
        li.innerHTML = parts[i];
        ul.appendChild(li);
    }
    div.appendChild(ul);
    return div;
}

function renderChangelog(sections) {
    const container = document.getElementById("patchNotes");
    if (!container) return;
    container.innerHTML = '<div class="optionsHeader">arras.io JS Client</div>';

    const SIX_MONTHS = 157248e5;
    const cutoff = Date.now() - SIX_MONTHS;
    let oldStart = 0;

    for (let i = 0; i < sections.length; i++) {
        const parts = sections[i];
        const titleRaw = parts[0] || "";
        const match = titleRaw.match(/^([A-Za-z ]+[A-Za-z])\s*\[([0-9\-]+)\]\s*(.+)?$/);
        const dateStr = match ? match[2] : null;

        if (dateStr) {
            const ms = +new Date(dateStr + "T00:00:00Z") + 252e5;
            if (ms > Date.now()) continue;
            if (ms < cutoff) {
                oldStart = i;
                break;
            }
        }
        container.appendChild(renderSection(parts));
        oldStart = i + 1;
    }

    if (oldStart < sections.length) {
        const olderDiv = document.createElement("div");
        olderDiv.innerHTML =
            '<div class="optionsHeader">Older Changelogs</div>' +
            '<a class="view-older-changelogs" href="javascript:;">Click here to load changelogs more than 6 months old.</a>';
        container.appendChild(olderDiv);
        const link = olderDiv.querySelector(".view-older-changelogs");
        link.addEventListener("click", () => {
            olderDiv.remove();
            for (let i = oldStart; i < sections.length; i++) {
                container.appendChild(renderSection(sections[i]));
            }
        });
    }
}

export async function loadChangelog() {
    try {
        const res = await fetch(CHANGELOG_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error(res.statusText);
        const text = await res.text();
        const sections = parseChangelog(text);
        renderChangelog(sections);
    } catch (err) {
        console.error("[client] failed to load changelog:", err);
    }
}
