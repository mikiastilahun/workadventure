import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Merges the meshes of a group of static objects into one mesh per material. The models are made of many small
 * meshes: a map with hundreds of desks and chairs would otherwise cost thousands of draw calls per frame.
 * Geometries can only be merged when they have the same attributes: they are grouped by material and by attribute
 * layout. Meshes with several materials are kept as they are.
 * The returned objects own their geometry (flagged with userData.ownedGeometry).
 */
export function mergeStaticMeshes(root: THREE.Object3D): THREE.Object3D[] {
    root.updateMatrixWorld(true);
    const groups = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    const materialIds = new Map<THREE.Material, number>();
    const kept: THREE.Object3D[] = [];

    root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
            return;
        }
        const geometry: THREE.BufferGeometry = object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        // A negative scale (mirrored model) flips the triangles
        if (object.matrixWorld.determinant() < 0 && geometry.index) {
            const index = geometry.index.array;
            for (let i = 0; i < index.length; i += 3) {
                const swap = index[i + 1] ?? 0;
                index[i + 1] = index[i + 2] ?? 0;
                index[i + 2] = swap;
            }
        }
        if (!(object.material instanceof THREE.Material)) {
            const copy = new THREE.Mesh(geometry, object.material);
            copy.castShadow = object.castShadow;
            copy.receiveShadow = object.receiveShadow;
            copy.userData["ownedGeometry"] = true;
            kept.push(copy);
            return;
        }
        let materialId = materialIds.get(object.material);
        if (materialId === undefined) {
            materialId = materialIds.size;
            materialIds.set(object.material, materialId);
        }
        const layout = Object.keys(geometry.attributes)
            .sort()
            .map((name) => `${name}:${geometry.getAttribute(name).itemSize}`)
            .join(",");
        const key = `${materialId}|${layout}|${geometry.index ? "indexed" : "flat"}|${geometry.morphAttributes.position ? "morph" : ""}`;
        let group = groups.get(key);
        if (!group) {
            group = { material: object.material, geometries: [] };
            groups.set(key, group);
        }
        group.geometries.push(geometry);
    });

    const meshes: THREE.Object3D[] = [...kept];
    for (const { material, geometries } of groups.values()) {
        const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
        if (geometries.length > 1) {
            for (const geometry of geometries) {
                geometry.dispose();
            }
        }
        if (!merged) {
            continue;
        }
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData["ownedGeometry"] = true;
        meshes.push(mesh);
    }
    return meshes;
}
