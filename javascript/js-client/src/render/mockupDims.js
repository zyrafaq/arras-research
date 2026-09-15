const SIDE_MAX = 16;
const LAZY_REAL_SIZES = [1, 1, 1];
for (let i = 3; i < 17; i++) {
    const circum = (2 * Math.PI) / i;
    LAZY_REAL_SIZES.push(Math.sqrt(circum * (1 / Math.sin(circum))));
}

function rounder(v) {
    return Math.round(v * 1e3) / 1e3;
}

function circumcircle(p1, p2, p3) {
    const x1 = rounder(p1[0]), y1 = rounder(p1[1]);
    const x2 = rounder(p2[0]), y2 = rounder(p2[1]);
    let x3 = rounder(p3[0]), y3 = rounder(p3[1]);
    if (x3 === x1 || x3 === x2) x3 += 1e-5;
    const numer1 = x3 ** 2 + y3 ** 2 - x1 ** 2 - y1 ** 2;
    const numer2 = x2 ** 2 + y2 ** 2 - x1 ** 2 - y1 ** 2;
    const factorX1 = 2 * x2 - 2 * x1;
    const factorX2 = 2 * x3 - 2 * x1;
    const factorY1 = 2 * y1 - 2 * y2;
    const factorY2 = 2 * y1 - 2 * y3;
    const y = (numer1 * factorX1 - numer2 * factorX2) / (factorY1 * factorX2 - factorY2 * factorX1);
    const x = ((y - y3) ** 2 - (y - y1) ** 2 - x1 ** 2 + x3 ** 2) / factorX2;
    const r = Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
    return { x, y, r };
}

function welzlMEC(P, R) {
    if (P.length === 0 || R.length === 3) {
        if (R.length === 0) return { x: 0, y: 0, r: 0 };
        if (R.length === 1) return { x: R[0][0], y: R[0][1], r: 0 };
        if (R.length === 2) {
            const cx = (R[0][0] + R[1][0]) / 2, cy = (R[0][1] + R[1][1]) / 2;
            return { x: cx, y: cy, r: Math.hypot(R[0][0] - R[1][0], R[0][1] - R[1][1]) / 2 };
        }
        return circumcircle(R[0], R[1], R[2]);
    }
    const p = P[P.length - 1];
    const d = welzlMEC(P.slice(0, -1), R);
    if (Math.hypot(p[0] - d.x, p[1] - d.y) <= d.r + 1e-10) return d;
    return welzlMEC(P.slice(0, -1), [...R, p]);
}

function collectEndpoints(entity, getMockup, endPoints, x = 0, y = 0, angle = 0, scale = 1) {
    const shape = entity.shape;
    if (Array.isArray(shape)) {
        for (const pt of shape) endPoints.push([x + pt[0] * scale, y + pt[1] * scale]);
    } else if (shape < 3 || shape >= SIDE_MAX) {
        for (let i = 0; i < SIDE_MAX; i++) {
            const theta = ((Math.PI * 2) / SIDE_MAX) * i;
            endPoints.push([x + Math.cos(theta) * scale, y + Math.sin(theta) * scale]);
        }
    } else {
        const numSides = Math.floor(shape);
        const angleOffset = (shape % 1) * 2 * Math.PI;
        for (let i = 0; i < numSides; i++) {
            const theta = ((2 * Math.PI) / numSides) * i + angleOffset;
            endPoints.push([
                x + Math.cos(theta) * scale * LAZY_REAL_SIZES[numSides],
                y + Math.sin(theta) * scale * LAZY_REAL_SIZES[numSides],
            ]);
        }
    }
    for (const g of entity.guns || []) {
        const widths = g.aspect > 0
            ? [(g.width * g.aspect) / 2, g.width / 2]
            : [g.width / 2, (-g.width * g.aspect) / 2];
        const sinT = Math.sin((g.angle || 0) + angle);
        const cosT = Math.cos((g.angle || 0) + angle);
        const offX = (g.x || 0) * cosT - (g.y || 0) * sinT;
        const offY = (g.x || 0) * sinT + (g.y || 0) * cosT;
        const local = [
            [0, widths[1]],
            [g.length || 0, widths[0]],
            [g.length || 0, -widths[0]],
            [0, -widths[1]],
        ];
        for (const [px, py] of local) {
            endPoints.push([
                x + (px * cosT - py * sinT + offX) * scale,
                y + (px * sinT + py * cosT + offY) * scale,
            ]);
        }
    }
    for (const t of entity.turrets || []) {
        const tm = getMockup(t.mockupIndex);
        if (!tm) continue;
        const trueAngle = angle + (t.angle || 0);
        const xShift = (t.offset || 0) * Math.cos((t.direction || 0) + trueAngle);
        const yShift = (t.offset || 0) * Math.sin((t.direction || 0) + trueAngle);
        collectEndpoints(tm, getMockup, endPoints,
            x + xShift * scale, y + yShift * scale, trueAngle, (t.scale || 1) * scale);
    }
}

export function computeMockupPosition(mockup, getMockup) {
    const endPoints = [];
    collectEndpoints(mockup, getMockup, endPoints);
    for (let i = endPoints.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [endPoints[i], endPoints[j]] = [endPoints[j], endPoints[i]];
    }
    const { x, y, r } = welzlMEC(endPoints, []);
    return { axis: Math.max(r * 2, 0.001), middle: { x, y } };
}
