export function advancedSmoothBar(a, speed = 2, d = 3) {
    let value = a;
    let display = a;
    let S = a;
    let time = Date.now();
    const get = () => {
        const t = (Date.now() - time) / 1e3;
        display = t >= speed ? value : S + (value - S) * Math.pow(t / speed, 1 / d);
        return display;
    };
    return {
        set(a) {
            if (value !== a) {
                S = get();
                value = a;
                time = Date.now();
            }
        },
        get,
        force(val) { display = value = S = val; time = Date.now(); },
    };
}

let animFps = 60;
export function setAnimFps(fps) {
    animFps = Math.max(20, fps);
}

export function lerpSmoothBar(value, lerpValue = 0.05) {
    let display = value;
    return {
        set(val) { value = val; },
        get(round = false) {
            const x = lerpValue / (animFps / 120);
            display += x * (value - display);
            if (round && Math.abs(value - display) < 0.1) display = value;
            return display;
        },
        force(val) { display = value = val; },
    };
}
