import { get, writable } from "svelte/store";
import type { Subscription } from "rxjs";
import type { Unsubscriber } from "svelte/store";
import type { GameScene } from "../Phaser/Game/GameScene";
import { AVATAR_PLAYER_VARIABLE, AVATAR_SEAT_VARIABLE, avatarConfigFromSeed } from "./Avatar/AvatarConfig";
import { avatarConfigFromWokaFrame, WOKA_FRAME_SIZE } from "./Avatar/WokaColors";
import type { Seat } from "./Scene/Seats";
import type { Place } from "./Places/Places";
import { extractPlaces } from "./Places/Places";
import { avatarConfigStore } from "./Stores/AvatarStore";
import { placesStore, travelDestinationStore } from "./Stores/PlacesStore";
import { cameraModeStore, preferredViewModeStore, viewModeStore } from "./Stores/ViewModeStore";
import { World3dRenderer } from "./World3dRenderer";
import { world3dState } from "./World3dState";

const DRAG_THRESHOLD = 6;
const MAP_REBUILD_DELAY = 800;
/** Distance (tiles) from which a player can sit on a seat */
const MAX_SIT_DISTANCE = 1.6;

/**
 * Glue between the game scene and the 3D view:
 * - shows/hides the 3D view according to the view mode,
 * - translates pointer interactions (click to walk, drag to orbit the camera),
 * - broadcasts the 3D avatar of the player,
 * - maintains the list of places of the map and walks the player to them.
 */
export class World3dController {
    private renderer: World3dRenderer | undefined;
    private readonly unsubscribers: Unsubscriber[] = [];
    private mapChangedSubscription: Subscription | undefined;
    private rebuildTimeout: ReturnType<typeof setTimeout> | undefined;
    private pointerDown: { x: number; y: number; lastX: number; lastY: number } | undefined;
    private readonly canvas: HTMLCanvasElement | undefined;
    private connected = false;

    constructor(private readonly gameScene: GameScene) {
        const container = gameScene.game.canvas.parentElement;
        if (!container) {
            throw new Error("The game canvas has no parent element");
        }
        try {
            this.renderer = new World3dRenderer(gameScene, container, () => get(avatarConfigStore));
        } catch (e) {
            console.error("Could not start the 3D view, falling back to 2D", e);
            preferredViewModeStore.set("2d");
            return;
        }

        this.unsubscribers.push(viewModeStore.subscribe((mode) => this.applyViewMode(mode === "3d")));
        this.unsubscribers.push(cameraModeStore.subscribe((mode) => this.renderer?.setCameraMode(mode)));
        this.unsubscribers.push(
            avatarConfigStore.subscribe(() => {
                this.publishAvatar();
            }),
        );

        this.refreshPlaces();
        this.mapChangedSubscription = gameScene
            .getGameMapFrontWrapper()
            .getMapChangedObservable()
            .subscribe(() => this.scheduleMapRebuild());

        this.canvas = gameScene.game.canvas;
        this.canvas.addEventListener("pointerdown", this.onPointerDown);
        this.canvas.addEventListener("contextmenu", this.onContextMenu);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);

        world3dState.pointerHandler = {
            handleClick: (clientX, clientY) => this.handleClick(clientX, clientY),
        };
        world3dControllerStore.set(this);
    }

    public get isAvailable(): boolean {
        return this.renderer !== undefined;
    }

    /**
     * Called once the connection to the room is established (player variables can then be sent).
     */
    public onConnected(): void {
        this.connected = true;
        this.publishAvatar();
        this.refreshPlaces();
        this.dressLikeWoka();
    }

    /**
     * Until the user customizes their 3D avatar, it wears the colors of their Woka.
     */
    private dressLikeWoka(): void {
        if (get(avatarConfigStore.customized)) {
            return;
        }
        const player = this.gameScene.CurrentPlayer;
        Promise.resolve(player.getTextureLoadedPromise())
            .then(() => {
                const canvas = document.createElement("canvas");
                canvas.width = WOKA_FRAME_SIZE;
                canvas.height = WOKA_FRAME_SIZE;
                const context = canvas.getContext("2d", { willReadFrequently: true });
                if (!context) {
                    return;
                }
                // The Woka is made of layers (body, clothes, hair...): the front-facing frame of each one
                for (const textureKey of player.sprites.keys()) {
                    const image = this.gameScene.textures.get(textureKey).getSourceImage();
                    if (image instanceof HTMLImageElement || image instanceof HTMLCanvasElement) {
                        context.drawImage(
                            image,
                            WOKA_FRAME_SIZE,
                            0,
                            WOKA_FRAME_SIZE,
                            WOKA_FRAME_SIZE,
                            0,
                            0,
                            WOKA_FRAME_SIZE,
                            WOKA_FRAME_SIZE,
                        );
                    }
                }
                const pixels = context.getImageData(0, 0, WOKA_FRAME_SIZE, WOKA_FRAME_SIZE).data;
                const base = avatarConfigFromSeed([...player.sprites.keys()].join("|"));
                avatarConfigStore.setFromWoka(avatarConfigFromWokaFrame(pixels, base));
            })
            .catch((e) => console.warn("Could not dress the 3D avatar like the Woka", e));
    }

    public rotateQuarter(direction: 1 | -1): void {
        this.renderer?.rotateQuarter(direction);
    }

    public resetCamera(): void {
        this.renderer?.resetCamera();
    }

    public getRenderer(): World3dRenderer | undefined {
        return this.renderer;
    }

    /**
     * Walks the player to a place of the map.
     */
    public travelTo(place: Place): void {
        travelDestinationStore.set(place);
        this.renderer?.showDestination(place.x, place.y);
        this.gameScene
            .moveTo({ x: place.x, y: place.y }, true)
            .then(() => {
                if (get(travelDestinationStore)?.id === place.id) {
                    travelDestinationStore.set(undefined);
                }
            })
            .catch((e) => {
                console.warn("Could not travel to", place.name, e);
                travelDestinationStore.set(undefined);
            });
    }

    public destroy(): void {
        this.canvas?.removeEventListener("pointerdown", this.onPointerDown);
        this.canvas?.removeEventListener("contextmenu", this.onContextMenu);
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.unsubscribers.length = 0;
        this.mapChangedSubscription?.unsubscribe();
        if (this.rebuildTimeout !== undefined) {
            clearTimeout(this.rebuildTimeout);
        }
        this.applyViewMode(false);
        this.renderer?.dispose();
        this.renderer = undefined;
        world3dState.pointerHandler = undefined;
        world3dState.active = false;
        placesStore.set([]);
        travelDestinationStore.set(undefined);
        if (get(world3dControllerStore) === this) {
            world3dControllerStore.set(undefined);
        }
    }

    private applyViewMode(active: boolean): void {
        const renderer = this.renderer;
        const enable = active && renderer !== undefined;
        world3dState.active = enable;
        world3dState.pointerDragged = false;
        // The Phaser camera keeps running (it drives the game logic) but is not drawn anymore
        this.gameScene.cameras.main.setVisible(!enable);
        const domContainer = this.gameScene.game.domContainer;
        if (domContainer) {
            domContainer.style.visibility = enable ? "hidden" : "";
        }
        renderer?.setActive(enable);
        this.gameScene.markDirty();
    }

    private publishAvatar(): void {
        if (!this.connected) {
            return;
        }
        const playerVariablesManager = this.gameScene.getPlayerVariablesManager();
        if (!playerVariablesManager) {
            return;
        }
        try {
            playerVariablesManager.setVariableFromApp(AVATAR_PLAYER_VARIABLE, get(avatarConfigStore), {
                public: true,
                persist: true,
                scope: "world",
            });
        } catch (e) {
            console.error("Could not publish the 3D avatar", e);
        }
    }

    private refreshPlaces(): void {
        const wrapper = this.gameScene.getGameMapFrontWrapper();
        placesStore.set(extractPlaces(wrapper.dynamicAreas.values(), wrapper.getAreas()?.values() ?? []));
    }

    private scheduleMapRebuild(): void {
        if (this.rebuildTimeout !== undefined) {
            clearTimeout(this.rebuildTimeout);
        }
        this.rebuildTimeout = setTimeout(() => {
            this.rebuildTimeout = undefined;
            this.refreshPlaces();
            if (this.renderer?.isActive) {
                this.renderer.rebuildMap();
            } else {
                this.renderer?.invalidateMap();
            }
        }, MAP_REBUILD_DELAY);
    }

    private readonly onContextMenu = (event: MouseEvent): void => {
        if (world3dState.active) {
            event.preventDefault();
        }
    };

    private readonly onPointerUp = (): void => {
        this.pointerDown = undefined;
    };

    private readonly onPointerDown = (event: PointerEvent): void => {
        world3dState.pointerDragged = false;
        if (!world3dState.active || event.pointerType === "touch") {
            // On touch screens, dragging moves the player with the virtual joystick
            this.pointerDown = undefined;
            return;
        }
        this.pointerDown = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY };
    };

    private readonly onPointerMove = (event: PointerEvent): void => {
        const pointerDown = this.pointerDown;
        if (!pointerDown || !world3dState.active || event.buttons === 0) {
            return;
        }
        if (
            !world3dState.pointerDragged &&
            Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < DRAG_THRESHOLD
        ) {
            return;
        }
        world3dState.pointerDragged = true;
        this.renderer?.rotateBy(
            -(event.clientX - pointerDown.lastX) * 0.008,
            (event.clientY - pointerDown.lastY) * 0.005,
        );
        pointerDown.lastX = event.clientX;
        pointerDown.lastY = event.clientY;
    };

    private handleClick(clientX: number, clientY: number): void {
        if (world3dState.pointerDragged) {
            world3dState.pointerDragged = false;
            return;
        }
        const pick = this.renderer?.pick(clientX, clientY);
        if (!pick) {
            return;
        }
        switch (pick.type) {
            case "player":
                this.gameScene.getActivatablesManager().handlePointerDownEvent(pick.player);
                return;
            case "entity": {
                const entity = this.gameScene
                    .getGameMapFrontWrapper()
                    .getEntitiesManager()
                    .getEntities()
                    .get(pick.entityId);
                if (entity?.isActivatable()) {
                    this.gameScene.getActivatablesManager().handlePointerDownEvent(entity);
                    return;
                }
                if (entity) {
                    this.walkTo(entity.x + entity.displayWidth / 2, entity.y + entity.displayHeight);
                }
                return;
            }
            case "seat":
                this.sitOn(pick.seat);
                return;
            case "ground":
                this.walkTo(pick.x, pick.y);
                return;
        }
    }

    /**
     * Walks to a seat and sits on it. The other players see the avatar seated thanks to a public player variable.
     */
    private sitOn(seat: Seat): void {
        const renderer = this.renderer;
        if (!renderer) {
            return;
        }
        travelDestinationStore.set(undefined);
        const tileWidth = this.gameScene.getGameMapFrontWrapper().phaserMap.tileWidth || 32;
        const tileHeight = this.gameScene.getGameMapFrontWrapper().phaserMap.tileHeight || 32;
        renderer.showDestination(seat.x * tileWidth, seat.y * tileHeight);
        this.gameScene
            .moveTo({ x: seat.x * tileWidth, y: seat.y * tileHeight }, true)
            .then((result) => {
                const player = this.gameScene.CurrentPlayer;
                const distance = Math.hypot(player.x / tileWidth - seat.x, player.y / tileHeight - seat.y);
                // The chair itself may be an obstacle: sitting is possible from the tiles around it
                if (result.cancelled || distance > MAX_SIT_DISTANCE) {
                    return;
                }
                renderer.setLocalSeat(seat, () => this.publishSeat(undefined));
                this.publishSeat(seat);
            })
            .catch((e) => console.warn("Could not walk to the seat", e));
    }

    private publishSeat(seat: Seat | undefined): void {
        try {
            this.gameScene.getPlayerVariablesManager()?.setVariableFromApp(AVATAR_SEAT_VARIABLE, seat ?? null, {
                public: true,
                persist: false,
                scope: "room",
            });
        } catch (e) {
            console.error("Could not publish the seat of the player", e);
        }
    }

    private walkTo(x: number, y: number): void {
        travelDestinationStore.set(undefined);
        if (this.renderer?.localPlayerSeat) {
            this.renderer.setLocalSeat(undefined);
            this.publishSeat(undefined);
        }
        this.renderer?.showDestination(x, y);
        this.gameScene.moveTo({ x, y }, true).catch((e) => console.warn(e));
    }
}

/**
 * The controller of the current game scene, for the Svelte UI.
 */
export const world3dControllerStore = writable<World3dController | undefined>(undefined);
