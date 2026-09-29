/**
 * A minimal, engine-agnostic view of a tile map: what the 3D world builder needs to know about the map. The Phaser
 * implementation lives in PhaserMapSource.
 */
export interface MapSourceTile {
    index: number;
    flipX: boolean;
    flipY: boolean;
    /** Rotation in radians */
    rotation: number;
    collides: boolean;
    properties: Record<string, unknown>;
}

export interface MapSourceLayer {
    name: string;
    visible: boolean;
    alpha: number;
    /** True for layers drawn above the players (after the "floorLayer" object layer). */
    overhead: boolean;
    properties: Record<string, unknown>;
    getTile(x: number, y: number): MapSourceTile | undefined;
}

export interface MapSourceTileImage {
    image: CanvasImageSource;
    sx: number;
    sy: number;
    width: number;
    height: number;
}

export interface MapSource {
    /** Size of the map, in tiles */
    width: number;
    height: number;
    /** Size of a tile, in pixels */
    tileWidth: number;
    tileHeight: number;
    layers: MapSourceLayer[];
    getTileImage(index: number): MapSourceTileImage | undefined;
    /**
     * Average opacity of the image of a tile (0: fully transparent, 1: opaque). Maps made from a big picture cut in
     * tiles contain many fully transparent tiles, that must be considered as empty.
     */
    getTileOpacity(index: number): number;
}

export function numberProperty(properties: Record<string, unknown>, name: string): number | undefined {
    const value = properties[name];
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) {
        return Number(value);
    }
    return undefined;
}

export function stringProperty(properties: Record<string, unknown>, name: string): string | undefined {
    const value = properties[name];
    return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Tiled stores properties either as an array of {name, value} (JSON format) or, once parsed by Phaser, as an object.
 */
export function normalizeProperties(properties: unknown): Record<string, unknown> {
    if (Array.isArray(properties)) {
        const result: Record<string, unknown> = {};
        for (const property of properties) {
            if (typeof property === "object" && property !== null && "name" in property && "value" in property) {
                const name: unknown = property.name;
                if (typeof name === "string") {
                    result[name] = property.value;
                }
            }
        }
        return result;
    }
    if (typeof properties === "object" && properties !== null) {
        return { ...properties };
    }
    return {};
}
