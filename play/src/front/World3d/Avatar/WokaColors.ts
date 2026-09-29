import type { AvatarConfig } from "./AvatarConfig";

/** Size of a frame of a Woka spritesheet */
export const WOKA_FRAME_SIZE = 32;

interface Region {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}

/**
 * Regions of the front-facing Woka frame (32x32) holding each part of the character. Wokas are "chibi": a big head
 * (hair on top, face below), then the body, the legs and the feet.
 */
const REGIONS = {
    hair: { x0: 8, x1: 24, y0: 1, y1: 6 },
    skin: { x0: 11, x1: 21, y0: 11, y1: 15 },
    top: { x0: 9, x1: 23, y0: 19, y1: 23 },
    bottom: { x0: 10, x1: 22, y0: 25, y1: 28 },
    shoes: { x0: 9, x1: 23, y0: 29, y1: 31 },
} satisfies Record<string, Region>;

function toHex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The dominant color of a region: colors are grouped in buckets, the average color of the biggest bucket wins.
 * Returns undefined when the region is (almost) transparent.
 */
function dominantColor(pixels: Uint8ClampedArray, region: Region): string | undefined {
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
    let opaque = 0;
    for (let y = region.y0; y <= region.y1; y++) {
        for (let x = region.x0; x <= region.x1; x++) {
            const index = (y * WOKA_FRAME_SIZE + x) * 4;
            const alpha = pixels[index + 3] ?? 0;
            if (alpha < 128) {
                continue;
            }
            opaque++;
            const r = pixels[index] ?? 0;
            const g = pixels[index + 1] ?? 0;
            const b = pixels[index + 2] ?? 0;
            // Very dark pixels are outlines, not the color of the part
            if (r + g + b < 60) {
                continue;
            }
            const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
            const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
            bucket.count++;
            bucket.r += r;
            bucket.g += g;
            bucket.b += b;
            buckets.set(key, bucket);
        }
    }
    const area = (region.x1 - region.x0 + 1) * (region.y1 - region.y0 + 1);
    if (opaque < area * 0.25) {
        return undefined;
    }
    let best: { count: number; r: number; g: number; b: number } | undefined;
    for (const bucket of buckets.values()) {
        if (!best || bucket.count > best.count) {
            best = bucket;
        }
    }
    return best ? toHex(best.r / best.count, best.g / best.count, best.b / best.count) : undefined;
}

/**
 * Dresses a 3D avatar like a Woka: the colors of the hair, skin, clothes and shoes are read from the front-facing
 * frame of the Woka (RGBA pixels, 32x32). Shapes (hairstyle, clothes...) are kept from `base`.
 */
export function avatarConfigFromWokaFrame(pixels: Uint8ClampedArray, base: AvatarConfig): AvatarConfig {
    const skin = dominantColor(pixels, REGIONS.skin);
    const hair = dominantColor(pixels, REGIONS.hair);
    const top = dominantColor(pixels, REGIONS.top);
    const bottom = dominantColor(pixels, REGIONS.bottom);
    const shoes = dominantColor(pixels, REGIONS.shoes);
    return {
        ...base,
        skinColor: skin ?? base.skinColor,
        hairColor: hair ?? base.hairColor,
        // No hair color distinct from the skin: a bald Woka
        hairStyle: hair === undefined || hair === skin ? "bald" : base.hairStyle === "bald" ? "short" : base.hairStyle,
        topColor: top ?? base.topColor,
        bottomColor: bottom ?? base.bottomColor,
        shoesColor: shoes ?? base.shoesColor,
    };
}
