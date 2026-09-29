// Minimal PNG encoder / pixel canvas, using only Node built-ins.
import zlib from "node:zlib";

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(buffer) {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
        crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([length, typeAndData, crc]);
}

/** Encodes an RGBA image (8 bits per channel, filter 0 on every scanline). */
export function encodePng(width, height, rgba) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // color type: RGBA
    header[10] = 0; // compression
    header[11] = 0; // filter
    header[12] = 0; // interlace
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Parses "#rrggbb" into [r, g, b, a]. */
export function col(hex, alpha = 255) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, alpha];
}

/** Multiplies the RGB channels of a color (factor > 1 lightens). */
export function shade(color, factor) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return [clamp(color[0] * factor), clamp(color[1] * factor), clamp(color[2] * factor), color[3]];
}

export function withAlpha(color, alpha) {
    return [color[0], color[1], color[2], alpha];
}

export class Img {
    constructor(width, height) {
        this.w = width;
        this.h = height;
        this.data = new Uint8ClampedArray(width * height * 4);
    }

    /** Alpha-composites a color over a pixel ("source over"). */
    px(x, y, color) {
        x = Math.floor(x);
        y = Math.floor(y);
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
            return;
        }
        const d = this.data;
        const i = (y * this.w + x) * 4;
        const sa = (color[3] ?? 255) / 255;
        if (sa <= 0) {
            return;
        }
        const da = d[i + 3] / 255;
        const oa = sa + da * (1 - sa);
        d[i] = (color[0] * sa + d[i] * da * (1 - sa)) / oa;
        d[i + 1] = (color[1] * sa + d[i + 1] * da * (1 - sa)) / oa;
        d[i + 2] = (color[2] * sa + d[i + 2] * da * (1 - sa)) / oa;
        d[i + 3] = oa * 255;
    }

    rect(x, y, w, h, color) {
        for (let j = Math.max(0, Math.floor(y)); j < Math.min(this.h, Math.floor(y + h)); j++) {
            for (let i = Math.max(0, Math.floor(x)); i < Math.min(this.w, Math.floor(x + w)); i++) {
                this.px(i, j, color);
            }
        }
    }

    frame(x, y, w, h, color) {
        this.rect(x, y, w, 1, color);
        this.rect(x, y + h - 1, w, 1, color);
        this.rect(x, y + 1, 1, h - 2, color);
        this.rect(x + w - 1, y + 1, 1, h - 2, color);
    }

    circle(cx, cy, r, color) {
        for (let j = Math.floor(cy - r - 1); j <= Math.ceil(cy + r); j++) {
            for (let i = Math.floor(cx - r - 1); i <= Math.ceil(cx + r); i++) {
                const dx = i + 0.5 - cx;
                const dy = j + 0.5 - cy;
                if (dx * dx + dy * dy <= r * r) {
                    this.px(i, j, color);
                }
            }
        }
    }

    ring(cx, cy, r, thickness, color) {
        for (let j = Math.floor(cy - r - 1); j <= Math.ceil(cy + r); j++) {
            for (let i = Math.floor(cx - r - 1); i <= Math.ceil(cx + r); i++) {
                const dx = i + 0.5 - cx;
                const dy = j + 0.5 - cy;
                const d2 = dx * dx + dy * dy;
                if (d2 <= r * r && d2 > (r - thickness) * (r - thickness)) {
                    this.px(i, j, color);
                }
            }
        }
    }

    /** Adds random brightness noise to the opaque pixels of a rectangle. */
    noise(random, amount, x = 0, y = 0, w = this.w, h = this.h) {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                const k = (j * this.w + i) * 4;
                if (this.data[k + 3] === 0) {
                    continue;
                }
                const delta = (random() - 0.5) * 2 * amount;
                this.data[k] += delta;
                this.data[k + 1] += delta;
                this.data[k + 2] += delta;
            }
        }
    }

    /** Returns a copy rotated clockwise by `quarterTurns` * 90 degrees (square images only). */
    rotated(quarterTurns) {
        let current = this;
        for (let q = 0; q < ((quarterTurns % 4) + 4) % 4; q++) {
            const next = new Img(current.h, current.w);
            for (let y = 0; y < current.h; y++) {
                for (let x = 0; x < current.w; x++) {
                    // Clockwise: (x, y) -> (h - 1 - y, x)
                    const src = (y * current.w + x) * 4;
                    const dst = (x * next.w + (current.h - 1 - y)) * 4;
                    for (let c = 0; c < 4; c++) {
                        next.data[dst + c] = current.data[src + c];
                    }
                }
            }
            current = next;
        }
        return current === this ? this.copy() : current;
    }

    copy() {
        const clone = new Img(this.w, this.h);
        clone.data.set(this.data);
        return clone;
    }

    /** Alpha-composites another image at (dx, dy). */
    blit(src, dx, dy, sx = 0, sy = 0, sw = src.w, sh = src.h) {
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const k = ((sy + y) * src.w + sx + x) * 4;
                const a = src.data[k + 3];
                if (a === 0) {
                    continue;
                }
                this.px(dx + x, dy + y, [src.data[k], src.data[k + 1], src.data[k + 2], a]);
            }
        }
    }

    /** Box-filter downscale by an integer factor. */
    downscale(factor) {
        const out = new Img(Math.floor(this.w / factor), Math.floor(this.h / factor));
        const n = factor * factor;
        for (let y = 0; y < out.h; y++) {
            for (let x = 0; x < out.w; x++) {
                let r = 0;
                let g = 0;
                let b = 0;
                let a = 0;
                for (let j = 0; j < factor; j++) {
                    for (let i = 0; i < factor; i++) {
                        const k = ((y * factor + j) * this.w + x * factor + i) * 4;
                        const alpha = this.data[k + 3];
                        r += this.data[k] * alpha;
                        g += this.data[k + 1] * alpha;
                        b += this.data[k + 2] * alpha;
                        a += alpha;
                    }
                }
                const k = (y * out.w + x) * 4;
                if (a > 0) {
                    out.data[k] = r / a;
                    out.data[k + 1] = g / a;
                    out.data[k + 2] = b / a;
                }
                out.data[k + 3] = a / n;
            }
        }
        return out;
    }

    toPng() {
        return encodePng(this.w, this.h, this.data);
    }
}
