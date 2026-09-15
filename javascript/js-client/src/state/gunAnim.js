
const TARGET_FRAME_TIME = 33.33;
const BASE_DECAY = 0.2;
const FIRE_IMPULSE_DIVISOR = 20;
const DEFAULT_POWER = 15;

function physicsGun(g, dt) {
    g.isUpdated = true;
    if (g.motion || g.position) {
        const scaledDt = dt / TARGET_FRAME_TIME;
        g.motion -= BASE_DECAY * g.position * scaledDt;
        g.position += g.motion * scaledDt;
        if (g.position < 0) {
            g.position = 0;
            g.motion = -g.motion;
        }
        if (g.motion > 0) {
            g.motion *= Math.pow(0.5, scaledDt);
        }
    }
}

export function createGunContainer(n) {
    const guns = [];
    for (let i = 0; i < n; i++) {
        guns.push({
            motion: 0,
            position: 0,
            isUpdated: true,
        });
    }
    return {
        length: n,
        getPositions() {
            return guns.map(g => g.position);
        },
        fire(i, power) {
            if (i < 0 || i >= guns.length) return;
            const g = guns[i];
            const p = (power !== undefined && power > 0) ? power : DEFAULT_POWER;
            if (g.isUpdated) {
                g.motion += Math.sqrt(p) / FIRE_IMPULSE_DIVISOR;
            }
            g.isUpdated = false;
        },
        update(dt) {
            for (const g of guns) {
                physicsGun(g, dt);
            }
        },
    };
}
