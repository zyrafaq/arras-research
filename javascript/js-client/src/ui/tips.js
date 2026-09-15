const TIPS_URL = new URL("./tips.txt", import.meta.url).href;

let tips = [];

export async function loadTips() {
    try {
        const res = await fetch(TIPS_URL);
        if (!res.ok) throw new Error(res.statusText);
        const text = await res.text();
        tips = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    } catch (err) {
        console.error("[client] failed to load tips:", err);
        tips = [];
    }
}

export function randomTip() {
    if (tips.length === 0) return "";
    return tips[Math.floor(Math.random() * tips.length)];
}
