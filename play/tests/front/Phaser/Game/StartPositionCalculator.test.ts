import { describe, expect, it, vi } from "vitest";
import type { AreaData, WAMFileFormat } from "@workadventure/map-editor";
import { GameMapAreas } from "@workadventure/map-editor";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { computeStartPosition, nearestWalkablePosition } from "../../../../src/front/Phaser/Game/StartPositionCalculator";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";

// No personal desk: the user is anonymous.
vi.mock("../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => undefined },
}));

const lobby: AreaData = {
    id: "lobby",
    name: "lobby",
    x: 0,
    y: 0,
    width: 96,
    height: 96,
    visible: true,
    properties: [{ id: "lobby-start", type: "start", isDefault: true }],
};

// The reported setup: a restricted area that is also a "Use if URL contains #class5b" start area.
const class5b: AreaData = {
    id: "class5b",
    name: "class5b",
    x: 200,
    y: 200,
    width: 160,
    height: 160,
    visible: true,
    properties: [
        { id: "class5b-start", type: "start", isDefault: false },
        { id: "class5b-rights", type: "restrictedRightsPropertyData", writeTags: ["teacher"], readTags: ["class5b"] },
    ],
};

const mapFile = { width: 20, height: 20, tilewidth: 32, tileheight: 32 } as ITiledMap;

function computeStartPositionFor(areas: AreaData[], userTags: string[], startPositionName?: string) {
    const gameMapAreas = new GameMapAreas({ areas } as unknown as WAMFileFormat);
    const gameMapFrontWrapper = {
        getAreaByName: (name: string) => gameMapAreas.getAreaByName(name),
        getAreas: () => gameMapAreas.getAreas(),
        dynamicAreas: new Map(),
        getFlatLayers: () => [],
        hasStartTile: () => false,
    } as unknown as GameMapFrontWrapper;
    const isPositionAllowed = (position: { x: number; y: number }) =>
        gameMapAreas.getForbiddenAreasOnPosition(position, userTags).length === 0;

    return {
        position: computeStartPosition(gameMapFrontWrapper, mapFile, undefined, startPositionName, isPositionAllowed),
        isPositionAllowed,
        isInside: (position: { x: number; y: number }, areaId: string) =>
            gameMapAreas.isPlayerInsideArea(areaId, position),
    };
}

describe("computeStartPosition", () => {
    it("spawns in the start area named in the URL when the user has access to it", () => {
        const { position, isInside } = computeStartPositionFor([lobby, class5b], ["class5b"], "class5b");

        expect(isInside(position, "class5b")).toBe(true);
    });

    it("falls back to the default start area when the user has no access to the start area named in the URL", () => {
        for (let i = 0; i < 20; i++) {
            const { position, isPositionAllowed, isInside } = computeStartPositionFor([lobby, class5b], [], "class5b");

            expect(isInside(position, "class5b")).toBe(false);
            expect(isPositionAllowed(position)).toBe(true);
            expect(position.x).toBeGreaterThanOrEqual(lobby.x);
            expect(position.x).toBeLessThanOrEqual(lobby.x + lobby.width);
            expect(position.y).toBeGreaterThanOrEqual(lobby.y);
            expect(position.y).toBeLessThanOrEqual(lobby.y + lobby.height);
        }
    });

    it("keeps the forbidden start position when the map has no other one", () => {
        const { position, isInside } = computeStartPositionFor([class5b], [], "class5b");

        expect(isInside(position, "class5b")).toBe(true);
    });
});

// 0: walkable, 1: collider
const grid = [
    [1, 1, 1, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 0, 1],
];

describe("nearestWalkablePosition", () => {
    it("should keep a position that is already walkable", () => {
        expect(nearestWalkablePosition({ x: 40, y: 45 }, grid, 32, 32)).toEqual({ x: 40, y: 45 });
    });

    it("should move a position inside a wall to the center of the closest walkable tile", () => {
        // Tile (2, 1) is a wall, tiles (1, 1) and (3, 1) are free: the first found wins
        const position = nearestWalkablePosition({ x: 2 * 32 + 10, y: 32 + 10 }, grid, 32, 32);
        expect([
            { x: 48, y: 48 },
            { x: 112, y: 48 },
        ]).toContainEqual(position);
        // Tile (3, 2) is a wall between the free tiles (3, 1) and (3, 3)
        expect([
            { x: 112, y: 48 },
            { x: 112, y: 112 },
        ]).toContainEqual(nearestWalkablePosition({ x: 3 * 32 + 5, y: 2 * 32 + 5 }, grid, 32, 32));
        // Tile (0, 1) is a wall next to the free tile (1, 1)
        expect(nearestWalkablePosition({ x: 5, y: 32 + 5 }, grid, 32, 32)).toEqual({ x: 48, y: 48 });
    });

    it("should give up when no walkable tile is close enough", () => {
        const walls = [
            [1, 1, 1],
            [1, 1, 1],
        ];
        expect(nearestWalkablePosition({ x: 10, y: 10 }, walls, 32, 32)).toEqual({ x: 10, y: 10 });
    });
});
