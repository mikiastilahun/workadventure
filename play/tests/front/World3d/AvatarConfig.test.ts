import { describe, expect, it } from "vitest";
import {
    avatarConfigFromSeed,
    createSeededRandom,
    defaultAvatarConfig,
    parseAvatarConfig,
    randomAvatarConfig,
} from "../../../src/front/World3d/Avatar/AvatarConfig";

describe("AvatarConfig", () => {
    it("should accept the default configuration", () => {
        expect(parseAvatarConfig(defaultAvatarConfig)).toEqual(defaultAvatarConfig);
    });

    it("should reject malformed configurations sent by other players", () => {
        expect(parseAvatarConfig(undefined)).toBeUndefined();
        expect(parseAvatarConfig("not an avatar")).toBeUndefined();
        expect(parseAvatarConfig({ ...defaultAvatarConfig, hairStyle: "mohawk" })).toBeUndefined();
        expect(parseAvatarConfig({ ...defaultAvatarConfig, skinColor: "red" })).toBeUndefined();
        expect(parseAvatarConfig({ ...defaultAvatarConfig, topColor: "#12345" })).toBeUndefined();
        expect(parseAvatarConfig({ ...defaultAvatarConfig, version: 2 })).toBeUndefined();
    });

    it("should strip unknown keys", () => {
        const parsed = parseAvatarConfig({ ...defaultAvatarConfig, script: "alert(1)" });
        expect(parsed).toEqual(defaultAvatarConfig);
    });

    it("should always generate valid random avatars", () => {
        const random = createSeededRandom(42);
        for (let i = 0; i < 200; i++) {
            const config = randomAvatarConfig(random);
            expect(parseAvatarConfig(config)).toEqual(config);
            if (config.topStyle === "dress") {
                expect(config.bottomStyle).toBe("skirt");
            }
        }
    });

    it("should generate the same avatar for the same seed on every client", () => {
        expect(avatarConfigFromSeed("user-1")).toEqual(avatarConfigFromSeed("user-1"));
        const different = ["a", "b", "c", "d", "e"].map((seed) => JSON.stringify(avatarConfigFromSeed(seed)));
        expect(new Set(different).size).toBeGreaterThan(1);
    });
});
