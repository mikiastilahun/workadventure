import * as THREE from "three";

/**
 * Uniforms shared by every material using the cutaway effect.
 */
export interface CutawayUniforms {
    uCutCamera: { value: THREE.Vector3 };
    uCutTarget: { value: THREE.Vector3 };
    uCutRadius: { value: number };
    uCutEnabled: { value: number };
}

export function createCutawayUniforms(): CutawayUniforms {
    return {
        uCutCamera: { value: new THREE.Vector3() },
        uCutTarget: { value: new THREE.Vector3() },
        uCutRadius: { value: 1.0 },
        uCutEnabled: { value: 0 },
    };
}

/**
 * Makes the walls standing between the camera and the player see-through, so the player is never hidden behind a
 * wall. Fragments close to the camera → player segment are discarded (with a dithered border), except for a low
 * strip at the bottom of the walls so the layout of the room stays readable.
 */
export function applyCutaway(material: THREE.Material, uniforms: CutawayUniforms): void {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vCutWorldPosition;")
            .replace(
                "#include <project_vertex>",
                "#include <project_vertex>\nvCutWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
varying vec3 vCutWorldPosition;
uniform vec3 uCutCamera;
uniform vec3 uCutTarget;
uniform float uCutRadius;
uniform float uCutEnabled;`,
            )
            .replace(
                "#include <clipping_planes_fragment>",
                `#include <clipping_planes_fragment>
if (uCutEnabled > 0.5 && vCutWorldPosition.y > 0.3) {
    vec3 cutSegment = uCutTarget - uCutCamera;
    float cutT = clamp(dot(vCutWorldPosition - uCutCamera, cutSegment) / dot(cutSegment, cutSegment), 0.0, 1.0);
    float cutDistance = length(vCutWorldPosition - (uCutCamera + cutSegment * cutT));
    // A cone from the camera to the target: narrow close to the camera, so the hole keeps a steady size on screen
    float cutRadius = uCutRadius * smoothstep(0.0, 1.0, cutT);
    if (cutT < 0.96 && cutDistance < cutRadius) {
        bool dither = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0;
        if (cutDistance < cutRadius * 0.85 || dither) {
            discard;
        }
    }
}`,
            );
    };
    material.customProgramCacheKey = () => "world3d-cutaway";
}
