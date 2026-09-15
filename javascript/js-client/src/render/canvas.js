export class Canvas {
    constructor() {
        this.cv = document.getElementById("gameCanvas");
        this.ctx = this.cv.getContext("2d");
        this.width = 0;
        this.height = 0;
        this.dpr = 1;
        this.ratio = 1;
        this._resize();
        window.addEventListener("resize", () => this._resize());
    }

    _resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.dpr = dpr;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.cv.width = Math.round(this.width * dpr);
        this.cv.height = Math.round(this.height * dpr);
        this.ratio = Math.max(this.width, (16 * this.height) / 9) / 2000;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    beginCamera(worldX, worldY, fov) {
        const view = Math.max(fov, 1);
        this.ratio = Math.max(this.width, (16 * this.height) / 9) / view;
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(this.width / 2, this.height / 2);
        ctx.scale(this.ratio, this.ratio);
        ctx.translate(-worldX, -worldY);
    }

    endCamera() {
        this.ctx.restore();
    }

    screenToWorld(sx, sy, worldX, worldY, fov) {
        const view = Math.max(fov, 1);
        const r = Math.max(this.width, (16 * this.height) / 9) / view;
        return {
            x: (sx - this.width / 2) / r + worldX,
            y: (sy - this.height / 2) / r + worldY,
        };
    }
}
