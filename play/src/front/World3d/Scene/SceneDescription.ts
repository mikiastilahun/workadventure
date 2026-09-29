import { z } from "zod";

const Rect = z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]);

export const SceneObject = z.object({
    /** A 3D model of the library (see public/world3d/models/manifest.json) or a procedural model kind */
    model: z.string(),
    /** Center of the object, in tiles */
    x: z.number(),
    y: z.number(),
    /** Direction the object faces, in degrees: 0 south, 90 west, 180 north, 270 east */
    rotation: z.number().default(0),
    /** Footprint (tiles) for the models stretched to a size (desks, tables...), before rotation */
    width: z.number().positive().optional(),
    depth: z.number().positive().optional(),
    /** Height of the base of the object (tiles), e.g. to put a monitor on a desk */
    elevation: z.number().default(0),
    /** Multiplies the real size of the model */
    scale: z.number().positive().optional(),
});
export type SceneObject = z.infer<typeof SceneObject>;

/**
 * Describes how to "upgrade" a 2D map to a realistic 3D scene:
 * - the layers whose drawings are replaced by 3D objects,
 * - patches of the floor to erase objects drawn in the floor itself (e.g. cars drawn on a parking lot),
 * - the 3D objects to place.
 *
 * It lives next to a map (map property "world3dScene"), in the map itself (an object layer named "3d"), or in the
 * registry of the play server (public/world3d/scenes/index.json) for maps you cannot modify.
 */
export const SceneDescription = z.object({
    version: z.literal(1),
    /** Layers (or groups of layers, by name prefix) not drawn in 3D */
    hideLayers: z.array(z.string()).default([]),
    /** Floor regions copied over other regions (rectangles in tiles: [x, y, width, height]) */
    floorPatches: z.array(z.object({ from: Rect, to: Rect })).default([]),
    objects: z.array(SceneObject).default([]),
});
export type SceneDescription = z.infer<typeof SceneDescription>;

export const SceneRegistry = z.object({
    scenes: z.array(
        z.object({
            /** The scene applies to the maps whose URL ends with one of these strings */
            maps: z.array(z.string()),
            scene: z.string(),
        }),
    ),
});

const SCENES_URL = "/world3d/scenes/";

/**
 * Builds a scene description from the objects of a Tiled object layer named "3d". Each object is a rectangle whose
 * name (or "model" property) is the model, with optional "rotation" and "elevation" properties.
 */
export function sceneObjectsFromTiled(
    objects: readonly {
        name?: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
        properties?: readonly { name: string; value: unknown }[];
    }[],
    tileWidth: number,
    tileHeight: number,
): SceneObject[] {
    const result: SceneObject[] = [];
    for (const object of objects) {
        const properties = new Map((object.properties ?? []).map((property) => [property.name, property.value]));
        const model = typeof properties.get("model") === "string" ? String(properties.get("model")) : object.name;
        if (!model) {
            continue;
        }
        const width = (object.width ?? 0) / tileWidth;
        const depth = (object.height ?? 0) / tileHeight;
        const rotation = Number(properties.get("rotation") ?? 0);
        const elevation = Number(properties.get("elevation") ?? 0);
        const parsed = SceneObject.safeParse({
            model,
            x: object.x / tileWidth + width / 2,
            y: object.y / tileHeight + depth / 2,
            rotation: isNaN(rotation) ? 0 : rotation,
            width: width > 0 ? width : undefined,
            depth: depth > 0 ? depth : undefined,
            elevation: isNaN(elevation) ? 0 : elevation,
        });
        if (parsed.success) {
            result.push(parsed.data);
        }
    }
    return result;
}

/**
 * Finds the scene description of a map: a "world3dScene" map property (URL relative to the map) wins over the
 * registry of the server.
 */
export async function loadSceneDescription(
    mapUrl: string,
    sceneProperty: string | undefined,
    signal?: AbortSignal,
): Promise<SceneDescription | undefined> {
    let sceneUrl: string | undefined;
    if (sceneProperty) {
        sceneUrl = new URL(sceneProperty, mapUrl).toString();
    } else {
        try {
            const response = await fetch(`${SCENES_URL}index.json`, { signal });
            if (response.ok) {
                const registry = SceneRegistry.parse(await response.json());
                const cleanMapUrl = mapUrl.split(/[?#]/)[0] ?? mapUrl;
                const entry = registry.scenes.find((candidate) =>
                    candidate.maps.some((suffix) => cleanMapUrl.endsWith(suffix)),
                );
                if (entry) {
                    sceneUrl = `${SCENES_URL}${entry.scene}`;
                }
            }
        } catch (e) {
            if (!(e instanceof DOMException && e.name === "AbortError")) {
                console.warn("Could not read the registry of 3D scenes", e);
            }
            return undefined;
        }
    }
    if (!sceneUrl) {
        return undefined;
    }
    try {
        const response = await fetch(sceneUrl, { signal });
        if (!response.ok) {
            return undefined;
        }
        return SceneDescription.parse(await response.json());
    } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
            console.warn(`Invalid 3D scene description ${sceneUrl}`, e);
        }
        return undefined;
    }
}
