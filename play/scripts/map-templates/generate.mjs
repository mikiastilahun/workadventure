#!/usr/bin/env node
// Generates the map templates ("worlds") of play/public/map-templates: a shared procedural tileset, and for each
// template a Tiled map (map.tmj) and a preview image (preview.png).
//
// Usage: node scripts/map-templates/generate.mjs [--debug-dir=<dir>]
//   --debug-dir also writes a full-size (32 px per tile) render of every map, handy to review a layout.
//
// Only Node built-ins are used, and the output is deterministic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Img } from "./png.mjs";
import { TEMPLATES } from "./templates.mjs";
import { TILE, TileRegistry } from "./tiles.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, "../../public/map-templates");
const tilesetFile = path.join(outputDir, "tileset", "world3d-tiles.png");
const PREVIEW_TILE = 8;

const debugArg = process.argv.find((arg) => arg.startsWith("--debug-dir="));
const debugDir = debugArg ? path.resolve(debugArg.slice("--debug-dir=".length)) : undefined;

const registry = new TileRegistry();

// Pre-register the plain variants of every floor so the first rows of the tileset are stable and readable.
for (const kind of [
    "wood",
    "wood_dark",
    "carpet_blue",
    "carpet_grey",
    "carpet_green",
    "carpet_red",
    "carpet_teal",
    "carpet_purple",
    "carpet_wine",
    "tiles_kitchen",
    "tiles_slate",
    "marble",
    "concrete",
    "grass",
    "path",
    "threshold",
    "start",
]) {
    registry.gid(kind);
}

// 1. Lay out every map (this registers the tile variants they use)
const built = TEMPLATES.map(({ id, build }) => {
    const { builder, properties } = build();
    const stats = builder.validate();
    const layers = builder.tileLayers(registry);
    return { id, builder, properties, layers, stats };
});

// 2. Draw the tileset
const tileset = registry.drawTileset();
fs.mkdirSync(path.dirname(tilesetFile), { recursive: true });
fs.writeFileSync(tilesetFile, tileset.toPng());
const tilesetJson = registry.tilesetJson("../tileset/world3d-tiles.png", tileset.w, tileset.h);

// 3. Write the maps and their previews
function render(builder, layers) {
    const img = new Img(builder.width * TILE, builder.height * TILE);
    for (const layer of layers) {
        if (layer.name === "start") {
            continue;
        }
        layer.data.forEach((gid, i) => {
            if (gid === 0) {
                return;
            }
            const x = (i % builder.width) * TILE;
            const y = Math.floor(i / builder.width) * TILE;
            img.blit(registry.tileImages[gid - 1], x, y);
        });
    }
    return img;
}

for (const { id, builder, properties, layers, stats } of built) {
    const dir = path.join(outputDir, id);
    fs.mkdirSync(dir, { recursive: true });
    const map = builder.toTiled(registry, tilesetJson, properties);
    fs.writeFileSync(path.join(dir, "map.tmj"), JSON.stringify(map) + "\n");
    const full = render(builder, layers);
    fs.writeFileSync(path.join(dir, "preview.png"), full.downscale(TILE / PREVIEW_TILE).toPng());
    if (debugDir) {
        fs.mkdirSync(debugDir, { recursive: true });
        fs.writeFileSync(path.join(debugDir, `${id}-full.png`), full.toPng());
    }
    console.log(
        `${id}: ${builder.width}x${builder.height} tiles, ${builder.objects.length} objects, ${builder.areas.length} areas, ` +
            `${builder.spawns.length} spawn cells, layers: ${layers.map((l) => l.name).join(", ")}` +
            (stats.unreachableFreeCells > 0 ? ` (${stats.unreachableFreeCells} enclosed free cells)` : ""),
    );
}
console.log(`tileset: ${registry.variants.length} tiles, ${tileset.w}x${tileset.h} px`);
