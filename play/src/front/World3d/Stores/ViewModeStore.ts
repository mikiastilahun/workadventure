import { derived, get, writable } from "svelte/store";
import { DEFAULT_VIEW_MODE } from "../../Enum/EnvironmentVariable";
import { mapEditorModeStore } from "../../Stores/MapEditorStore";
import type { ViewMode } from "../ViewMode";
import type { CameraMode } from "../World3dRenderer";
import { isWebGLSupported, resolveInitialViewMode } from "../ViewMode";

const STORAGE_KEY = "world3d.viewMode";

function readStoredPreference(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function createPreferredViewModeStore() {
    const webglSupported = isWebGLSupported();
    const initial = resolveInitialViewMode(
        new URLSearchParams(window.location.search).get("view"),
        readStoredPreference(),
        DEFAULT_VIEW_MODE,
        webglSupported,
    );
    const { subscribe, set } = writable<ViewMode>(initial);
    return {
        subscribe,
        webglSupported,
        set(mode: ViewMode) {
            const effectiveMode = webglSupported ? mode : "2d";
            set(effectiveMode);
            try {
                localStorage.setItem(STORAGE_KEY, effectiveMode);
            } catch {
                // Storage can be unavailable (private mode...). The choice is then only kept for this session.
            }
        },
        toggle() {
            this.set(get({ subscribe }) === "3d" ? "2d" : "3d");
        },
    };
}

/**
 * The view mode chosen by the user.
 */
export const preferredViewModeStore = createPreferredViewModeStore();

/**
 * The view mode actually displayed. The map editor only works in 2D: the 3D view is suspended while it is open.
 */
export const viewModeStore = derived(
    [preferredViewModeStore, mapEditorModeStore],
    ([$preferredViewMode, $mapEditorMode]): ViewMode => ($mapEditorMode ? "2d" : $preferredViewMode),
);

const CAMERA_MODE_STORAGE_KEY = "world3d.cameraMode";

function createCameraModeStore() {
    let initial: CameraMode = "game";
    try {
        if (localStorage.getItem(CAMERA_MODE_STORAGE_KEY) === "overview") {
            initial = "overview";
        }
    } catch {
        // Storage unavailable: use the default camera
    }
    const { subscribe, set } = writable<CameraMode>(initial);
    return {
        subscribe,
        set(mode: CameraMode) {
            set(mode);
            try {
                localStorage.setItem(CAMERA_MODE_STORAGE_KEY, mode);
            } catch {
                // The choice is only kept for this session
            }
        },
        toggle() {
            this.set(get({ subscribe }) === "game" ? "overview" : "game");
        },
    };
}

/**
 * The camera of the 3D view: "game" (third-person, behind the avatar) or "overview" (bird's-eye view).
 */
export const cameraModeStore = createCameraModeStore();
