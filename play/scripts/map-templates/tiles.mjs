// Tile catalogue: how every tile of the shared "world3d-tiles" tileset is drawn, and which Tiled properties it holds.
//
// Furniture is always drawn "facing south" (rotation3d = 0: the front of the object is at the bottom of the tile, its
// back at the top). Rotated variants are produced by rotating the picture clockwise, which matches the rotation3d
// convention of the 3D view (90 = faces west, 180 = faces north, 270 = faces east).
//
// Multi-cell objects (a 3x2 meeting table, a 2-cell sofa...) are drawn with a "mask" telling which sides of the cell
// continue the same object, so the object is outlined only on its real edges.
import { Img, col, hashString, rng, shade, withAlpha } from "./png.mjs";

export const TILE = 32;
export const COLUMNS = 8;

const C = {
    lightWood: col("#dcb68a"),
    lightWoodEdge: col("#a47a4e"),
    wood: col("#b98552"),
    woodEdge: col("#7a5230"),
    darkWood: col("#8a5a36"),
    darkWoodEdge: col("#553519"),
    dark: col("#2f3542"),
    darkSoft: col("#454d5c"),
    metal: col("#9aa3ad"),
    white: col("#f1f2f6"),
    fabric: col("#4a69bd"),
    red: col("#c0392b"),
    leaf: col("#3fa34d"),
    leafDark: col("#2d7a3a"),
    leafLight: col("#6cc36a"),
    pot: col("#c0673c"),
    screen: col("#5aa9e6"),
    shadow: [0, 0, 0, 55],
};

/** Local mask: which sides of the cell continue the same object. */
const NO_MASK = { n: false, e: false, s: false, w: false };

/**
 * Draws a rectangular body filling the cell, inset on the sides that are real edges of the object.
 * Returns the drawn bounds.
 */
function body(img, m, inset, fill, edge, { shadow = true, edgeWidth = 1 } = {}) {
    const x0 = m.w ? 0 : inset.l;
    const x1 = m.e ? TILE : TILE - inset.r;
    const y0 = m.n ? 0 : inset.t;
    const y1 = m.s ? TILE : TILE - inset.b;
    if (shadow) {
        img.rect(x0 + 1, y0 + 2, x1 - x0, y1 - y0, C.shadow);
    }
    img.rect(x0, y0, x1 - x0, y1 - y0, fill);
    if (edge) {
        if (!m.n) img.rect(x0, y0, x1 - x0, edgeWidth, edge);
        if (!m.s) img.rect(x0, y1 - edgeWidth, x1 - x0, edgeWidth, edge);
        if (!m.w) img.rect(x0, y0, edgeWidth, y1 - y0, edge);
        if (!m.e) img.rect(x1 - edgeWidth, y0, edgeWidth, y1 - y0, edge);
    }
    return { x0, x1, y0, y1 };
}

// ---------------------------------------------------------------------------------------------------------------------
// Floors (opaque, seamless)

function woodFloor(base) {
    return (img, _m, r) => {
        const color = col(base);
        for (let row = 0; row < 4; row++) {
            const plank = shade(color, 0.92 + r() * 0.16);
            img.rect(0, row * 8, TILE, 8, plank);
            img.rect(0, row * 8, TILE, 1, shade(color, 0.72));
            const joint = (row * 13 + 5) % TILE;
            img.rect(joint, row * 8, 1, 8, shade(color, 0.75));
            for (let g = 0; g < 3; g++) {
                img.rect(Math.floor(r() * 28), row * 8 + 2 + Math.floor(r() * 5), 3 + Math.floor(r() * 6), 1, shade(plank, 0.9));
            }
        }
        img.noise(r, 5);
    };
}

function carpetFloor(base, pattern = true) {
    return (img, _m, r) => {
        const color = col(base);
        img.rect(0, 0, TILE, TILE, color);
        img.noise(r, 9);
        if (pattern) {
            for (let y = 3; y < TILE; y += 8) {
                for (let x = (y % 16 === 3 ? 3 : 7); x < TILE; x += 8) {
                    img.px(x, y, shade(color, 1.18));
                }
            }
        }
    };
}

function checkerFloor(a, b, grout) {
    return (img, _m, r) => {
        for (let j = 0; j < 2; j++) {
            for (let i = 0; i < 2; i++) {
                img.rect(i * 16, j * 16, 16, 16, col((i + j) % 2 === 0 ? a : b));
            }
        }
        img.noise(r, 4);
        for (let k = 0; k < 2; k++) {
            img.rect(k * 16, 0, 1, TILE, col(grout));
            img.rect(0, k * 16, TILE, 1, col(grout));
        }
    };
}

function marbleFloor(img, _m, r) {
    img.rect(0, 0, TILE, TILE, col("#e9e5de"));
    img.noise(r, 4);
    for (let v = 0; v < 2; v++) {
        let x = r() * TILE;
        for (let y = 0; y < TILE; y++) {
            x += (r() - 0.5) * 2.2;
            img.px((x + TILE) % TILE, y, col("#c9c3b8", 150));
        }
    }
    img.rect(0, 0, TILE, 1, col("#cfc8bc"));
    img.rect(0, 0, 1, TILE, col("#cfc8bc"));
}

function concreteFloor(img, _m, r) {
    img.rect(0, 0, TILE, TILE, col("#b7babe"));
    img.noise(r, 10);
    img.rect(0, 0, TILE, 1, col("#a2a5aa"));
    img.rect(0, 0, 1, TILE, col("#a2a5aa"));
}

function grassFloor(img, _m, r) {
    img.rect(0, 0, TILE, TILE, col("#6aa84f"));
    img.noise(r, 12);
    for (let i = 0; i < 26; i++) {
        const x = Math.floor(r() * TILE);
        const y = Math.floor(r() * TILE);
        const c = r() < 0.5 ? col("#4f8f3a") : col("#86c06a");
        img.px(x, y, c);
        img.px(x, y - 1, c);
    }
    if (r() < 0.6) {
        const x = 2 + Math.floor(r() * 28);
        const y = 2 + Math.floor(r() * 28);
        img.px(x, y, col(r() < 0.5 ? "#f6e58d" : "#ffffff"));
    }
}

function pathFloor(img, _m, r) {
    img.rect(0, 0, TILE, TILE, col("#a89f8c"));
    const stones = [
        [1, 1, 14, 9],
        [17, 1, 14, 9],
        [1, 12, 8, 8],
        [11, 12, 12, 8],
        [25, 12, 6, 8],
        [1, 22, 13, 9],
        [16, 22, 15, 9],
    ];
    for (const [x, y, w, h] of stones) {
        const stone = shade(col("#d3c8ae"), 0.9 + r() * 0.18);
        img.rect(x, y, w, h, stone);
        img.rect(x, y + h - 1, w, 1, shade(stone, 0.82));
    }
    img.noise(r, 5);
}

function thresholdFloor(img, _m, r) {
    img.rect(0, 0, TILE, TILE, col("#7d8591"));
    for (let y = 2; y < TILE; y += 4) {
        img.rect(2, y, 28, 2, col("#646b76"));
    }
    img.noise(r, 4);
    img.frame(0, 0, TILE, TILE, col("#555c66"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Walls (autotiled with the world mask)

function wallTile(material, windowGlass = false) {
    return (img, m, r) => {
        const cap = col(material.cap);
        const edge = col(material.edge);
        const face = col(material.face);
        img.rect(0, 0, TILE, TILE, cap);
        img.noise(r, 5);
        if (material.brick) {
            for (let y = 0; y < TILE; y += 6) {
                img.rect(0, y, TILE, 1, shade(cap, 0.85));
                const offset = (y / 6) % 2 === 0 ? 0 : 8;
                for (let x = offset; x < TILE; x += 16) {
                    img.rect(x, y, 1, 6, shade(cap, 0.85));
                }
            }
        }
        if (windowGlass) {
            const glass = col("#9fd3f0");
            if (m.e || m.w || (!m.n && !m.s)) {
                img.rect(0, 11, TILE, 10, col("#e8edf2"));
                img.rect(0, 13, TILE, 6, glass);
                img.rect(3, 14, 8, 1, col("#ffffff", 200));
                img.rect(15, 0 + 13, 1, 6, col("#e8edf2"));
            } else {
                img.rect(11, 0, 10, TILE, col("#e8edf2"));
                img.rect(13, 0, 6, TILE, glass);
                img.rect(14, 3, 1, 8, col("#ffffff", 200));
                img.rect(13, 15, 6, 1, col("#e8edf2"));
            }
        }
        if (!m.n) img.rect(0, 0, TILE, 2, edge);
        if (!m.w) img.rect(0, 0, 2, TILE, edge);
        if (!m.e) img.rect(TILE - 2, 0, 2, TILE, edge);
        if (!m.s) {
            // The visible face of the wall (top-down RPG style)
            img.rect(0, 22, TILE, 10, face);
            img.noise(r, 4, 0, 22, TILE, 10);
            img.rect(0, 22, TILE, 2, edge);
            img.rect(0, 30, TILE, 2, shade(face, 0.7));
            if (!m.w) img.rect(0, 22, 2, 10, edge);
            if (!m.e) img.rect(TILE - 2, 22, 2, 10, edge);
        }
    };
}

const INTERIOR_WALL = { cap: "#6b7382", edge: "#3d4350", face: "#d9d1c3" };
const EXTERIOR_WALL = { cap: "#8b4a3a", edge: "#4e2a22", face: "#c9a58a", brick: true };

function hedgeTile(img, m, r) {
    const x0 = m.w ? 0 : 2;
    const x1 = m.e ? TILE : TILE - 2;
    const y0 = m.n ? 0 : 2;
    const y1 = m.s ? TILE : TILE - 3;
    img.rect(x0 + 1, y0 + 3, x1 - x0, y1 - y0, C.shadow);
    img.rect(x0, y0, x1 - x0, y1 - y0, col("#2f7d32"));
    for (let i = 0; i < 18; i++) {
        const x = x0 + 3 + r() * (x1 - x0 - 6);
        const y = y0 + 3 + r() * (y1 - y0 - 6);
        img.circle(x, y, 3 + r() * 3, r() < 0.5 ? col("#3c9a40") : col("#276b2b"));
    }
    img.noise(r, 8);
}

// ---------------------------------------------------------------------------------------------------------------------
// Furniture (transparent background, drawn facing south)

function deskTile(withMonitor) {
    return (img, m, r) => {
        const b = body(img, m, { l: 2, r: 2, t: 4, b: 7 }, C.lightWood, C.lightWoodEdge);
        img.rect(b.x0, b.y1 - 2, b.x1 - b.x0, 1, shade(C.lightWood, 0.9));
        if (withMonitor) {
            img.rect(8, b.y0 + 2, 16, 4, C.dark);
            img.rect(9, b.y0 + 3, 14, 2, C.screen);
            img.rect(14, b.y0 + 6, 4, 2, C.dark);
            img.rect(10, 16, 11, 4, col("#dfe4ea"));
            img.frame(10, 16, 11, 4, col("#9aa3ad"));
            img.rect(23, 17, 2, 3, C.dark);
        } else {
            img.rect(7, 9, 9, 11, C.white);
            img.rect(8, 11, 6, 1, col("#b2bec3"));
            img.rect(8, 13, 5, 1, col("#b2bec3"));
            img.circle(23, 14, 2.5, col("#ffffff"));
            img.circle(23, 14, 1.5, col("#6d4c41"));
        }
        img.noise(r, 3);
    };
}

function tableTile(fill, edge) {
    return (img, m, r) => {
        const b = body(img, m, { l: 3, r: 3, t: 3, b: 4 }, fill, edge, { edgeWidth: 2 });
        for (let y = b.y0 + 5; y < b.y1 - 2; y += 7) {
            img.rect(b.x0, y, b.x1 - b.x0, 1, shade(fill, 0.9));
        }
        img.noise(r, 4);
    };
}

function roundTableTile(img, m, r) {
    // Centered on the cell, or on the corner shared with the other cells of a 2x2 table
    const cx = m.e && !m.w ? TILE : m.w && !m.e ? 0 : TILE / 2;
    const cy = m.s && !m.n ? TILE : m.n && !m.s ? 0 : TILE / 2;
    const big = m.e || m.w || m.n || m.s;
    const radius = big ? 29 : 13;
    img.circle(cx + 1, cy + 2, radius, C.shadow);
    img.circle(cx, cy, radius, C.lightWoodEdge);
    img.circle(cx, cy, radius - 2, C.lightWood);
    img.circle(cx - radius / 4, cy - radius / 4, radius / 3, shade(C.lightWood, 1.06));
    img.noise(r, 3);
}

function chairTile(office) {
    return (img, _m, r) => {
        img.circle(17, 18, 10, C.shadow);
        if (office) {
            img.rect(15, 24, 2, 6, C.darkSoft);
            img.rect(10, 27, 12, 2, C.darkSoft);
            img.rect(9, 12, 14, 13, col("#3d4452"));
            img.rect(10, 13, 12, 2, col("#566072"));
            img.rect(7, 13, 2, 9, C.dark);
            img.rect(23, 13, 2, 9, C.dark);
            img.rect(8, 6, 16, 6, C.dark);
            img.rect(9, 7, 14, 1, col("#5d6778"));
        } else {
            img.rect(10, 12, 12, 12, C.fabric);
            img.rect(11, 13, 10, 2, shade(C.fabric, 1.2));
            img.rect(9, 7, 14, 5, C.wood);
            img.rect(9, 7, 14, 1, shade(C.wood, 1.2));
            img.rect(9, 22, 2, 3, C.woodEdge);
            img.rect(21, 22, 2, 3, C.woodEdge);
        }
        img.noise(r, 3);
    };
}

function seatTile(fill, arms) {
    return (img, m, r) => {
        const b = body(img, m, { l: 2, r: 2, t: 3, b: 4 }, fill, shade(fill, 0.6));
        const back = shade(fill, 0.75);
        img.rect(b.x0, b.y0, b.x1 - b.x0, 8, back);
        img.rect(b.x0, b.y0, b.x1 - b.x0, 1, shade(fill, 0.55));
        if (arms) {
            if (!m.w) img.rect(b.x0, b.y0, 5, b.y1 - b.y0, back);
            if (!m.e) img.rect(b.x1 - 5, b.y0, 5, b.y1 - b.y0, back);
        }
        // Cushion
        const cx0 = b.x0 + (m.w ? 1 : 6);
        const cx1 = b.x1 - (m.e ? 1 : 6);
        img.rect(cx0, b.y0 + 10, cx1 - cx0, b.y1 - b.y0 - 12, shade(fill, 1.12));
        img.noise(r, 4);
    };
}

function poufTile(img, _m, r) {
    img.circle(17, 18, 9, C.shadow);
    img.circle(16, 16, 9, col("#e17055"));
    img.circle(16, 16, 5, col("#f08a6c"));
    img.noise(r, 4);
}

function benchTile(img, m, r) {
    const b = body(img, m, { l: 2, r: 2, t: 10, b: 10 }, C.wood, C.woodEdge);
    for (let y = b.y0 + 4; y < b.y1 - 1; y += 4) {
        img.rect(b.x0, y, b.x1 - b.x0, 1, C.woodEdge);
    }
    img.noise(r, 5);
}

function plantTile(large) {
    return (img, _m, r) => {
        const radius = large ? 14 : 10;
        img.circle(17, 18, radius, C.shadow);
        img.circle(16, 17, large ? 7 : 5, C.pot);
        const blobs = large ? 12 : 8;
        for (let i = 0; i < blobs; i++) {
            const angle = (i / blobs) * Math.PI * 2 + r();
            const distance = radius * (0.35 + r() * 0.35);
            const x = 16 + Math.cos(angle) * distance;
            const y = 16 + Math.sin(angle) * distance;
            img.circle(x, y, radius * 0.38, i % 2 === 0 ? C.leaf : C.leafDark);
        }
        img.circle(15, 14, radius * 0.35, C.leafLight);
    };
}

function treeTile(img, _m, r) {
    img.circle(18, 19, 15, [0, 0, 0, 70]);
    img.circle(16, 16, 15, col("#2d6e35"));
    for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2;
        img.circle(16 + Math.cos(angle) * 8, 16 + Math.sin(angle) * 8, 6, i % 2 ? col("#3f8f45") : col("#357d3c"));
    }
    img.circle(13, 12, 6, col("#56a85a"));
    img.circle(11, 10, 2.5, col("#7cc47d"));
    img.noise(r, 6);
}

function shelfTile(bookshelf) {
    return (img, m, r) => {
        const depth = bookshelf ? 14 : 11;
        const b = body(img, m, { l: 1, r: 1, t: 1, b: TILE - 1 - depth }, C.wood, C.woodEdge, { edgeWidth: 2 });
        const colors = ["#e74c3c", "#3498db", "#f1c40f", "#9b59b6", "#1abc9c", "#e67e22"];
        let x = b.x0 + (m.w ? 0 : 2);
        while (x < b.x1 - (m.e ? 0 : 3)) {
            const width = 2 + Math.floor(r() * 2);
            if (!bookshelf && r() < 0.3) {
                x += width + 2;
                continue;
            }
            const color = col(colors[Math.floor(r() * colors.length)]);
            img.rect(x, b.y0 + 2, width, depth - 4, color);
            img.rect(x, b.y0 + 2, width, 1, shade(color, 1.25));
            x += width + 1;
        }
        img.rect(b.x0, b.y1 - 2, b.x1 - b.x0, 2, C.woodEdge);
    };
}

function wallBoardTile(kind) {
    return (img, m) => {
        const x0 = m.w ? 0 : 2;
        const x1 = m.e ? TILE : TILE - 2;
        img.rect(x0 + 1, 4, x1 - x0, 6, C.shadow);
        if (kind === "whiteboard") {
            img.rect(x0, 1, x1 - x0, 7, col("#b2bec3"));
            img.rect(x0, 2, x1 - x0, 5, C.white);
            if (!m.w) img.rect(x0, 1, 1, 7, col("#7f8c8d"));
            if (!m.e) img.rect(x1 - 1, 1, 1, 7, col("#7f8c8d"));
            img.rect(x0, 8, x1 - x0, 2, C.metal);
            img.rect(8, 8, 3, 1, col("#3498db"));
            img.rect(13, 8, 3, 1, col("#e74c3c"));
            img.rect(10, 4, 10, 1, col("#74b9ff"));
        } else {
            img.rect(x0, 1, x1 - x0, 7, C.dark);
            img.rect(x0 + (m.w ? 0 : 1), 3, x1 - x0 - (m.w ? 0 : 1) - (m.e ? 0 : 1), 3, col("#4b7bec"));
            img.rect(x0, 8, x1 - x0, 1, [75, 123, 236, 90]);
            img.rect(x0, 9, x1 - x0, 2, [75, 123, 236, 45]);
        }
    };
}

function counterTile(img, m, r) {
    const b = body(img, m, { l: 1, r: 1, t: 2, b: 4 }, col("#eceff1"), col("#57606f"), { edgeWidth: 2 });
    img.rect(b.x0, b.y1 - 5, b.x1 - b.x0, 3, col("#cfd8dc"));
    img.noise(r, 3);
}

function sinkTile(img, m, r) {
    counterTile(img, m, r);
    img.rect(8, 8, 16, 12, col("#b2bec3"));
    img.rect(9, 9, 14, 10, col("#dfe6e9"));
    img.circle(16, 14, 1.5, col("#636e72"));
    img.rect(15, 4, 2, 5, C.metal);
}

function coffeeMachineTile(img) {
    img.rect(11, 9, 12, 14, C.shadow);
    img.rect(10, 7, 12, 14, col("#2d3436"));
    img.rect(11, 8, 10, 3, col("#636e72"));
    img.rect(13, 13, 6, 2, col("#e17055"));
    img.rect(14, 18, 4, 4, C.white);
}

function waterCoolerTile(img) {
    img.rect(10, 10, 14, 14, C.shadow);
    img.rect(9, 8, 14, 14, C.white);
    img.frame(9, 8, 14, 14, col("#b2bec3"));
    img.circle(16, 15, 5.5, col("#74b9ff"));
    img.circle(15, 14, 2, col("#dff0ff"));
}

function printerTile(img, m, r) {
    const b = body(img, m, { l: 4, r: 4, t: 7, b: 6 }, col("#dfe4ea"), col("#747d8c"));
    img.rect(b.x0, b.y1 - 5, b.x1 - b.x0, 4, col("#57606f"));
    img.rect(Math.max(b.x0, 10), b.y0 + 3, 12, 6, C.white);
    img.rect(b.x0 + 2, b.y0 + 2, 3, 2, col("#2ecc71"));
    img.noise(r, 3);
}

function lampTile(img) {
    img.circle(16, 16, 12, [255, 234, 167, 50]);
    img.circle(17, 18, 8, C.shadow);
    img.circle(16, 16, 8, col("#f6d365"));
    img.circle(16, 16, 5, col("#ffeaa7"));
    img.circle(16, 16, 1.5, C.dark);
}

function stageTile(img, m, r) {
    const fill = col("#6c5ce7");
    img.rect(0, 0, TILE, TILE, fill);
    for (let y = 0; y < TILE; y += 8) {
        img.rect(0, y, TILE, 1, shade(fill, 0.85));
    }
    img.noise(r, 5);
    const edge = shade(fill, 0.6);
    if (!m.n) img.rect(0, 0, TILE, 2, edge);
    if (!m.w) img.rect(0, 0, 2, TILE, edge);
    if (!m.e) img.rect(TILE - 2, 0, 2, TILE, edge);
    if (!m.s) {
        img.rect(0, TILE - 5, TILE, 5, edge);
        for (let x = 3; x < TILE; x += 8) {
            img.rect(x, TILE - 4, 3, 2, col("#ffeaa7"));
        }
    }
}

function podiumTile(img, _m, r) {
    img.rect(10, 11, 14, 14, C.shadow);
    img.rect(9, 9, 14, 13, C.wood);
    img.frame(9, 9, 14, 13, C.woodEdge);
    img.rect(10, 17, 12, 4, C.lightWood);
    img.rect(14, 12, 4, 2, C.dark);
    img.noise(r, 4);
}

function cabinetTile(img, m, r) {
    const b = body(img, m, { l: 1, r: 1, t: 3, b: 13 }, col("#a4b0be"), col("#57606f"));
    for (let x = b.x0 + 6; x < b.x1 - 3; x += 10) {
        img.rect(x, b.y1 - 4, 5, 1, C.dark);
    }
    img.noise(r, 3);
}

function binTile(img) {
    img.circle(17, 18, 6, C.shadow);
    img.circle(16, 16, 6, col("#636e72"));
    img.circle(16, 16, 4, col("#2d3436"));
}

function laptopTile(img) {
    img.rect(10, 11, 13, 11, C.shadow);
    img.rect(9, 9, 14, 3, C.darkSoft);
    img.rect(10, 10, 12, 1, C.screen);
    img.rect(9, 12, 14, 9, col("#c8d6e5"));
    img.rect(10, 13, 12, 5, col("#a4b0be"));
}

function mugTile(img) {
    img.circle(16, 16, 3.5, C.white);
    img.circle(16, 16, 2.2, col("#6d4c41"));
    img.rect(19, 15, 2, 2, C.white);
}

function booksTile(img) {
    img.rect(10, 11, 12, 10, C.shadow);
    img.rect(9, 9, 12, 10, col("#e74c3c"));
    img.rect(10, 11, 12, 9, col("#3498db"));
    img.rect(11, 13, 11, 8, col("#27ae60"));
}

function rugTile(fill, pattern) {
    return (img, m, r) => {
        const main = col(fill);
        const b = body(img, m, { l: 3, r: 3, t: 3, b: 3 }, main, shade(main, 0.7), { shadow: false, edgeWidth: 2 });
        const inner = col(pattern);
        if (!m.n) img.rect(b.x0, b.y0 + 4, b.x1 - b.x0, 1, inner);
        if (!m.s) img.rect(b.x0, b.y1 - 5, b.x1 - b.x0, 1, inner);
        if (!m.w) img.rect(b.x0 + 4, b.y0, 1, b.y1 - b.y0, inner);
        if (!m.e) img.rect(b.x1 - 5, b.y0, 1, b.y1 - b.y0, inner);
        for (let y = 2; y < TILE; y += 10) {
            for (let x = 2; x < TILE; x += 10) {
                if (x > b.x0 + 5 && x < b.x1 - 6 && y > b.y0 + 5 && y < b.y1 - 6) {
                    img.rect(x, y, 2, 2, inner);
                }
            }
        }
        img.noise(r, 5);
    };
}

function startTile(img) {
    img.ring(16, 16, 9, 2, [255, 255, 255, 80]);
    img.circle(16, 16, 2, [255, 255, 255, 80]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Catalogue
//
// family: which group of layers the tile goes to ("floor", "wall", "furniture", "seating", "tabletop", "rug", "start").
// model: the model3d property. collides: the collides property. autotile: the drawing depends on the neighbours.

export const KINDS = {
    // Floors
    wood: { family: "floor", draw: woodFloor("#c99a64") },
    wood_dark: { family: "floor", draw: woodFloor("#8f6040") },
    carpet_blue: { family: "floor", draw: carpetFloor("#5b7fb8") },
    carpet_grey: { family: "floor", draw: carpetFloor("#8d939c") },
    carpet_green: { family: "floor", draw: carpetFloor("#6a9a78") },
    carpet_red: { family: "floor", draw: carpetFloor("#a8545a") },
    carpet_teal: { family: "floor", draw: carpetFloor("#4f9a9a") },
    carpet_purple: { family: "floor", draw: carpetFloor("#6d5a9c") },
    carpet_wine: { family: "floor", draw: carpetFloor("#7a2e3b", false) },
    tiles_kitchen: { family: "floor", draw: checkerFloor("#f0ece4", "#d6cfc1", "#bfb7a8") },
    tiles_slate: { family: "floor", draw: checkerFloor("#9aa5b1", "#8a95a1", "#77828e") },
    marble: { family: "floor", draw: marbleFloor },
    concrete: { family: "floor", draw: concreteFloor },
    grass: { family: "floor", draw: grassFloor },
    path: { family: "floor", draw: pathFloor },
    threshold: { family: "floor", draw: thresholdFloor },

    // Walls
    wall: { family: "wall", collides: true, autotile: "wall", draw: wallTile(INTERIOR_WALL) },
    wall_ext: { family: "wall", collides: true, autotile: "wall", draw: wallTile(EXTERIOR_WALL) },
    window: { family: "wall", collides: true, autotile: "wall", draw: wallTile(EXTERIOR_WALL, true) },
    hedge: { family: "wall", collides: true, autotile: "hedge", height3d: 0.9, draw: hedgeTile },

    // Furniture
    desk_monitor: { family: "furniture", model: "desk_monitor", collides: true, autotile: "self", draw: deskTile(true) },
    desk: { family: "furniture", model: "desk", collides: true, autotile: "self", draw: deskTile(false) },
    meeting_table: {
        family: "furniture",
        model: "meeting_table",
        collides: true,
        autotile: "self",
        draw: tableTile(C.darkWood, C.darkWoodEdge),
    },
    round_table: { family: "furniture", model: "round_table", collides: true, autotile: "self", draw: roundTableTile },
    office_chair: { family: "seating", model: "office_chair", draw: chairTile(true) },
    chair: { family: "seating", model: "chair", draw: chairTile(false) },
    armchair: { family: "seating", model: "armchair", draw: seatTile(C.red, true) },
    pouf: { family: "seating", model: "pouf", draw: poufTile },
    bench: { family: "seating", model: "bench", autotile: "self", draw: benchTile },
    sofa: { family: "furniture", model: "sofa", collides: true, autotile: "self", draw: seatTile(C.fabric, true) },
    plant: { family: "furniture", model: "plant", collides: true, draw: plantTile(false) },
    large_plant: { family: "furniture", model: "large_plant", collides: true, draw: plantTile(true) },
    tree: { family: "furniture", model: "tree", collides: true, draw: treeTile },
    bookshelf: { family: "furniture", model: "bookshelf", collides: true, autotile: "self", draw: shelfTile(true) },
    shelf: { family: "furniture", model: "shelf", collides: true, autotile: "self", draw: shelfTile(false) },
    whiteboard: {
        family: "furniture",
        model: "whiteboard",
        collides: true,
        autotile: "self",
        draw: wallBoardTile("whiteboard"),
    },
    screen: { family: "furniture", model: "screen", collides: true, autotile: "self", draw: wallBoardTile("screen") },
    counter: { family: "furniture", model: "counter", collides: true, autotile: "self", draw: counterTile },
    sink: { family: "furniture", model: "sink", collides: true, draw: sinkTile },
    water_cooler: { family: "furniture", model: "water_cooler", collides: true, draw: waterCoolerTile },
    printer: { family: "furniture", model: "printer", collides: true, autotile: "self", draw: printerTile },
    lamp: { family: "furniture", model: "lamp", collides: true, draw: lampTile },
    stage: { family: "furniture", model: "stage", autotile: "self", draw: stageTile },
    podium: { family: "furniture", model: "podium", collides: true, draw: podiumTile },
    cabinet: { family: "furniture", model: "cabinet", collides: true, autotile: "self", draw: cabinetTile },
    bin: { family: "furniture", model: "bin", collides: true, draw: binTile },

    // Small objects put on tables (lifted to the table height in 3D)
    coffee_machine: { family: "tabletop", model: "coffee_machine", draw: coffeeMachineTile },
    laptop: { family: "tabletop", model: "laptop", draw: laptopTile },
    mug: { family: "tabletop", model: "mug", draw: mugTile },
    books: { family: "tabletop", model: "books", draw: booksTile },

    // Rugs: drawn on the floor, no 3D model
    rug_red: { family: "rug", autotile: "self", draw: rugTile("#b33939", "#f7d794") },
    rug_blue: { family: "rug", autotile: "self", draw: rugTile("#34568b", "#c7ecee") },
    rug_green: { family: "rug", autotile: "self", draw: rugTile("#3b7a57", "#f3e5ab") },
    rug_sand: { family: "rug", autotile: "self", draw: rugTile("#c8a97e", "#7a5c3a") },

    start: { family: "start", draw: startTile },
};

const SIDES = ["n", "e", "s", "w"];

/** Converts a world mask (4 bits, N=1 E=2 S=4 W=8) into the local mask of an object rotated by `rotation` degrees. */
function localMask(worldBits, rotation) {
    const quarter = Math.round(rotation / 90) % 4;
    const mask = { ...NO_MASK };
    for (let local = 0; local < 4; local++) {
        const world = (local + quarter) % 4;
        mask[SIDES[local]] = (worldBits & (1 << world)) !== 0;
    }
    return mask;
}

/**
 * Registers the tile variants used by the maps. Variants are created on demand; the order of creation is
 * deterministic, so the tileset is stable between runs.
 */
export class TileRegistry {
    constructor() {
        this.variants = [];
        this.byKey = new Map();
    }

    /** Returns the GID (firstgid = 1) of a variant. */
    gid(kind, rotation = 0, maskBits = 0) {
        const def = KINDS[kind];
        if (!def) {
            throw new Error(`Unknown tile kind "${kind}"`);
        }
        if (!def.model && rotation !== 0) {
            throw new Error(`Tile kind "${kind}" has no 3D model and cannot be rotated`);
        }
        const bits = def.autotile ? maskBits : 0;
        const key = `${kind}|${rotation}|${bits}`;
        let index = this.byKey.get(key);
        if (index === undefined) {
            index = this.variants.length;
            this.variants.push({ kind, rotation, bits });
            this.byKey.set(key, index);
        }
        return index + 1;
    }

    variant(gid) {
        return this.variants[gid - 1];
    }

    drawTile(index) {
        const { kind, rotation, bits } = this.variants[index];
        const def = KINDS[kind];
        const img = new Img(TILE, TILE);
        def.draw(img, localMask(bits, rotation), rng(hashString(`${kind}|${bits}`)));
        return rotation === 0 ? img : img.rotated(rotation / 90);
    }

    /** Draws the whole tileset image. */
    drawTileset() {
        const rows = Math.max(1, Math.ceil(this.variants.length / COLUMNS));
        const img = new Img(COLUMNS * TILE, rows * TILE);
        this.tileImages = [];
        for (let i = 0; i < this.variants.length; i++) {
            const tile = this.drawTile(i);
            this.tileImages.push(tile);
            img.blit(tile, (i % COLUMNS) * TILE, Math.floor(i / COLUMNS) * TILE);
        }
        return img;
    }

    /** The "tiles" array of the Tiled tileset: the properties of every tile. */
    tiledTiles() {
        const tiles = [];
        this.variants.forEach(({ kind, rotation }, id) => {
            const def = KINDS[kind];
            const properties = [];
            if (def.collides) {
                properties.push({ name: "collides", type: "bool", value: true });
            }
            if (def.height3d !== undefined) {
                properties.push({ name: "height3d", type: "float", value: def.height3d });
            }
            if (def.model) {
                properties.push({ name: "model3d", type: "string", value: def.model });
                properties.push({ name: "rotation3d", type: "int", value: rotation });
            }
            if (properties.length > 0) {
                tiles.push({ id, properties });
            }
        });
        return tiles;
    }

    tilesetJson(imagePath, imageWidth, imageHeight) {
        return {
            columns: COLUMNS,
            firstgid: 1,
            image: imagePath,
            imageheight: imageHeight,
            imagewidth: imageWidth,
            margin: 0,
            name: "world3d-tiles",
            spacing: 0,
            tilecount: Math.max(1, Math.ceil(this.variants.length / COLUMNS)) * COLUMNS,
            tileheight: TILE,
            tiles: this.tiledTiles(),
            tilewidth: TILE,
        };
    }
}
