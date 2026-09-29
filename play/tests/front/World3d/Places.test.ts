import { describe, expect, it } from "vitest";
import { extractPlaces, placeFromEditorArea, placeFromTiledArea } from "../../../src/front/World3d/Places/Places";

const tiledArea = (name: string, properties: Record<string, unknown> = {}) => ({
    name,
    x: 32,
    y: 64,
    width: 64,
    height: 32,
    properties,
});

describe("placeFromTiledArea", () => {
    it("should list meeting rooms at the center of the area", () => {
        expect(placeFromTiledArea(tiledArea("Meeting Room A", { jitsiRoom: "room-a" }))).toEqual({
            id: "tiled:Meeting Room A",
            name: "Meeting Room A",
            kind: "meeting",
            x: 64,
            y: 80,
            width: 64,
            height: 32,
        });
    });

    it("should detect the kind of the place", () => {
        expect(placeFromTiledArea(tiledArea("Stage", { speakerMegaphone: "talk" }))?.kind).toBe("stage");
        expect(placeFromTiledArea(tiledArea("Library", { silent: true }))?.kind).toBe("focus");
        expect(placeFromTiledArea(tiledArea("Cafeteria"))?.kind).toBe("social");
        expect(placeFromTiledArea(tiledArea("Team Desks"))?.kind).toBe("desk");
        expect(placeFromTiledArea(tiledArea("Reception"))?.kind).toBe("entrance");
        expect(placeFromTiledArea(tiledArea("Huddle Room 2"))?.kind).toBe("meeting");
        expect(placeFromTiledArea(tiledArea("Game Room"))?.kind).toBe("social");
    });

    it("should ignore unnamed areas, technical areas and areas hidden with place=false", () => {
        expect(placeFromTiledArea(tiledArea("unnamed_tiled_area_1", { jitsiRoom: "x" }))).toBeUndefined();
        expect(placeFromTiledArea(tiledArea("scriptTrigger"))).toBeUndefined();
        expect(placeFromTiledArea(tiledArea("Meeting", { jitsiRoom: "x", place: false }))).toBeUndefined();
    });

    it("should allow opting in and renaming with the place property", () => {
        expect(placeFromTiledArea(tiledArea("zone42", { place: true }))?.kind).toBe("other");
        expect(placeFromTiledArea(tiledArea("zone42", { place: "Rooftop" }))?.name).toBe("Rooftop");
    });
});

describe("placeFromEditorArea", () => {
    it("should list every named map-editor area", () => {
        const area = { id: "1", name: "Rooftop", x: 0, y: 0, width: 10, height: 20, properties: [] };
        expect(placeFromEditorArea(area)?.kind).toBe("other");
        expect(placeFromEditorArea({ ...area, properties: [{ type: "livekitRoomProperty" }] })?.kind).toBe("meeting");
        expect(placeFromEditorArea({ ...area, name: "" })).toBeUndefined();
    });
});

describe("extractPlaces", () => {
    it("should sort places by kind then name and remove duplicates", () => {
        const places = extractPlaces(
            [tiledArea("Kitchen"), tiledArea("Room B", { jitsiRoom: "b" }), tiledArea("Room A", { jitsiRoom: "a" })],
            [{ id: "e1", name: "Kitchen", x: 0, y: 0, width: 1, height: 1, properties: [] }],
        );
        expect(places.map((place) => place.name)).toEqual(["Room A", "Room B", "Kitchen"]);
    });
});
