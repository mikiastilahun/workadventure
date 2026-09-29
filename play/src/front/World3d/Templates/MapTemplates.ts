export const MAP_TEMPLATE_IDS = ["office", "conference", "campus"] as const;
export type MapTemplateId = (typeof MAP_TEMPLATE_IDS)[number];

/**
 * URL of the room opening a template. Templates are static Tiled maps served by the front
 * (play/public/map-templates), opened as public "_" rooms.
 */
export function getMapTemplateRoomUrl(id: MapTemplateId, location: Pick<Location, "origin" | "host">): string {
    return `${location.origin}/_/global/${location.host}/map-templates/${id}/map.tmj`;
}

export function getMapTemplatePreviewUrl(id: MapTemplateId, location: Pick<Location, "origin">): string {
    return `${location.origin}/map-templates/${id}/preview.png`;
}
