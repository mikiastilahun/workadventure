// A small helper to lay out a Tiled map (rooms, walls, doors, furniture, named areas) on a grid of 32px tiles.
import { KINDS, TILE } from "./tiles.mjs";

const FAMILY_LAYERS = {
    rug: ["rugs", "rugs2"],
    furniture: ["furniture", "furniture2", "furniture3", "furniture4"],
    seating: ["chairs", "chairs2", "chairs3"],
    tabletop: ["tabletop", "tabletop2"],
};
const LAYER_ORDER = ["floor", ...FAMILY_LAYERS.rug, "walls", ...FAMILY_LAYERS.furniture, ...FAMILY_LAYERS.seating, ...FAMILY_LAYERS.tabletop, "start"];
const TABLE_KINDS = new Set(["desk", "desk_monitor", "meeting_table", "round_table", "counter", "cabinet"]);
/** Objects other furniture may stand on. */
const BASE_KINDS = new Set(["stage"]);
const DIRS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
];

export class MapBuilder {
    constructor(id, width, height, floorKind) {
        this.id = id;
        this.width = width;
        this.height = height;
        this.floor = new Array(width * height).fill(floorKind);
        this.walls = new Array(width * height).fill(null);
        /** layer name -> cells holding { object } */
        this.layers = new Map();
        this.objects = [];
        this.areas = [];
        this.spawns = [];
        /** Cells occupied by furniture / seating (to detect overlaps). */
        this.occupied = new Map();
    }

    index(x, y) {
        return y * this.width + x;
    }

    inside(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    assertInside(x, y, what) {
        if (!this.inside(x, y)) {
            throw new Error(`[${this.id}] ${what} out of the map at ${x},${y}`);
        }
    }

    /** Fills a rectangle of the floor. */
    fill(x, y, w, h, kind) {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                this.assertInside(i, j, `floor ${kind}`);
                this.floor[this.index(i, j)] = kind;
            }
        }
    }

    /** Draws the outline of a rectangle of walls (outer bounds). */
    wallRect(x, y, w, h, kind = "wall", keep = false) {
        for (let i = x; i < x + w; i++) {
            this.setWall(i, y, kind, keep);
            this.setWall(i, y + h - 1, kind, keep);
        }
        for (let j = y; j < y + h; j++) {
            this.setWall(x, j, kind, keep);
            this.setWall(x + w - 1, j, kind, keep);
        }
    }

    wallLine(x, y, w, h, kind = "wall") {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                this.setWall(i, j, kind);
            }
        }
    }

    /** With `keep`, an existing wall keeps its material (rooms built against the facade keep the facade). */
    setWall(x, y, kind, keep = false) {
        this.assertInside(x, y, `wall ${kind}`);
        if (keep && this.walls[this.index(x, y)]) {
            return;
        }
        this.walls[this.index(x, y)] = kind;
    }

    /** A room: floor on the interior, walls on the outline. (x, y, w, h) are the outer bounds. */
    room(x, y, w, h, floorKind, wallKind = "wall") {
        this.fill(x + 1, y + 1, w - 2, h - 2, floorKind);
        this.wallRect(x, y, w, h, wallKind, true);
        return { ix: x + 1, iy: y + 1, iw: w - 2, ih: h - 2 };
    }

    /** Opens a door in a wall (a rectangle of wall cells becomes walkable). */
    door(x, y, w = 1, h = 1, floorKind = "threshold") {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                this.assertInside(i, j, "door");
                if (!this.walls[this.index(i, j)]) {
                    throw new Error(`[${this.id}] door at ${i},${j} is not in a wall`);
                }
                this.walls[this.index(i, j)] = null;
                this.floor[this.index(i, j)] = floorKind;
            }
        }
    }

    /** Replaces exterior wall cells by windows, along a line, with a pattern of `on` windows and `off` walls. */
    windows(x, y, w, h, on = 3, off = 2) {
        let k = 0;
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (this.walls[this.index(i, j)] === "wall_ext" && k % (on + off) < on) {
                    this.walls[this.index(i, j)] = "window";
                }
                k++;
            }
        }
    }

    /**
     * Places an object. Its layer is chosen so it is never merged with a neighbouring object of the same kind in 3D.
     */
    put(kind, x, y, { w = 1, h = 1, rot = 0 } = {}) {
        const def = KINDS[kind];
        if (!def || !FAMILY_LAYERS[def.family]) {
            throw new Error(`[${this.id}] "${kind}" is not an object`);
        }
        const cells = [];
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                this.assertInside(i, j, kind);
                if (this.walls[this.index(i, j)]) {
                    throw new Error(`[${this.id}] ${kind} at ${i},${j} is on a wall`);
                }
                cells.push([i, j]);
            }
        }
        const object = { id: this.objects.length, kind, rot, x, y, w, h, cells };
        const cellSet = new Set(cells.map(([i, j]) => `${i},${j}`));

        if (def.family === "furniture" || def.family === "seating") {
            for (const [i, j] of cells) {
                const other = this.occupied.get(`${i},${j}`);
                if (other && !BASE_KINDS.has(other.kind) && !BASE_KINDS.has(kind)) {
                    throw new Error(`[${this.id}] ${kind} at ${i},${j} overlaps ${other.kind}`);
                }
            }
        }
        if (def.family === "tabletop") {
            for (const [i, j] of cells) {
                const under = this.occupied.get(`${i},${j}`);
                if (!under || !TABLE_KINDS.has(under.kind)) {
                    throw new Error(`[${this.id}] ${kind} at ${i},${j} is not on a table`);
                }
            }
        }

        const layerName = FAMILY_LAYERS[def.family].find((name) => {
            const layer = this.layers.get(name);
            if (!layer) {
                return true;
            }
            for (const [i, j] of cells) {
                if (layer[this.index(i, j)]) {
                    return false;
                }
                for (const [dx, dy] of DIRS) {
                    const nx = i + dx;
                    const ny = j + dy;
                    if (!this.inside(nx, ny) || cellSet.has(`${nx},${ny}`)) {
                        continue;
                    }
                    const neighbour = layer[this.index(nx, ny)];
                    if (neighbour && KINDS[neighbour.kind].model === def.model && neighbour.kind === kind) {
                        return false;
                    }
                    if (neighbour && def.model && KINDS[neighbour.kind].model === def.model) {
                        return false;
                    }
                }
            }
            return true;
        });
        if (!layerName) {
            throw new Error(`[${this.id}] no free layer for ${kind} at ${x},${y}`);
        }
        if (!this.layers.has(layerName)) {
            this.layers.set(layerName, new Array(this.width * this.height).fill(null));
        }
        const layer = this.layers.get(layerName);
        for (const [i, j] of cells) {
            layer[this.index(i, j)] = object;
            if (def.family === "furniture" || def.family === "seating") {
                const other = this.occupied.get(`${i},${j}`);
                if (!other || BASE_KINDS.has(other.kind)) {
                    this.occupied.set(`${i},${j}`, object);
                }
            }
        }
        object.layer = layerName;
        this.objects.push(object);
        return object;
    }

    /** A named Tiled area (in tiles). */
    area(name, x, y, w, h, properties = {}) {
        this.areas.push({ name, x, y, w, h, properties });
    }

    spawn(x, y, w = 1, h = 1) {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                this.spawns.push([i, j]);
            }
        }
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Reusable arrangements

    /**
     * A cluster of desks facing each other: chairs / desks (monitor to the south) / desks (monitor to the north) /
     * chairs. `n` desks per row, footprint n x 4.
     */
    deskCluster(x, y, n) {
        for (let i = 0; i < n; i++) {
            this.put("office_chair", x + i, y, { rot: 0 });
            this.put("desk_monitor", x + i, y + 1, { rot: 180 });
            this.put("desk_monitor", x + i, y + 2, { rot: 0 });
            this.put("office_chair", x + i, y + 3, { rot: 180 });
        }
    }

    /** A round table with chairs around it (dirs: subset of "nesw"). */
    roundTable(x, y, dirs = "nesw", seat = "chair", size = 1) {
        this.put("round_table", x, y, { w: size, h: size });
        if (dirs.includes("n")) this.put(seat, x, y - 1, { rot: 0 });
        if (dirs.includes("s")) this.put(seat, x + size - 1, y + size, { rot: 180 });
        if (dirs.includes("w")) this.put(seat, x - 1, y + size - 1, { rot: 270 });
        if (dirs.includes("e")) this.put(seat, x + size, y, { rot: 90 });
    }

    /**
     * A meeting table surrounded by chairs, laid out so the center cell of the room interior is walkable (a chair).
     * Table rows are c-2..c-1 where c is the central row of the interior.
     */
    meetingRoom({ ix, iy, iw, ih }, { screenSide = "w", whiteboard = true, laptops = true } = {}) {
        const c = iy + Math.floor(ih / 2);
        const tx = ix + 2;
        const tw = iw - 4;
        const ty = c - 2;
        this.put("meeting_table", tx, ty, { w: tw, h: 2 });
        for (let i = 0; i < tw; i++) {
            this.put("chair", tx + i, ty - 1, { rot: 0 });
            this.put("chair", tx + i, ty + 2, { rot: 180 });
        }
        this.put("chair", tx - 1, ty, { rot: 270 });
        this.put("chair", tx - 1, ty + 1, { rot: 270 });
        this.put("chair", tx + tw, ty, { rot: 90 });
        this.put("chair", tx + tw, ty + 1, { rot: 90 });
        if (screenSide === "w") {
            this.put("screen", ix, ty, { h: 2, rot: 270 });
        } else {
            this.put("screen", ix + iw - 1, ty, { h: 2, rot: 90 });
        }
        if (laptops) {
            this.put("laptop", tx + 1, ty, { rot: 180 });
            this.put("laptop", tx + tw - 2, ty + 1);
            this.put("mug", tx + Math.floor(tw / 2), ty);
        }
        if (whiteboard) {
            const wx = screenSide === "w" ? ix + iw - 4 : ix + 1;
            this.put("whiteboard", wx, iy + ih - 1, { w: 3, rot: 180 });
        }
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Output

    collides(x, y) {
        const wall = this.walls[this.index(x, y)];
        if (wall && KINDS[wall].collides) {
            return true;
        }
        for (const layer of this.layers.values()) {
            const object = layer[this.index(x, y)];
            if (object && KINDS[object.kind].collides) {
                return true;
            }
        }
        return false;
    }

    /** Checks that every spawn cell, area and seat is reachable from the first spawn cell. Throws otherwise. */
    validate() {
        if (this.spawns.length === 0) {
            throw new Error(`[${this.id}] no spawn cell`);
        }
        const reached = new Uint8Array(this.width * this.height);
        const [sx, sy] = this.spawns[0];
        const queue = [[sx, sy]];
        reached[this.index(sx, sy)] = 1;
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            for (const [dx, dy] of DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                if (this.inside(nx, ny) && !reached[this.index(nx, ny)] && !this.collides(nx, ny)) {
                    reached[this.index(nx, ny)] = 1;
                    queue.push([nx, ny]);
                }
            }
        }
        const problems = [];
        for (const [x, y] of this.spawns) {
            if (this.collides(x, y) || !reached[this.index(x, y)]) {
                problems.push(`spawn ${x},${y} is not walkable/reachable`);
            }
        }
        for (const area of this.areas) {
            const cx = Math.floor(area.x + area.w / 2);
            const cy = Math.floor(area.y + area.h / 2);
            if (!reached[this.index(cx, cy)]) {
                problems.push(`center ${cx},${cy} of area "${area.name}" is not reachable`);
            }
        }
        for (const object of this.objects) {
            if (KINDS[object.kind].family === "seating" && !object.cells.some(([x, y]) => reached[this.index(x, y)])) {
                problems.push(`${object.kind} at ${object.x},${object.y} is not reachable`);
            }
        }
        if (problems.length > 0) {
            throw new Error(`[${this.id}] invalid map:\n  ${problems.join("\n  ")}`);
        }
        let pockets = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (!this.collides(x, y) && !reached[this.index(x, y)]) {
                    pockets++;
                }
            }
        }
        return { unreachableFreeCells: pockets };
    }

    /** Builds the GID arrays of every tile layer, in drawing order. */
    tileLayers(registry) {
        const result = [];
        const floorData = this.floor.map((kind) => registry.gid(kind));
        result.push({ name: "floor", data: floorData });
        const wallGroup = (kind) => (kind ? KINDS[kind].autotile : null);
        const wallData = this.walls.map((kind, i) => {
            if (!kind) {
                return 0;
            }
            const x = i % this.width;
            const y = Math.floor(i / this.width);
            let bits = 0;
            DIRS.forEach(([dx, dy], d) => {
                const nx = x + dx;
                const ny = y + dy;
                // Outside the map counts as a wall: the border of the map has no visible edge
                const same = !this.inside(nx, ny) || wallGroup(this.walls[this.index(nx, ny)]) === wallGroup(kind);
                if (same) {
                    bits |= 1 << d;
                }
            });
            return registry.gid(kind, 0, bits);
        });
        const objectLayer = (name) => {
            const cells = this.layers.get(name);
            return cells.map((object, i) => {
                if (!object) {
                    return 0;
                }
                const x = i % this.width;
                const y = Math.floor(i / this.width);
                let bits = 0;
                DIRS.forEach(([dx, dy], d) => {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (this.inside(nx, ny) && cells[this.index(nx, ny)] === object) {
                        bits |= 1 << d;
                    }
                });
                return registry.gid(object.kind, object.rot, bits);
            });
        };
        for (const name of LAYER_ORDER) {
            if (name === "floor") {
                continue;
            }
            if (name === "walls") {
                result.push({ name, data: wallData });
            } else if (name === "start") {
                const data = new Array(this.width * this.height).fill(0);
                const gid = registry.gid("start");
                for (const [x, y] of this.spawns) {
                    data[this.index(x, y)] = gid;
                }
                result.push({ name, data });
            } else if (this.layers.has(name)) {
                result.push({ name, data: objectLayer(name) });
            }
        }
        return result;
    }

    toTiled(registry, tileset, properties) {
        const layers = [];
        let id = 1;
        for (const layer of this.tileLayers(registry)) {
            layers.push({
                data: layer.data,
                height: this.height,
                id: id++,
                name: layer.name,
                opacity: 1,
                type: "tilelayer",
                visible: true,
                width: this.width,
                x: 0,
                y: 0,
            });
        }
        layers.push({
            draworder: "topdown",
            id: id++,
            name: "floorLayer",
            objects: [],
            opacity: 1,
            type: "objectgroup",
            visible: true,
            x: 0,
            y: 0,
        });
        let objectId = 1;
        const toProperty = ([name, value]) => {
            if (typeof value === "boolean") {
                return { name, type: "bool", value };
            }
            if (typeof value === "number") {
                return Number.isInteger(value) ? { name, type: "int", value } : { name, type: "float", value };
            }
            return { name, type: "string", value: String(value) };
        };
        layers.push({
            draworder: "topdown",
            id: id++,
            name: "areas",
            objects: this.areas.map((area) => ({
                class: "area",
                height: area.h * TILE,
                id: objectId++,
                name: area.name,
                properties: Object.entries(area.properties).map(toProperty),
                rotation: 0,
                type: "area",
                visible: true,
                width: area.w * TILE,
                x: area.x * TILE,
                y: area.y * TILE,
            })),
            opacity: 1,
            type: "objectgroup",
            visible: true,
            x: 0,
            y: 0,
        });
        return {
            compressionlevel: -1,
            height: this.height,
            infinite: false,
            layers,
            nextlayerid: id,
            nextobjectid: objectId,
            orientation: "orthogonal",
            properties: Object.entries(properties).map(toProperty),
            renderorder: "right-down",
            tiledversion: "1.10.2",
            tileheight: TILE,
            tilesets: [tileset],
            tilewidth: TILE,
            type: "map",
            version: "1.10",
            width: this.width,
        };
    }
}
