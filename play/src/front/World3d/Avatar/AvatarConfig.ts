import { z } from "zod";

/**
 * The name of the public player variable used to broadcast the 3D avatar of a player to the other players of the
 * room. Using a player variable means no protocol change: the back already relays public variables to everybody in
 * the zone, including players joining later.
 */
export const AVATAR_PLAYER_VARIABLE = "avatar3d";

/**
 * The public player variable holding the seat the player sits on in 3D (null when standing).
 */
export const AVATAR_SEAT_VARIABLE = "avatar3dSeat";

export const HAIR_STYLES = ["short", "long", "bun", "spiky", "curly", "ponytail", "bald"] as const;
export const TOP_STYLES = ["tshirt", "hoodie", "shirt", "suit", "dress"] as const;
export const BOTTOM_STYLES = ["pants", "shorts", "skirt"] as const;
export const HEADWEAR_STYLES = ["none", "cap", "beanie", "headphones", "crown"] as const;
export const EYEWEAR_STYLES = ["none", "glasses", "sunglasses"] as const;
export const FACIAL_HAIR_STYLES = ["none", "beard", "mustache"] as const;
export const BODY_TYPES = ["slim", "regular", "broad"] as const;

export const SKIN_COLORS = ["#fde0cc", "#f5c9a6", "#e0a878", "#c68650", "#9c6338", "#6b4226", "#4a2c17"] as const;
export const HAIR_COLORS = [
    "#1c1c1c",
    "#4b2e1a",
    "#8a5a2b",
    "#d8b36a",
    "#f1e3b5",
    "#b5452a",
    "#9aa0a6",
    "#e86aa6",
    "#4f7bf2",
    "#46b889",
] as const;
export const CLOTHING_COLORS = [
    "#f5f5f5",
    "#2b2d42",
    "#3a86ff",
    "#8338ec",
    "#ff006e",
    "#fb5607",
    "#ffbe0b",
    "#2a9d8f",
    "#588157",
    "#8d99ae",
    "#6d4c41",
    "#e63946",
] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const AvatarConfig = z.object({
    version: z.literal(1),
    bodyType: z.enum(BODY_TYPES),
    skinColor: hexColor,
    hairStyle: z.enum(HAIR_STYLES),
    hairColor: hexColor,
    facialHair: z.enum(FACIAL_HAIR_STYLES),
    topStyle: z.enum(TOP_STYLES),
    topColor: hexColor,
    bottomStyle: z.enum(BOTTOM_STYLES),
    bottomColor: hexColor,
    shoesColor: hexColor,
    headwear: z.enum(HEADWEAR_STYLES),
    headwearColor: hexColor,
    eyewear: z.enum(EYEWEAR_STYLES),
});
export type AvatarConfig = z.infer<typeof AvatarConfig>;

export const defaultAvatarConfig: AvatarConfig = {
    version: 1,
    bodyType: "regular",
    skinColor: SKIN_COLORS[2],
    hairStyle: "short",
    hairColor: HAIR_COLORS[1],
    facialHair: "none",
    topStyle: "hoodie",
    topColor: CLOTHING_COLORS[2],
    bottomStyle: "pants",
    bottomColor: CLOTHING_COLORS[1],
    shoesColor: CLOTHING_COLORS[0],
    headwear: "none",
    headwearColor: CLOTHING_COLORS[4],
    eyewear: "none",
};

/**
 * Parses an untrusted value (typically a player variable sent by another client) into an avatar configuration.
 * Returns undefined if the value is not a valid configuration.
 */
export function parseAvatarConfig(value: unknown): AvatarConfig | undefined {
    const result = AvatarConfig.safeParse(value);
    return result.success ? result.data : undefined;
}

/**
 * A small, fast, deterministic PRNG (mulberry32). Deterministic so every client generates the same avatar for the
 * same seed.
 */
export function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * FNV-1a hash of a string, used to turn a stable identifier (a user UUID, a list of texture ids...) into a seed.
 */
export function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function pick<T>(random: () => number, values: readonly T[]): T {
    const value = values[Math.floor(random() * values.length) % values.length];
    if (value === undefined) {
        throw new Error("Cannot pick a value in an empty list");
    }
    return value;
}

/**
 * Generates a random (but plausible) avatar. Headwear, eyewear and facial hair are kept rare so crowds do not look
 * like a costume party.
 */
export function randomAvatarConfig(random: () => number = Math.random): AvatarConfig {
    const topStyle = pick(random, TOP_STYLES);
    return {
        version: 1,
        bodyType: pick(random, BODY_TYPES),
        skinColor: pick(random, SKIN_COLORS),
        hairStyle: pick(random, HAIR_STYLES),
        hairColor: pick(random, HAIR_COLORS),
        facialHair: random() < 0.2 ? pick(random, FACIAL_HAIR_STYLES) : "none",
        topStyle,
        topColor: pick(random, CLOTHING_COLORS),
        bottomStyle: topStyle === "dress" ? "skirt" : pick(random, BOTTOM_STYLES),
        bottomColor: pick(random, CLOTHING_COLORS),
        shoesColor: pick(random, CLOTHING_COLORS),
        headwear: random() < 0.25 ? pick(random, HEADWEAR_STYLES) : "none",
        headwearColor: pick(random, CLOTHING_COLORS),
        eyewear: random() < 0.25 ? pick(random, EYEWEAR_STYLES) : "none",
    };
}

/**
 * The avatar displayed for a player who never customized their 3D avatar. It is derived from a stable seed (their
 * Woka textures) so they look the same for everybody and across sessions.
 */
export function avatarConfigFromSeed(seed: string): AvatarConfig {
    return randomAvatarConfig(createSeededRandom(hashString(seed)));
}
