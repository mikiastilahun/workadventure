import * as THREE from "three";
import type { ITiledMapLayer } from "@workadventure/tiled-map-type-guard";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PositionMessage_Direction, AvailabilityStatus } from "@workadventure/messages";
import type { GameScene } from "../Phaser/Game/GameScene";
import type { Character } from "../Phaser/Entity/Character";
import type { RemotePlayer } from "../Phaser/Entity/RemotePlayer";
import { waScaleManager } from "../Phaser/Services/WaScaleManager";
import type { AvatarConfig } from "./Avatar/AvatarConfig";
import {
    AVATAR_PLAYER_VARIABLE,
    AVATAR_SEAT_VARIABLE,
    avatarConfigFromSeed,
    parseAvatarConfig,
} from "./Avatar/AvatarConfig";
import { cameraQuarterTurns } from "./Input/MovementRemap";
import { AVATAR_HEIGHT, AvatarModel, HIP_Y } from "./Models/AvatarModel";
import { ModelToolkit } from "./Models/Materials";
import type { EntitySnapshot } from "./Scene/EntityVisuals";
import { EntityVisuals } from "./Scene/EntityVisuals";
import { MapWorld } from "./Scene/MapWorld";
import { createPhaserMapSource } from "./Scene/PhaserMapSource";
import { world3dState } from "./World3dState";
import { modelLibrary } from "./Assets/ModelLibrary";
import type { SceneDescription, SceneObject } from "./Scene/SceneDescription";
import { loadSceneDescription, sceneObjectsFromTiled } from "./Scene/SceneDescription";
import { normalizeProperties } from "./Scene/MapSource";
import type { Seat } from "./Scene/Seats";
import { findClosestSeat, resolveRemoteSeat } from "./Scene/Seats";
import { WALL_HEIGHT } from "./Map/MapAnalysis";

/** How far behind the center of the seat the avatar sits, so its thighs rest on the seat (tiles) */
const SEAT_BACK_OFFSET = 0.12;
/** Distance (game pixels) the player must walk to stand up */
const STAND_UP_DISTANCE = 6;
/** Pixels between the origin of a Woka and its feet */
const FEET_OFFSET_Y = 12;
export type CameraMode = "game" | "overview";

interface CameraModeSettings {
    minPitch: number;
    maxPitch: number;
    defaultPitch: number;
    /** Camera distance at zoom 1 */
    baseDistance: number;
    minDistance: number;
    maxDistance: number;
    /** Height of the point the camera looks at */
    targetHeight: number;
    /** Radius of the see-through hole in the walls hiding the player */
    cutawayRadius: number;
    fogNear: number;
    fogFar: number;
}

const CAMERA_MODES: Record<CameraMode, CameraModeSettings> = {
    // Third-person camera, right behind the avatar, kept inside the rooms
    game: {
        minPitch: THREE.MathUtils.degToRad(4),
        maxPitch: THREE.MathUtils.degToRad(55),
        defaultPitch: THREE.MathUtils.degToRad(11),
        baseDistance: 3.3,
        minDistance: 1.4,
        maxDistance: 9,
        targetHeight: 1.2,
        // The camera already stays inside the rooms: only keep the body of the player visible
        cutawayRadius: 0.45,
        fogNear: 14,
        fogFar: 70,
    },
    // Bird's-eye view over the map
    overview: {
        minPitch: THREE.MathUtils.degToRad(25),
        maxPitch: THREE.MathUtils.degToRad(80),
        defaultPitch: THREE.MathUtils.degToRad(50),
        baseDistance: 11,
        minDistance: 3.5,
        maxDistance: 60,
        targetHeight: 0.6,
        cutawayRadius: 1.0,
        fogNear: 40,
        fogFar: 140,
    },
};
/** Sideways offset of the game camera, for an over-the-shoulder view (tiles) */
const SHOULDER_OFFSET = 0.35;
/** Room kept between the camera and the walls / ceilings it bumps into */
const CAMERA_CLEARANCE = 0.25;
const LABEL_MAX_DISTANCE = 45;

interface CharacterVisual {
    avatar: AvatarModel;
    label: HTMLDivElement;
    nameElement: HTMLSpanElement;
    statusElement: HTMLSpanElement;
    bubbleElement: HTMLDivElement;
    lastX: number;
    lastY: number;
    lastMoveTime: number;
    configKey: string;
    character: Character;
    remote: RemotePlayer | undefined;
}

export type PickResult =
    | { type: "player"; player: RemotePlayer }
    | { type: "seat"; seat: Seat }
    | { type: "entity"; entityId: string }
    | { type: "ground"; x: number; y: number };

function directionToYaw(direction: PositionMessage_Direction): number {
    switch (direction) {
        case PositionMessage_Direction.UP:
            return Math.PI;
        case PositionMessage_Direction.LEFT:
            return -Math.PI / 2;
        case PositionMessage_Direction.RIGHT:
            return Math.PI / 2;
        default:
            return 0;
    }
}

function statusColor(status: AvailabilityStatus): string {
    switch (status) {
        case AvailabilityStatus.AWAY:
        case AvailabilityStatus.BACK_IN_A_MOMENT:
            return "#f7b731";
        case AvailabilityStatus.BUSY:
        case AvailabilityStatus.DO_NOT_DISTURB:
        case AvailabilityStatus.JITSI:
        case AvailabilityStatus.BBB:
        case AvailabilityStatus.DENY_PROXIMITY_MEETING:
        case AvailabilityStatus.SPEAKER:
        case AvailabilityStatus.LIVEKIT:
        case AvailabilityStatus.LISTENER:
            return "#eb3b5a";
        case AvailabilityStatus.SILENT:
            return "#a5b1c2";
        default:
            return "#20bf6b";
    }
}

/**
 * Renders the game scene in 3D with Three.js.
 *
 * Phaser stays the source of truth: it still runs the game logic (movement, collisions, areas, network...). This
 * renderer only reads the state of the Phaser scene every frame and displays it in 3D, on a canvas placed above the
 * Phaser one. Pointer events go through to the Phaser canvas and are translated by the input handler.
 */
export class World3dRenderer {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    private readonly toolkit = new ModelToolkit();
    private readonly sun = new THREE.DirectionalLight("#fff4e0", 2.2);
    private readonly labelsLayer: HTMLDivElement;
    private readonly characters = new Map<string, CharacterVisual>();
    private readonly raycaster = new THREE.Raycaster();
    private readonly cameraTarget = new THREE.Vector3();
    private readonly resizeObserver: ResizeObserver;
    private readonly clock = new THREE.Clock();
    private mapWorld: MapWorld | undefined;
    private entityVisuals: EntityVisuals | undefined;
    private destinationMarker: THREE.Mesh;
    private animationFrame: number | undefined;
    private active = false;
    private yaw = 0;
    private targetYaw = 0;
    private cameraMode: CameraMode = "game";
    private lastManualRotation = 0;
    private cameraPlacedBehindPlayer = false;
    private pitch = CAMERA_MODES.game.defaultPitch;
    private cameraDistance = CAMERA_MODES.game.baseDistance;
    private frameCount = 0;
    private overheadOpacity = 0.9;
    private cameraInitialized = false;
    private readonly skyTexture: THREE.CanvasTexture;
    private readonly abortController = new AbortController();
    private readonly environmentTexture: THREE.Texture;
    private sceneDescription: SceneDescription | undefined;
    private localSeat: Seat | undefined;
    private onLocalStandUp: (() => void) | undefined;
    /** Where the local player stood (game pixels) when they sat down */
    private localSeatAnchor: { x: number; y: number } | undefined;

    constructor(
        private readonly gameScene: GameScene,
        private readonly container: HTMLElement,
        private readonly localPlayerAvatar: () => AvatarConfig,
    ) {
        const canvas = document.createElement("canvas");
        canvas.id = "world3d-canvas";
        canvas.className = "absolute inset-0 h-full w-full pointer-events-none";
        canvas.style.display = "none";
        canvas.dataset.cameraMode = this.cameraMode;
        this.container.appendChild(canvas);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;

        this.labelsLayer = document.createElement("div");
        this.labelsLayer.id = "world3d-labels";
        // z-0 creates a stacking context: the z-index of the labels must not leak above the UI
        this.labelsLayer.className = "absolute inset-0 z-0 overflow-hidden pointer-events-none";
        this.labelsLayer.style.display = "none";
        this.container.appendChild(this.labelsLayer);

        this.skyTexture = this.createSkyTexture();
        this.scene.background = this.skyTexture;
        this.scene.fog = new THREE.Fog("#cfe6f5", CAMERA_MODES.game.fogNear, CAMERA_MODES.game.fogFar);

        this.scene.add(new THREE.HemisphereLight("#dff1ff", "#8a7a66", 0.9));
        // Image-based lighting: realistic (PBR) materials need something to reflect
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.environmentTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        this.scene.environment = this.environmentTexture;
        this.scene.environmentIntensity = 0.55;
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.left = -18;
        this.sun.shadow.camera.right = 18;
        this.sun.shadow.camera.top = 18;
        this.sun.shadow.camera.bottom = -18;
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 80;
        this.sun.shadow.bias = -0.0005;
        this.sun.shadow.normalBias = 0.02;
        this.scene.add(this.sun, this.sun.target);

        const markerGeometry = new THREE.RingGeometry(0.22, 0.32, 32);
        const markerMaterial = new THREE.MeshBasicMaterial({
            color: "#4b7bec",
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
        });
        this.destinationMarker = new THREE.Mesh(markerGeometry, markerMaterial);
        this.destinationMarker.rotation.x = -Math.PI / 2;
        this.destinationMarker.visible = false;
        this.scene.add(this.destinationMarker);

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);
        this.loadAssets();
        this.resize();
    }

    public get canvas(): HTMLCanvasElement {
        return this.renderer.domElement;
    }

    public get isActive(): boolean {
        return this.active;
    }

    /**
     * Quarter turns between the map "up" direction and the direction the camera looks at.
     */
    public get quarterTurns(): number {
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        return cameraQuarterTurns(forward.x, forward.z);
    }

    public setActive(active: boolean): void {
        if (this.active === active) {
            return;
        }
        this.active = active;
        this.renderer.domElement.style.display = active ? "block" : "none";
        this.labelsLayer.style.display = active ? "block" : "none";
        if (active) {
            if (!this.mapWorld) {
                this.rebuildMap();
            }
            this.cameraInitialized = false;
            this.clock.getDelta();
            this.loop();
        } else if (this.animationFrame !== undefined) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = undefined;
        }
    }

    /**
     * Forgets the world built from the map: it is rebuilt the next time the 3D view is displayed. Used when the map
     * changes while the 3D view is hidden (e.g. while the map editor is open).
     */
    public invalidateMap(): void {
        this.mapWorld?.dispose();
        this.mapWorld = undefined;
        this.entityVisuals?.dispose();
        this.entityVisuals = undefined;
    }

    /**
     * (Re)builds the static world from the tile map. Call it when the map changes.
     */
    public rebuildMap(): void {
        this.mapWorld?.dispose();
        this.entityVisuals?.dispose();
        const wrapper = this.gameScene.getGameMapFrontWrapper();
        const source = createPhaserMapSource(wrapper);
        const mapWorld = new MapWorld(this.toolkit, source, this.sceneDescription, modelLibrary);
        this.mapWorld = mapWorld;
        this.scene.add(mapWorld.group);
        // Exposed for debugging and end-to-end tests
        this.canvas.dataset.indoorCells = String(mapWorld.indoorCellCount);
        this.canvas.dataset.sceneObjects = String(this.sceneDescription?.objects.length ?? 0);
        this.entityVisuals = new EntityVisuals(
            this.toolkit,
            source.tileWidth,
            source.tileHeight,
            (x, y) => mapWorld.tableCells.has(mapWorld.cellKey(x, y)),
            modelLibrary,
        );
        this.scene.add(this.entityVisuals.group);
        this.syncEntities();
    }

    /**
     * Orbits the camera around the player.
     */
    public rotateBy(deltaYaw: number, deltaPitch: number): void {
        this.lastManualRotation = performance.now();
        this.targetYaw += deltaYaw;
        this.yaw += deltaYaw;
        const settings = CAMERA_MODES[this.cameraMode];
        this.pitch = THREE.MathUtils.clamp(this.pitch + deltaPitch, settings.minPitch, settings.maxPitch);
    }

    /**
     * Orbits the camera by a quarter turn (1: clockwise seen from above), with a smooth transition. Snaps to the
     * closest quarter first.
     */
    public rotateQuarter(direction: 1 | -1): void {
        const quarter = Math.PI / 2;
        // The camera offset is (sin(yaw), cos(yaw)) in map coordinates (y towards the bottom of the map): a
        // clockwise orbit decreases the yaw.
        this.targetYaw = Math.round(this.targetYaw / quarter) * quarter - direction * quarter;
    }

    public setCameraMode(mode: CameraMode): void {
        if (this.cameraMode === mode) {
            return;
        }
        this.cameraMode = mode;
        const settings = CAMERA_MODES[mode];
        this.pitch = settings.defaultPitch;
        if (this.scene.fog instanceof THREE.Fog) {
            this.scene.fog.near = settings.fogNear;
            this.scene.fog.far = settings.fogFar;
        }
        this.canvas.dataset.cameraMode = mode;
    }

    public resetCamera(): void {
        this.targetYaw = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2;
        this.pitch = CAMERA_MODES[this.cameraMode].defaultPitch;
    }

    public showDestination(x: number, y: number): void {
        this.destinationMarker.position.set(x / this.tileWidth, 0.03, y / this.tileHeight);
        this.destinationMarker.visible = true;
    }

    /**
     * Every seat of the world (chairs, sofas, benches...).
     */
    public getSeats(): readonly Seat[] {
        return [...(this.mapWorld?.seats ?? []), ...(this.entityVisuals?.seats ?? [])];
    }

    /**
     * Seats the local player (undefined to stand up). `onStandUp` is called when the player stands up by walking.
     */
    public setLocalSeat(seat: Seat | undefined, onStandUp?: () => void): void {
        this.localSeat = seat;
        this.onLocalStandUp = seat ? onStandUp : undefined;
        const player = this.getLocalPlayer();
        this.localSeatAnchor = seat && player ? { x: player.x, y: player.y } : undefined;
        this.canvas.dataset.seated = seat ? "true" : "false";
        // The player position does not move when sitting: do not mistake the last frames of the walk for moving
        const local = this.characters.get("local");
        if (local) {
            local.lastMoveTime = 0;
        }
    }

    public get localPlayerSeat(): Seat | undefined {
        return this.localSeat;
    }

    /**
     * Exposes the screen position of the free seat closest to the player (for end-to-end tests and debugging).
     */
    private exposeNearestSeat(): void {
        const player = this.getLocalPlayer();
        if (!player) {
            return;
        }
        const seat = findClosestSeat(
            this.getSeats(),
            player.x / this.tileWidth,
            (player.y + FEET_OFFSET_Y) / this.tileHeight,
            12,
        );
        const screen = seat
            ? this.projectToScreen(seat.x * this.tileWidth, seat.y * this.tileHeight, seat.height * 0.9)
            : undefined;
        this.canvas.dataset.nearestSeat = screen ? `${Math.round(screen.x)},${Math.round(screen.y)}` : "";
        this.canvas.dataset.seats = String(this.getSeats().length);
        this.canvas.dataset.doorways = String(this.mapWorld?.doorwayCount ?? 0);
    }

    /**
     * The seat under the pointer (the raycaster must be set): seats are tested as spheres, the chairs themselves are
     * merged with the rest of the furniture.
     */
    private pickSeat(): Seat | undefined {
        let best: Seat | undefined;
        let bestDistance = Infinity;
        const sphere = new THREE.Sphere(new THREE.Vector3(), 0.42);
        const hit = new THREE.Vector3();
        for (const seat of this.getSeats()) {
            sphere.center.set(seat.x, seat.height * 0.9, seat.y);
            if (this.raycaster.ray.intersectSphere(sphere, hit)) {
                const distance = hit.distanceTo(this.raycaster.ray.origin);
                if (distance < bestDistance) {
                    best = seat;
                    bestDistance = distance;
                }
            }
        }
        return best;
    }

    /**
     * Finds what is under a point of the screen (client coordinates).
     */
    public pick(clientX: number, clientY: number): PickResult | undefined {
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return undefined;
        }
        const pointer = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(pointer, this.camera);

        const remoteAvatars: THREE.Object3D[] = [];
        for (const visual of this.characters.values()) {
            if (visual.remote) {
                remoteAvatars.push(visual.avatar.root);
            }
        }
        const avatarHit = this.raycaster.intersectObjects(remoteAvatars, true)[0];
        if (avatarHit) {
            for (const visual of this.characters.values()) {
                if (visual.remote && this.isDescendant(avatarHit.object, visual.avatar.root)) {
                    return { type: "player", player: visual.remote };
                }
            }
        }

        const seat = this.pickSeat();
        if (seat) {
            return { type: "seat", seat };
        }

        if (this.entityVisuals) {
            const entityHit = this.raycaster.intersectObject(this.entityVisuals.group, true)[0];
            const entityId = entityHit ? this.entityVisuals.getEntityIdForObject(entityHit.object) : undefined;
            if (entityId) {
                return { type: "entity", entityId };
            }
        }

        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const point = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(groundPlane, point)) {
            return { type: "ground", x: point.x * this.tileWidth, y: point.z * this.tileHeight };
        }
        return undefined;
    }

    /**
     * Projects a point of the map (game pixels) on the screen. Used by the end-to-end tests and by UI elements
     * that need to point at something in the world.
     */
    public projectToScreen(x: number, y: number, height = 0): { x: number; y: number } | undefined {
        const vector = new THREE.Vector3(x / this.tileWidth, height, y / this.tileHeight).project(this.camera);
        if (vector.z > 1) {
            return undefined;
        }
        const rect = this.renderer.domElement.getBoundingClientRect();
        return {
            x: rect.left + ((vector.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - vector.y) / 2) * rect.height,
        };
    }

    /**
     * Some statistics about the rendered world (used by tests and for debugging).
     */
    public getStats(): { characters: number; entities: number; drawCalls: number; triangles: number } {
        return {
            characters: this.characters.size,
            entities: this.entityVisuals?.group.children.length ?? 0,
            drawCalls: this.renderer.info.render.calls,
            triangles: this.renderer.info.render.triangles,
        };
    }

    /**
     * Loads the realistic models and the scene description of the map, then rebuilds the world with them. The world
     * is displayed with the procedural models in the meantime.
     */
    private loadAssets(): void {
        const mapUrl = this.gameScene.mapUrlFile;
        const sceneProperty = normalizeProperties(this.gameScene.mapFile?.properties)["world3dScene"];
        const tiledObjects = this.findTiledSceneObjects();
        Promise.all([
            modelLibrary.load(),
            mapUrl
                ? loadSceneDescription(
                      mapUrl,
                      typeof sceneProperty === "string" ? sceneProperty : undefined,
                      this.abortController.signal,
                  )
                : Promise.resolve(undefined),
        ])
            .then(([, description]) => {
                if (this.abortController.signal.aborted) {
                    return;
                }
                if (description || tiledObjects.length > 0) {
                    this.sceneDescription = {
                        version: 1,
                        hideLayers: description?.hideLayers ?? [],
                        floorPatches: description?.floorPatches ?? [],
                        objects: [...(description?.objects ?? []), ...tiledObjects],
                    };
                }
                if (this.active) {
                    this.rebuildMap();
                } else {
                    this.invalidateMap();
                }
            })
            .catch((e) => console.error("Could not load the 3D assets", e));
    }

    /**
     * Objects of a Tiled object layer named "3d".
     */
    private findTiledSceneObjects(): SceneObject[] {
        const map = this.gameScene.mapFile;
        if (!map) {
            return [];
        }
        const objects: SceneObject[] = [];
        const visit = (layers: readonly ITiledMapLayer[]) => {
            for (const layer of layers) {
                if (layer.type === "group") {
                    visit(layer.layers);
                } else if (layer.type === "objectgroup" && layer.name === "3d") {
                    objects.push(
                        ...sceneObjectsFromTiled(
                            layer.objects.map((object) => ({
                                ...object,
                                properties: (object.properties ?? []).map((property) => ({
                                    name: property.name,
                                    value: "value" in property ? property.value : undefined,
                                })),
                            })),
                            map.tilewidth ?? 32,
                            map.tileheight ?? 32,
                        ),
                    );
                }
            }
        };
        visit(map.layers);
        return objects;
    }

    public dispose(): void {
        this.abortController.abort();
        this.setActive(false);
        this.resizeObserver.disconnect();
        for (const visual of this.characters.values()) {
            visual.avatar.dispose();
            visual.label.remove();
        }
        this.characters.clear();
        this.mapWorld?.dispose();
        this.entityVisuals?.dispose();
        this.toolkit.dispose();
        this.destinationMarker.geometry.dispose();
        if (this.destinationMarker.material instanceof THREE.Material) {
            this.destinationMarker.material.dispose();
        }
        this.skyTexture.dispose();
        this.environmentTexture.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
        this.labelsLayer.remove();
    }

    private get tileWidth(): number {
        return this.gameScene.getGameMapFrontWrapper().phaserMap.tileWidth || 32;
    }

    private get tileHeight(): number {
        return this.gameScene.getGameMapFrontWrapper().phaserMap.tileHeight || 32;
    }

    private isDescendant(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
        let current: THREE.Object3D | null = object;
        while (current) {
            if (current === ancestor) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    private createSkyTexture(): THREE.CanvasTexture {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 256;
        const context = canvas.getContext("2d");
        if (context) {
            const gradient = context.createLinearGradient(0, 0, 0, 256);
            gradient.addColorStop(0, "#6fb1f0");
            gradient.addColorStop(0.6, "#bfe0f7");
            gradient.addColorStop(1, "#e8f4fb");
            context.fillStyle = gradient;
            context.fillRect(0, 0, 2, 256);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    private resize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) {
            return;
        }
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    private readonly loop = (): void => {
        if (!this.active) {
            return;
        }
        this.animationFrame = requestAnimationFrame(this.loop);
        try {
            this.renderFrame(Math.min(this.clock.getDelta(), 0.1));
        } catch (e) {
            console.error("Error while rendering the 3D world", e);
        }
    };

    private renderFrame(delta: number): void {
        this.frameCount++;
        if (!this.mapWorld) {
            return;
        }
        this.syncCharacters(delta);
        if (this.frameCount % 20 === 0) {
            this.syncEntities();
        }
        this.updateCamera(delta);
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        world3dState.cameraForwardX = forward.x;
        world3dState.cameraForwardY = forward.z;
        const quarterTurns = this.quarterTurns;
        if (world3dState.quarterTurns !== quarterTurns || this.canvas.dataset.quarterTurns === undefined) {
            world3dState.quarterTurns = quarterTurns;
            // Exposed for end-to-end tests
            this.canvas.dataset.quarterTurns = String(quarterTurns);
        }
        this.updateOverhead(delta);
        this.updateCutaway();
        this.entityVisuals?.faceCamera(this.yaw);
        const localPlayer = this.getLocalPlayer();
        if (this.destinationMarker.visible && localPlayer) {
            const dx = localPlayer.x / this.tileWidth - this.destinationMarker.position.x;
            const dz = (localPlayer.y + FEET_OFFSET_Y) / this.tileHeight - this.destinationMarker.position.z;
            if (Math.hypot(dx, dz) < 0.8) {
                this.destinationMarker.visible = false;
            }
            this.destinationMarker.scale.setScalar(1 + Math.sin(this.frameCount / 8) * 0.1);
        }
        this.renderer.render(this.scene, this.camera);
        if (this.frameCount % 30 === 0) {
            this.exposeNearestSeat();
        }
        if (this.frameCount % 60 === 0) {
            // Exposed for debugging and performance tests
            this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
            this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
        }
        this.updateLabels();
    }

    private getLocalPlayer(): Character | undefined {
        // CurrentPlayer is only set once the connection to the room is established
        const player: Character | undefined = this.gameScene.CurrentPlayer;
        return player?.active ? player : undefined;
    }

    private syncCharacters(delta: number): void {
        const seen = new Set<string>();
        const now = performance.now();
        const checkConfigs = this.frameCount % 15 === 1;

        const localPlayer = this.getLocalPlayer();
        if (localPlayer) {
            seen.add("local");
            this.syncCharacter("local", localPlayer, undefined, delta, now, checkConfigs, this.localSeat);
        }
        const repository = this.gameScene.getRemotePlayersRepository();
        for (const [userId, remotePlayer] of this.gameScene.MapPlayersByKey) {
            if (!remotePlayer.active || !remotePlayer.visible) {
                continue;
            }
            const key = `remote:${userId}`;
            seen.add(key);
            const seat = resolveRemoteSeat(
                repository.getPlayers().get(userId)?.variables.get(AVATAR_SEAT_VARIABLE),
                this.getSeats(),
                remotePlayer.x / this.tileWidth,
                (remotePlayer.y + FEET_OFFSET_Y) / this.tileHeight,
            );
            this.syncCharacter(key, remotePlayer, remotePlayer, delta, now, checkConfigs, seat, () => {
                const data = repository.getPlayers().get(userId);
                const published = parseAvatarConfig(data?.variables.get(AVATAR_PLAYER_VARIABLE));
                return published ?? avatarConfigFromSeed(remotePlayer.userUuid || String(userId));
            });
        }

        for (const [key, visual] of this.characters) {
            if (!seen.has(key)) {
                visual.avatar.dispose();
                visual.label.remove();
                this.characters.delete(key);
            }
        }
    }

    private syncCharacter(
        key: string,
        character: Character,
        remote: RemotePlayer | undefined,
        delta: number,
        now: number,
        checkConfig: boolean,
        seat: Seat | undefined,
        getRemoteConfig?: () => AvatarConfig,
    ): void {
        let visual = this.characters.get(key);
        const getConfig = getRemoteConfig ?? this.localPlayerAvatar;
        if (!visual) {
            const config = getConfig();
            const avatar = new AvatarModel(this.toolkit, config);
            avatar.faceImmediately(directionToYaw(character.lastDirection));
            this.scene.add(avatar.root);
            const label = this.createLabel();
            label.label.dataset.avatar = JSON.stringify(config);
            label.label.dataset.player = key;
            visual = {
                avatar,
                ...label,
                lastX: character.x,
                lastY: character.y,
                lastMoveTime: 0,
                configKey: JSON.stringify(config),
                character,
                remote,
            };
            this.characters.set(key, visual);
        } else if (checkConfig || key === "local") {
            const config = getConfig();
            const configKey = JSON.stringify(config);
            if (configKey !== visual.configKey) {
                visual.configKey = configKey;
                visual.avatar.setConfig(config);
                visual.label.dataset.avatar = configKey;
            }
        }
        visual.character = character;
        visual.remote = remote;

        const dx = character.x - visual.lastX;
        const dy = character.y - visual.lastY;
        const distance = Math.hypot(dx, dy);
        if (distance > 0.01) {
            visual.lastMoveTime = now;
            if (distance > 0.5) {
                visual.avatar.setFacing(Math.atan2(dx, dy));
            }
        } else if (now - visual.lastMoveTime > 150) {
            visual.avatar.setFacing(directionToYaw(character.lastDirection));
        }
        const moving = now - visual.lastMoveTime < 150;
        const speed = delta > 0 ? distance / delta / (this.tileWidth * 3.5) : 1;
        visual.lastX = character.x;
        visual.lastY = character.y;

        if (
            key === "local" &&
            seat &&
            this.localSeatAnchor &&
            Math.hypot(character.x - this.localSeatAnchor.x, character.y - this.localSeatAnchor.y) > STAND_UP_DISTANCE
        ) {
            // The player walks away: stand up
            const onStandUp = this.onLocalStandUp;
            this.setLocalSeat(undefined);
            seat = undefined;
            onStandUp?.();
        }
        const seatedAttribute = seat ? "true" : "false";
        if (visual.label.dataset.seated !== seatedAttribute) {
            visual.label.dataset.seated = seatedAttribute;
        }
        if (seat) {
            // Seated: the hips rest on the seat, the avatar faces where the seat faces
            const yaw = THREE.MathUtils.degToRad(-seat.rotation);
            visual.avatar.setSitting(true);
            visual.avatar.setFacing(yaw);
            visual.avatar.root.position.set(
                seat.x - Math.sin(yaw) * SEAT_BACK_OFFSET,
                seat.height - HIP_Y + 0.04,
                seat.y - Math.cos(yaw) * SEAT_BACK_OFFSET,
            );
            visual.avatar.update(delta, false);
            return;
        }
        visual.avatar.setSitting(false);
        visual.avatar.root.position.set(
            character.x / this.tileWidth,
            0,
            (character.y + FEET_OFFSET_Y) / this.tileHeight,
        );
        visual.avatar.update(delta, moving, THREE.MathUtils.clamp(speed, 0.8, 2.5));
    }

    private createLabel(): Pick<CharacterVisual, "label" | "nameElement" | "statusElement" | "bubbleElement"> {
        const label = document.createElement("div");
        label.className = "absolute flex flex-col items-center -translate-x-1/2 -translate-y-full select-none";
        label.style.left = "0";
        label.style.top = "0";
        label.style.willChange = "transform";
        label.dataset.testid = "world3d-label";

        const bubbleElement = document.createElement("div");
        bubbleElement.className =
            "mb-1 max-w-[220px] rounded-xl bg-white/95 px-3 py-1.5 text-sm text-gray-800 shadow-lg break-words text-center";
        bubbleElement.style.display = "none";
        bubbleElement.dataset.testid = "world3d-bubble";

        const nameTag = document.createElement("div");
        nameTag.className =
            "flex items-center gap-1.5 whitespace-nowrap rounded-full bg-contrast/80 px-2.5 py-0.5 text-xs font-semibold text-white shadow";
        const statusElement = document.createElement("span");
        statusElement.className = "inline-block h-2 w-2 rounded-full";
        const nameElement = document.createElement("span");
        nameElement.dataset.testid = "world3d-name";
        nameTag.append(statusElement, nameElement);

        label.append(bubbleElement, nameTag);
        this.labelsLayer.appendChild(label);
        return { label, nameElement, statusElement, bubbleElement };
    }

    private updateLabels(): void {
        const width = this.labelsLayer.clientWidth;
        const height = this.labelsLayer.clientHeight;
        const position = new THREE.Vector3();
        for (const visual of this.characters.values()) {
            position.copy(visual.avatar.root.position);
            position.y += AVATAR_HEIGHT + 0.15;
            const distance = position.distanceTo(this.camera.position);
            position.project(this.camera);
            if (
                position.z > 1 ||
                distance > LABEL_MAX_DISTANCE ||
                Math.abs(position.x) > 1.2 ||
                Math.abs(position.y) > 1.2
            ) {
                visual.label.style.display = "none";
                continue;
            }
            visual.label.style.display = "flex";
            const screenX = ((position.x + 1) / 2) * width;
            const screenY = ((1 - position.y) / 2) * height;
            visual.label.style.transform = `translate(${screenX.toFixed(1)}px, ${screenY.toFixed(1)}px) translate(-50%, -100%)`;
            visual.label.style.zIndex = String(Math.round(1000 - distance * 10));

            // Position in game pixels, exposed for end-to-end tests and debugging
            const mapX = String(Math.round(visual.character.x));
            const mapY = String(Math.round(visual.character.y));
            if (visual.label.dataset.x !== mapX || visual.label.dataset.y !== mapY) {
                visual.label.dataset.x = mapX;
                visual.label.dataset.y = mapY;
            }

            const name = visual.character.playerName;
            if (visual.nameElement.textContent !== name) {
                visual.nameElement.textContent = name;
            }
            const color = statusColor(visual.character.getAvailabilityStatus());
            if (visual.statusElement.style.backgroundColor !== color) {
                visual.statusElement.style.backgroundColor = color;
            }
            const message = visual.character.currentSayMessage;
            const text = message?.text ?? "";
            if (visual.bubbleElement.textContent !== text) {
                visual.bubbleElement.textContent = text;
                visual.bubbleElement.style.display = text ? "block" : "none";
            }
        }
    }

    private syncEntities(): void {
        if (!this.entityVisuals) {
            return;
        }
        const snapshots: EntitySnapshot[] = [];
        const entities = this.gameScene.getGameMapFrontWrapper().getEntitiesManager().getEntities();
        for (const [id, entity] of entities) {
            const prefab = entity.getPrefab();
            let image: CanvasImageSource | undefined;
            const source = entity.texture?.getSourceImage();
            if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
                image = source;
            }
            snapshots.push({
                id,
                x: entity.x,
                y: entity.y,
                width: entity.displayWidth,
                height: entity.displayHeight,
                prefabName: prefab.name,
                direction: prefab.direction,
                imagePath: prefab.imagePath,
                collisionRows: prefab.collisionGrid?.length ?? 0,
                image: entity.texture?.key === "__MISSING" ? undefined : image,
            });
        }
        this.entityVisuals.sync(snapshots);
    }

    private updateCamera(delta: number): void {
        // Target: the character the Phaser camera follows (the player, or a followed user), else the Phaser camera
        // center (explorer or focus mode).
        const cameraManager = this.gameScene.getCameraManager();
        const followed = cameraManager.playerFollowing;
        let targetX: number;
        let targetY: number;
        if (this.localSeat && followed === this.getLocalPlayer()) {
            targetX = this.localSeat.x * this.tileWidth;
            targetY = this.localSeat.y * this.tileHeight;
        } else if (followed?.active) {
            targetX = followed.x;
            targetY = followed.y + FEET_OFFSET_Y;
        } else {
            const midPoint = cameraManager.getCamera().midPoint;
            targetX = midPoint.x;
            targetY = midPoint.y;
        }
        const settings = CAMERA_MODES[this.cameraMode];
        const target = new THREE.Vector3(targetX / this.tileWidth, settings.targetHeight, targetY / this.tileHeight);
        if (!this.cameraInitialized) {
            this.cameraTarget.copy(target);
            this.cameraInitialized = true;
        } else {
            this.cameraTarget.lerp(target, 1 - Math.exp(-delta * 10));
        }

        const local = this.characters.get("local");
        if (!this.cameraPlacedBehindPlayer && local) {
            // When the player appears, start behind them, looking where they look
            this.cameraPlacedBehindPlayer = true;
            if (this.cameraMode === "game") {
                this.yaw = this.targetYaw = directionToYaw(local.character.lastDirection) + Math.PI;
            }
        }
        if (this.cameraMode === "game") {
            this.followPlayerHeading(delta);
        }

        let yawDelta = this.targetYaw - this.yaw;
        if (Math.abs(yawDelta) > 0.0001) {
            yawDelta *= 1 - Math.exp(-delta * 8);
            this.yaw += yawDelta;
        }

        // The zoom follows the zoom of the 2D game (mouse wheel, pinch, zoom buttons all keep working)
        const zoom = waScaleManager.zoomModifier || 1;
        let distance = THREE.MathUtils.clamp(settings.baseDistance / zoom, settings.minDistance, settings.maxDistance);
        if (this.cameraMode === "game") {
            distance = this.getUnobstructedDistance(distance);
        }
        // Move in fast when a wall comes between the camera and the player, move back out smoothly
        const smoothing = distance < this.cameraDistance ? 20 : 4;
        this.cameraDistance += (distance - this.cameraDistance) * (1 - Math.exp(-delta * smoothing));
        this.camera.position.copy(this.getCameraOffset(this.cameraDistance).add(this.cameraTarget));
        this.camera.lookAt(this.cameraTarget);
        if (this.cameraMode === "game") {
            // Over-the-shoulder view: the player stands a bit on the left of the screen
            const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(
                SHOULDER_OFFSET * Math.min(1, this.cameraDistance / settings.baseDistance),
            );
            this.camera.position.add(right);
            this.camera.lookAt(this.cameraTarget.clone().add(right));
        }

        // The shadows follow the camera target so they stay sharp wherever the player is
        this.sun.position.set(this.cameraTarget.x + 12, 30, this.cameraTarget.z + 8);
        this.sun.target.position.copy(this.cameraTarget);
        this.sun.target.updateMatrixWorld();
    }

    private updateCutaway(): void {
        const localPlayer = this.getLocalPlayer();
        const target = localPlayer
            ? new THREE.Vector3(localPlayer.x / this.tileWidth, 0.6, (localPlayer.y + FEET_OFFSET_Y) / this.tileHeight)
            : undefined;
        this.mapWorld?.setCutawayRadius(CAMERA_MODES[this.cameraMode].cutawayRadius);
        this.mapWorld?.setCutaway(this.camera.position, target);
    }

    /**
     * Like in third-person games, the camera swings back behind the player when they run forward (not when they run
     * towards the camera, and never while the user is turning the camera).
     */
    private followPlayerHeading(delta: number): void {
        const local = this.characters.get("local");
        if (!local || this.localSeat || performance.now() - local.lastMoveTime > 150) {
            return;
        }
        if (performance.now() - this.lastManualRotation < 1200) {
            return;
        }
        const heading = local.avatar.root.rotation.y;
        const behind = heading + Math.PI;
        const cameraHeading = this.targetYaw + Math.PI;
        const offset = Math.atan2(Math.sin(heading - cameraHeading), Math.cos(heading - cameraHeading));
        if (Math.abs(offset) > THREE.MathUtils.degToRad(100)) {
            return;
        }
        const difference = Math.atan2(Math.sin(behind - this.targetYaw), Math.cos(behind - this.targetYaw));
        this.targetYaw += difference * Math.min(1, delta * 1.6);
    }

    private getCameraOffset(distance: number): THREE.Vector3 {
        const horizontal = Math.cos(this.pitch) * distance;
        return new THREE.Vector3(
            Math.sin(this.yaw) * horizontal,
            Math.sin(this.pitch) * distance,
            Math.cos(this.yaw) * horizontal,
        );
    }

    /**
     * The game camera must stay in the room of the player: walks from the player towards the wanted camera position
     * and stops before the first wall, or before the ceiling.
     */
    private getUnobstructedDistance(wanted: number): number {
        const mapWorld = this.mapWorld;
        if (!mapWorld) {
            return wanted;
        }
        const direction = this.getCameraOffset(1);
        const indoor = mapWorld.isIndoor(this.cameraTarget.x, this.cameraTarget.z);
        const step = 0.1;
        for (let distance = step; distance <= wanted; distance += step) {
            const x = this.cameraTarget.x + direction.x * distance;
            const y = this.cameraTarget.y + direction.y * distance;
            const z = this.cameraTarget.z + direction.z * distance;
            const blockHeight = mapWorld.getObstacleHeight(Math.floor(x), Math.floor(z));
            const hitsWall = blockHeight > 0 && y < blockHeight + CAMERA_CLEARANCE;
            const hitsCeiling = indoor && mapWorld.isIndoor(x, z) && y > WALL_HEIGHT - CAMERA_CLEARANCE;
            if (hitsWall || hitsCeiling) {
                // Never closer than the minimum distance: the see-through walls take over from there
                return Math.max(CAMERA_MODES.game.minDistance, distance - CAMERA_CLEARANCE);
            }
        }
        return wanted;
    }

    private updateOverhead(delta: number): void {
        if (!this.mapWorld) {
            return;
        }
        const localPlayer = this.getLocalPlayer();
        const underRoof =
            localPlayer !== undefined &&
            this.mapWorld.isUnderOverhead(
                localPlayer.x / this.tileWidth,
                (localPlayer.y + FEET_OFFSET_Y) / this.tileHeight,
            );
        // Roofs and tree tops fade out when the player walks under them, and when looking from above
        const target = underRoof || this.pitch > THREE.MathUtils.degToRad(70) ? 0.12 : 0.85;
        this.overheadOpacity += (target - this.overheadOpacity) * Math.min(1, delta * 6);
        this.mapWorld.setOverheadOpacity(this.overheadOpacity);
    }
}
