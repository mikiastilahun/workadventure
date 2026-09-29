/**
 * Pure helpers turning a 2D top-down Tiled map into 3D information (which cells are walls, how tall they are, where
 * 3D furniture models go...). They are independent of Phaser and Three.js so they can be unit tested.
 *
 * Units: 1 world unit = 1 tile.
 */

/** Height (in tiles) of a wall. */
export const WALL_HEIGHT = 2.2;
/** Height (in tiles) of a generic colliding piece of furniture drawn in a 2D tileset. */
export const FURNITURE_HEIGHT = 0.55;

const WALL_LAYER_PATTERN = /wall|mur|building|fence|border/i;
const FURNITURE_LAYER_PATTERN = /furniture|object|deco|table|desk|chair|item|prop/i;

/**
 * Tile information for one cell of one layer.
 */
/**
 * True for layers holding walls or furniture. Such layers drawn above the players (e.g. the top of the walls in
 * "foreground" layers) are painted on the top of the 3D blocks rather than drawn as a ceiling.
 */
export function isStructureLayerName(name: string): boolean {
    return WALL_LAYER_PATTERN.test(name) || FURNITURE_LAYER_PATTERN.test(name);
}

export interface CellTileInfo {
    layerName: string;
    /** "height3d" property set on the layer, if any. */
    layerHeight3d?: number;
    /** "height3d" property set on the tile (in the tileset), if any. */
    tileHeight3d?: number;
    /** "model3d" property set on the tile (in the tileset), if any. */
    model3d?: string;
    collides: boolean;
}

export type BlockKind = "none" | "wall" | "furniture" | "custom";

export interface CellBlock {
    kind: BlockKind;
    height: number;
}

const NO_BLOCK: CellBlock = { kind: "none", height: 0 };

/**
 * Decides whether a cell of the map should be extruded in 3D, and how tall it should be.
 *
 * - An explicit "height3d" property (tile first, then layer) always wins.
 * - Tiles holding a "model3d" property are rendered by a 3D model: they never produce a block.
 * - Otherwise, a colliding cell becomes a wall or a low block depending on the names of the layers drawn on that
 *   cell. Maps usually have an invisible "collisions" layer, so we look at every layer of the cell, not only at the
 *   colliding one.
 */
export function computeCellBlock(tiles: readonly CellTileInfo[]): CellBlock {
    const relevantTiles = tiles.filter((tile) => tile.model3d === undefined || tile.model3d === "");
    const hasModel = relevantTiles.length !== tiles.length;

    let explicitHeight: number | undefined;
    for (const tile of relevantTiles) {
        const height = tile.tileHeight3d ?? tile.layerHeight3d;
        if (height !== undefined && (tile.collides || height > 0)) {
            explicitHeight = Math.max(explicitHeight ?? 0, height);
        }
    }
    if (explicitHeight !== undefined) {
        return explicitHeight > 0 ? { kind: "custom", height: explicitHeight } : NO_BLOCK;
    }

    const collides = relevantTiles.some((tile) => tile.collides);
    if (!collides) {
        return NO_BLOCK;
    }
    // The collision comes only from the tiles of a 3D model (e.g. a desk) and an invisible collision layer: the
    // model already renders the obstacle.
    const drawnTiles = relevantTiles.filter((tile) => !/collision/i.test(tile.layerName));
    if (hasModel && drawnTiles.every((tile) => !tile.collides && !WALL_LAYER_PATTERN.test(tile.layerName))) {
        return NO_BLOCK;
    }

    if (relevantTiles.some((tile) => WALL_LAYER_PATTERN.test(tile.layerName))) {
        return { kind: "wall", height: WALL_HEIGHT };
    }
    if (relevantTiles.some((tile) => FURNITURE_LAYER_PATTERN.test(tile.layerName))) {
        return { kind: "furniture", height: FURNITURE_HEIGHT };
    }
    return { kind: "wall", height: WALL_HEIGHT };
}

export interface ModelCell {
    x: number;
    y: number;
    model: string;
    /** Rotation in degrees (clockwise, seen from above), from the "rotation3d" tile property. */
    rotation?: number;
    /** Layer the model tile is on. Adjacent cells of the same model on the same layer are merged. */
    layer: string;
}

export interface ModelPlacement {
    model: string;
    /** Top-left cell of the footprint. */
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
}

/**
 * Merges adjacent cells holding the same 3D model into a single placement. A 2-tile desk drawn with 2 tiles tagged
 * model3d=desk becomes one 2x1 desk.
 */
export function groupModelCells(cells: readonly ModelCell[]): ModelPlacement[] {
    const key = (x: number, y: number, layer: string) => `${layer}|${x}|${y}`;
    const byKey = new Map<string, ModelCell>();
    for (const cell of cells) {
        byKey.set(key(cell.x, cell.y, cell.layer), cell);
    }

    const visited = new Set<string>();
    const placements: ModelPlacement[] = [];
    for (const cell of cells) {
        const startKey = key(cell.x, cell.y, cell.layer);
        if (visited.has(startKey)) {
            continue;
        }
        visited.add(startKey);

        let minX = cell.x;
        let maxX = cell.x;
        let minY = cell.y;
        let maxY = cell.y;
        let rotation = cell.rotation;
        const stack = [cell];
        while (stack.length > 0) {
            const current = stack.pop();
            if (current === undefined) {
                break;
            }
            minX = Math.min(minX, current.x);
            maxX = Math.max(maxX, current.x);
            minY = Math.min(minY, current.y);
            maxY = Math.max(maxY, current.y);
            rotation = rotation ?? current.rotation;
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ] as const) {
                const neighbourKey = key(current.x + dx, current.y + dy, current.layer);
                const neighbour = byKey.get(neighbourKey);
                if (neighbour && !visited.has(neighbourKey) && neighbour.model === cell.model) {
                    visited.add(neighbourKey);
                    stack.push(neighbour);
                }
            }
        }
        placements.push({
            model: cell.model,
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            rotation: rotation ?? 0,
        });
    }
    return placements;
}

/**
 * The procedural 3D models the renderer knows how to build.
 */
export const MODEL_KINDS = [
    "desk",
    "desk_monitor",
    "chair",
    "office_chair",
    "meeting_table",
    "round_table",
    "sofa",
    "armchair",
    "pouf",
    "plant",
    "large_plant",
    "tree",
    "bookshelf",
    "shelf",
    "whiteboard",
    "screen",
    "monitor",
    "laptop",
    "counter",
    "coffee_machine",
    "water_cooler",
    "printer",
    "lamp",
    "stage",
    "podium",
    "cabinet",
    "bin",
    "sink",
    "toilet",
    "books",
    "mug",
    "clock",
    "bench",
    "door",
    "vending_machine",
] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

export function isModelKind(value: string): value is ModelKind {
    return (MODEL_KINDS as readonly string[]).includes(value);
}

/**
 * Small objects that are usually put on a table: in 3D they must be lifted to the height of the table under them.
 */
export const TABLETOP_MODEL_KINDS: readonly ModelKind[] = ["monitor", "laptop", "books", "mug", "coffee_machine"];

const ENTITY_NAME_TO_MODEL: readonly [RegExp, ModelKind][] = [
    [/computer screen|monitor|screen \(big\)/i, "monitor"],
    [/laptop/i, "laptop"],
    [/armchair/i, "armchair"],
    [/couch|sofa/i, "sofa"],
    [/pouf/i, "pouf"],
    [/office chair/i, "office_chair"],
    [/chair|stool/i, "chair"],
    [/meeting table|conference/i, "meeting_table"],
    [/round table|small table/i, "round_table"],
    [/desk/i, "desk"],
    [/table/i, "desk"],
    [/large plant|suspended plant/i, "large_plant"],
    [/tree/i, "tree"],
    [/plant|flower/i, "plant"],
    [/big shelf|bookshelf|bookcase/i, "bookshelf"],
    [/mural shelf|shelf/i, "shelf"],
    [/whiteboard|board/i, "whiteboard"],
    [/tv|television|kakemono|pannel|panel/i, "screen"],
    [/coffee/i, "coffee_machine"],
    [/water/i, "water_cooler"],
    [/printer/i, "printer"],
    [/lamp/i, "lamp"],
    [/basket|bin|trash/i, "bin"],
    [/sink/i, "sink"],
    [/toilet(?! paper| brush)/i, "toilet"],
    [/books|folders/i, "books"],
    [/mug|cup/i, "mug"],
    [/clock/i, "clock"],
    [/bench/i, "bench"],
    [/cabinet|drawer|locker/i, "cabinet"],
    [/vending|arcade/i, "vending_machine"],
];

/**
 * Picks the 3D model used to render a map-editor entity, from the name of its prefab. Returns undefined when no
 * model matches: the entity is then rendered as a standing picture of its 2D image.
 */
export function resolveEntityModel(prefabName: string): ModelKind | undefined {
    for (const [pattern, model] of ENTITY_NAME_TO_MODEL) {
        if (pattern.test(prefabName)) {
            return model;
        }
    }
    return undefined;
}

/**
 * Converts the "direction" of a map-editor prefab (the side the object faces) into a rotation in degrees, clockwise
 * seen from above. 0 means the object faces "down" (towards the bottom of the map).
 */
export function directionToRotation(direction: string | undefined): number {
    switch (direction) {
        case "Left":
            return 90;
        case "Up":
            return 180;
        case "Right":
            return 270;
        default:
            return 0;
    }
}

/**
 * Finds the indoor cells of a map: the cells enclosed by walls. They get a ceiling in 3D.
 *
 * The outdoor is flooded from the border of the map. Doors are gaps in the walls: to keep the flood from leaking
 * through them, the walls are first thickened by `doorWidth` cells, then the flooded area is grown back by the same
 * amount so the cells hugging the outer walls stay outdoor.
 *
 * @returns 1 for indoor cells, 0 for outdoor cells and walls
 */
export function computeIndoorCells(
    width: number,
    height: number,
    isWall: (x: number, y: number) => boolean,
    doorWidth = 1,
): Uint8Array {
    const size = width * height;
    const wall = new Uint8Array(size);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            wall[y * width + x] = isWall(x, y) ? 1 : 0;
        }
    }

    // Thicken the walls (Chebyshev distance) to close the doors
    const thick = new Uint8Array(size);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!wall[y * width + x]) {
                continue;
            }
            for (let dy = -doorWidth; dy <= doorWidth; dy++) {
                for (let dx = -doorWidth; dx <= doorWidth; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
                        thick[ny * width + nx] = 1;
                    }
                }
            }
        }
    }

    // Flood the outdoor from the border of the map
    const outdoor = new Uint8Array(size);
    const stack: number[] = [];
    const push = (x: number, y: number) => {
        const index = y * width + x;
        if (!thick[index] && !outdoor[index]) {
            outdoor[index] = 1;
            stack.push(index);
        }
    };
    // The border of the map is outdoor even when it hugs a wall
    const seed = (x: number, y: number) => {
        const index = y * width + x;
        if (!wall[index] && !outdoor[index]) {
            outdoor[index] = 1;
            stack.push(index);
        }
    };
    for (let x = 0; x < width; x++) {
        seed(x, 0);
        seed(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
        seed(0, y);
        seed(width - 1, y);
    }
    while (stack.length > 0) {
        const index = stack.pop() ?? 0;
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) push(x - 1, y);
        if (x < width - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < height - 1) push(x, y + 1);
    }

    // Grow the outdoor back over the thickening, without crossing the real walls
    for (let step = 0; step < doorWidth; step++) {
        const grown = outdoor.slice();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                if (outdoor[index] || wall[index]) {
                    continue;
                }
                // 8 neighbours, like the thickening (the corners of the rooms are diagonal to the flood)
                let touchesOutdoor = false;
                for (let dy = -1; dy <= 1 && !touchesOutdoor; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && ny >= 0 && nx < width && ny < height && outdoor[ny * width + nx]) {
                            touchesOutdoor = true;
                            break;
                        }
                    }
                }
                if (touchesOutdoor) {
                    grown[index] = 1;
                }
            }
        }
        outdoor.set(grown);
    }

    const indoor = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        indoor[i] = !outdoor[i] && !wall[i] ? 1 : 0;
    }
    return indoor;
}
