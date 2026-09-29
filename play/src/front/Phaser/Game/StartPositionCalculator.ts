import type { AreaData } from "@workadventure/map-editor";
import { MathUtils } from "@workadventure/math-utils";
import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";

import type { PositionInterface } from "../../Connection/ConnexionModels";
import { localUserStore } from "../../Connection/LocalUserStore";
import { PathTileType } from "../../Utils/PathfindingManager";
import type { GameMapFrontWrapper } from "./GameMap/GameMapFrontWrapper";

const DEFAULT_START_NAME = "start";

export function computeStartPosition(
    gameMapFrontWrapper: GameMapFrontWrapper,
    mapFile: ITiledMap,
    initPosition?: PositionInterface,
    startPositionName?: string,
): PositionInterface {
    let startPosition: PositionInterface | undefined = undefined;
    // If there is an init position passed
    if (initPosition != undefined) {
        startPosition = initPosition;
    } else {
        if (startPositionName) {
            // try to get custom starting position from a map-editor area object with the correct area name
            startPosition = getStartPositionFromArea(gameMapFrontWrapper, startPositionName);
            if (startPosition) {
                return startPosition;
            }

            // try to get custom starting position from Area object
            startPosition = getStartPositionFromTiledArea(gameMapFrontWrapper, startPositionName, true);
            if (startPosition) {
                return startPosition;
            }

            // if not found, look for custom name Layers
            startPosition = getStartPositionFromLayerName(gameMapFrontWrapper, mapFile, startPositionName);
            if (startPosition) {
                return startPosition;
            }

            // if not found, look for Tile
            startPosition = getStartPositionFromTile(gameMapFrontWrapper, mapFile, startPositionName);
            if (startPosition) {
                return startPosition;
            }
        }

        // If no start position in the URL, let's look if we have a personal desk first
        const uuid = localUserStore.getLocalUser()?.uuid;
        if (uuid) {
            const personalArea = gameMapFrontWrapper
                .getGameMap()
                .getWamFile()
                ?.getGameMapAreas()
                .findPersonalArea(uuid);
            if (personalArea) {
                return {
                    x: personalArea.x + personalArea.width * 0.5,
                    y: personalArea.y + personalArea.height * 0.5,
                };
            }
        }

        // if not found, look for map-editor areas with DEFAULT property set
        startPosition = getStartPositionFromDefaultStartArea(gameMapFrontWrapper);
        if (startPosition) {
            return startPosition;
        }

        // try to get custom starting position from Area object
        startPosition = getStartPositionFromTiledArea(gameMapFrontWrapper, DEFAULT_START_NAME, false);
        if (startPosition) {
            return startPosition;
        }

        // if not found, look for Tile
        startPosition = getStartPositionFromTile(gameMapFrontWrapper, mapFile, DEFAULT_START_NAME);
        if (startPosition) {
            return startPosition;
        }

        // default name layer
        startPosition = getStartPositionFromLayerName(gameMapFrontWrapper, mapFile);
        if (startPosition) {
            return startPosition;
        }
    }
    // Still no start position? Something is wrong with the map, we need a "start" layer.
    if (startPosition === undefined) {
        console.warn('This map is missing a layer named "start" that contains the available default start positions.');
        // Let's start in the middle of the map
        startPosition = {
            x: (mapFile.width ?? 0) * 16,
            y: (mapFile.height ?? 0) * 16,
        };
    }

    // Never start inside a wall (the middle of the map, or a start zone drawn over obstacles)
    const tileDimensions = gameMapFrontWrapper.getTileDimensions();
    return nearestWalkablePosition(
        startPosition,
        gameMapFrontWrapper.getCollisionGrid(),
        tileDimensions.width,
        tileDimensions.height,
    );
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
