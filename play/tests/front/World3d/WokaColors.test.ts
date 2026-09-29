import { describe, expect, it } from "vitest";
import { defaultAvatarConfig } from "../../../src/front/World3d/Avatar/AvatarConfig";
import { avatarConfigFromWokaFrame, WOKA_FRAME_SIZE } from "../../../src/front/World3d/Avatar/WokaColors";

function frame(paint: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(WOKA_FRAME_SIZE * WOKA_FRAME_SIZE * 4);
    for (let y = 0; y < WOKA_FRAME_SIZE; y++) {
        for (let x = 0; x < WOKA_FRAME_SIZE; x++) {
            pixels.set(paint(x, y), (y * WOKA_FRAME_SIZE + x) * 4);
        }
    }
    return pixels;
}

describe("avatarConfigFromWokaFrame", () => {
    it("should read the colors of each part of the Woka", () => {
        const pixels = frame((x, y) => {
            if (y <= 7) return [200, 30, 30, 255]; // red hair
            if (y <= 17) return [240, 200, 170, 255]; // skin
            if (y <= 24) return [30, 60, 200, 255]; // blue top
            if (y <= 28) return [40, 160, 60, 255]; // green bottom
            return [240, 240, 240, 255]; // white shoes
        });
        const config = avatarConfigFromWokaFrame(pixels, { ...defaultAvatarConfig, hairStyle: "long" });
        expect(config.hairColor).toBe("#c81e1e");
        expect(config.skinColor).toBe("#f0c8aa");
        expect(config.topColor).toBe("#1e3cc8");
        expect(config.bottomColor).toBe("#28a03c");
        expect(config.shoesColor).toBe("#f0f0f0");
        expect(config.hairStyle).toBe("long");
    });

    it("should ignore outlines and keep the base colors of transparent parts", () => {
        const pixels = frame((x, y) => {
            if (x % 4 === 0) return [0, 0, 0, 255]; // outlines
            if (y >= 19 && y <= 24) return [30, 60, 200, 255];
            return [0, 0, 0, 0];
        });
        const config = avatarConfigFromWokaFrame(pixels, defaultAvatarConfig);
        expect(config.topColor).toBe("#1e3cc8");
        expect(config.skinColor).toBe(defaultAvatarConfig.skinColor);
        expect(config.hairStyle).toBe("bald");
    });
});
