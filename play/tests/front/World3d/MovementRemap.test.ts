import { describe, expect, it } from "vitest";
import {
    cameraQuarterTurns,
    remapDirectionalInput,
    remapInputToCamera,
} from "../../../src/front/World3d/Input/MovementRemap";

const none = { up: false, right: false, down: false, left: false };

describe("cameraQuarterTurns", () => {
    it("should compute the quarter turns from the camera forward vector", () => {
        expect(cameraQuarterTurns(0, -1)).toBe(0);
        expect(cameraQuarterTurns(1, 0)).toBe(1);
        expect(cameraQuarterTurns(0, 1)).toBe(2);
        expect(cameraQuarterTurns(-1, 0)).toBe(3);
        expect(cameraQuarterTurns(0.3, -1)).toBe(0);
        expect(cameraQuarterTurns(1, -0.2)).toBe(1);
    });
});

describe("remapDirectionalInput", () => {
    it("should not change anything when the camera looks at the top of the map", () => {
        expect(remapDirectionalInput({ ...none, up: true, left: true }, 0)).toEqual({ ...none, up: true, left: true });
    });

    it("should rotate the input with the camera", () => {
        expect(remapDirectionalInput({ ...none, up: true }, 1)).toEqual({ ...none, right: true });
        expect(remapDirectionalInput({ ...none, up: true }, 2)).toEqual({ ...none, down: true });
        expect(remapDirectionalInput({ ...none, up: true }, 3)).toEqual({ ...none, left: true });
        expect(remapDirectionalInput({ ...none, left: true }, 1)).toEqual({ ...none, up: true });
        expect(remapDirectionalInput({ ...none, right: true, down: true }, -1)).toEqual({
            ...none,
            up: true,
            right: true,
        });
    });
});

describe("remapInputToCamera", () => {
    it("should move towards where the camera looks", () => {
        expect(remapInputToCamera({ ...none, up: true }, 0, -1)).toEqual({ ...none, up: true });
        expect(remapInputToCamera({ ...none, up: true }, 1, 0)).toEqual({ ...none, right: true });
        expect(remapInputToCamera({ ...none, up: true }, 0, 1)).toEqual({ ...none, down: true });
    });

    it("should use diagonals when the camera looks between two directions", () => {
        expect(remapInputToCamera({ ...none, up: true }, 0.7, -0.7)).toEqual({ ...none, up: true, right: true });
        expect(remapInputToCamera({ ...none, up: true }, 0.3, -1)).toEqual({ ...none, up: true });
    });

    it("should strafe relatively to the camera", () => {
        expect(remapInputToCamera({ ...none, right: true }, 0, -1)).toEqual({ ...none, right: true });
        expect(remapInputToCamera({ ...none, right: true }, 1, 0)).toEqual({ ...none, down: true });
        expect(remapInputToCamera({ ...none, left: true }, 1, 0)).toEqual({ ...none, up: true });
        expect(remapInputToCamera({ ...none, up: true, right: true }, 0, -1)).toEqual({
            ...none,
            up: true,
            right: true,
        });
    });

    it("should not move without input", () => {
        expect(remapInputToCamera(none, 1, 0)).toEqual(none);
        expect(remapInputToCamera({ ...none, up: true, down: true }, 1, 0)).toEqual(none);
    });
});
