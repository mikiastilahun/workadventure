import * as THREE from "three";
import type { ModelKind } from "../Map/MapAnalysis";
import { directionToRotation, resolveEntityModel, TABLETOP_MODEL_KINDS } from "../Map/MapAnalysis";
import type { ModelToolkit } from "../Models/Materials";
import { buildPropModel, TABLE_HEIGHT } from "../Models/PropModels";
import type { ModelLibrary } from "../Assets/ModelLibrary";
import { buildAssetModel } from "../Assets/KindRecipes";
import type { Seat } from "./Seats";
import { seatFromModel } from "./Seats";

/**
 * What the 3D world needs to know about an entity placed with the map editor.
 */
export interface EntitySnapshot {
    id: string;
    /** Top-left corner of the 2D image, in game pixels */
    x: number;
    y: number;
    /** Size of the 2D image, in game pixels */
    width: number;
    height: number;
    prefabName: string;
    direction: string | undefined;
    imagePath: string;
    /** Number of rows of the collision grid of the prefab (0 when the entity does not collide) */
    collisionRows: number;
    image: CanvasImageSource | undefined;
}

interface EntityVisual {
    signature: string;
    object: THREE.Object3D;
    model: ModelKind | undefined;
}

const TABLE_KINDS: readonly ModelKind[] = ["desk", "desk_monitor", "meeting_table", "round_table", "counter"];

/**
 * Keeps 3D objects in sync with the entities of the map editor. Known furniture is rendered with a procedural 3D
 * model, anything else (custom uploaded entities...) as a standing picture of its 2D image.
 */
export class EntityVisuals {
    public readonly group = new THREE.Group();
    private readonly visuals = new Map<string, EntityVisual>();
    /** Seats of the entities (chairs, sofas...), rebuilt on each sync */
    public seats: Seat[] = [];
    private readonly textures = new Map<string, THREE.Texture>();
    private readonly standeeMaterials = new Map<string, THREE.MeshStandardMaterial>();
    private readonly planeGeometry = new THREE.PlaneGeometry(1, 1);

    constructor(
        private readonly toolkit: ModelToolkit,
        private readonly tileWidth: number,
        private readonly tileHeight: number,
        private readonly isTableCell: (x: number, y: number) => boolean,
        private readonly library: ModelLibrary | undefined = undefined,
    ) {}

    public sync(entities: readonly EntitySnapshot[]): void {
        const seen = new Set<string>();
        // Tables first, so objects put on them can be lifted
        const tableFootprints: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
        for (const entity of entities) {
            const model = resolveEntityModel(entity.prefabName);
            if (model && TABLE_KINDS.includes(model)) {
                const footprint = this.getFootprint(entity);
                tableFootprints.push({
                    minX: footprint.centerX - footprint.width / 2,
                    maxX: footprint.centerX + footprint.width / 2,
                    minY: footprint.centerY - footprint.depth / 2 - 0.3,
                    maxY: footprint.centerY + footprint.depth / 2,
                });
            }
        }

        for (const entity of entities) {
            seen.add(entity.id);
            const signature = `${entity.x}|${entity.y}|${entity.width}|${entity.height}|${entity.prefabName}|${
                entity.direction ?? ""
            }|${entity.image ? 1 : 0}`;
            const existing = this.visuals.get(entity.id);
            if (existing && existing.signature === signature) {
                continue;
            }
            if (existing) {
                existing.object.removeFromParent();
            }
            const visual = this.createVisual(entity, tableFootprints);
            if (visual) {
                this.group.add(visual.object);
                this.visuals.set(entity.id, { ...visual, signature });
            } else {
                this.visuals.delete(entity.id);
            }
        }

        this.seats = [];
        for (const entity of entities) {
            const model = resolveEntityModel(entity.prefabName);
            if (!model) {
                continue;
            }
            const footprint = this.getFootprint(entity);
            const seat = seatFromModel(
                model,
                footprint.centerX,
                footprint.centerY,
                directionToRotation(entity.direction),
            );
            if (seat) {
                this.seats.push(seat);
            }
        }

        for (const [id, visual] of this.visuals) {
            if (!seen.has(id)) {
                visual.object.removeFromParent();
                this.visuals.delete(id);
            }
        }
    }

    /**
     * Makes the standing pictures face the camera (around the vertical axis only).
     */
    public faceCamera(cameraYaw: number): void {
        for (const visual of this.visuals.values()) {
            if (visual.model === undefined) {
                visual.object.rotation.y = cameraYaw;
            }
        }
    }

    public getObjectForEntity(id: string): THREE.Object3D | undefined {
        return this.visuals.get(id)?.object;
    }

    public getEntityIdForObject(object: THREE.Object3D): string | undefined {
        let current: THREE.Object3D | null = object;
        while (current) {
            const id: unknown = current.userData["entityId"];
            if (typeof id === "string") {
                return id;
            }
            current = current.parent;
        }
        return undefined;
    }

    public dispose(): void {
        this.group.removeFromParent();
        this.group.clear();
        this.visuals.clear();
        for (const texture of this.textures.values()) {
            texture.dispose();
        }
        for (const material of this.standeeMaterials.values()) {
            material.dispose();
        }
        this.planeGeometry.dispose();
    }

    private getFootprint(entity: EntitySnapshot) {
        const width = entity.width / this.tileWidth;
        const imageHeight = entity.height / this.tileHeight;
        // In a top-down picture, the bottom of the image is the base of the object. The depth of the object is the
        // height of its collision grid, or a fraction of the picture.
        const depth = Math.max(
            0.4,
            Math.min(imageHeight, entity.collisionRows > 0 ? entity.collisionRows : imageHeight * 0.6),
        );
        const centerX = entity.x / this.tileWidth + width / 2;
        const centerY = (entity.y + entity.height) / this.tileHeight - depth / 2;
        return { width, depth, centerX, centerY };
    }

    private createVisual(
        entity: EntitySnapshot,
        tableFootprints: readonly { minX: number; minY: number; maxX: number; maxY: number }[],
    ): Omit<EntityVisual, "signature"> | undefined {
        const model = resolveEntityModel(entity.prefabName);
        const footprint = this.getFootprint(entity);
        let object: THREE.Object3D;
        if (model) {
            const rotation = directionToRotation(entity.direction);
            const quarter = rotation === 90 || rotation === 270;
            const width = quarter ? footprint.depth : footprint.width;
            const depth = quarter ? footprint.width : footprint.depth;
            object =
                (this.library ? buildAssetModel(this.library, model, width, depth) : undefined) ??
                buildPropModel(this.toolkit, model, width, depth);
            object.rotation.y = (-rotation * Math.PI) / 180;
            object.position.set(footprint.centerX, 0, footprint.centerY);
            if (TABLETOP_MODEL_KINDS.includes(model)) {
                const onEntityTable = tableFootprints.some(
                    (table) =>
                        footprint.centerX >= table.minX &&
                        footprint.centerX <= table.maxX &&
                        footprint.centerY >= table.minY &&
                        footprint.centerY <= table.maxY,
                );
                if (onEntityTable || this.isTableCell(Math.floor(footprint.centerX), Math.floor(footprint.centerY))) {
                    object.position.y = TABLE_HEIGHT;
                }
            }
        } else {
            if (!entity.image) {
                return undefined;
            }
            const material = this.getStandeeMaterial(entity.imagePath, entity.image);
            const standee = new THREE.Mesh(this.planeGeometry, material);
            const width = entity.width / this.tileWidth;
            const height = entity.height / this.tileHeight;
            standee.scale.set(width, height, 1);
            standee.position.y = height / 2;
            standee.castShadow = true;
            const holder = new THREE.Group();
            holder.add(standee);
            holder.position.set(footprint.centerX, 0, (entity.y + entity.height) / this.tileHeight - 0.1);
            object = holder;
        }
        object.userData["entityId"] = entity.id;
        object.traverse((child) => {
            child.userData["entityId"] = entity.id;
        });
        object.name = `entity:${entity.prefabName}`;
        return { object, model };
    }

    private getStandeeMaterial(imagePath: string, image: CanvasImageSource): THREE.MeshStandardMaterial {
        let material = this.standeeMaterials.get(imagePath);
        if (!material) {
            let texture = this.textures.get(imagePath);
            if (!texture) {
                texture = new THREE.Texture(image);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.magFilter = THREE.NearestFilter;
                texture.needsUpdate = true;
                this.textures.set(imagePath, texture);
            }
            material = new THREE.MeshStandardMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.4,
                side: THREE.DoubleSide,
                roughness: 0.9,
            });
            this.standeeMaterials.set(imagePath, material);
        }
        return material;
    }
}
