import * as THREE from "three";
import type { CellTileInfo, ModelCell } from "../Map/MapAnalysis";
import {
    computeCellBlock,
    computeIndoorCells,
    groupModelCells,
    isModelKind,
    isStructureLayerName,
    WALL_HEIGHT,
} from "../Map/MapAnalysis";
import type { ModelToolkit } from "../Models/Materials";
import { buildPropModel } from "../Models/PropModels";
import { mesh } from "../Models/Materials";
import type { ModelLibrary } from "../Assets/ModelLibrary";
import { buildAssetModel } from "../Assets/KindRecipes";
import type { ModelKind } from "../Map/MapAnalysis";
import { applyCutaway, createCutawayUniforms } from "./Cutaway";
import { mergeStaticMeshes } from "./MergeMeshes";
import type { SceneDescription } from "./SceneDescription";
import type { Seat } from "./Seats";
import { seatFromModel } from "./Seats";
import type { MapSource, MapSourceLayer, MapSourceTile } from "./MapSource";
import { numberProperty, stringProperty } from "./MapSource";

const MAX_TEXTURE_SIZE = 4096;
const SKIRTING_HEIGHT = 0.12;
/** Height of the doors (2.1 m) */
const DOOR_HEIGHT = 1.5;
const TABLE_MODELS = new Set(["desk", "desk_monitor", "meeting_table", "round_table", "counter"]);

/**
 * The static part of the 3D world, built from the tile map:
 * - the floor, a plane textured with every layer drawn below the players,
 * - the walls and obstacles, extruded from the colliding cells,
 * - the 3D models of the tiles holding a "model3d" property,
 * - the "overhead" layers (roofs, tree tops...), drawn as a translucent ceiling.
 */
export class MapWorld {
    public readonly group = new THREE.Group();
    public readonly width: number;
    public readonly height: number;
    /** Cells covered by a table: small objects put there are lifted to the table height. */
    public readonly tableCells = new Set<string>();
    /** Height of the tallest 3D object standing on each cell (camera collisions) */
    private readonly objectHeights: Float32Array;
    /** The places where avatars can sit */
    public readonly seats: Seat[] = [];
    private readonly disposables: { dispose(): void }[] = [];
    private overheadCoverage: Uint8Array | undefined;
    private overheadMaterial: THREE.MeshStandardMaterial | undefined;
    private readonly cutawayUniforms = createCutawayUniforms();
    private indoorCells: Uint8Array = new Uint8Array(0);
    private readonly patchedCells = new Set<string>();
    /** Cells a 3D object of the scene description stands on */
    private readonly objectCells = new Set<string>();
    public doorwayCount = 0;
    private blockHeights: Float32Array;
    private readonly blockKinds: string[];

    constructor(
        private readonly toolkit: ModelToolkit,
        private readonly source: MapSource,
        private readonly scene: SceneDescription | undefined = undefined,
        private readonly library: ModelLibrary | undefined = undefined,
    ) {
        this.width = source.width;
        this.height = source.height;
        this.blockHeights = new Float32Array(this.width * this.height);
        this.blockKinds = new Array<string>(this.width * this.height).fill("none");
        this.objectHeights = new Float32Array(this.width * this.height);

        const pixelsPerTile = Math.max(
            4,
            Math.min(source.tileWidth, Math.floor(MAX_TEXTURE_SIZE / Math.max(this.width, this.height, 1))),
        );
        const visibleLayers = source.layers.filter((layer) => layer.visible);
        // Collision layers (usually drawn with "BLOCK" marker tiles) shape the walls but are never painted. The layers
        // replaced by 3D objects (scene description) are not painted either.
        const paintedLayers = visibleLayers.filter(
            (layer) => !this.isCollisionLayer(layer) && !this.isReplacedLayer(layer),
        );
        const groundLayers = paintedLayers.filter((layer) => !layer.overhead);
        const overheadLayers = paintedLayers.filter((layer) => layer.overhead);

        const groundCanvas = this.bakeLayers(groundLayers, pixelsPerTile);
        this.applyFloorPatches(groundCanvas, pixelsPerTile);
        const groundTexture = this.createTexture(groundCanvas);
        this.buildGround(groundTexture);
        this.buildSurroundings();
        // The 3D objects first: the cells they stand on are not extruded
        this.buildSceneObjects();
        this.computeBlocks(visibleLayers);

        // The tops of the blocks show everything drawn on the cell, including the layers drawn above the players
        // (in many maps, the top of the walls is drawn in "foreground" layers).
        let topCanvas = groundCanvas;
        let topTexture = groundTexture;
        if (overheadLayers.length > 0) {
            topCanvas = document.createElement("canvas");
            topCanvas.width = groundCanvas.width;
            topCanvas.height = groundCanvas.height;
            const context = topCanvas.getContext("2d");
            if (context) {
                context.drawImage(groundCanvas, 0, 0);
                context.drawImage(this.bakeLayers(overheadLayers, pixelsPerTile), 0, 0);
            }
            topTexture = this.createTexture(topCanvas);
        }
        this.buildBlockMeshes(topCanvas, topTexture);
        this.buildDoorways();
        this.buildTileModels(visibleLayers);
        this.buildCeiling();

        // Roofs and tree tops (overhead layers that are not walls/furniture) float above the players as a ceiling
        const roofLayers = overheadLayers.filter((layer) => !isStructureLayerName(layer.name));
        if (roofLayers.length > 0) {
            this.buildOverhead(roofLayers, pixelsPerTile);
        }
    }

    /**
     * True for the layers whose drawings are replaced by 3D objects (see SceneDescription.hideLayers).
     */
    private isReplacedLayer(layer: MapSourceLayer): boolean {
        return this.scene?.hideLayers.some((prefix) => layer.name.startsWith(prefix)) ?? false;
    }

    /**
     * Erases objects drawn in the floor itself (a car on a parking lot...) by copying another region of the floor
     * over them.
     */
    private applyFloorPatches(canvas: HTMLCanvasElement, pixelsPerTile: number): void {
        const patches = this.scene?.floorPatches ?? [];
        const context = canvas.getContext("2d");
        if (!context || patches.length === 0) {
            return;
        }
        // Copy from a snapshot: patches must not copy each other
        const snapshot = document.createElement("canvas");
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext("2d")?.drawImage(canvas, 0, 0);
        for (const { from, to } of patches) {
            context.drawImage(
                snapshot,
                from[0] * pixelsPerTile,
                from[1] * pixelsPerTile,
                from[2] * pixelsPerTile,
                from[3] * pixelsPerTile,
                to[0] * pixelsPerTile,
                to[1] * pixelsPerTile,
                to[2] * pixelsPerTile,
                to[3] * pixelsPerTile,
            );
            // The erased object must not be extruded either
            for (let y = Math.floor(to[1]); y < Math.ceil(to[1] + to[3]); y++) {
                for (let x = Math.floor(to[0]); x < Math.ceil(to[0] + to[2]); x++) {
                    this.patchedCells.add(this.cellKey(x, y));
                }
            }
        }
    }

    /**
     * Doorways are the gaps (1 to 3 tiles) of the lines of walls: they get a door frame, the wall above the door and
     * an open glass door.
     */
    private buildDoorways(): void {
        const isWall = (x: number, y: number) => this.getBlockHeight(x, y) >= WALL_HEIGHT * 0.75;
        const isFree = (x: number, y: number) =>
            x >= 0 && y >= 0 && x < this.width && y < this.height && this.getBlockHeight(x, y) === 0;
        const doorways: { x: number; y: number; length: number; horizontal: boolean }[] = [];
        const found = new Set<string>();
        for (const horizontal of [true, false]) {
            // "along" runs along the wall line, "across" crosses it
            const alongSize = horizontal ? this.width : this.height;
            const acrossSize = horizontal ? this.height : this.width;
            const at = (along: number, across: number): [number, number] =>
                horizontal ? [along, across] : [across, along];
            for (let across = 1; across < acrossSize - 1; across++) {
                for (let start = 1; start < alongSize - 1; start++) {
                    if (!isWall(...at(start - 1, across)) || !isFree(...at(start, across))) {
                        continue;
                    }
                    let end = start;
                    while (end - start < 3 && isFree(...at(end + 1, across))) {
                        end++;
                    }
                    const length = end - start + 1;
                    if (length > 3 || !isWall(...at(end + 1, across))) {
                        continue;
                    }
                    // A passage: somewhere in the gap, people can walk through the wall line
                    let passage = false;
                    for (let along = start; along <= end && !passage; along++) {
                        passage = isFree(...at(along, across - 1)) && isFree(...at(along, across + 1));
                    }
                    if (!passage) {
                        continue;
                    }
                    const [x, y] = at(start, across);
                    found.add(`${horizontal}|${x}|${y}`);
                    // Thick walls: only one door leaf for the aligned gaps of consecutive rows (negative length)
                    const [previousX, previousY] = at(start, across - 1);
                    const hasDoorLeaf = !found.has(`${horizontal}|${previousX}|${previousY}`);
                    doorways.push({ x, y, length: hasDoorLeaf ? length : -length, horizontal });
                }
            }
        }
        if (doorways.length === 0) {
            return;
        }

        const { geometries, materials } = this.toolkit;
        const wallMaterial = new THREE.MeshStandardMaterial({ color: "#e6e0d4", roughness: 0.9 });
        applyCutaway(wallMaterial, this.cutawayUniforms);
        this.disposables.push(wallMaterial);
        const frameMaterial = materials.get("#4b5058", { roughness: 0.4, metalness: 0.6 });
        const glassMaterial = materials.get("#cfe3ea", { roughness: 0.05, metalness: 0.1, opacity: 0.3 });
        const handleMaterial = materials.get("#c8ccd2", { roughness: 0.2, metalness: 0.9 });
        const group = new THREE.Group();
        const lintelHeight = WALL_HEIGHT - DOOR_HEIGHT;
        for (const doorway of doorways) {
            const length = Math.abs(doorway.length);
            const withLeaf = doorway.length > 0;
            const door = new THREE.Group();
            // Local frame: the opening runs along X, the passage along Z
            door.add(mesh(geometries.box(length, lintelHeight, 1), wallMaterial, 0, DOOR_HEIGHT + lintelHeight / 2, 0));
            door.add(
                mesh(geometries.box(0.08, DOOR_HEIGHT, 1.02), frameMaterial, -length / 2 + 0.04, DOOR_HEIGHT / 2, 0),
            );
            door.add(
                mesh(geometries.box(0.08, DOOR_HEIGHT, 1.02), frameMaterial, length / 2 - 0.04, DOOR_HEIGHT / 2, 0),
            );
            door.add(mesh(geometries.box(length, 0.08, 1.02), frameMaterial, 0, DOOR_HEIGHT - 0.04, 0));
            if (withLeaf) {
                // Open glass doors, swung against the side of the opening (double doors for wide openings)
                const leaves = length > 1.5 ? [-1, 1] : [-1];
                const leafWidth = (length - 0.16) / leaves.length;
                for (const side of leaves) {
                    const hingeX = side * (length / 2 - 0.1);
                    const leaf = new THREE.Group();
                    leaf.add(
                        mesh(
                            geometries.box(0.04, DOOR_HEIGHT - 0.12, leafWidth),
                            glassMaterial,
                            0,
                            (DOOR_HEIGHT - 0.12) / 2 + 0.02,
                            leafWidth / 2,
                            false,
                        ),
                    );
                    leaf.add(mesh(geometries.box(0.05, 0.05, leafWidth), frameMaterial, 0, 0.04, leafWidth / 2));
                    leaf.add(
                        mesh(
                            geometries.box(0.05, 0.05, leafWidth),
                            frameMaterial,
                            0,
                            DOOR_HEIGHT - 0.12,
                            leafWidth / 2,
                        ),
                    );
                    leaf.add(
                        mesh(
                            geometries.box(0.05, DOOR_HEIGHT - 0.12, 0.04),
                            frameMaterial,
                            0,
                            (DOOR_HEIGHT - 0.12) / 2 + 0.02,
                            leafWidth,
                        ),
                    );
                    leaf.add(mesh(geometries.box(0.1, 0.3, 0.03), handleMaterial, 0, 0.72, leafWidth - 0.1));
                    leaf.position.set(hingeX, 0, 0.5);
                    door.add(leaf);
                }
            }
            if (doorway.horizontal) {
                door.position.set(doorway.x + length / 2, 0, doorway.y + 0.5);
            } else {
                door.position.set(doorway.x + 0.5, 0, doorway.y + length / 2);
                door.rotation.y = Math.PI / 2;
            }
            group.add(door);
        }
        for (const doorMesh of mergeStaticMeshes(group)) {
            doorMesh.name = "doorways";
            this.group.add(doorMesh);
        }
        this.doorwayCount = doorways.length;
    }

    /**
     * The 3D objects of the scene description.
     */
    private buildSceneObjects(): void {
        const objects = this.scene?.objects ?? [];
        if (objects.length === 0) {
            return;
        }
        const group = new THREE.Group();
        for (const sceneObject of objects) {
            const width = sceneObject.width;
            const depth = sceneObject.depth;
            let object: THREE.Object3D | undefined;
            if (this.library?.has(sceneObject.model)) {
                object =
                    width !== undefined && depth !== undefined
                        ? this.library.instantiate(sceneObject.model, { fit: "stretch", width, depth })
                        : this.library.instantiate(sceneObject.model, { scale: sceneObject.scale });
            } else if (isModelKind(sceneObject.model)) {
                object = this.buildModel(sceneObject.model, width ?? 1, depth ?? 1);
            }
            if (!object) {
                continue;
            }
            object.position.set(sceneObject.x, sceneObject.elevation, sceneObject.y);
            object.rotation.y = THREE.MathUtils.degToRad(-sceneObject.rotation);
            group.add(object);
            this.recordObjectHeight(object);
            const seat =
                sceneObject.elevation === 0
                    ? seatFromModel(sceneObject.model, sceneObject.x, sceneObject.y, sceneObject.rotation)
                    : undefined;
            if (seat) {
                this.seats.push(seat);
            }
            if (sceneObject.elevation < 0.3) {
                object.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(object);
                for (let y = Math.floor(box.min.z); y < Math.ceil(box.max.z); y++) {
                    for (let x = Math.floor(box.min.x); x < Math.ceil(box.max.x); x++) {
                        this.objectCells.add(this.cellKey(x, y));
                    }
                }
            }
        }
        for (const mesh of mergeStaticMeshes(group)) {
            mesh.name = "sceneObjects";
            this.group.add(mesh);
        }
    }

    /**
     * A model kind, built with the realistic assets when available, else procedurally.
     */
    private buildModel(kind: ModelKind, width: number, depth: number): THREE.Object3D {
        return (
            (this.library ? buildAssetModel(this.library, kind, width, depth) : undefined) ??
            buildPropModel(this.toolkit, kind, width, depth)
        );
    }

    /**
     * A layer whose tiles almost all collide is a collision layer: it only marks the obstacles.
     */
    private isCollisionLayer(layer: MapSourceLayer): boolean {
        if (/collision|collide/i.test(layer.name)) {
            return true;
        }
        let tiles = 0;
        let colliding = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tile = layer.getTile(x, y);
                if (tile) {
                    tiles++;
                    if (tile.collides) {
                        colliding++;
                    }
                }
            }
        }
        return tiles > 0 && colliding / tiles > 0.9;
    }

    /**
     * The tile of a layer on a cell, ignoring fully transparent tiles.
     */
    private getDrawnTile(layer: MapSourceLayer, x: number, y: number): MapSourceTile | undefined {
        const tile = layer.getTile(x, y);
        if (!tile) {
            return undefined;
        }
        if (!tile.collides && this.source.getTileOpacity(tile.index) < 0.03) {
            return undefined;
        }
        return tile;
    }

    public cellKey(x: number, y: number): string {
        return `${x}|${y}`;
    }

    /**
     * Height of whatever stands on a cell: wall, block or 3D object. Used to keep the camera out of the obstacles.
     */
    public getObstacleHeight(x: number, y: number): number {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
            return 0;
        }
        return Math.max(this.blockHeights[y * this.width + x] ?? 0, this.objectHeights[y * this.width + x] ?? 0);
    }

    private recordObjectHeight(object: THREE.Object3D): void {
        object.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) {
            return;
        }
        // Shrink the footprint a little: bounding boxes are generous
        for (let y = Math.floor(box.min.z + 0.15); y < Math.ceil(box.max.z - 0.15); y++) {
            for (let x = Math.floor(box.min.x + 0.15); x < Math.ceil(box.max.x - 0.15); x++) {
                if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
                    const index = y * this.width + x;
                    this.objectHeights[index] = Math.max(this.objectHeights[index] ?? 0, box.max.y);
                }
            }
        }
    }

    /**
     * Height of the block (wall, obstacle) standing on a cell. 0 when the cell is free.
     */
    public getBlockHeight(x: number, y: number): number {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
            return 0;
        }
        return this.blockHeights[y * this.width + x] ?? 0;
    }

    /**
     * True if the cell is inside a room (enclosed by walls): it has a ceiling.
     */
    public get indoorCellCount(): number {
        return this.indoorCells.reduce((total, value) => total + value, 0);
    }

    public isIndoor(x: number, y: number): boolean {
        const cellX = Math.floor(x);
        const cellY = Math.floor(y);
        if (cellX < 0 || cellY < 0 || cellX >= this.width || cellY >= this.height) {
            return false;
        }
        return this.indoorCells[cellY * this.width + cellX] === 1;
    }

    public isUnderOverhead(x: number, y: number): boolean {
        const cellX = Math.floor(x);
        const cellY = Math.floor(y);
        if (!this.overheadCoverage || cellX < 0 || cellY < 0 || cellX >= this.width || cellY >= this.height) {
            return false;
        }
        return this.overheadCoverage[cellY * this.width + cellX] === 1;
    }

    /**
     * Walls between the camera and the target (usually the player) become see-through.
     */
    public setCutawayRadius(radius: number): void {
        this.cutawayUniforms.uCutRadius.value = radius;
    }

    public setCutaway(camera: THREE.Vector3, target: THREE.Vector3 | undefined): void {
        this.cutawayUniforms.uCutEnabled.value = target ? 1 : 0;
        this.cutawayUniforms.uCutCamera.value.copy(camera);
        if (target) {
            this.cutawayUniforms.uCutTarget.value.copy(target);
        }
    }

    public setOverheadOpacity(opacity: number): void {
        if (this.overheadMaterial) {
            this.overheadMaterial.opacity = opacity;
            this.overheadMaterial.visible = opacity > 0.01;
        }
    }

    public dispose(): void {
        this.group.removeFromParent();
        this.group.traverse((object) => {
            // Shared geometries/materials belong to the toolkit. Only the geometries created here are disposed.
            if (object instanceof THREE.Mesh && object.userData["ownedGeometry"] === true) {
                object.geometry.dispose();
            }
        });
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }

    private bakeLayers(layers: readonly MapSourceLayer[], pixelsPerTile: number): HTMLCanvasElement {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, this.width * pixelsPerTile);
        canvas.height = Math.max(1, this.height * pixelsPerTile);
        const context = canvas.getContext("2d");
        if (!context) {
            return canvas;
        }
        context.imageSmoothingEnabled = false;
        for (const layer of layers) {
            context.globalAlpha = layer.alpha;
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const tile = layer.getTile(x, y);
                    if (tile) {
                        this.drawTile(context, tile, x * pixelsPerTile, y * pixelsPerTile, pixelsPerTile);
                    }
                }
            }
        }
        context.globalAlpha = 1;
        return canvas;
    }

    private drawTile(context: CanvasRenderingContext2D, tile: MapSourceTile, x: number, y: number, size: number): void {
        const image = this.source.getTileImage(tile.index);
        if (!image) {
            return;
        }
        // Tiles bigger than the grid (e.g. 32x64 trees) are anchored on the bottom-left corner of the cell, like Tiled.
        const drawWidth = (image.width / this.source.tileWidth) * size;
        const drawHeight = (image.height / this.source.tileHeight) * size;
        context.save();
        context.translate(x + drawWidth / 2, y + size - drawHeight / 2);
        if (tile.rotation) {
            context.rotate(tile.rotation);
        }
        context.scale(tile.flipX ? -1 : 1, tile.flipY ? -1 : 1);
        try {
            context.drawImage(
                image.image,
                image.sx,
                image.sy,
                image.width,
                image.height,
                -drawWidth / 2,
                -drawHeight / 2,
                drawWidth,
                drawHeight,
            );
        } catch (e) {
            // A tileset image that failed to load must not break the whole world
            console.warn("Could not draw tile", tile.index, e);
        }
        context.restore();
    }

    private createTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.anisotropy = 8;
        this.disposables.push(texture);
        return texture;
    }

    private buildGround(texture: THREE.Texture): void {
        const geometry = new THREE.PlaneGeometry(this.width, this.height);
        // Cells without any floor tile are cut out: the surroundings show through instead of a black hole
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, alphaTest: 0.5 });
        this.disposables.push(material);
        const ground = new THREE.Mesh(geometry, material);
        ground.userData["ownedGeometry"] = true;
        ground.userData["ground"] = true;
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(this.width / 2, 0, this.height / 2);
        ground.receiveShadow = true;
        ground.name = "ground";
        this.group.add(ground);
    }

    /**
     * A large neutral floor around the map, so the edges of the map do not float in the void.
     */
    private buildSurroundings(): void {
        const size = Math.max(this.width, this.height) * 4 + 100;
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshStandardMaterial({ color: "#8fbf7a", roughness: 1 });
        this.disposables.push(material);
        const surroundings = new THREE.Mesh(geometry, material);
        surroundings.userData["ownedGeometry"] = true;
        surroundings.rotation.x = -Math.PI / 2;
        surroundings.position.set(this.width / 2, -0.02, this.height / 2);
        surroundings.receiveShadow = true;
        this.group.add(surroundings);
    }

    private computeBlocks(layers: readonly MapSourceLayer[]): void {
        const kinds = this.blockKinds;
        const hiddenLayerNames = new Set(
            layers.filter((layer) => this.isReplacedLayer(layer)).map((layer) => layer.name),
        );
        const uncertainWalls: number[] = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tiles: CellTileInfo[] = [];
                for (const layer of layers) {
                    const tile = this.getDrawnTile(layer, x, y);
                    if (!tile) {
                        continue;
                    }
                    tiles.push({
                        layerName: layer.name,
                        layerHeight3d: numberProperty(layer.properties, "height3d"),
                        tileHeight3d: numberProperty(tile.properties, "height3d"),
                        model3d: stringProperty(tile.properties, "model3d"),
                        collides: tile.collides,
                    });
                }
                // Cells whose drawing is replaced by 3D objects (hidden layers, erased floor objects) are not extruded
                // where a 3D object stands: the object renders the obstacle.
                const key = this.cellKey(x, y);
                const drawnOnHiddenLayer =
                    layers.some((layer) => this.isReplacedLayer(layer) && this.getDrawnTile(layer, x, y)) &&
                    !tiles.some((tile) => /wall|mur|building/i.test(tile.layerName));
                let block = computeCellBlock(tiles.filter((tile) => !hiddenLayerNames.has(tile.layerName)));
                if (this.patchedCells.has(key)) {
                    block = { kind: "none", height: 0 };
                } else if (drawnOnHiddenLayer && block.kind === "wall") {
                    // Either a replaced object or a window drawn on a wall: decided below, from the walls around
                    uncertainWalls.push(y * this.width + x);
                } else if (drawnOnHiddenLayer && this.objectCells.has(key)) {
                    block = { kind: "none", height: 0 };
                }
                this.blockHeights[y * this.width + x] = block.height;
                kinds[y * this.width + x] = block.kind;
            }
        }

        // A hidden object without 3D replacement that collides becomes a wall only inside a run of walls (a window
        // drawn on the furniture layer); elsewhere it is an invisible obstacle, not a pillar in the middle of a room.
        const isWallAt = (x: number, y: number) =>
            x >= 0 && y >= 0 && x < this.width && y < this.height && kinds[y * this.width + x] === "wall";
        // Confirmed walls spread along the runs: a 3-tile wide window is confirmed from its ends inwards
        const pending = new Set(uncertainWalls);
        const isConfirmedWallAt = (x: number, y: number) => isWallAt(x, y) && !pending.has(y * this.width + x);
        let changed = true;
        while (changed) {
            changed = false;
            for (const index of pending) {
                const x = index % this.width;
                const y = Math.floor(index / this.width);
                // In a line of walls, next to a confirmed wall of that same line
                const horizontalRun =
                    isWallAt(x - 1, y) &&
                    isWallAt(x + 1, y) &&
                    (isConfirmedWallAt(x - 1, y) || isConfirmedWallAt(x + 1, y));
                const verticalRun =
                    isWallAt(x, y - 1) &&
                    isWallAt(x, y + 1) &&
                    (isConfirmedWallAt(x, y - 1) || isConfirmedWallAt(x, y + 1));
                if (horizontalRun || verticalRun) {
                    pending.delete(index);
                    changed = true;
                }
            }
        }
        for (const index of pending) {
            this.blockHeights[index] = 0;
            kinds[index] = "none";
        }
    }

    private buildBlockMeshes(groundCanvas: HTMLCanvasElement, groundTexture: THREE.Texture): void {
        const kinds = this.blockKinds;

        const cellColors = this.sampleCellColors(groundCanvas);
        const wallPaint = new THREE.Color("#ece6da");
        const skirting = new THREE.Color("#6b5a4a");

        const topPositions: number[] = [];
        const topNormals: number[] = [];
        const topUvs: number[] = [];
        const sidePositions: number[] = [];
        const sideNormals: number[] = [];
        const sideColors: number[] = [];

        const pushQuad = (
            positions: number[],
            normals: number[],
            corners: readonly (readonly [number, number, number])[],
            normal: readonly [number, number, number],
        ) => {
            const [a, b, c, d] = corners;
            if (!a || !b || !c || !d) {
                return;
            }
            for (const vertex of [a, b, c, a, c, d]) {
                positions.push(vertex[0], vertex[1], vertex[2]);
                normals.push(normal[0], normal[1], normal[2]);
            }
        };

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const h = this.getBlockHeight(x, y);
                if (h <= 0) {
                    continue;
                }
                pushQuad(
                    topPositions,
                    topNormals,
                    [
                        [x, h, y],
                        [x, h, y + 1],
                        [x + 1, h, y + 1],
                        [x + 1, h, y],
                    ],
                    [0, 1, 0],
                );
                const u0 = x / this.width;
                const u1 = (x + 1) / this.width;
                const v0 = 1 - y / this.height;
                const v1 = 1 - (y + 1) / this.height;
                topUvs.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);

                const color = new THREE.Color().setRGB(
                    cellColors[(y * this.width + x) * 3] ?? 0.8,
                    cellColors[(y * this.width + x) * 3 + 1] ?? 0.8,
                    cellColors[(y * this.width + x) * 3 + 2] ?? 0.8,
                    THREE.SRGBColorSpace,
                );
                const isWall = kinds[y * this.width + x] === "wall";
                if (isWall) {
                    color.lerp(wallPaint, 0.55);
                } else {
                    color.multiplyScalar(0.85);
                }

                const sides: [number, number, (h0: number) => [number, number, number][], [number, number, number]][] =
                    [
                        [
                            0,
                            -1,
                            (h0) => [
                                [x + 1, h0, y],
                                [x, h0, y],
                                [x, h, y],
                                [x + 1, h, y],
                            ],
                            [0, 0, -1],
                        ],
                        [
                            0,
                            1,
                            (h0) => [
                                [x, h0, y + 1],
                                [x + 1, h0, y + 1],
                                [x + 1, h, y + 1],
                                [x, h, y + 1],
                            ],
                            [0, 0, 1],
                        ],
                        [
                            -1,
                            0,
                            (h0) => [
                                [x, h0, y],
                                [x, h0, y + 1],
                                [x, h, y + 1],
                                [x, h, y],
                            ],
                            [-1, 0, 0],
                        ],
                        [
                            1,
                            0,
                            (h0) => [
                                [x + 1, h0, y + 1],
                                [x + 1, h0, y],
                                [x + 1, h, y],
                                [x + 1, h, y + 1],
                            ],
                            [1, 0, 0],
                        ],
                    ];
                for (const [dx, dy, corners, normal] of sides) {
                    const neighbourHeight = this.getBlockHeight(x + dx, y + dy);
                    if (neighbourHeight >= h) {
                        continue;
                    }
                    pushQuad(sidePositions, sideNormals, corners(neighbourHeight), normal);
                    // Vertices are pushed as [bottom, bottom, top, bottom, top, top]: walls get darker towards the
                    // floor, which reads as ambient occlusion and gives them volume.
                    const bottomShade = neighbourHeight === 0 ? 0.7 : 0.85;
                    for (const top of [false, false, true, false, true, true]) {
                        const shade = top ? 1 : bottomShade;
                        sideColors.push(color.r * shade, color.g * shade, color.b * shade);
                    }
                    if (isWall && neighbourHeight === 0) {
                        // Skirting board, slightly in front of the wall to avoid z-fighting
                        const offset = 0.012;
                        const board = corners(0).map(([cx, cy, cz]): [number, number, number] => [
                            cx + normal[0] * offset,
                            Math.min(cy, SKIRTING_HEIGHT),
                            cz + normal[2] * offset,
                        ]);
                        pushQuad(sidePositions, sideNormals, board, normal);
                        for (let i = 0; i < 6; i++) {
                            sideColors.push(skirting.r, skirting.g, skirting.b);
                        }
                    }
                }
            }
        }

        if (topPositions.length > 0) {
            const topGeometry = new THREE.BufferGeometry();
            topGeometry.setAttribute("position", new THREE.Float32BufferAttribute(topPositions, 3));
            topGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(topNormals, 3));
            topGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(topUvs, 2));
            const topMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.85 });
            applyCutaway(topMaterial, this.cutawayUniforms);
            this.disposables.push(topMaterial);
            const tops = new THREE.Mesh(topGeometry, topMaterial);
            tops.userData["ownedGeometry"] = true;
            tops.castShadow = true;
            tops.receiveShadow = true;
            tops.name = "blockTops";
            this.group.add(tops);
        }
        if (sidePositions.length > 0) {
            const sideGeometry = new THREE.BufferGeometry();
            sideGeometry.setAttribute("position", new THREE.Float32BufferAttribute(sidePositions, 3));
            sideGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(sideNormals, 3));
            sideGeometry.setAttribute("color", new THREE.Float32BufferAttribute(sideColors, 3));
            const sideMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
            applyCutaway(sideMaterial, this.cutawayUniforms);
            this.disposables.push(sideMaterial);
            const sidesMesh = new THREE.Mesh(sideGeometry, sideMaterial);
            sidesMesh.userData["ownedGeometry"] = true;
            sidesMesh.castShadow = true;
            sidesMesh.receiveShadow = true;
            sidesMesh.name = "blockSides";
            this.group.add(sidesMesh);
        }
    }

    /**
     * Average color of each cell of the baked floor, in linear RGB (3 floats per cell).
     */
    private sampleCellColors(groundCanvas: HTMLCanvasElement): Float32Array {
        const colors = new Float32Array(this.width * this.height * 3).fill(0.8);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, this.width);
        canvas.height = Math.max(1, this.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
            return colors;
        }
        try {
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(groundCanvas, 0, 0, canvas.width, canvas.height);
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 0; i < this.width * this.height; i++) {
                const alpha = (data[i * 4 + 3] ?? 255) / 255;
                colors[i * 3] = alpha > 0 ? (data[i * 4] ?? 200) / 255 : 0.8;
                colors[i * 3 + 1] = alpha > 0 ? (data[i * 4 + 1] ?? 200) / 255 : 0.8;
                colors[i * 3 + 2] = alpha > 0 ? (data[i * 4 + 2] ?? 200) / 255 : 0.8;
            }
        } catch (e) {
            // Tainted canvas (tileset served without CORS headers): keep neutral colors
            console.warn("Could not sample the colors of the map", e);
        }
        return colors;
    }

    private buildTileModels(layers: readonly MapSourceLayer[]): void {
        const cells: ModelCell[] = [];
        for (const layer of layers) {
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const tile = layer.getTile(x, y);
                    const model = tile ? stringProperty(tile.properties, "model3d") : undefined;
                    if (!tile || !model) {
                        continue;
                    }
                    cells.push({
                        x,
                        y,
                        model,
                        layer: layer.name,
                        rotation: numberProperty(tile.properties, "rotation3d"),
                    });
                }
            }
        }
        const models = new THREE.Group();
        for (const placement of groupModelCells(cells)) {
            if (!isModelKind(placement.model)) {
                console.warn(`Unknown model3d "${placement.model}" at ${placement.x},${placement.y}`);
                continue;
            }
            const quarter = Math.round(placement.rotation / 90) % 2 !== 0;
            const model = this.buildModel(
                placement.model,
                quarter ? placement.height : placement.width,
                quarter ? placement.width : placement.height,
            );
            model.position.set(placement.x + placement.width / 2, 0, placement.y + placement.height / 2);
            model.rotation.y = (-placement.rotation * Math.PI) / 180;
            models.add(model);
            this.recordObjectHeight(model);
            const seat = seatFromModel(
                placement.model,
                placement.x + placement.width / 2,
                placement.y + placement.height / 2,
                placement.rotation,
            );
            if (seat) {
                this.seats.push(seat);
            }
            if (TABLE_MODELS.has(placement.model)) {
                for (let y = placement.y; y < placement.y + placement.height; y++) {
                    for (let x = placement.x; x < placement.x + placement.width; x++) {
                        this.tableCells.add(this.cellKey(x, y));
                    }
                }
            }
        }
        // Tile models never move: merge them to keep the number of draw calls low
        for (const mesh of mergeStaticMeshes(models)) {
            mesh.name = "tileModels";
            this.group.add(mesh);
        }
    }

    /**
     * Rooms get a ceiling with light panels. The ceiling only faces down: it is seen from inside the rooms (game
     * camera) and invisible from above (overview camera), so it never hides the inside of the rooms.
     */
    private buildCeiling(): void {
        this.indoorCells = computeIndoorCells(
            this.width,
            this.height,
            // Every obstacle closes the rooms: walls are often interrupted by windows, counters or shelves drawn
            // on furniture layers
            (x, y) => this.getBlockHeight(x, y) > 0,
        );
        const h = WALL_HEIGHT;
        const ceilingPositions: number[] = [];
        const fixtures = new THREE.Group();
        const lightPositions: number[] = [];
        const pushDownQuad = (positions: number[], x0: number, z0: number, x1: number, z1: number, y: number) => {
            positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
        };
        // The ceiling also covers the cells next to the rooms (doorways, top of the inner walls), so no sky shows
        // through the gaps
        const hasCeiling = (x: number, y: number): boolean => {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (this.isIndoor(x + dx, y + dy)) {
                        return true;
                    }
                }
            }
            return false;
        };
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (!hasCeiling(x, y)) {
                    continue;
                }
                pushDownQuad(ceilingPositions, x, y, x + 1, y + 1, h);
                if (!this.isIndoor(x, y)) {
                    continue;
                }
                // A light every few tiles, where the room is large enough
                if (x % 5 === 2 && y % 4 === 1 && this.isIndoor(x + 1, y)) {
                    const fixture = this.library?.instantiate("ceiling_light");
                    if (fixture) {
                        const fixtureHeight = this.library?.getHeight("ceiling_light") ?? 0;
                        fixture.position.set(x + 1, h - fixtureHeight, y + 0.5);
                        fixtures.add(fixture);
                    } else {
                        pushDownQuad(lightPositions, x + 0.2, y + 0.3, x + 1.8, y + 0.7, h - 0.01);
                    }
                }
            }
        }
        if (ceilingPositions.length === 0) {
            return;
        }
        const createMesh = (positions: number[], material: THREE.Material, name: string) => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            const normals = new Float32Array(positions.length);
            for (let i = 1; i < normals.length; i += 3) {
                normals[i] = -1;
            }
            geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
            const ceilingMesh = new THREE.Mesh(geometry, material);
            ceilingMesh.userData["ownedGeometry"] = true;
            ceilingMesh.name = name;
            this.disposables.push(material);
            this.group.add(ceilingMesh);
        };
        // Unlit: seen from below, a lit ceiling would only get the dim bounce light of the ground
        createMesh(ceilingPositions, new THREE.MeshBasicMaterial({ color: "#e6e1d6" }), "ceiling");
        if (lightPositions.length > 0) {
            createMesh(lightPositions, new THREE.MeshBasicMaterial({ color: "#fffbea" }), "ceilingLights");
        }
        for (const mesh of mergeStaticMeshes(fixtures)) {
            // The fixtures are lit from below only by bounce light: no shadow casting, they would darken the rooms
            mesh.castShadow = false;
            mesh.name = "ceilingFixtures";
            this.group.add(mesh);
        }
    }

    private buildOverhead(layers: readonly MapSourceLayer[], pixelsPerTile: number): void {
        const coverage = new Uint8Array(this.width * this.height);
        let covered = false;
        for (const layer of layers) {
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    if (this.getDrawnTile(layer, x, y)) {
                        coverage[y * this.width + x] = 1;
                        covered = true;
                    }
                }
            }
        }
        if (!covered) {
            return;
        }
        this.overheadCoverage = coverage;
        const texture = this.createTexture(this.bakeLayers(layers, pixelsPerTile));
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            alphaTest: 0.05,
            side: THREE.DoubleSide,
        });
        this.overheadMaterial = material;
        this.disposables.push(material);
        const geometry = new THREE.PlaneGeometry(this.width, this.height);
        const overhead = new THREE.Mesh(geometry, material);
        overhead.userData["ownedGeometry"] = true;
        overhead.rotation.x = -Math.PI / 2;
        overhead.position.set(this.width / 2, WALL_HEIGHT + 0.02, this.height / 2);
        overhead.renderOrder = 10;
        overhead.name = "overhead";
        this.group.add(overhead);
    }
}
