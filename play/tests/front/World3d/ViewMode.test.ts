import { describe, expect, it } from "vitest";
import { resolveInitialViewMode } from "../../../src/front/World3d/ViewMode";

describe("resolveInitialViewMode", () => {
    it("should follow URL parameter, then stored preference, then server default", () => {
        expect(resolveInitialViewMode("2d", "3d", "3d", true)).toBe("2d");
        expect(resolveInitialViewMode(null, "2d", "3d", true)).toBe("2d");
        expect(resolveInitialViewMode("bogus", "bogus", "2d", true)).toBe("2d");
        expect(resolveInitialViewMode(null, null, undefined, true)).toBe("2d");
    });

    it("should always use 2D without WebGL", () => {
        expect(resolveInitialViewMode("3d", "3d", "3d", false)).toBe("2d");
    });
});
