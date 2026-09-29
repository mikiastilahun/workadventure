import { describe, expect, it } from "vitest";
import {
    computeCellBlock,
    computeIndoorCells,
    directionToRotation,
    FURNITURE_HEIGHT,
    groupModelCells,
    resolveEntityModel,
    WALL_HEIGHT,
} from "../../../src/front/World3d/Map/MapAnalysis";

describe("computeCellBlock", () => {
    it("should not extrude walkable cells", () => {
        expect(computeCellBlock([{ layerName: "floor", collides: false }])).toEqual({ kind: "none", height: 0 });
        expect(computeCellBlock([])).toEqual({ kind: "none", height: 0 });
    });

    it("should extrude colliding tiles on a wall layer as walls", () => {
        expect(computeCellBlock([{ layerName: "walls", collides: true }])).toEqual({
            kind: "wall",
            height: WALL_HEIGHT,
        });
    });

    it("should use the drawn layers of the cell when the collision comes from an invisible layer", () => {
        expect(
            computeCellBlock([
                { layerName: "floor", collides: false },
                { layerName: "furniture", collides: false },
                { layerName: "collisions", collides: true },
            ]),
        ).toEqual({ kind: "furniture", height: FURNITURE_HEIGHT });
        expect(
            computeCellBlock([
                { layerName: "floor", collides: false },
                { layerName: "Walls", collides: false },
                { layerName: "collisions", collides: true },
            ]),
        ).toEqual({ kind: "wall", height: WALL_HEIGHT });
    });

    it("should default unknown colliding cells to walls", () => {
        expect(computeCellBlock([{ layerName: "collisions", collides: true }]).kind).toBe("wall");
    });

    it("should honour explicit height3d properties, tile first", () => {
        expect(computeCellBlock([{ layerName: "walls", collides: true, layerHeight3d: 3 }])).toEqual({
            kind: "custom",
            height: 3,
        });
        expect(computeCellBlock([{ layerName: "walls", collides: true, layerHeight3d: 3, tileHeight3d: 0.2 }])).toEqual(
            { kind: "custom", height: 0.2 },
        );
        expect(computeCellBlock([{ layerName: "walls", collides: true, tileHeight3d: 0 }]).kind).toBe("none");
        expect(computeCellBlock([{ layerName: "deco", collides: false, tileHeight3d: 0.8 }]).height).toBe(0.8);
    });

    it("should not extrude cells rendered by a 3D model", () => {
        expect(
            computeCellBlock([
                { layerName: "floor", collides: false },
                { layerName: "furniture", collides: true, model3d: "desk" },
            ]),
        ).toEqual({ kind: "none", height: 0 });
        expect(
            computeCellBlock([
                { layerName: "furniture", collides: false, model3d: "desk" },
                { layerName: "collisions", collides: true },
            ]),
        ).toEqual({ kind: "none", height: 0 });
    });

    it("should keep a wall under a 3D model", () => {
        expect(
            computeCellBlock([
                { layerName: "walls", collides: true },
                { layerName: "furniture", collides: false, model3d: "whiteboard" },
            ]).kind,
        ).toBe("wall");
    });
});

describe("groupModelCells", () => {
    it("should merge adjacent cells of the same model", () => {
        const placements = groupModelCells([
            { x: 2, y: 3, model: "desk", layer: "furniture" },
            { x: 3, y: 3, model: "desk", layer: "furniture" },
            { x: 5, y: 3, model: "desk", layer: "furniture" },
            { x: 2, y: 4, model: "chair", layer: "furniture", rotation: 180 },
        ]);
        expect(placements).toHaveLength(3);
        expect(placements).toContainEqual({ model: "desk", x: 2, y: 3, width: 2, height: 1, rotation: 0 });
        expect(placements).toContainEqual({ model: "desk", x: 5, y: 3, width: 1, height: 1, rotation: 0 });
        expect(placements).toContainEqual({ model: "chair", x: 2, y: 4, width: 1, height: 1, rotation: 180 });
    });

    it("should build the bounding box of L-shaped groups", () => {
        const placements = groupModelCells([
            { x: 0, y: 0, model: "meeting_table", layer: "f" },
            { x: 1, y: 0, model: "meeting_table", layer: "f" },
            { x: 1, y: 1, model: "meeting_table", layer: "f" },
        ]);
        expect(placements).toEqual([{ model: "meeting_table", x: 0, y: 0, width: 2, height: 2, rotation: 0 }]);
    });

    it("should not merge cells from different layers", () => {
        expect(
            groupModelCells([
                { x: 0, y: 0, model: "plant", layer: "a" },
                { x: 1, y: 0, model: "plant", layer: "b" },
            ]),
        ).toHaveLength(2);
    });
});

describe("resolveEntityModel", () => {
    it("should map the default entity collections to 3D models", () => {
        expect(resolveEntityModel("Basic Chair")).toBe("chair");
        expect(resolveEntityModel("Armchair")).toBe("armchair");
        expect(resolveEntityModel("Couch")).toBe("sofa");
        expect(resolveEntityModel("Basic Wood Table")).toBe("desk");
        expect(resolveEntityModel("Basic Small Table")).toBe("round_table");
        expect(resolveEntityModel("Large Plant")).toBe("large_plant");
        expect(resolveEntityModel("Plant")).toBe("plant");
        expect(resolveEntityModel("Computer Screen (Big)")).toBe("monitor");
        expect(resolveEntityModel("Laptop")).toBe("laptop");
        expect(resolveEntityModel("Big Shelf")).toBe("bookshelf");
        expect(resolveEntityModel("Coffee Dispenser")).toBe("coffee_machine");
        expect(resolveEntityModel("Toilet")).toBe("toilet");
        expect(resolveEntityModel("Toilet Paper")).toBeUndefined();
    });

    it("should return undefined for unknown entities", () => {
        expect(resolveEntityModel("Spaceship")).toBeUndefined();
    });
});

describe("directionToRotation", () => {
    it("should convert the prefab directions", () => {
        expect(directionToRotation("Down")).toBe(0);
        expect(directionToRotation(undefined)).toBe(0);
        expect(directionToRotation("Left")).toBe(90);
        expect(directionToRotation("Up")).toBe(180);
        expect(directionToRotation("Right")).toBe(270);
    });
});

describe("computeIndoorCells", () => {
    const parse = (rows: string[]) => ({
        width: rows[0]?.length ?? 0,
        height: rows.length,
        isWall: (x: number, y: number) => rows[y]?.[x] === "#",
    });
    const render = (rows: string[], doorWidth?: number) => {
        const { width, height, isWall } = parse(rows);
        const indoor = computeIndoorCells(width, height, isWall, doorWidth);
        return rows.map((row, y) =>
            [...row].map((char, x) => (char === "#" ? "#" : indoor[y * width + x] ? "i" : ".")).join(""),
        );
    };

    it("should find the inside of a closed room", () => {
        expect(render(["........", ".######.", ".#....#.", ".#....#.", ".######.", "........"])).toEqual([
            "........",
            ".######.",
            ".#iiii#.",
            ".#iiii#.",
            ".######.",
            "........",
        ]);
    });

    it("should keep a room with a door indoor (the doorway itself has no ceiling)", () => {
        expect(render(["..........", ".########.", ".#......#.", ".#......#.", ".###..###.", ".........."])).toEqual([
            "..........",
            ".########.",
            ".#iiiiii#.",
            ".#iiiiii#.",
            ".###..###.",
            "..........",
        ]);
    });

    it("should consider wide openings as outdoor", () => {
        const result = render([
            "..........",
            ".########.",
            ".#......#.",
            ".#......#.",
            ".#......#.",
            ".." + "......" + "..",
        ]);
        expect(result.every((row) => !row.includes("i"))).toBe(true);
    });

    it("should not put a ceiling on open maps", () => {
        expect(render(["....", "....", "...."]).join("")).not.toContain("i");
    });
});
