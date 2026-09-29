/**
 * Lightweight state shared between the 3D view and the input handling of the game scene. It is kept free of any
 * Three.js import so the input code can use it without pulling the 3D engine.
 */
export interface World3dPointerHandler {
    /**
     * Handles a click/tap on the game canvas while the 3D view is displayed. Coordinates are client (viewport)
     * coordinates.
     */
    handleClick(clientX: number, clientY: number): void;
}

class World3dState {
    /** True while the 3D view is displayed */
    public active = false;
    /** Quarter turns between the map "up" and the direction the 3D camera looks at (see MovementRemap) */
    public quarterTurns = 0;
    /** Horizontal direction the camera looks at, in map coordinates (x right, y towards the bottom) */
    public cameraForwardX = 0;
    public cameraForwardY = -1;
    /** True if the pointer moved enough since it was pressed to be considered a camera drag and not a click */
    public pointerDragged = false;
    public pointerHandler: World3dPointerHandler | undefined;
}

export const world3dState = new World3dState();
