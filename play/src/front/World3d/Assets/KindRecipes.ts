import * as THREE from "three";
import type { ModelKind } from "../Map/MapAnalysis";
import type { ModelLibrary } from "./ModelLibrary";

interface RecipePart {
    asset: string;
    /**
     * "stretch": fills the footprint (width x depth) keeping the real height.
     * "width": uniform scale so that the model is as wide as the footprint (screens).
     * "uniform" (default): real size.
     */
    fit?: "uniform" | "stretch" | "width";
    /** Position, relative to the size of the footprint (-0.5 → 0.5) */
    x?: number;
    z?: number;
    rotation?: number;
    /** Base of the part: a height in tiles, or "top" to put it on the first part (desk, counter...) */
    elevation?: number | "top";
    /** Maximum depth (tiles) of a stretched part: desks are not as deep as their drawing */
    maxDepth?: number;
    /** Wall-mounted objects are pushed against the back of the footprint */
    againstBack?: boolean;
}

/**
 * How to build each procedural model kind with the realistic models of the library. Kinds without a recipe (or
 * whose assets are missing) keep their procedural model.
 */
const RECIPES: Partial<Record<ModelKind, RecipePart[]>> = {
    desk: [{ asset: "office_desk", fit: "stretch", maxDepth: 1.0 }],
    desk_monitor: [
        { asset: "office_desk", fit: "stretch", maxDepth: 1.0 },
        { asset: "monitor", elevation: "top", z: -0.2 },
        { asset: "keyboard", elevation: "top", z: 0.12 },
    ],
    meeting_table: [{ asset: "table", fit: "stretch" }],
    round_table: [{ asset: "table_round" }],
    chair: [{ asset: "chair" }],
    office_chair: [{ asset: "office_chair" }],
    sofa: [{ asset: "sofa" }],
    armchair: [{ asset: "armchair" }],
    plant: [{ asset: "plant" }],
    large_plant: [{ asset: "plant_large" }],
    bookshelf: [{ asset: "bookcase", fit: "stretch", maxDepth: 0.45, againstBack: true }],
    shelf: [{ asset: "shelves", fit: "stretch", maxDepth: 0.45, againstBack: true }],
    screen: [{ asset: "tv", fit: "width", againstBack: true, elevation: 0.55 }],
    monitor: [{ asset: "monitor" }],
    laptop: [{ asset: "laptop" }],
    counter: [{ asset: "kitchen_cabinet", fit: "stretch" }],
    coffee_machine: [{ asset: "coffee_machine" }],
    lamp: [{ asset: "floor_lamp" }],
    cabinet: [{ asset: "filing_cabinet", fit: "stretch", maxDepth: 0.5, againstBack: true }],
    bin: [{ asset: "trash_can" }],
    sink: [{ asset: "bathroom_sink" }],
    toilet: [{ asset: "toilet" }],
    books: [{ asset: "books" }],
    clock: [{ asset: "wall_clock", againstBack: true, elevation: 1.4, rotation: 0 }],
};

export function hasRecipe(kind: ModelKind): boolean {
    return RECIPES[kind] !== undefined;
}

/**
 * Builds a model kind from realistic assets, fitting a width x depth footprint (tiles, local X and Z axes, facing
 * +Z). Returns undefined when the library cannot build it.
 */
export function buildAssetModel(
    library: ModelLibrary,
    kind: ModelKind,
    width: number,
    depth: number,
): THREE.Group | undefined {
    const recipe = RECIPES[kind];
    if (!recipe || !library.isLoaded || recipe.some((part) => !library.has(part.asset))) {
        return undefined;
    }
    const group = new THREE.Group();
    let topHeight = 0;
    recipe.forEach((part, index) => {
        const partDepth = Math.min(depth, part.maxDepth ?? depth);
        let object: THREE.Object3D | undefined;
        if (part.fit === "stretch") {
            object = library.instantiate(part.asset, {
                fit: "stretch",
                width: Math.max(0.3, width - 0.08),
                depth: partDepth,
            });
        } else if (part.fit === "width") {
            const probe = library.instantiate(part.asset);
            const realWidth = probe ? new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3()).x : 0;
            object = library.instantiate(part.asset, { scale: realWidth > 0 ? (width * 0.9) / realWidth : 1 });
        } else {
            object = library.instantiate(part.asset);
        }
        if (!object) {
            return;
        }
        let elevation = 0;
        if (part.elevation === "top") {
            elevation = topHeight;
        } else if (part.elevation !== undefined) {
            elevation = part.elevation;
        }
        let z = (part.z ?? 0) * depth;
        if (part.againstBack) {
            const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
            z = -depth / 2 + size.z / 2 + 0.02;
        }
        object.position.set((part.x ?? 0) * width, elevation, z);
        object.rotation.y = THREE.MathUtils.degToRad(part.rotation ?? 0);
        group.add(object);
        if (index === 0) {
            group.updateMatrixWorld(true);
            topHeight = new THREE.Box3().setFromObject(object).max.y;
        }
    });
    return group;
}
