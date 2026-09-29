import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { MODEL_KINDS } from "../../../src/front/World3d/Map/MapAnalysis";
import type { TiledAreaSource } from "../../../src/front/World3d/Places/Places";
import { extractPlaces } from "../../../src/front/World3d/Places/Places";

// Resolved from the file path: under jsdom, the global URL class is not the one node:url expects.
const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../public/map-templates");
const TEMPLATE_IDS = ["office", "conference", "campus"] as const;
const GID_MASK = 0x1fffffff;

interface RawProperty {
    name: string;
    type: string;
    value?: unknown;
}

interface RawTileLayer {
    type: "tilelayer";
    name: string;
    data: number[];
}

interface RawObjectLayer {
    type: "objectgroup";
    name: string;
    objects: {
        name: string;
        type?: string;
        class?: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
        properties?: RawProperty[];
    }[];
}

interface RawTileset {
    firstgid: number;
    image: string;
    imagewidth: number;
    imageheight: number;
    columns: number;
    tilecount: number;
    tilewidth: number;
    tileheight: number;
    tiles?: { id: number; properties?: RawProperty[] }[];
}

interface RawMap {
    width: number;
    height: number;
    tilewidth: number;
    tileheight: number;
    infinite: boolean;
    orientation: string;
    properties?: RawProperty[];
    layers: (RawTileLayer | RawObjectLayer)[];
    tilesets: RawTileset[];
}

function loadMap(id: string): { raw: unknown; map: RawMap; mapPath: string } {
    const mapPath = path.join(templatesDir, id, "map.tmj");
    const raw: unknown = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    return { raw, map: raw as RawMap, mapPath };
}

function propertiesToObject(properties: RawProperty[] | undefined): { [key: string]: unknown } {
    const result: { [key: string]: unknown } = {};
    for (const property of properties ?? []) {
        result[property.name] = property.value;
    }
    return result;
}

function tileProperties(map: RawMap): Map<number, { [key: string]: unknown }> {
    const byGid = new Map<number, { [key: string]: unknown }>();
    for (const tileset of map.tilesets) {
        for (const tile of tileset.tiles ?? []) {
            byGid.set(tileset.firstgid + tile.id, propertiesToObject(tile.properties));
        }
    }
    return byGid;
}

function tileLayers(map: RawMap): RawTileLayer[] {
    return map.layers.filter((layer): layer is RawTileLayer => layer.type === "tilelayer");
}

function areaObjects(map: RawMap): TiledAreaSource[] {
    return map.layers
        .filter((layer): layer is RawObjectLayer => layer.type === "objectgroup")
        .flatMap((layer) => layer.objects)
        .filter((object) => object.class === "area" || object.type === "area")
        .map((object) => ({
            name: object.name,
            x: object.x,
            y: object.y,
            width: object.width ?? 0,
            height: object.height ?? 0,
            properties: propertiesToObject(object.properties),
        }));
}

function collisionGrid(map: RawMap): boolean[] {
    const properties = tileProperties(map);
    const grid = new Array<boolean>(map.width * map.height).fill(false);
    for (const layer of tileLayers(map)) {
        layer.data.forEach((gid, index) => {
            if (properties.get(gid & GID_MASK)?.["collides"] === true) {
                grid[index] = true;
            }
        });
    }
    return grid;
}

function reachableFrom(map: RawMap, grid: boolean[], startIndex: number): boolean[] {
    const reached = new Array<boolean>(grid.length).fill(false);
    reached[startIndex] = true;
    const queue = [startIndex];
    for (let head = 0; head < queue.length; head++) {
        const index = queue[head];
        const x = index % map.width;
        const y = Math.floor(index / map.width);
        for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) {
                continue;
            }
            const neighbour = ny * map.width + nx;
            if (!reached[neighbour] && !grid[neighbour]) {
                reached[neighbour] = true;
                queue.push(neighbour);
            }
        }
    }
    return reached;
}

function startCells(map: RawMap): number[] {
    const start = tileLayers(map).find((layer) => layer.name === "start");
    return (start?.data ?? []).flatMap((gid, index) => (gid !== 0 ? [index] : []));
}

describe.each(TEMPLATE_IDS)("map template %s", (id) => {
    const { raw, map, mapPath } = loadMap(id);

    it("should be a valid Tiled map", () => {
        const result = ITiledMap.safeParse(raw);
        expect(result.success).toBe(true);
        expect(map.orientation).toBe("orthogonal");
        expect(map.infinite).toBe(false);
        expect(map.tilewidth).toBe(32);
        expect(map.tileheight).toBe(32);
        const properties = propertiesToObject(map.properties);
        expect(properties["mapName"]).toEqual(expect.any(String));
        expect(properties["mapDescription"]).toEqual(expect.any(String));
        expect(properties["mapCopyright"]).toBe("CC-BY-SA 4.0 WorkAdventure contributors");
        for (const layer of tileLayers(map)) {
            expect(layer.data).toHaveLength(map.width * map.height);
        }
    });

    it("should embed a tileset whose image exists and matches its declared size", () => {
        expect(map.tilesets.length).toBeGreaterThan(0);
        for (const tileset of map.tilesets) {
            const imagePath = path.resolve(path.dirname(mapPath), tileset.image);
            expect(fs.existsSync(imagePath)).toBe(true);
            const header = fs.readFileSync(imagePath).subarray(0, 24);
            expect(header.subarray(1, 4).toString("ascii")).toBe("PNG");
            expect(header.readUInt32BE(16)).toBe(tileset.imagewidth);
            expect(header.readUInt32BE(20)).toBe(tileset.imageheight);
            expect(tileset.columns * tileset.tilewidth).toBe(tileset.imagewidth);
            expect(tileset.tilecount).toBeLessThanOrEqual(
                tileset.columns * Math.floor(tileset.imageheight / tileset.tileheight),
            );
        }
        expect(fs.existsSync(path.join(templatesDir, id, "preview.png"))).toBe(true);
    });

    it("should have a floorLayer and a start layer with spawn cells", () => {
        expect(map.layers.some((layer) => layer.name === "floorLayer" && layer.type === "objectgroup")).toBe(true);
        expect(tileLayers(map).some((layer) => layer.name === "start")).toBe(true);
        expect(startCells(map).length).toBeGreaterThan(0);
    });

    it("should let players reach every spawn cell and every area from the entrance", () => {
        const grid = collisionGrid(map);
        const starts = startCells(map);
        for (const cell of starts) {
            expect(grid[cell], `start cell ${cell} collides`).toBe(false);
        }
        const reached = reachableFrom(map, grid, starts[0]);
        for (const cell of starts) {
            expect(reached[cell], `start cell ${cell} is not reachable`).toBe(true);
        }
        const areas = areaObjects(map);
        expect(areas.length).toBeGreaterThan(0);
        for (const area of areas) {
            const x0 = Math.floor(area.x / 32);
            const y0 = Math.floor(area.y / 32);
            const x1 = Math.ceil((area.x + area.width) / 32);
            const y1 = Math.ceil((area.y + area.height) / 32);
            const center =
                Math.floor((area.y + area.height / 2) / 32) * map.width + Math.floor((area.x + area.width / 2) / 32);
            expect(reached[center], `center of "${area.name}" is not reachable`).toBe(true);
            let reachableCells = 0;
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    if (reached[y * map.width + x]) {
                        reachableCells++;
                    }
                }
            }
            expect(reachableCells, `no reachable cell in "${area.name}"`).toBeGreaterThan(0);
        }
    });

    it("should only use known 3D models and rotations", () => {
        const modelKinds: readonly string[] = MODEL_KINDS;
        let models = 0;
        for (const properties of tileProperties(map).values()) {
            const model = properties["model3d"];
            if (model !== undefined) {
                models++;
                expect(modelKinds).toContain(model);
            }
            const rotation = properties["rotation3d"];
            if (rotation !== undefined) {
                expect([0, 90, 180, 270]).toContain(rotation);
            }
        }
        expect(models).toBeGreaterThan(0);
    });

    it("should expose its rooms as places", () => {
        const places = extractPlaces(areaObjects(map), []);
        expect(places.length).toBeGreaterThanOrEqual(5);
        const kinds = new Set(places.map((place) => place.kind));
        expect(kinds.has("meeting")).toBe(true);
        expect(kinds.has("social")).toBe(true);
        if (id === "conference") {
            expect(kinds.has("stage")).toBe(true);
        }
    });
});
