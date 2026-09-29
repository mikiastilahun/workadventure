export type ViewMode = "2d" | "3d";

export function isViewMode(value: unknown): value is ViewMode {
    return value === "2d" || value === "3d";
}

/**
 * Decides the view mode used when the game starts.
 * Priority: the "view" URL parameter, then the last choice of the user, then the server default.
 * The 3D view is never used on browsers without WebGL.
 */
export function resolveInitialViewMode(
    urlParameter: string | null,
    storedPreference: string | null,
    serverDefault: string | undefined,
    webglSupported: boolean,
): ViewMode {
    if (!webglSupported) {
        return "2d";
    }
    for (const candidate of [urlParameter, storedPreference, serverDefault]) {
        if (isViewMode(candidate)) {
            return candidate;
        }
    }
    return "2d";
}

export function isWebGLSupported(): boolean {
    try {
        const canvas = document.createElement("canvas");
        return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
    } catch {
        return false;
    }
}
