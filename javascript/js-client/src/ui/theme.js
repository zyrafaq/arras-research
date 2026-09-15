import {
    themes, setColorTheme, setCustomTheme,
    getCurrentThemeName, parseThemeCode, themeToCode, getColor,
} from "../render/color.js";

const THEME_STORAGE_KEY = "arrasTheme";
const DEFAULT_THEME_CODE = "arras/ABBUxpZ2h0AkNYFHrT27nofueJbf3zgHrbuu+Zw+jr96Skrf///0hISDyky4q8P+A+Qe/HS41q38xmnKenr3Jvb9vb2wAAAAFISEiZAA";

let themeSelect, themeCodeInput, themeStatus, colorGrid;

function updateSwatches() {
    if (!colorGrid) return;
    const swatches = colorGrid.querySelectorAll(".color-swatch");
    for (const swatch of swatches) {
        const colorName = swatch.dataset.color;
        if (colorName) {
            swatch.style.background = getColor(colorName);
        }
    }
}

function applyTheme(name) {
    if (themes[name]) {
        setColorTheme(name);
        saveTheme(name);
        updateSwatches();
        if (themeStatus) themeStatus.textContent = "";
    }
}

function applyCustomTheme(themeObj) {
    setCustomTheme(themeObj);
    saveTheme("custom", themeObj);
    updateSwatches();
    if (themeStatus) themeStatus.textContent = `Applied: ${themeObj.name || "Custom"}${themeObj.author ? " by " + themeObj.author : ""}`;
}

function saveTheme(name, customObj) {
    try {
        const data = { name };
        if (name === "custom" && customObj) {
            data.code = themeToCode(customObj);
            data.custom = customObj;
        }
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
}

function loadTheme() {
    try {
        const raw = localStorage.getItem(THEME_STORAGE_KEY);
        if (!raw) {
            const parsed = parseThemeCode(DEFAULT_THEME_CODE);
            if (parsed) applyCustomTheme(parsed);
            return;
        }
        const data = JSON.parse(raw);
        if (data.name === "custom" && data.custom) {
            applyCustomTheme(data.custom);
            if (themeSelect) themeSelect.value = "normal";
            if (themeCodeInput) themeCodeInput.value = data.code || "";
        } else if (data.name && themes[data.name]) {
            applyTheme(data.name);
            if (themeSelect) themeSelect.value = data.name;
        }
    } catch (e) {}
}

export function initThemeUI() {
    themeSelect = document.getElementById("optThemeName");
    themeCodeInput = document.getElementById("optThemeCode");
    themeStatus = document.getElementById("optThemeStatus");
    colorGrid = document.getElementById("themeColorGrid");

    if (themeSelect) {
        themeSelect.addEventListener("change", () => {
            const name = themeSelect.value;
            if (themes[name]) {
                applyTheme(name);
                if (themeCodeInput) themeCodeInput.value = "";
            }
        });
    }

    if (themeCodeInput) {
        themeCodeInput.addEventListener("change", () => {
            const code = themeCodeInput.value.trim();
            if (!code) {
                applyTheme(themeSelect ? themeSelect.value : "normal");
                return;
            }
            const parsed = parseThemeCode(code);
            if (parsed) {
                applyCustomTheme(parsed);
                if (themeSelect) themeSelect.value = "normal";
            } else {
                if (themeStatus) themeStatus.textContent = "Invalid theme code";
            }
        });
        themeCodeInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                themeCodeInput.dispatchEvent(new Event("change"));
            }
        });
    }

    loadTheme();
    updateSwatches();
}
