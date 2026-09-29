import type { AreaData } from "@workadventure/map-editor";
import { MathUtils } from "@workadventure/math-utils";
import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";

import type { PositionInterface } from "../../Connection/ConnexionModels";
import { localUserStore } from "../../Connection/LocalUserStore";
import { PathTileType } from "../../Utils/PathfindingManager";
import type { GameMapFrontWrapper } from "./GameMap/GameMapFrontWrapper";

const DEFAULT_START_NAME = "start";
// ponytail: random redraws, not an exhaustive search. A start zone mostly covered by areas the user cannot enter can
// still miss its free spots, then the next kind of start position is used.
const MAX_DRAWS_PER_CANDIDATE = 10;

/**
 * Chooses where the current player appears. Never inside an area the user has no access to (see isPositionAllowed)
 * when the map offers another start position: a forbidden "#area-name" falls back to the default start position.
 */
export function computeStartPosition(
    gameMapFrontWrapper: GameMapFrontWrapper,
    mapFile: ITiledMap,
    initPosition: PositionInterface | undefined,
    startPositionName: string | undefined,
    isPositionAllowed: (position: PositionInterface) => boolean,
): PositionInterface {
    // From the most to the least specific. Most of them draw a random position, hence the functions.
    const candidates: (() => PositionInterface | undefined)[] = [];
    if (initPosition !== undefined) {
        // Never start inside a wall
        candidates.push(() => snapToWalkable(gameMapFrontWrapper, initPosition));
    }
    if (startPositionName) {
        candidates.push(
            // a map-editor area with the correct area name and a "start" property
            () => getStartPositionFromArea(gameMapFrontWrapper, startPositionName),
            // a Tiled area object
            () => getStartPositionFromTiledArea(gameMapFrontWrapper, startPositionName, true),
            // a layer with the custom name
            () => getStartPositionFromLayerName(gameMapFrontWrapper, mapFile, startPositionName),
            // a tile
            () => getStartPositionFromTile(gameMapFrontWrapper, mapFile, startPositionName),
        );
    }
    candidates.push(
        () => getStartPositionFromPersonalArea(gameMapFrontWrapper),
        // map-editor areas with the DEFAULT property set
        () => getStartPositionFromDefaultStartArea(gameMapFrontWrapper),
        () => getStartPositionFromTiledArea(gameMapFrontWrapper, DEFAULT_START_NAME, false),
        () => getStartPositionFromTile(gameMapFrontWrapper, mapFile, DEFAULT_START_NAME),
        () => getStartPositionFromLayerName(gameMapFrontWrapper, mapFile),
    );

    let firstForbiddenPosition: PositionInterface | undefined = undefined;
    for (const candidate of candidates) {
        for (let draw = 0; draw < MAX_DRAWS_PER_CANDIDATE; draw++) {
            const position = candidate();
            if (position === undefined) {
                break;
            }
            if (isPositionAllowed(position)) {
                return position;
            }
            firstForbiddenPosition ??= position;
        }
    }

    if (firstForbiddenPosition !== undefined) {
        // ponytail: the map has no start position this user may enter. Keep the one they would have had before
        // access rights were checked at spawn, rather than inventing one that may be inside a wall.
        console.warn("Every start position of this map is inside an area the user does not have access to.");
        return firstForbiddenPosition;
    }

    // Still no start position? Something is wrong with the map, we need a "start" layer.
    console.warn('This map is missing a layer named "start" that contains the available default start positions.');
    // Let's start in the middle of the map, but never inside a wall
    return snapToWalkable(gameMapFrontWrapper, {
        x: (mapFile.width ?? 0) * 16,
        y: (mapFile.height ?? 0) * 16,
    });
}

function snapToWalkable(gameMapFrontWrapper: GameMapFrontWrapper, position: PositionInterface): PositionInterface {
    const tileDimensions = gameMapFrontWrapper.getTileDimensions();
    return nearestWalkablePosition(
        position,
        gameMapFrontWrapper.getCollisionGrid(),
        tileDimensions.width,
        tileDimensions.height,
    );
}

function getStartPositionFromPersonalArea(gameMapFrontWrapper: GameMapFrontWrapper): PositionInterface | undefined {
    const uuid = localUserStore.getLocalUser()?.uuid;
    if (!uuid) {
        return undefined;
    }
    const personalArea = gameMapFrontWrapper.getGameMap().getWamFile()?.getGameMapAreas().findPersonalArea(uuid);
    if (!personalArea) {
        return undefined;
    }
    return {
        x: personalArea.x + personalArea.width * 0.5,
        y: personalArea.y + personalArea.height * 0.5,
    };
}

/**
 * Returns the position itself if it is on a walkable tile, else the center of the closest walkable tile (searching
 * up to `maxDistance` tiles away). Positions are in game pixels.
 */
export function nearestWalkablePosition(
    position: PositionInterface,
    collisionGrid: readonly (readonly number[])[],
    tileWidth: number,
    tileHeight: number,
    maxDistance = 30,
): PositionInterface {
    const height = collisionGrid.length;
    const width = collisionGrid[0]?.length ?? 0;
    const isWalkable = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < width && y < height && collisionGrid[y]?.[x] !== PathTileType.Collider;
    const startX = Math.floor(position.x / tileWidth);
    const startY = Math.floor(position.y / tileHeight);
    if (width === 0 || isWalkable(startX, startY)) {
        return position;
    }
    // Breadth-first search: the closest walkable tile in number of steps
    const visited = new Set<number>([startY * width + startX]);
    let frontier: [number, number][] = [[startX, startY]];
    for (let distance = 1; distance <= maxDistance && frontier.length > 0; distance++) {
        const next: [number, number][] = [];
        for (const [x, y] of frontier) {
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ] as const) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height || visited.has(ny * width + nx)) {
                    continue;
                }
                if (isWalkable(nx, ny)) {
                    return { x: nx * tileWidth + tileWidth / 2, y: ny * tileHeight + tileHeight / 2 };
                }
                visited.add(ny * width + nx);
                next.push([nx, ny]);
            }
        }
        frontier = next;
    }
    return position;
}

function getStartPositionFromTiledArea(
    gameMapFrontWrapper: GameMapFrontWrapper,
    startPositionName: string,
    needStartProperty = false,
): PositionInterface | undefined {
    const tiledAreas = gameMapFrontWrapper.dynamicAreas;
    for (const [name, tiledArea] of tiledAreas.entries()) {
        if (!tiledArea || name !== startPositionName) {
            continue;
        }
        const properties = tiledArea.properties;
        if (needStartProperty && properties) {
            if (!properties["start"]) {
                return undefined;
            }
        }
        const tiledAreaRect: { x: number; y: number; width: number; height: number } = {
            x: tiledArea.x,
            y: tiledArea.y,
            width: tiledArea.width ?? 0,
            height: tiledArea.height ?? 0,
        };
        return MathUtils.randomPositionFromRect(tiledAreaRect, 16);
    }
    return undefined;
}

/**
 * Look in the map-editor areas for an area with the name "startPositionName" and a property "start".
 */
function getStartPositionFromArea(
    gameMapFrontWrapper: GameMapFrontWrapper,
    startPositionName: string,
): PositionInterface | undefined {
    const area = gameMapFrontWrapper.getAreaByName(startPositionName);
    if (area) {
        if (!area.properties.find((property) => property.type === "start")) {
            return undefined;
        }
        return MathUtils.randomPositionFromRect(area, 16);
    }
    return undefined;
}

function getStartPositionFromDefaultStartArea(gameMapFrontWrapper: GameMapFrontWrapper): PositionInterface | undefined {
    const areas = gameMapFrontWrapper.getAreas();

    const defaultStartAreas: AreaData[] = [];

    for (const area of areas?.values() ?? []) {
        for (const properties of area.properties) {
            if (properties.type === "start" && properties.isDefault === true) {
                defaultStartAreas.push(area);
            }
        }
    }

    if (defaultStartAreas.length === 0) {
        return undefined;
    }

    return randomPositionFromRects(defaultStartAreas);
}

/**
 * Return a random position in one of the rectangles passed in parameter
 */
function randomPositionFromRects(
    rectangles: { x: number; y: number; width: number; height: number }[],
    margin = 0,
): { x: number; y: number } {
    const rectangle = rectangles[Math.floor(Math.random() * rectangles.length)];
    return MathUtils.randomPositionFromRect(rectangle, margin);
}

function getStartPositionFromLayerName(
    gameMapFrontWrapper: GameMapFrontWrapper,
    mapFile: ITiledMap,
    startPositionName?: string,
): PositionInterface | undefined {
    let foundLayer: ITiledMapLayer | undefined = undefined;

    const tileLayers = gameMapFrontWrapper.getFlatLayers().filter((layer) => layer.type === "tilelayer");

    if (startPositionName) {
        for (const layer of tileLayers) {
            //we want to prioritize the selectedLayer rather than "start" layer
            if (
                [layer.name, `#${layer.name}`].includes(startPositionName) ||
                layer.name.endsWith("/" + startPositionName)
            ) {
                try {
                    const startPosition = gameMapFrontWrapper.getRandomPositionFromLayer(layer.name);
                    return {
                        x: startPosition.x * (mapFile.tilewidth ?? 0) + (mapFile.tilewidth ?? 0) / 2,
                        y: startPosition.y * (mapFile.tileheight ?? 0) + (mapFile.tileheight ?? 0) / 2,
                    };
                } catch (e: unknown) {
                    console.error("Error while finding start position: ", e);
                }
            }
        }
    } else {
        foundLayer = tileLayers.find(
            (layer) => layer.name === DEFAULT_START_NAME || layer.name.endsWith("/" + DEFAULT_START_NAME),
        );
        if (!foundLayer) {
            for (const layer of tileLayers) {
                if (gameMapFrontWrapper.isStartObject(layer)) {
                    foundLayer = layer;
                    break;
                }
            }
        }
    }
    if (foundLayer) {
        try {
            const startPosition = gameMapFrontWrapper.getRandomPositionFromLayer(foundLayer.name);
            return {
                x: startPosition.x * (mapFile.tilewidth ?? 0) + (mapFile.tilewidth ?? 0) / 2,
                y: startPosition.y * (mapFile.tileheight ?? 0) + (mapFile.tileheight ?? 0) / 2,
            };
        } catch (e: unknown) {
            console.error("Error while finding start position: ", e);
        }
    }
    return undefined;
}

function getStartPositionFromTile(
    gameMapFrontWrapper: GameMapFrontWrapper,
    mapFile: ITiledMap,
    startPositionName: string,
): PositionInterface | undefined {
    if (!gameMapFrontWrapper.hasStartTile()) {
        return undefined;
    }
    const layer = gameMapFrontWrapper.findLayer(startPositionName);
    if (!layer) {
        return undefined;
    }
    if (layer.type !== "tilelayer") {
        return undefined;
    }
    const tiles = layer.data;
    if (typeof tiles === "string") {
        return undefined;
    }
    const possibleStartPositions: PositionInterface[] = [];
    tiles.forEach((objectKey: number, key: number) => {
        if (objectKey === 0 || !layer) {
            return;
        }
        const y = Math.floor(key / layer.width);
        const x = key % layer.width;

        const properties = gameMapFrontWrapper.getPropertiesForIndex(objectKey);
        if (
            !properties.length ||
            !properties.some((property) => property.name == "start" && property.value == startPositionName)
        ) {
            return;
        }
        possibleStartPositions.push({
            x: x * (mapFile.tilewidth ?? 0) + (mapFile.tilewidth ?? 0) / 2,
            y: y * (mapFile.tileheight ?? 0) + (mapFile.tileheight ?? 0) / 2,
        });
    });
    // Get a value at random amongst allowed values
    if (possibleStartPositions.length === 0) {
        return undefined;
    }
    // Choose one of the available start positions at random amongst the list of available start positions.
    return possibleStartPositions[Math.floor(Math.random() * possibleStartPositions.length)];
}
