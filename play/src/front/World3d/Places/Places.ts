/**
 * A "place" is a named area of the map the player can travel to from the places menu (a meeting room, the
 * cafeteria, a desk cluster...). Places are extracted from the named areas of the map:
 * - areas drawn in Tiled (objects with the "area" class),
 * - areas created with the map editor.
 *
 * A Tiled area can be hidden from the list with a "place" boolean property set to false, or renamed with a "place"
 * string property.
 */

export type PlaceKind = "meeting" | "stage" | "focus" | "desk" | "social" | "entrance" | "other";

export interface Place {
    id: string;
    name: string;
    kind: PlaceKind;
    /** Center of the place, in game pixels. */
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TiledAreaSource {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    properties: { [key: string]: unknown };
}

export interface EditorAreaSource {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    properties: readonly { type: string }[];
}

const MEETING_NAME_PATTERN = /meeting|conference|boardroom|huddle|breakout|war ?room/i;
const SOCIAL_NAME_PATTERN = /lounge|cafe|café|coffee|kitchen|bar|garden|terrace|social|chill|lobby|cafeteria|game/i;
const DESK_NAME_PATTERN = /desk|office|pod|team|workspace|open ?space/i;
const ENTRANCE_NAME_PATTERN = /entrance|reception|hall|welcome/i;

function kindFromName(name: string): PlaceKind | undefined {
    if (MEETING_NAME_PATTERN.test(name)) {
        return "meeting";
    }
    if (SOCIAL_NAME_PATTERN.test(name)) {
        return "social";
    }
    if (ENTRANCE_NAME_PATTERN.test(name)) {
        return "entrance";
    }
    if (DESK_NAME_PATTERN.test(name)) {
        return "desk";
    }
    return undefined;
}

function isHiddenOrUnnamed(name: string): boolean {
    return name.trim() === "" || name.startsWith("unnamed_tiled_area_");
}

/**
 * Converts a Tiled "area" object into a place. Returns undefined for areas that should not be listed.
 */
export function placeFromTiledArea(area: TiledAreaSource): Place | undefined {
    const placeProperty = area.properties["place"];
    if (placeProperty === false) {
        return undefined;
    }
    const name = typeof placeProperty === "string" && placeProperty.trim() !== "" ? placeProperty : area.name;
    if (isHiddenOrUnnamed(name)) {
        return undefined;
    }
    // Areas that are only there to hold a script trigger are not interesting places, unless explicitly flagged
    let kind: PlaceKind | undefined;
    const properties = area.properties;
    if (properties["speakerMegaphone"] !== undefined) {
        kind = "stage";
    } else if (
        properties["jitsiRoom"] !== undefined ||
        properties["bbbMeeting"] !== undefined ||
        properties["livekitRoom"] !== undefined
    ) {
        kind = "meeting";
    } else if (properties["silent"] === true) {
        kind = "focus";
    } else if (properties["start"] === true || name === "start") {
        kind = "entrance";
    }
    kind = kind ?? kindFromName(name);
    if (kind === undefined && typeof placeProperty !== "string" && placeProperty !== true) {
        return undefined;
    }
    return {
        id: `tiled:${area.name}`,
        name,
        kind: kind ?? "other",
        x: area.x + area.width / 2,
        y: area.y + area.height / 2,
        width: area.width,
        height: area.height,
    };
}

/**
 * Converts an area created with the map editor into a place. Every named map-editor area is listed: they are
 * created by hand, a name means somebody wanted to reference it.
 */
export function placeFromEditorArea(area: EditorAreaSource): Place | undefined {
    if (isHiddenOrUnnamed(area.name)) {
        return undefined;
    }
    const types = new Set(area.properties.map((property) => property.type));
    let kind: PlaceKind | undefined;
    if (types.has("speakerMegaphone")) {
        kind = "stage";
    } else if (types.has("jitsiRoomProperty") || types.has("livekitRoomProperty")) {
        kind = "meeting";
    } else if (types.has("silent")) {
        kind = "focus";
    } else if (types.has("personalAreaPropertyData")) {
        kind = "desk";
    } else if (types.has("start")) {
        kind = "entrance";
    }
    return {
        id: `editor:${area.id}`,
        name: area.name,
        kind: kind ?? kindFromName(area.name) ?? "other",
        x: area.x + area.width / 2,
        y: area.y + area.height / 2,
        width: area.width,
        height: area.height,
    };
}

const KIND_ORDER: readonly PlaceKind[] = ["entrance", "meeting", "stage", "desk", "focus", "social", "other"];

/**
 * Builds the sorted, de-duplicated list of places of a map.
 */
export function extractPlaces(tiledAreas: Iterable<TiledAreaSource>, editorAreas: Iterable<EditorAreaSource>): Place[] {
    const places: Place[] = [];
    const seenNames = new Set<string>();
    const add = (place: Place | undefined) => {
        if (place === undefined || seenNames.has(place.name)) {
            return;
        }
        seenNames.add(place.name);
        places.push(place);
    };
    for (const area of tiledAreas) {
        add(placeFromTiledArea(area));
    }
    for (const area of editorAreas) {
        add(placeFromEditorArea(area));
    }
    return places.sort(
        (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name),
    );
}
