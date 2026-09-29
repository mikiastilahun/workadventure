import * as THREE from "three";
import type { AvatarConfig } from "../Avatar/AvatarConfig";
import type { ModelToolkit } from "./Materials";
import { mesh } from "./Materials";

/** Height of an avatar, in tiles. */
export const AVATAR_HEIGHT = 1.2;

/** Height of the hips above the feet */
export const HIP_Y = 0.42;
const KNEE_DEPTH = 0.2;
const SHOULDER_Y = 0.76;
const HEAD_Y = 0.98;
const HEAD_RADIUS = 0.19;
const WALK_CYCLE_SPEED = 9;

function darken(color: string, amount: number): THREE.Color {
    return new THREE.Color(color).multiplyScalar(1 - amount);
}

/**
 * A procedural, low-poly humanoid avatar built from an AvatarConfig. The model faces +Z and its origin is between
 * its feet. Call update() every frame to animate it.
 */
export class AvatarModel {
    public readonly root = new THREE.Group();
    private readonly body = new THREE.Group();
    private leftLeg = new THREE.Group();
    private rightLeg = new THREE.Group();
    private leftArm = new THREE.Group();
    private rightArm = new THREE.Group();
    private head = new THREE.Group();
    private leftKnee = new THREE.Group();
    private rightKnee = new THREE.Group();
    private sitting = false;
    private sitBlend = 0;
    private walkPhase = 0;
    private walkBlend = 0;
    private idleTime = Math.random() * 10;
    private targetYaw = 0;

    constructor(
        private readonly toolkit: ModelToolkit,
        private config: AvatarConfig,
    ) {
        this.root.add(this.body);
        this.build();
    }

    public getConfig(): AvatarConfig {
        return this.config;
    }

    public setConfig(config: AvatarConfig): void {
        if (JSON.stringify(config) === JSON.stringify(this.config)) {
            return;
        }
        this.config = config;
        this.build();
    }

    /**
     * Sets the direction the avatar should face, as a yaw angle (radians, rotation around the vertical axis).
     */
    public setFacing(yaw: number): void {
        this.targetYaw = yaw;
    }

    public faceImmediately(yaw: number): void {
        this.targetYaw = yaw;
        this.root.rotation.y = yaw;
    }

    /**
     * @param delta seconds since the last frame
     * @param moving whether the avatar walks
     * @param speedFactor 1 for a normal walk, more when running
     */
    public update(delta: number, moving: boolean, speedFactor = 1): void {
        // Smoothly turn towards the target direction, the shortest way
        let yawDelta = this.targetYaw - this.root.rotation.y;
        yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
        this.root.rotation.y += yawDelta * Math.min(1, delta * 14);

        this.walkBlend += ((moving ? 1 : 0) - this.walkBlend) * Math.min(1, delta * 10);
        if (moving) {
            this.walkPhase += delta * WALK_CYCLE_SPEED * speedFactor;
        }
        this.idleTime += delta;

        this.sitBlend += ((this.sitting ? 1 : 0) - this.sitBlend) * Math.min(1, delta * 8);
        const standing = 1 - this.sitBlend;

        const swing = Math.sin(this.walkPhase) * 0.65 * this.walkBlend * standing;
        // Knees bend when the leg swings back
        const leftKneeBend = Math.max(0, -Math.sin(this.walkPhase)) * 0.7 * this.walkBlend * standing;
        const rightKneeBend = Math.max(0, Math.sin(this.walkPhase)) * 0.7 * this.walkBlend * standing;
        const seatedHip = (-Math.PI / 2) * this.sitBlend;
        const seatedKnee = (Math.PI / 2) * this.sitBlend;
        this.leftLeg.rotation.x = swing + seatedHip;
        this.rightLeg.rotation.x = -swing + seatedHip;
        this.leftKnee.rotation.x = leftKneeBend + seatedKnee;
        this.rightKnee.rotation.x = rightKneeBend + seatedKnee;
        // Seated, the hands rest on the desk (typing a little)
        const typing = Math.sin(this.idleTime * 9) * 0.04 * this.sitBlend;
        this.leftArm.rotation.x = -swing * 0.8 - 0.95 * this.sitBlend + typing;
        this.rightArm.rotation.x = swing * 0.8 - 0.95 * this.sitBlend - typing;
        const breathing = Math.sin(this.idleTime * 2) * 0.008 * (1 - this.walkBlend);
        this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05 * this.walkBlend * standing + breathing;
        this.head.rotation.z = Math.sin(this.walkPhase) * 0.04 * this.walkBlend * standing;
        this.body.rotation.x = 0.06 * this.walkBlend * Math.min(speedFactor, 2) * standing;
    }

    /**
     * Seated avatars bend their hips and knees; the caller places the root so that the hips rest on the seat.
     */
    public setSitting(sitting: boolean): void {
        this.sitting = sitting;
    }

    public get isSitting(): boolean {
        return this.sitting;
    }

    public dispose(): void {
        // Geometries and materials belong to the shared toolkit
        this.root.removeFromParent();
        this.body.clear();
    }

    private build(): void {
        this.body.clear();
        const { materials, geometries } = this.toolkit;
        const config = this.config;
        const widthFactor = config.bodyType === "slim" ? 0.85 : config.bodyType === "broad" ? 1.2 : 1;

        const skin = materials.get(config.skinColor, { roughness: 0.7 });
        const top = materials.get(config.topColor);
        const bottom = materials.get(config.bottomColor);
        const shoes = materials.get(config.shoesColor, { roughness: 0.6 });
        const hair = materials.get(config.hairColor, { roughness: 0.9 });
        const dark = materials.get("#1e1e24", { roughness: 0.4 });
        const white = materials.get("#ffffff", { roughness: 0.5 });

        // Legs
        const legOffsetX = 0.085 * widthFactor;
        // Each leg: a hip joint (thigh) and a knee joint (shin + shoe), so the avatar can sit
        const makeLeg = (side: number): { hip: THREE.Group; knee: THREE.Group } => {
            const hip = new THREE.Group();
            hip.position.set(side * legOffsetX, HIP_Y, 0);
            const thighMaterial = config.bottomStyle === "pants" || config.bottomStyle === "shorts" ? bottom : skin;
            const shinMaterial = config.bottomStyle === "pants" ? bottom : skin;
            hip.add(mesh(geometries.capsule(0.063, 0.1), thighMaterial, 0, -0.1, 0));
            const knee = new THREE.Group();
            knee.position.set(0, -KNEE_DEPTH, 0);
            knee.add(mesh(geometries.capsule(0.057, 0.1), shinMaterial, 0, -0.09, 0));
            knee.add(mesh(geometries.box(0.11, 0.07, 0.19), shoes, 0, -(HIP_Y - KNEE_DEPTH) + 0.035, 0.03));
            hip.add(knee);
            return { hip, knee };
        };
        const left = makeLeg(-1);
        const right = makeLeg(1);
        this.leftLeg = left.hip;
        this.rightLeg = right.hip;
        this.leftKnee = left.knee;
        this.rightKnee = right.knee;
        this.body.add(this.leftLeg, this.rightLeg);

        // Hips
        this.body.add(mesh(geometries.box(0.28 * widthFactor, 0.1, 0.18), bottom, 0, HIP_Y, 0));
        if (config.bottomStyle === "skirt" || config.topStyle === "dress") {
            const skirtMaterial = config.topStyle === "dress" ? top : bottom;
            this.body.add(
                mesh(
                    geometries.cylinder(0.14 * widthFactor, 0.24 * widthFactor, 0.26, 14),
                    skirtMaterial,
                    0,
                    HIP_Y - 0.08,
                    0,
                ),
            );
        }

        // Torso
        const torsoWidth = 0.32 * widthFactor;
        const torso = mesh(geometries.box(torsoWidth, 0.34, 0.2), top, 0, 0.62, 0);
        this.body.add(torso);
        switch (config.topStyle) {
            case "hoodie": {
                const hood = mesh(
                    geometries.torus(0.1, 0.035, Math.PI),
                    materials.get(darken(config.topColor, 0.1)),
                    0,
                    0.78,
                    -0.09,
                );
                hood.rotation.x = -Math.PI / 2.4;
                this.body.add(hood);
                this.body.add(
                    mesh(
                        geometries.box(0.16, 0.07, 0.02),
                        materials.get(darken(config.topColor, 0.15)),
                        0,
                        0.53,
                        0.105,
                    ),
                );
                this.body.add(mesh(geometries.cylinder(0.006, 0.006, 0.12, 4), white, -0.04, 0.68, 0.105));
                this.body.add(mesh(geometries.cylinder(0.006, 0.006, 0.12, 4), white, 0.04, 0.68, 0.105));
                break;
            }
            case "shirt": {
                this.body.add(mesh(geometries.box(0.14, 0.04, 0.03), white, 0, 0.785, 0.09));
                for (let i = 0; i < 3; i++) {
                    this.body.add(mesh(geometries.sphere(0.012, 6, 4), dark, 0, 0.72 - i * 0.08, 0.103, false));
                }
                break;
            }
            case "suit": {
                this.body.add(mesh(geometries.box(0.09, 0.2, 0.02), white, 0, 0.69, 0.1));
                this.body.add(mesh(geometries.box(0.035, 0.16, 0.02), materials.get("#b3202a"), 0, 0.68, 0.112));
                break;
            }
            case "dress": {
                this.body.add(
                    mesh(
                        geometries.box(torsoWidth * 1.02, 0.04, 0.21),
                        materials.get(darken(config.topColor, 0.2)),
                        0,
                        0.5,
                        0,
                    ),
                );
                break;
            }
            case "tshirt":
            default:
                break;
        }

        // Arms
        const armOffsetX = torsoWidth / 2 + 0.05;
        const longSleeves = config.topStyle !== "tshirt" && config.topStyle !== "dress";
        const makeArm = (side: number): THREE.Group => {
            const arm = new THREE.Group();
            arm.position.set(side * armOffsetX, SHOULDER_Y, 0);
            if (longSleeves) {
                arm.add(mesh(geometries.capsule(0.05, 0.24), top, 0, -0.15, 0));
            } else {
                arm.add(mesh(geometries.capsule(0.058, 0.06), top, 0, -0.05, 0));
                arm.add(mesh(geometries.capsule(0.043, 0.2), skin, 0, -0.17, 0));
            }
            arm.add(mesh(geometries.sphere(0.05, 10, 8), skin, 0, -0.32, 0));
            arm.rotation.z = side * 0.06;
            return arm;
        };
        this.leftArm = makeArm(-1);
        this.rightArm = makeArm(1);
        this.body.add(this.leftArm, this.rightArm);

        // Neck + head
        this.body.add(mesh(geometries.cylinder(0.055, 0.06, 0.08, 10), skin, 0, 0.81, 0));
        this.head = new THREE.Group();
        this.head.position.set(0, HEAD_Y, 0);
        this.body.add(this.head);
        const headMesh = mesh(geometries.sphere(HEAD_RADIUS, 20, 16), skin);
        headMesh.scale.set(1, 1.05, 0.95);
        this.head.add(headMesh);
        // Face
        this.head.add(mesh(geometries.sphere(0.024, 8, 6), dark, -0.065, 0.02, 0.165, false));
        this.head.add(mesh(geometries.sphere(0.024, 8, 6), dark, 0.065, 0.02, 0.165, false));
        this.head.add(mesh(geometries.sphere(0.008, 6, 4), white, -0.058, 0.03, 0.186, false));
        this.head.add(mesh(geometries.sphere(0.008, 6, 4), white, 0.072, 0.03, 0.186, false));
        this.head.add(
            mesh(geometries.sphere(0.022, 8, 6), materials.get(darken(config.skinColor, 0.08)), 0, -0.02, 0.185, false),
        );
        const mouth = mesh(geometries.torus(0.03, 0.007, Math.PI), materials.get("#7a2e2e"), 0, -0.065, 0.165, false);
        mouth.rotation.z = Math.PI;
        this.head.add(mouth);
        this.head.add(mesh(geometries.sphere(0.035, 8, 6), skin, -0.19, 0, 0));
        this.head.add(mesh(geometries.sphere(0.035, 8, 6), skin, 0.19, 0, 0));

        this.buildHair(hair);
        this.buildFacialHair(hair);
        this.buildHeadwear();
        this.buildEyewear(dark);
    }

    private buildHair(hair: THREE.Material): void {
        const { geometries } = this.toolkit;
        const style = this.config.hairStyle;
        if (style === "bald") {
            return;
        }
        const cap = mesh(geometries.hemisphere(HEAD_RADIUS * 1.08), hair, 0, 0.05, -0.015);
        cap.scale.set(1, 0.95, 1.02);
        cap.rotation.x = -0.4;
        this.head.add(cap);
        switch (style) {
            case "long": {
                this.head.add(mesh(geometries.box(0.36, 0.34, 0.1), hair, 0, -0.14, -0.12));
                this.head.add(mesh(geometries.box(0.06, 0.26, 0.14), hair, -0.18, -0.1, -0.02));
                this.head.add(mesh(geometries.box(0.06, 0.26, 0.14), hair, 0.18, -0.1, -0.02));
                break;
            }
            case "bun": {
                this.head.add(mesh(geometries.sphere(0.085, 12, 10), hair, 0, 0.2, -0.1));
                break;
            }
            case "ponytail": {
                const tail = mesh(geometries.capsule(0.05, 0.2), hair, 0, -0.06, -0.21);
                tail.rotation.x = 0.35;
                this.head.add(tail);
                break;
            }
            case "spiky": {
                for (let i = 0; i < 7; i++) {
                    const angle = (i / 7) * Math.PI * 2;
                    const spike = mesh(
                        geometries.cone(0.05, 0.14, 6),
                        hair,
                        Math.cos(angle) * 0.09,
                        0.19,
                        Math.sin(angle) * 0.09 - 0.02,
                    );
                    spike.rotation.set(Math.sin(angle) * 0.5, 0, -Math.cos(angle) * 0.5);
                    this.head.add(spike);
                }
                break;
            }
            case "curly": {
                for (let i = 0; i < 10; i++) {
                    const angle = (i / 10) * Math.PI * 2;
                    this.head.add(
                        mesh(
                            geometries.sphere(0.07, 8, 6),
                            hair,
                            Math.cos(angle) * 0.15,
                            0.1 + (i % 2) * 0.05,
                            Math.sin(angle) * 0.14 - 0.03,
                        ),
                    );
                }
                this.head.add(mesh(geometries.sphere(0.1, 10, 8), hair, 0, 0.18, -0.02));
                break;
            }
            case "short":
            default: {
                this.head.add(mesh(geometries.box(0.3, 0.06, 0.08), hair, 0, 0.13, 0.1));
                break;
            }
        }
    }

    private buildFacialHair(hair: THREE.Material): void {
        const { geometries } = this.toolkit;
        if (this.config.facialHair === "beard") {
            const beard = mesh(geometries.hemisphere(0.13), hair, 0, -0.07, 0.07);
            beard.rotation.x = Math.PI * 0.85;
            this.head.add(beard);
        } else if (this.config.facialHair === "mustache") {
            this.head.add(mesh(geometries.box(0.1, 0.022, 0.03), hair, 0, -0.045, 0.18, false));
        }
    }

    private buildHeadwear(): void {
        const { geometries, materials } = this.toolkit;
        const color = materials.get(this.config.headwearColor);
        switch (this.config.headwear) {
            case "cap": {
                const crown = mesh(geometries.hemisphere(HEAD_RADIUS * 1.13), color, 0, 0.04, 0);
                this.head.add(crown);
                const brim = mesh(geometries.cylinder(0.12, 0.12, 0.02, 16), color, 0, 0.06, 0.17);
                brim.scale.set(1, 1, 0.8);
                this.head.add(brim);
                break;
            }
            case "beanie": {
                const beanie = mesh(geometries.hemisphere(HEAD_RADIUS * 1.15), color, 0, 0.05, 0);
                beanie.scale.set(1, 1.15, 1);
                this.head.add(beanie);
                this.head.add(
                    mesh(geometries.cylinder(HEAD_RADIUS * 1.17, HEAD_RADIUS * 1.17, 0.06, 18), color, 0, 0.06, 0),
                );
                this.head.add(mesh(geometries.sphere(0.05, 10, 8), materials.get("#ffffff"), 0, 0.3, 0));
                break;
            }
            case "headphones": {
                const band = mesh(geometries.torus(0.21, 0.02, Math.PI), color, 0, 0.02, 0);
                this.head.add(band);
                for (const side of [-1, 1]) {
                    const ear = mesh(geometries.cylinder(0.065, 0.065, 0.05, 14), color, side * 0.21, 0, 0);
                    ear.rotation.z = Math.PI / 2;
                    this.head.add(ear);
                }
                break;
            }
            case "crown": {
                const gold = materials.get("#f4c430", { roughness: 0.3, metalness: 0.7 });
                this.head.add(mesh(geometries.cylinder(0.13, 0.12, 0.07, 14), gold, 0, 0.2, 0));
                for (let i = 0; i < 5; i++) {
                    const angle = (i / 5) * Math.PI * 2;
                    this.head.add(
                        mesh(
                            geometries.cone(0.03, 0.08, 6),
                            gold,
                            Math.cos(angle) * 0.12,
                            0.27,
                            Math.sin(angle) * 0.12,
                        ),
                    );
                }
                break;
            }
            case "none":
            default:
                break;
        }
    }

    private buildEyewear(dark: THREE.Material): void {
        const { geometries, materials } = this.toolkit;
        if (this.config.eyewear === "glasses") {
            for (const side of [-1, 1]) {
                this.head.add(mesh(geometries.torus(0.042, 0.009), dark, side * 0.068, 0.02, 0.18, false));
            }
            this.head.add(mesh(geometries.box(0.04, 0.01, 0.01), dark, 0, 0.025, 0.185, false));
        } else if (this.config.eyewear === "sunglasses") {
            const lens = materials.get("#111111", { roughness: 0.1, metalness: 0.5 });
            for (const side of [-1, 1]) {
                this.head.add(mesh(geometries.box(0.075, 0.04, 0.02), lens, side * 0.066, 0.02, 0.18, false));
            }
            this.head.add(mesh(geometries.box(0.24, 0.015, 0.015), lens, 0, 0.04, 0.18, false));
        }
    }
}
