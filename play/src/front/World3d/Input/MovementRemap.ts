export interface DirectionalInput {
    up: boolean;
    right: boolean;
    down: boolean;
    left: boolean;
}

/**
 * Returns how many quarter turns (clockwise, seen from above, 0 to 3) separate the "up" direction of the map from the
 * direction the camera is looking at. `forwardX` / `forwardY` is the horizontal direction the camera looks at, in map
 * coordinates (x to the right, y to the bottom of the map).
 */
export function cameraQuarterTurns(forwardX: number, forwardY: number): number {
    // Angle, clockwise from map "up" (0, -1)
    const angle = Math.atan2(forwardX, -forwardY);
    const quarters = Math.round(angle / (Math.PI / 2));
    return ((quarters % 4) + 4) % 4;
}

/**
 * In 3D, the camera can orbit around the player. The arrow keys must move the player relatively to the screen, not
 * to the map: when the camera looks towards the right of the map, "up" must move the player towards the right.
 * Movement stays aligned on the 4 directions of the map, which is what the 2D engine understands.
 */
export function remapDirectionalInput(input: DirectionalInput, quarterTurns: number): DirectionalInput {
    const turns = ((quarterTurns % 4) + 4) % 4;
    // Clockwise order
    const pressed = [input.up, input.right, input.down, input.left];
    const rotated = [false, false, false, false];
    for (let i = 0; i < 4; i++) {
        rotated[(i + turns) % 4] = pressed[i] ?? false;
    }
    return {
        up: rotated[0] ?? false,
        right: rotated[1] ?? false,
        down: rotated[2] ?? false,
        left: rotated[3] ?? false,
    };
}

/**
 * Third-person controls: the arrow keys move the player relatively to the camera (up = where the camera looks),
 * like in most 3D games. The 2D engine only knows 8 directions: the wanted direction is snapped to the closest one.
 * `forwardX` / `forwardY` is the horizontal direction the camera looks at, in map coordinates.
 */
export function remapInputToCamera(input: DirectionalInput, forwardX: number, forwardY: number): DirectionalInput {
    const forwardAmount = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const rightAmount = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (forwardAmount === 0 && rightAmount === 0) {
        return { up: false, right: false, down: false, left: false };
    }
    const length = Math.hypot(forwardX, forwardY) || 1;
    const fx = forwardX / length;
    const fy = forwardY / length;
    // Right of the camera, in map coordinates (y towards the bottom of the map)
    const rx = -fy;
    const ry = fx;
    const x = fx * forwardAmount + rx * rightAmount;
    const y = fy * forwardAmount + ry * rightAmount;
    // Snap to one of the 8 directions
    const octant = Math.round(Math.atan2(y, x) / (Math.PI / 4));
    const snappedX = Math.round(Math.cos((octant * Math.PI) / 4));
    const snappedY = Math.round(Math.sin((octant * Math.PI) / 4));
    return { up: snappedY < 0, down: snappedY > 0, left: snappedX < 0, right: snappedX > 0 };
}
