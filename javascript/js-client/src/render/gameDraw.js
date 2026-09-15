import { getColor, mixColors, getBorderColor } from "./color.js";

export function drawPolygon(ctx, sides, x, y, size, color, stroke = true, fill = true) {
    ctx.beginPath();
    if (sides === 0) {
        ctx.arc(x, y, size, 0, Math.PI * 2);
    } else {
        for (let i = 0; i < sides; i++) {
            const angle = ((Math.PI * 2) / sides) * i - Math.PI / 2;
            const px = x + size * Math.cos(angle);
            const py = y + size * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

export function drawBody(ctx, centerX, centerY, radius, sides, angle = 0, borderless = false, fill = true) {
    ctx.beginPath();
    if (sides instanceof Array) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        for (const [sx, sy] of sides) {
            ctx.lineTo(centerX + radius * (sx * dx - sy * dy), centerY + radius * (sy * dx + sx * dy));
        }
    } else if ("string" === typeof sides) {
        return;
    } else {
        angle += sides % 2 ? 0 : Math.PI / sides;
    }
    if (!sides) {
        const fillcolor = ctx.fillStyle;
        const strokecolor = ctx.strokeStyle;
        const borderRadius = ctx.globalAlpha < 1 ? 4 : 2;
        ctx.arc(centerX, centerY, radius + ctx.lineWidth / borderRadius, 0, Math.PI * 2);
        ctx.fillStyle = strokecolor;
        ctx.lineWidth /= 2;
        if (!borderless) {
            if (ctx.globalAlpha === 1) {
                ctx.fill();
            } else {
                ctx.stroke();
            }
        }
        ctx.closePath();
        ctx.beginPath();
        ctx.fillStyle = fillcolor;
        ctx.arc(centerX, centerY, radius * fill, 0, Math.PI * 2);
        if (fill) ctx.fill();
        ctx.closePath();
        return;
    } else if (0 > sides) {
        sides = -sides;
        angle += (sides % 1) * Math.PI * 2;
        sides = Math.floor(sides);
        const dip = 1 - 6 / (sides ** 2);
        ctx.lineWidth *= fill ? 1 : 0.5;
        ctx.moveTo(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
        for (let i = 0; i < sides; i++) {
            const htheta = ((i + 0.5) / sides) * 2 * Math.PI + angle,
                theta = ((i + 1) / sides) * 2 * Math.PI + angle,
                cx = centerX + radius * dip * Math.cos(htheta),
                cy = centerY + radius * dip * Math.sin(htheta),
                px = centerX + radius * Math.cos(theta),
                py = centerY + radius * Math.sin(theta);
            ctx.quadraticCurveTo(cx, cy, px, py);
        }
    } else if (0 < sides) {
        angle += (sides % 1) * Math.PI * 2;
        sides = Math.floor(sides);
        ctx.lineWidth *= fill ? 1 : 0.5;
        for (let i = 0; i < sides; i++) {
            const theta = (i / sides) * 2 * Math.PI + angle;
            ctx.lineTo(centerX + radius * Math.cos(theta), centerY + radius * Math.sin(theta));
        }
    }
    ctx.closePath();
    if (!borderless) ctx.stroke();
    if (fill) ctx.fill();
    ctx.lineJoin = "round";
}

export function drawGun(ctx, x, y, length, height, aspect, angle, borderless = false, fill = true, alpha = 1, strokeWidth = 1, position = 0) {
    const h = aspect > 0 ? [height * aspect, height] : [height, -height * aspect];
    const points = [
        [-position, h[1]],
        [length * 2 - position, h[0]],
        [length * 2 - position, -h[0]],
        [-position, -h[1]],
    ];
    ctx.globalAlpha = alpha;
    const sinT = Math.sin(angle);
    const cosT = Math.cos(angle);
    ctx.beginPath();
    for (const [px, py] of points) {
        const newX = px * cosT - py * sinT + x;
        const newY = px * sinT + py * cosT + y;
        ctx.lineTo(newX, newY);
    }
    ctx.closePath();
    ctx.lineWidth *= strokeWidth;
    ctx.lineWidth *= fill ? 1 : 0.5;
    if (!borderless) ctx.stroke();
    ctx.lineWidth /= fill ? 1 : 0.5;
    if (fill) ctx.fill();
    ctx.globalAlpha = 1;
}

export function drawHealthBar(ctx, x, y, size, health, shield, alpha = 1) {
    if (alpha <= 0) return;
    const barWidth = size * 1.2;
    const barHeight = size * 0.15;
    const barY = y - size / 2 - barHeight - 6;
    const barX = x - barWidth / 2;
    ctx.globalAlpha = alpha;
    const bgH = Math.max(0, Math.min(1, health));
    const bgS = Math.max(0, Math.min(1, shield));
    if (bgS > 0) {
        ctx.fillStyle = getColor("teal");
        ctx.fillRect(barX, barY, barWidth * bgS, barHeight);
    }
    ctx.fillStyle = getColor("grey");
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = getColor("red");
    ctx.fillRect(barX, barY, barWidth * bgH, barHeight);
    ctx.strokeStyle = getColor("black");
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    ctx.globalAlpha = 1;
}

export function drawText(ctx, text, x, y, size, color = getColor("guiwhite"), align = "center", stroke = true, strokeRatio, strokeColor) {
    ctx.save();
    ctx.font = `bold ${size}px Ubuntu, Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    if (stroke) {
        const r = typeof stroke === "number" ? stroke : strokeRatio;
        ctx.strokeStyle = strokeColor || getColor("guiblack");
        ctx.lineWidth = r ? Math.max(1, (size + 1) / r) : Math.max(1, size / 5);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeText(text, x, y);
    }
    ctx.fillText(text, x, y);
    ctx.restore();
}

export function drawGuiRect(ctx, x, y, length, height, stroke = false, fill = true, radius = 0) {
    ctx.beginPath();
    if (radius > 0) {
        ctx.roundRect(x, y, length, height, radius);
    } else {
        ctx.rect(x, y, length, height);
    }
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

export function drawGuiCircle(ctx, x, y, radius, stroke = false, fill = true) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}