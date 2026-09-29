import type Phaser from "phaser";
import type { GameMapFrontWrapper } from "../../Phaser/Game/GameMap/GameMapFrontWrapper";
import { DEPTH_OVERLAY_INDEX } from "../../Phaser/Game/DepthIndexes";
import type { MapSource, MapSourceLayer, MapSourceTile, MapSourceTileImage } from "./MapSource";
import { normalizeProperties } from "./MapSource";

const OPACITY_SAMPLE_SIZE = 8;

/**
 * Exposes the Phaser tilemap of the game scene as a MapSource.
 */
export function createPhaserMapSource(wrapper: GameMapFrontWrapper): MapSource {
    const map = wrapper.phaserMap;
    const tilePropertiesCache = new Map<number, Record<string, unknown>>();

    const findTileset = (index: number): Phaser.Tilemaps.Tileset | undefined =>
        map.tilesets.find((tileset) => tileset.containsTileIndex(index));

    const getTilesetProperties = (index: number): Record<string, unknown> => {
        let properties = tilePropertiesCache.get(index);
        if (properties === undefined) {
            properties = normalizeProperties(findTileset(index)?.getTileProperties(index));
            tilePropertiesCache.set(index, properties);
        }
        return properties;
    };

    const opacityCache = new Map<number, number>();
    let opacityContext: CanvasRenderingContext2D | null | undefined;

    const layers: MapSourceLayer[] = [];
    for (const phaserLayer of wrapper.phaserLayers) {
        const layerData = phaserLayer.layer;
        if (layerData.name.startsWith("__")) {
            continue;
        }
        layers.push({
            name: layerData.name,
            visible: phaserLayer.visible,
            alpha: phaserLayer.alpha,
            overhead: phaserLayer.depth >= DEPTH_OVERLAY_INDEX,
            properties: normalizeProperties(layerData.properties),
            getTile(x: number, y: number): MapSourceTile | undefined {
                const tile = layerData.data[y]?.[x];
                if (!tile || tile.index < 0) {
                    return undefined;
                }
                const properties = { ...getTilesetProperties(tile.index), ...normalizeProperties(tile.properties) };
                return {
                    index: tile.index,
                    flipX: tile.flipX,
                    flipY: tile.flipY,
                    rotation: tile.rotation,
                    collides: tile.collides || properties["collides"] === true,
                    properties,
                };
            },
        });
    }

    const source: MapSource = {
        width: map.width,
        height: map.height,
        tileWidth: map.tileWidth,
        tileHeight: map.tileHeight,
        layers,
        getTileImage(index: number): MapSourceTileImage | undefined {
            const tileset = findTileset(index);
            if (!tileset || !tileset.image) {
                return undefined;
            }
            const coordinates = tileset.getTileTextureCoordinates(index);
            if (!coordinates || typeof coordinates !== "object" || !("x" in coordinates) || !("y" in coordinates)) {
                return undefined;
            }
            const x: unknown = coordinates.x;
            const y: unknown = coordinates.y;
            if (typeof x !== "number" || typeof y !== "number") {
                return undefined;
            }
            const image = tileset.image.getSourceImage();
            if (!(image instanceof HTMLImageElement || image instanceof HTMLCanvasElement)) {
                return undefined;
            }
            return { image, sx: x, sy: y, width: tileset.tileWidth, height: tileset.tileHeight };
        },
        getTileOpacity(index: number): number {
            const cached = opacityCache.get(index);
            if (cached !== undefined) {
                return cached;
            }
            let opacity = 1;
            const tileImage = source.getTileImage(index);
            if (opacityContext === undefined) {
                const canvas = document.createElement("canvas");
                canvas.width = OPACITY_SAMPLE_SIZE;
                canvas.height = OPACITY_SAMPLE_SIZE;
                opacityContext = canvas.getContext("2d", { willReadFrequently: true });
            }
            if (tileImage && opacityContext) {
                try {
                    opacityContext.clearRect(0, 0, OPACITY_SAMPLE_SIZE, OPACITY_SAMPLE_SIZE);
                    opacityContext.drawImage(
                        tileImage.image,
                        tileImage.sx,
                        tileImage.sy,
                        tileImage.width,
                        tileImage.height,
                        0,
                        0,
                        OPACITY_SAMPLE_SIZE,
                        OPACITY_SAMPLE_SIZE,
                    );
                    const data = opacityContext.getImageData(0, 0, OPACITY_SAMPLE_SIZE, OPACITY_SAMPLE_SIZE).data;
                    let total = 0;
                    for (let i = 3; i < data.length; i += 4) {
                        total += data[i] ?? 0;
                    }
                    opacity = total / (255 * OPACITY_SAMPLE_SIZE * OPACITY_SAMPLE_SIZE);
                } catch {
                    // Tileset served without CORS headers: the pixels cannot be read, consider the tile opaque
                    opacity = 1;
                }
            }
            opacityCache.set(index, opacity);
            return opacity;
        },
    };
    return source;
}
