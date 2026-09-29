import * as THREE from "three";

/**
 * Materials are shared between every model using the same color: creating one material per mesh would needlessly
 * multiply the GPU programs and the memory used.
 */
export class MaterialCache {
    private readonly materials = new Map<string, THREE.MeshStandardMaterial>();

    public get(
        color: THREE.ColorRepresentation,
        options: { roughness?: number; metalness?: number; emissive?: number; opacity?: number } = {},
    ): THREE.MeshStandardMaterial {
        const colorKey = new THREE.Color(color).getHexString();
        const key = `${colorKey}|${options.roughness ?? 0.8}|${options.metalness ?? 0}|${options.emissive ?? 0}|${
            options.opacity ?? 1
        }`;
        let material = this.materials.get(key);
        if (!material) {
            material = new THREE.MeshStandardMaterial({
                color,
                roughness: options.roughness ?? 0.8,
                metalness: options.metalness ?? 0,
                transparent: options.opacity !== undefined && options.opacity < 1,
                opacity: options.opacity ?? 1,
            });
            if (options.emissive) {
                material.emissive = new THREE.Color(color);
                material.emissiveIntensity = options.emissive;
            }
            this.materials.set(key, material);
        }
        return material;
    }

    public dispose(): void {
        for (const material of this.materials.values()) {
            material.dispose();
        }
        this.materials.clear();
    }
}

/**
 * Geometries are shared too. They are created lazily and keyed by their parameters.
 */
export class GeometryCache {
    private readonly geometries = new Map<string, THREE.BufferGeometry>();

    public box(width: number, height: number, depth: number): THREE.BufferGeometry {
        return this.getOrCreate(`box|${width}|${height}|${depth}`, () => new THREE.BoxGeometry(width, height, depth));
    }

    public cylinder(radiusTop: number, radiusBottom: number, height: number, segments = 16): THREE.BufferGeometry {
        return this.getOrCreate(
            `cyl|${radiusTop}|${radiusBottom}|${height}|${segments}`,
            () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
        );
    }

    public sphere(radius: number, widthSegments = 16, heightSegments = 12): THREE.BufferGeometry {
        return this.getOrCreate(
            `sphere|${radius}|${widthSegments}|${heightSegments}`,
            () => new THREE.SphereGeometry(radius, widthSegments, heightSegments),
        );
    }

    public hemisphere(radius: number): THREE.BufferGeometry {
        return this.getOrCreate(
            `hemi|${radius}`,
            () => new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        );
    }

    public capsule(radius: number, length: number): THREE.BufferGeometry {
        return this.getOrCreate(`capsule|${radius}|${length}`, () => new THREE.CapsuleGeometry(radius, length, 4, 10));
    }

    public cone(radius: number, height: number, segments = 12): THREE.BufferGeometry {
        return this.getOrCreate(
            `cone|${radius}|${height}|${segments}`,
            () => new THREE.ConeGeometry(radius, height, segments),
        );
    }

    public torus(radius: number, tube: number, arc = Math.PI * 2): THREE.BufferGeometry {
        return this.getOrCreate(
            `torus|${radius}|${tube}|${arc}`,
            () => new THREE.TorusGeometry(radius, tube, 8, 20, arc),
        );
    }

    private getOrCreate(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
        let geometry = this.geometries.get(key);
        if (!geometry) {
            geometry = factory();
            this.geometries.set(key, geometry);
        }
        return geometry;
    }

    public dispose(): void {
        for (const geometry of this.geometries.values()) {
            geometry.dispose();
        }
        this.geometries.clear();
    }
}

/**
 * Small helper to create a mesh casting and receiving shadows, positioned in one call.
 */
export function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    castShadow = true,
): THREE.Mesh {
    const result = new THREE.Mesh(geometry, material);
    result.position.set(x, y, z);
    result.castShadow = castShadow;
    result.receiveShadow = true;
    return result;
}

export class ModelToolkit {
    public readonly materials = new MaterialCache();
    public readonly geometries = new GeometryCache();

    public dispose(): void {
        this.materials.dispose();
        this.geometries.dispose();
    }
}
