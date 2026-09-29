# Map templates (3D-ready worlds)

Ready-made Tiled maps, designed for both the 2D (Phaser) view and the 3D view (`src/front/World3d`).
They are **generated**: do not edit them by hand, edit `play/scripts/map-templates/` and run

```bash
cd play
npm run generate-map-templates
```

The generator only uses Node built-ins (it has its own PNG encoder) and its output is deterministic.
It validates each map (every spawn cell, area center and seat must be reachable) and fails if a check does not pass.
`tests/front/World3d/MapTemplates.test.ts` checks the generated files again.

| id           | Name              | Size (tiles) | Places                                                                                                    |
| ------------ | ----------------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| `office`     | Open Office       | 48 x 34      | Reception, Team Desks, Engineering Pod, 2 Meeting Rooms, Huddle Room, Library (silent), Cafeteria, Lounge |
| `conference` | Conference Center | 56 x 40      | Reception, Lobby, Auditorium + Main Stage (megaphone), 3 Breakout Rooms, Networking Lounge, Coffee Corner |
| `campus`     | Startup Campus    | 64 x 46      | Garden, Reception, Engineering/Design/Sales Pods, 2 Private Offices, Boardroom, Game Room, Kitchen, Library |

Each folder holds `map.tmj` and `preview.png` (8 px per tile). All maps share one tileset: `tileset/world3d-tiles.png`.

## Layers

`floor`, `rugs`, `walls`, `furniture`, `furniture2`, `chairs`, `chairs2`, `tabletop`, `start` (tile layers), then the
`floorLayer` object layer (empty: nothing is drawn above the players) and the `areas` object layer.

The furniture is spread over several layers because, in 3D, adjacent cells holding the same model **on the same
layer** merge into a single model (two adjacent `desk` tiles make one 2x1 desk). Neighbouring objects that must stay
apart, like chairs in a row, are put on alternating layers.

## 3D tile properties (set on the tiles of the tileset)

| Property     | Type   | Meaning                                                                                                      |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------ |
| `collides`   | bool   | The tile blocks movement (WorkAdventure). Tables, desks, sofas, shelves, plants, counters, walls collide. Chairs, benches, poufs and the stage don't, so people can sit or walk on them. |
| `model3d`    | string | In 3D, a procedural model (one of `MODEL_KINDS` in `src/front/World3d/Map/MapAnalysis.ts`) replaces the tile. |
| `rotation3d` | int    | The direction the model faces: `0` south (down), `90` west, `180` north, `270` east. A `desk_monitor` with `0` has its monitor at the north and is used from the south, so its chair is south of it with `180`. |
| `height3d`   | float  | Optional explicit extrusion height, in tiles (the garden hedges use `0.9`). Colliding tiles of a layer whose name contains "wall" become walls that are 1.6 tiles tall. |

## Areas and places

Objects of the `areas` layer with the `area` class become entries of the Places menu (see
`src/front/World3d/Places/Places.ts`). The kind comes from the properties first, then from the name:

- `speakerMegaphone` makes a stage (the Main Stage, paired with a `listenerMegaphone` on the Auditorium),
- `silent: true` makes a focus zone (the libraries),
- names containing Meeting / Huddle / Boardroom / Breakout are meeting rooms. They also have `focusable: true` and
  `zoomMargin: 0.2`, so the camera zooms on the room,
- Cafeteria / Lounge / Garden / Game / Kitchen / Coffee / Lobby are social places, Desks / Pod / Office are desk
  places, Reception is the entrance,
- `place: true` lists an area whose name matches nothing (the Auditorium), `place: false` hides one.

Players spawn on the tiles of the `start` layer, in the reception.

## Using a template

- Open it directly from the play server: `/_/global/<play host>/map-templates/<id>/map.tmj`
  (for instance `http://play.workadventure.localhost/_/global/play.workadventure.localhost/map-templates/office/map.tmj`).
- Or upload it to map-storage. The map references its tileset as `../tileset/world3d-tiles.png`, so keep
  that folder structure: upload `<id>/map.tmj` together with `tileset/world3d-tiles.png`.

The maps can be opened and edited in Tiled (1.9+). The content is licensed CC-BY-SA 4.0, WorkAdventure contributors.
