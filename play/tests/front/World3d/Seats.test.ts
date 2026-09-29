import { describe, expect, it } from "vitest";
import { findClosestSeat, resolveRemoteSeat, seatFromModel } from "../../../src/front/World3d/Scene/Seats";

const seats = [
    { x: 10.5, y: 5.5, rotation: 180, height: 0.36 },
    { x: 12.5, y: 5.5, rotation: 180, height: 0.36 },
];

describe("seatFromModel", () => {
    it("should only create seats for the models people sit on", () => {
        expect(seatFromModel("office_chair", 1, 2, 90)).toEqual({ x: 1, y: 2, rotation: 90, height: 0.36 });
        expect(seatFromModel("sofa", 1, 2, 0)?.height).toBe(0.3);
        expect(seatFromModel("office_desk", 1, 2, 0)).toBeUndefined();
    });
});

describe("findClosestSeat", () => {
    it("should find the closest seat in range", () => {
        expect(findClosestSeat(seats, 12, 5.4, 1)).toBe(seats[1]);
        expect(findClosestSeat(seats, 20, 20, 1)).toBeUndefined();
    });
});

describe("resolveRemoteSeat", () => {
    it("should accept a real seat next to the player", () => {
        expect(resolveRemoteSeat(seats[0], seats, 10, 6.5)).toBe(seats[0]);
    });

    it("should reject malformed seats, unknown seats and seats far from the player", () => {
        expect(resolveRemoteSeat("chair", seats, 10, 6)).toBeUndefined();
        expect(resolveRemoteSeat({ x: 30, y: 30, rotation: 0, height: 0.3 }, seats, 30, 30)).toBeUndefined();
        expect(resolveRemoteSeat(seats[0], seats, 20, 20)).toBeUndefined();
        expect(resolveRemoteSeat({ ...seats[0], height: 50 }, seats, 10, 6)).toBeUndefined();
    });
});
