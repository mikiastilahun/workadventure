import { writable } from "svelte/store";
import type { Place } from "../Places/Places";

/**
 * The places of the current map, refreshed when the map (or its areas) change.
 */
export const placesStore = writable<Place[]>([]);

export const placesPanelVisibleStore = writable(false);

/**
 * The place the player is currently walking to, if any.
 */
export const travelDestinationStore = writable<Place | undefined>(undefined);
