import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/front/Connection/LocalUserStore", () => ({ localUserStore: {} }));

import { nearestWalkablePosition } from "../../../../src/front/Phaser/Game/StartPositionCalculator";

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
