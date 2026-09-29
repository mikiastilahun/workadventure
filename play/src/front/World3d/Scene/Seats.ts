import { z } from "zod";

/**
 * A place where an avatar can sit. Coordinates in tiles.
 */
export const Seat = z.object({
    x: z.number(),
    y: z.number(),
    /** Direction the seated person faces, in degrees: 0 south, 90 west, 180 north, 270 east */
    rotation: z.number(),
    /** Height of the seat, in tiles */
    height: z.number().min(0).max(1),
});
export type Seat = z.infer<typeof Seat>;

/**
 * Seat height (tiles) of the models people can sit on. 1 tile ≈ 1.4 m.
 */
const SEAT_HEIGHTS: Readonly<Record<string, number>> = {
    office_chair: 0.36,
    chair: 0.33,
    armchair: 0.3,
    sofa: 0.3,
    bench: 0.31,
    pouf: 0.25,
};

export function seatFromModel(model: string, x: number, y: number, rotation: number): Seat | undefined {
    const height = SEAT_HEIGHTS[model];
    return height === undefined ? undefined : { x, y, rotation, height };
}

/**
 * The seat an avatar standing at (x, y) is sitting on, if any: the closest seat within `maxDistance` tiles.
 */
export function findClosestSeat(seats: readonly Seat[], x: number, y: number, maxDistance: number): Seat | undefined {
    let closest: Seat | undefined;
    let closestDistance = maxDistance;
    for (const seat of seats) {
        const distance = Math.hypot(seat.x - x, seat.y - y);
        if (distance <= closestDistance) {
            closest = seat;
            closestDistance = distance;
        }
    }
    return closest;
}

/**
 * Validates the seat another player says they sit on: it must be a real seat of the map, close to where that
 * player stands (avatars cannot teleport onto a chair on the other side of the map).
 */
export function resolveRemoteSeat(
    value: unknown,
    seats: readonly Seat[],
    playerX: number,
    playerY: number,
    maxDistance = 2,
): Seat | undefined {
    const parsed = Seat.safeParse(value);
    if (!parsed.success) {
        return undefined;
    }
    const seat = findClosestSeat(seats, parsed.data.x, parsed.data.y, 0.05);
    if (!seat || Math.hypot(seat.x - playerX, seat.y - playerY) > maxDistance) {
        return undefined;
    }
    return seat;
}
