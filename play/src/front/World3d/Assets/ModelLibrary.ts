import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { z } from "zod";

/**
 * 1 tile of the map = 1 / 0.72 m: a 1.7 m tall person is as tall as the avatars (1.2 tiles).
 */
export const METERS_TO_TILES = 0.72;

const MODELS_URL = "/world3d/models/";

const ModelManifest = z.record(
    z.object({
        file: z.string(),
        /** Real height of the object, in meters */
        height: z.number().positive(),
        /** Rotation (degrees) turning the front of the model towards +Z */
        rotation: z.number().default(0),
        /** Overrides of the materials, by material name */
        materials: z
            .record(
                z.object({
                    color: z.string().optional(),
                    metalness: z.number().optional(),
                    roughness: z.number().optional(),
                }),
            )
            .optional(),
    }),
);
type ModelManifest = z.infer<typeof ModelManifest>;

interface ModelTemplate {
    scene: THREE.Object3D;
    /** Size of the model once rotated so that it faces +Z, before scaling */
    size: THREE.Vector3;
    center: THREE.Vector3;
    minY: number;
    height: number;
}

export interface ModelInstanceOptions {
    /**
     * "uniform": the model keeps its real proportions (chairs, plants, cars...).
     * "stretch": the model is stretched horizontally to fill width x depth, keeping its real height (desks, tables,
     * counters, shelves...).
     */
    fit?: "uniform" | "stretch";
    /** Size of the footprint (tiles), along the local X (width) and Z (depth) axes */
    width?: number;
    depth?: number;
    /** Multiplies the real size of the model */
    scale?: number;
}

/**
 * Loads the realistic 3D models (CC0 assets from Poly Haven and Kenney, see public/world3d/models/CREDITS.md) and
 * creates instances of them at the scale of the map.
 */
export class ModelLibrary {
    private manifest: ModelManifest = {};
    private readonly templates = new Map<string, ModelTemplate>();
    private loadingPromise: Promise<void> | undefined;
    private loaded = false;

    /**
     * Loads the manifest and every model. Resolves (never rejects) once everything that could be loaded is ready.
     */
    public load(): Promise<void> {
        if (!this.loadingPromise) {
            this.loadingPromise = this.doLoad();
        }
        return this.loadingPromise;
    }

    public get isLoaded(): boolean {
        return this.loaded;
    }

    public has(id: string): boolean {
        return this.templates.has(id);
    }

    /**
     * Height (tiles) of an instance of the model, at its real size.
     */
    public getHeight(id: string, scale = 1): number {
        const entry = this.manifest[id];
        return entry ? entry.height * METERS_TO_TILES * scale : 0;
    }

    /**
     * Creates an instance of a model, centered on the origin, standing on y = 0 and facing +Z.
     * Returns undefined if the model is not available.
     */
    public instantiate(id: string, options: ModelInstanceOptions = {}): THREE.Object3D | undefined {
        const template = this.templates.get(id);
        const entry = this.manifest[id];
        if (!template || !entry) {
            return undefined;
        }
        const realScale = ((entry.height * METERS_TO_TILES) / template.height) * (options.scale ?? 1);
        const inner = template.scene.clone(true);
        inner.rotation.y = THREE.MathUtils.degToRad(entry.rotation);
        const pivot = new THREE.Group();
        pivot.add(inner);
        // Center the rotated model on the origin, on the ground
        inner.position.set(-template.center.x, -template.minY, -template.center.z);

        const holder = new THREE.Group();
        holder.add(pivot);
        if (options.fit === "stretch" && options.width !== undefined && options.depth !== undefined) {
            holder.scale.set(options.width / template.size.x, realScale, options.depth / template.size.z);
        } else {
            holder.scale.setScalar(realScale);
        }
        holder.name = `asset:${id}`;
        return holder;
    }

    private async doLoad(): Promise<void> {
        try {
            const response = await fetch(`${MODELS_URL}manifest.json`);
            if (!response.ok) {
                return;
            }
            this.manifest = ModelManifest.parse(await response.json());
        } catch (e) {
            console.warn("3D models are not available, falling back to the procedural models", e);
            return;
        }
        const loader = new GLTFLoader();
        await Promise.all(
            Object.entries(this.manifest).map(async ([id, entry]) => {
                try {
                    const gltf = await loader.loadAsync(`${MODELS_URL}${entry.file}`);
                    this.templates.set(id, this.prepareTemplate(gltf.scene, entry.rotation, entry.materials));
                } catch (e) {
                    console.warn(`Could not load the 3D model "${id}"`, e);
                }
            }),
        );
        this.loaded = true;
    }

    private prepareTemplate(
        scene: THREE.Object3D,
        rotation: number,
        overrides: ModelManifest[string]["materials"],
    ): ModelTemplate {
        scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) {
                return;
            }
            object.castShadow = true;
            object.receiveShadow = true;
            const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                const override = overrides?.[material.name];
                if (!override || !(material instanceof THREE.MeshStandardMaterial)) {
                    continue;
                }
                if (override.color) {
                    material.color.set(override.color);
                }
                if (override.metalness !== undefined) {
                    material.metalness = override.metalness;
                }
                if (override.roughness !== undefined) {
                    material.roughness = override.roughness;
                }
            }
        });
        // Size and center once rotated to face +Z
        const rotated = new THREE.Group();
        const probe = scene.clone(true);
        probe.rotation.y = THREE.MathUtils.degToRad(rotation);
        rotated.add(probe);
        rotated.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(rotated);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        return {
            scene,
            size: new THREE.Vector3(Math.max(size.x, 1e-3), Math.max(size.y, 1e-3), Math.max(size.z, 1e-3)),
            center,
            minY: box.min.y,
            height: Math.max(size.y, 1e-3),
        };
    }
}

/**
 * The library is shared by every scene: models are downloaded once per session.
 */
export const modelLibrary = new ModelLibrary();
