import * as THREE from "three";
import type { ModelKind } from "../Map/MapAnalysis";
import type { ModelToolkit } from "./Materials";
import { mesh } from "./Materials";

const WOOD = "#b98552";
const LIGHT_WOOD = "#dcb68a";
const METAL = "#9aa3ad";
const DARK = "#2f3542";
const WHITE = "#f1f2f6";
const FABRIC = "#4a69bd";
const LEAF = "#3fa34d";
const LEAF_DARK = "#2d7a3a";
const POT = "#c0673c";

/** Height of the top of desks and tables: objects put on a table are lifted to this height. */
export const TABLE_HEIGHT = 0.46;

/**
 * Builds a procedural 3D model. The model faces +Z, is centered on the origin and fits a `width` x `depth` footprint
 * (in tiles, local X and Z axes). Heights are fixed, whatever the footprint.
 */
export function buildPropModel(toolkit: ModelToolkit, kind: ModelKind, width: number, depth: number): THREE.Group {
    const group = new THREE.Group();
    const { materials: m, geometries: g } = toolkit;
    const add = (object: THREE.Object3D) => group.add(object);
    const w = Math.max(0.3, width - 0.08);
    const d = Math.max(0.3, depth - 0.08);

    const tableTop = (color: string, height = TABLE_HEIGHT, thickness = 0.05) => {
        add(mesh(g.box(w, thickness, d), m.get(color, { roughness: 0.6 }), 0, height - thickness / 2, 0));
        const legGeometry = g.box(0.05, height - thickness, 0.05);
        const legMaterial = m.get(METAL, { roughness: 0.4, metalness: 0.5 });
        for (const [sx, sz] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
        ] as const) {
            add(mesh(legGeometry, legMaterial, sx * (w / 2 - 0.06), (height - thickness) / 2, sz * (d / 2 - 0.06)));
        }
    };

    const monitor = (x: number, z: number, y: number, big = false) => {
        const screenWidth = big ? 0.42 : 0.3;
        add(mesh(g.box(screenWidth, screenWidth * 0.6, 0.025), m.get(DARK, { roughness: 0.3 }), x, y + 0.2, z));
        add(
            mesh(
                g.box(screenWidth - 0.03, screenWidth * 0.6 - 0.03, 0.005),
                m.get("#5aa9e6", { emissive: 0.6 }),
                x,
                y + 0.2,
                z + 0.014,
                false,
            ),
        );
        add(mesh(g.box(0.03, 0.1, 0.03), m.get(DARK), x, y + 0.05, z - 0.02));
        add(mesh(g.box(0.14, 0.012, 0.09), m.get(DARK), x, y + 0.006, z - 0.02));
    };

    const plant = (x: number, z: number, scale: number) => {
        add(mesh(g.cylinder(0.12 * scale, 0.09 * scale, 0.22 * scale, 12), m.get(POT), x, 0.11 * scale, z));
        add(mesh(g.sphere(0.17 * scale, 10, 8), m.get(LEAF), x, 0.36 * scale, z));
        add(mesh(g.sphere(0.12 * scale, 10, 8), m.get(LEAF_DARK), x + 0.08 * scale, 0.46 * scale, z + 0.04 * scale));
        add(mesh(g.sphere(0.11 * scale, 10, 8), m.get(LEAF), x - 0.07 * scale, 0.5 * scale, z - 0.03 * scale));
    };

    const seat = (color: string, seatWidth: number, seatDepth: number, withArms: boolean) => {
        const fabric = m.get(color, { roughness: 0.95 });
        const darker = m.get(new THREE.Color(color).multiplyScalar(0.8), { roughness: 0.95 });
        add(mesh(g.box(seatWidth, 0.18, seatDepth), fabric, 0, 0.18, 0.03));
        add(mesh(g.box(seatWidth, 0.42, 0.14), darker, 0, 0.32, -seatDepth / 2 + 0.07));
        if (withArms) {
            add(mesh(g.box(0.12, 0.3, seatDepth), darker, -seatWidth / 2 + 0.06, 0.25, 0.03));
            add(mesh(g.box(0.12, 0.3, seatDepth), darker, seatWidth / 2 - 0.06, 0.25, 0.03));
        }
    };

    switch (kind) {
        case "desk":
        case "desk_monitor": {
            tableTop(LIGHT_WOOD);
            // Modesty panel
            add(mesh(g.box(w - 0.12, 0.25, 0.02), m.get(WHITE), 0, 0.28, -d / 2 + 0.08));
            if (kind === "desk_monitor") {
                monitor(0, -d / 2 + 0.22, TABLE_HEIGHT, w > 1.2);
                add(mesh(g.box(0.3, 0.015, 0.1), m.get(DARK), 0, TABLE_HEIGHT + 0.008, 0.05));
            }
            break;
        }
        case "meeting_table": {
            tableTop(WOOD, TABLE_HEIGHT, 0.07);
            add(mesh(g.box(0.14, 0.02, 0.1), m.get(DARK), 0, TABLE_HEIGHT + 0.01, 0));
            break;
        }
        case "round_table": {
            const radius = Math.min(w, d) / 2;
            add(
                mesh(
                    g.cylinder(radius, radius, 0.05, 24),
                    m.get(LIGHT_WOOD, { roughness: 0.6 }),
                    0,
                    TABLE_HEIGHT - 0.025,
                    0,
                ),
            );
            add(
                mesh(
                    g.cylinder(0.04, 0.04, TABLE_HEIGHT - 0.05, 8),
                    m.get(METAL, { metalness: 0.5 }),
                    0,
                    (TABLE_HEIGHT - 0.05) / 2,
                    0,
                ),
            );
            add(mesh(g.cylinder(0.2, 0.22, 0.03, 16), m.get(METAL, { metalness: 0.5 }), 0, 0.015, 0));
            break;
        }
        case "chair":
        case "office_chair": {
            const color = kind === "office_chair" ? DARK : FABRIC;
            add(mesh(g.box(0.36, 0.06, 0.36), m.get(color, { roughness: 0.9 }), 0, 0.28, 0));
            add(mesh(g.box(0.36, 0.34, 0.05), m.get(color, { roughness: 0.9 }), 0, 0.48, -0.16));
            if (kind === "office_chair") {
                add(mesh(g.cylinder(0.025, 0.025, 0.22, 8), m.get(METAL, { metalness: 0.6 }), 0, 0.14, 0));
                for (let i = 0; i < 5; i++) {
                    const leg = mesh(g.box(0.03, 0.03, 0.22), m.get(DARK), 0, 0.03, 0);
                    leg.rotation.y = (i / 5) * Math.PI * 2;
                    leg.translateZ(0.1);
                    add(leg);
                }
            } else {
                for (const [sx, sz] of [
                    [-1, -1],
                    [1, -1],
                    [-1, 1],
                    [1, 1],
                ] as const) {
                    add(mesh(g.box(0.035, 0.26, 0.035), m.get(WOOD), sx * 0.15, 0.13, sz * 0.15));
                }
            }
            break;
        }
        case "sofa":
            seat(FABRIC, w, Math.min(d, 0.8), true);
            break;
        case "armchair":
            seat("#c0392b", Math.min(w, 0.8), Math.min(d, 0.8), true);
            break;
        case "pouf":
            add(mesh(g.cylinder(0.22, 0.24, 0.3, 16), m.get("#e17055", { roughness: 1 }), 0, 0.15, 0));
            break;
        case "bench":
            add(mesh(g.box(w, 0.06, Math.min(d, 0.4)), m.get(WOOD), 0, 0.3, 0));
            add(mesh(g.box(0.06, 0.27, 0.3), m.get(DARK), -w / 2 + 0.1, 0.135, 0));
            add(mesh(g.box(0.06, 0.27, 0.3), m.get(DARK), w / 2 - 0.1, 0.135, 0));
            break;
        case "plant":
            plant(0, 0, 1.2);
            break;
        case "large_plant":
            plant(0, 0, 2);
            break;
        case "tree": {
            add(mesh(g.cylinder(0.08, 0.12, 1, 8), m.get("#6d4c41"), 0, 0.5, 0));
            add(mesh(g.cone(0.55, 1.1, 10), m.get(LEAF_DARK), 0, 1.3, 0));
            add(mesh(g.cone(0.42, 0.8, 10), m.get(LEAF), 0, 1.75, 0));
            break;
        }
        case "bookshelf":
        case "shelf": {
            const height = kind === "bookshelf" ? 1.5 : 0.9;
            const shelfDepth = Math.min(d, 0.4);
            const wood = m.get(WOOD);
            add(mesh(g.box(0.04, height, shelfDepth), wood, -w / 2 + 0.02, height / 2, -d / 2 + shelfDepth / 2));
            add(mesh(g.box(0.04, height, shelfDepth), wood, w / 2 - 0.02, height / 2, -d / 2 + shelfDepth / 2));
            add(mesh(g.box(w, height, 0.02), wood, 0, height / 2, -d / 2 + 0.01));
            const bookColors = ["#e74c3c", "#3498db", "#f1c40f", "#9b59b6", "#1abc9c", "#e67e22"];
            const levels = Math.round(height / 0.3);
            for (let level = 0; level <= levels; level++) {
                const y = level * (height / levels);
                add(
                    mesh(
                        g.box(w, 0.03, shelfDepth),
                        wood,
                        0,
                        Math.min(y, height - 0.015) + 0.015,
                        -d / 2 + shelfDepth / 2,
                    ),
                );
                if (level < levels) {
                    let x = -w / 2 + 0.08;
                    let i = level * 3;
                    while (x < w / 2 - 0.1) {
                        const bookHeight = 0.16 + ((i * 37) % 7) / 100;
                        add(
                            mesh(
                                g.box(0.05, bookHeight, shelfDepth * 0.8),
                                m.get(bookColors[i % bookColors.length] ?? WHITE),
                                x,
                                y + 0.03 + bookHeight / 2,
                                -d / 2 + shelfDepth / 2,
                            ),
                        );
                        x += 0.06 + ((i * 13) % 3) / 100;
                        i++;
                    }
                }
            }
            break;
        }
        case "whiteboard": {
            add(mesh(g.box(w, 0.7, 0.04), m.get(WHITE, { roughness: 0.2 }), 0, 0.95, -d / 2 + 0.05));
            add(mesh(g.box(w + 0.04, 0.74, 0.03), m.get(METAL, { metalness: 0.5 }), 0, 0.95, -d / 2 + 0.03));
            add(mesh(g.box(w * 0.5, 0.02, 0.005), m.get("#3498db"), -w * 0.1, 1.1, -d / 2 + 0.075, false));
            add(mesh(g.box(w * 0.3, 0.02, 0.005), m.get("#e74c3c"), -w * 0.2, 1.0, -d / 2 + 0.075, false));
            add(mesh(g.box(w * 0.4, 0.02, 0.005), m.get(DARK), 0, 0.9, -d / 2 + 0.075, false));
            add(mesh(g.box(w * 0.8, 0.03, 0.08), m.get(METAL), 0, 0.6, -d / 2 + 0.08));
            break;
        }
        case "screen": {
            add(mesh(g.box(w, w * 0.56, 0.05), m.get(DARK, { roughness: 0.3 }), 0, 1.0, -d / 2 + 0.05));
            add(
                mesh(
                    g.box(w - 0.06, w * 0.56 - 0.06, 0.005),
                    m.get("#4b7bec", { emissive: 0.7 }),
                    0,
                    1.0,
                    -d / 2 + 0.078,
                    false,
                ),
            );
            break;
        }
        case "monitor":
            monitor(0, 0, 0, w > 1);
            break;
        case "laptop": {
            add(mesh(g.box(0.3, 0.015, 0.2), m.get(METAL, { metalness: 0.6, roughness: 0.3 }), 0, 0.008, 0.02));
            const lid = mesh(g.box(0.3, 0.2, 0.012), m.get(METAL, { metalness: 0.6, roughness: 0.3 }), 0, 0.1, -0.08);
            lid.rotation.x = -0.25;
            add(lid);
            break;
        }
        case "counter": {
            add(mesh(g.box(w, 0.5, d), m.get(WHITE), 0, 0.25, 0));
            add(mesh(g.box(w + 0.04, 0.04, d + 0.04), m.get("#57606f", { roughness: 0.4 }), 0, 0.52, 0));
            break;
        }
        case "coffee_machine": {
            add(mesh(g.box(0.26, 0.36, 0.24), m.get("#2d3436", { roughness: 0.4 }), 0, 0.18, 0));
            add(mesh(g.box(0.18, 0.06, 0.02), m.get("#e17055", { emissive: 0.5 }), 0, 0.28, 0.125, false));
            add(mesh(g.cylinder(0.035, 0.03, 0.07, 10), m.get(WHITE), 0, 0.05, 0.08));
            break;
        }
        case "water_cooler": {
            add(mesh(g.box(0.3, 0.7, 0.3), m.get(WHITE), 0, 0.35, 0));
            add(mesh(g.cylinder(0.13, 0.13, 0.35, 14), m.get("#74b9ff", { opacity: 0.7, roughness: 0.1 }), 0, 0.88, 0));
            break;
        }
        case "printer": {
            add(mesh(g.box(Math.min(w, 0.6), 0.35, Math.min(d, 0.5)), m.get("#dfe4ea"), 0, 0.3, 0));
            add(mesh(g.box(0.4, 0.02, 0.2), m.get(WHITE), 0, 0.49, 0.05));
            add(mesh(g.box(Math.min(w, 0.6), 0.12, Math.min(d, 0.5)), m.get("#57606f"), 0, 0.06, 0));
            break;
        }
        case "lamp": {
            add(mesh(g.cylinder(0.12, 0.14, 0.03, 12), m.get(DARK), 0, 0.015, 0));
            add(mesh(g.cylinder(0.015, 0.015, 1.1, 6), m.get(DARK), 0, 0.55, 0));
            add(mesh(g.cone(0.16, 0.2, 14), m.get("#ffeaa7", { emissive: 0.8 }), 0, 1.15, 0));
            break;
        }
        case "stage": {
            add(mesh(g.box(w, 0.18, d), m.get("#6c5ce7", { roughness: 0.6 }), 0, 0.09, 0));
            add(mesh(g.box(w, 0.02, 0.04), m.get("#ffeaa7", { emissive: 0.8 }), 0, 0.17, d / 2 - 0.02, false));
            break;
        }
        case "podium": {
            add(mesh(g.box(0.5, 0.75, 0.4), m.get(WOOD), 0, 0.375, 0));
            const top = mesh(g.box(0.55, 0.04, 0.45), m.get(LIGHT_WOOD), 0, 0.77, 0.02);
            top.rotation.x = 0.2;
            add(top);
            break;
        }
        case "cabinet": {
            add(mesh(g.box(w, 0.8, Math.min(d, 0.5)), m.get("#a4b0be"), 0, 0.4, 0));
            for (let i = 0; i < 3; i++) {
                add(mesh(g.box(0.12, 0.02, 0.02), m.get(DARK), 0, 0.15 + i * 0.25, Math.min(d, 0.5) / 2 + 0.01, false));
            }
            break;
        }
        case "bin":
            add(mesh(g.cylinder(0.12, 0.1, 0.3, 12), m.get("#636e72"), 0, 0.15, 0));
            break;
        case "sink": {
            add(mesh(g.box(w, 0.5, Math.min(d, 0.5)), m.get(WHITE), 0, 0.25, 0));
            add(mesh(g.cylinder(0.015, 0.015, 0.15, 6), m.get(METAL, { metalness: 0.8 }), 0, 0.57, -0.1));
            break;
        }
        case "toilet": {
            add(mesh(g.cylinder(0.16, 0.12, 0.35, 14), m.get(WHITE), 0, 0.18, 0.05));
            add(mesh(g.box(0.36, 0.35, 0.14), m.get(WHITE), 0, 0.45, -0.15));
            break;
        }
        case "books": {
            const colors = ["#e74c3c", "#3498db", "#27ae60"];
            colors.forEach((color, i) => add(mesh(g.box(0.2, 0.04, 0.26), m.get(color), 0, 0.02 + i * 0.04, 0)));
            break;
        }
        case "mug":
            add(mesh(g.cylinder(0.035, 0.03, 0.08, 10), m.get(WHITE), 0, 0.04, 0));
            break;
        case "clock": {
            const face = mesh(g.cylinder(0.18, 0.18, 0.03, 20), m.get(WHITE), 0, 1.2, -d / 2 + 0.05);
            face.rotation.x = Math.PI / 2;
            add(face);
            break;
        }
        case "door": {
            add(mesh(g.box(w, 1.3, 0.08), m.get(WOOD), 0, 0.65, 0));
            add(mesh(g.sphere(0.03, 8, 6), m.get("#f4c430", { metalness: 0.8 }), w / 2 - 0.12, 0.62, 0.05));
            break;
        }
        case "vending_machine": {
            const machineWidth = Math.min(w, 0.95);
            const machineDepth = Math.min(d, 0.7);
            add(
                mesh(
                    g.box(machineWidth, 1.35, machineDepth),
                    m.get("#2f3542", { roughness: 0.4, metalness: 0.3 }),
                    0,
                    0.675,
                    0,
                ),
            );
            // Lit glass front with rows of products
            add(
                mesh(
                    g.box(machineWidth * 0.62, 1.0, 0.02),
                    m.get("#dfe9f3", { emissive: 0.35, roughness: 0.1 }),
                    -machineWidth * 0.12,
                    0.8,
                    machineDepth / 2 + 0.005,
                    false,
                ),
            );
            const productColors = ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71", "#e67e22"];
            for (let row = 0; row < 5; row++) {
                for (let column = 0; column < 4; column++) {
                    add(
                        mesh(
                            g.box(0.08, 0.12, 0.04),
                            m.get(productColors[(row + column) % productColors.length] ?? WHITE, { emissive: 0.2 }),
                            -machineWidth * 0.37 + column * machineWidth * 0.16,
                            0.42 + row * 0.19,
                            machineDepth / 2 + 0.025,
                            false,
                        ),
                    );
                }
            }
            add(
                mesh(
                    g.box(machineWidth * 0.22, 0.3, 0.02),
                    m.get("#57606f"),
                    machineWidth * 0.33,
                    0.95,
                    machineDepth / 2 + 0.005,
                    false,
                ),
            );
            add(
                mesh(
                    g.box(machineWidth * 0.62, 0.14, 0.03),
                    m.get("#1e272e"),
                    -machineWidth * 0.12,
                    0.18,
                    machineDepth / 2 + 0.01,
                    false,
                ),
            );
            break;
        }
        default: {
            const exhaustiveCheck: never = kind;
            console.warn("Unknown 3D model", exhaustiveCheck);
        }
    }
    return group;
}
