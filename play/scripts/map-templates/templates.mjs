// The layouts of the map templates. Coordinates are in tiles. room() takes the OUTER bounds of a room (walls
// included) and returns its interior { ix, iy, iw, ih }.
import { MapBuilder } from "./builder.mjs";

const COPYRIGHT = "CC-BY-SA 4.0 WorkAdventure contributors";
const MEETING = { focusable: true, zoomMargin: 0.2 };

// ---------------------------------------------------------------------------------------------------------------------
// 1. Open Office (48 x 34)

function office() {
    const m = new MapBuilder("office", 48, 34, "wood");
    m.wallRect(0, 0, 48, 34, "wall_ext");

    // --- Top row: 2 meeting rooms, a huddle room and the library
    const atlas = m.room(0, 0, 12, 10, "carpet_blue");
    m.door(4, 9, 2, 1);
    m.meetingRoom(atlas, { screenSide: "w" });
    m.put("plant", 10, 1);
    m.put("plant", 1, 8);
    m.area("Meeting Room Atlas", atlas.ix, atlas.iy, atlas.iw, atlas.ih, MEETING);

    const borealis = m.room(11, 0, 12, 10, "carpet_grey");
    m.door(18, 9, 2, 1);
    m.meetingRoom(borealis, { screenSide: "e" });
    m.put("plant", 12, 1);
    m.put("large_plant", 21, 8);
    m.area("Meeting Room Borealis", borealis.ix, borealis.iy, borealis.iw, borealis.ih, MEETING);

    const huddle = m.room(22, 0, 8, 10, "carpet_green");
    m.door(25, 9, 2, 1);
    m.put("screen", 25, 1, { w: 2 });
    m.put("round_table", 25, 3, { w: 2, h: 2 });
    m.put("chair", 25, 2, { rot: 0 });
    m.put("chair", 27, 4, { rot: 90 });
    m.put("chair", 26, 5, { rot: 180 });
    m.put("chair", 24, 3, { rot: 270 });
    m.put("laptop", 26, 3);
    m.put("plant", 23, 1);
    m.put("plant", 28, 1);
    m.put("whiteboard", 23, 8, { w: 2, rot: 180 });
    m.area("Huddle Room", huddle.ix, huddle.iy, huddle.iw, huddle.ih, MEETING);

    const library = m.room(29, 0, 19, 10, "wood_dark");
    m.door(37, 9, 2, 1);
    for (let x = 31; x <= 43; x += 2) {
        m.put("bookshelf", x, 1, { w: 2 });
    }
    m.put("plant", 30, 1);
    m.put("large_plant", 46, 1);
    m.put("bookshelf", 46, 3, { h: 2, rot: 90 });
    m.put("bookshelf", 46, 5, { h: 2, rot: 90 });
    m.put("rug_green", 32, 3, { w: 11, h: 4 });
    m.put("round_table", 34, 5);
    m.put("armchair", 33, 5, { rot: 270 });
    m.put("armchair", 35, 5, { rot: 90 });
    m.put("books", 34, 5);
    m.put("lamp", 33, 4);
    m.put("round_table", 40, 5);
    m.put("armchair", 39, 5, { rot: 270 });
    m.put("armchair", 41, 5, { rot: 90 });
    m.put("lamp", 41, 4);
    m.put("desk", 31, 7, { w: 2 });
    m.put("chair", 31, 8, { rot: 180 });
    m.put("desk", 42, 7, { w: 2 });
    m.put("chair", 42, 8, { rot: 180 });
    m.put("plant", 45, 8);
    m.area("Library", library.ix, library.iy, library.iw, library.ih, { silent: true });

    // --- Open space
    m.deskCluster(3, 12, 6);
    m.deskCluster(3, 19, 6);
    m.put("lamp", 10, 12);
    m.put("plant", 1, 11);
    m.put("plant", 1, 23);
    m.put("cabinet", 1, 16, { h: 2, rot: 270 });
    m.area("Team Desks", 2, 11, 9, 13);

    m.deskCluster(38, 12, 6);
    m.deskCluster(38, 19, 6);
    m.put("lamp", 36, 23);
    m.put("plant", 46, 11);
    m.put("plant", 46, 23);
    m.put("cabinet", 46, 16, { h: 2, rot: 90 });
    m.area("Engineering Pod", 37, 11, 9, 13);

    // Printer corner
    m.put("printer", 12, 10, { w: 2 });
    m.put("cabinet", 14, 10, { w: 2 });
    m.put("bin", 16, 10);
    m.put("water_cooler", 29, 10);
    m.put("large_plant", 31, 10);
    m.put("plant", 23, 10);
    m.put("shelf", 32, 10, { w: 2 });

    // Collaboration corner
    m.put("rug_blue", 17, 13, { w: 7, h: 7 });
    m.put("sofa", 19, 14, { w: 3 });
    m.put("round_table", 20, 16);
    m.put("sofa", 19, 18, { w: 3, rot: 180 });
    m.put("armchair", 18, 16, { rot: 270 });
    m.put("armchair", 22, 16, { rot: 90 });
    m.put("mug", 20, 16);
    m.put("whiteboard", 25, 14, { w: 3 });
    m.roundTable(28, 17, "nesw");
    m.roundTable(32, 17, "nesw");
    m.put("large_plant", 14, 18);
    m.put("large_plant", 34, 13);
    m.put("lamp", 24, 20);
    m.put("plant", 11, 24);
    m.put("plant", 35, 24);

    // --- Bottom row: cafeteria, reception, lounge
    const cafeteria = m.room(0, 25, 18, 9, "tiles_kitchen");
    m.door(13, 25, 2, 1);
    m.door(17, 27, 1, 2);
    m.put("counter", 2, 26, { w: 7 });
    m.put("coffee_machine", 3, 26);
    m.put("coffee_machine", 5, 26);
    m.put("sink", 9, 26);
    m.put("cabinet", 10, 26);
    m.put("water_cooler", 11, 26);
    m.put("bin", 1, 26);
    m.roundTable(3, 29, "nesw");
    m.roundTable(8, 29, "nesw");
    m.roundTable(13, 30, "nesw");
    m.put("large_plant", 1, 32);
    m.put("plant", 16, 32);
    m.put("plant", 16, 26);
    m.area("Cafeteria", cafeteria.ix, cafeteria.iy, cafeteria.iw, cafeteria.ih);

    m.fill(18, 26, 12, 7, "marble");
    m.wallLine(17, 25, 3, 1);
    m.wallLine(28, 25, 3, 1);
    m.put("counter", 21, 28, { w: 6 });
    m.put("office_chair", 22, 27, { rot: 0 });
    m.put("office_chair", 25, 27, { rot: 0 });
    m.put("laptop", 22, 28);
    m.put("laptop", 25, 28);
    m.put("sofa", 18, 31, { h: 2, rot: 270 });
    m.put("sofa", 29, 31, { h: 2, rot: 90 });
    m.put("large_plant", 18, 26);
    m.put("large_plant", 29, 26);
    m.put("rug_red", 21, 30, { w: 6, h: 3 });
    m.spawn(22, 31, 4, 1);
    m.area("Reception", 18, 26, 12, 7);

    const lounge = m.room(30, 25, 18, 9, "carpet_teal");
    m.door(33, 25, 2, 1);
    m.door(30, 29, 1, 2);
    m.put("screen", 41, 26, { w: 3 });
    m.put("rug_sand", 40, 27, { w: 5, h: 4 });
    m.put("round_table", 42, 28);
    m.put("sofa", 41, 30, { w: 3, rot: 180 });
    m.put("armchair", 40, 28, { rot: 270 });
    m.put("armchair", 44, 28, { rot: 90 });
    m.put("round_table", 34, 29);
    m.put("pouf", 33, 29);
    m.put("pouf", 35, 29);
    m.put("pouf", 34, 30);
    m.put("bookshelf", 36, 26, { w: 2 });
    m.put("large_plant", 46, 26);
    m.put("plant", 31, 32);
    m.put("plant", 46, 32);
    m.put("lamp", 45, 30);
    m.area("Lounge", lounge.ix, lounge.iy, lounge.iw, lounge.ih);

    m.windows(1, 0, 46, 1);
    m.windows(1, 33, 46, 1);
    m.windows(0, 1, 1, 32);
    m.windows(47, 1, 1, 32);

    return {
        builder: m,
        properties: {
            mapName: "Open Office",
            mapDescription:
                "An open office with a reception, desk clusters, two meeting rooms, a huddle room, a quiet library, a cafeteria and a lounge.",
            mapCopyright: COPYRIGHT,
        },
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Conference Center (56 x 40)

function conference() {
    const m = new MapBuilder("conference", 56, 40, "marble");
    m.wallRect(0, 0, 56, 40, "wall_ext");

    // --- Breakout rooms (left column) and corridor
    const floors = ["carpet_blue", "carpet_green", "carpet_red"];
    for (let i = 0; i < 3; i++) {
        const room = m.room(0, i * 8, 12, 9, floors[i]);
        m.door(11, i * 8 + 5, 1, 2);
        m.meetingRoom(room, { screenSide: "w" });
        m.put("plant", room.ix + room.iw - 1, room.iy + room.ih - 1);
        m.area(`Breakout Room ${i + 1}`, room.ix, room.iy, room.iw, room.ih, MEETING);
    }
    m.fill(12, 1, 2, 23, "concrete");

    // --- Auditorium
    const auditorium = m.room(14, 0, 28, 25, "carpet_wine");
    m.door(20, 24, 2, 1);
    m.door(34, 24, 2, 1);
    m.door(14, 11, 1, 2);
    m.door(41, 11, 1, 2);
    m.put("screen", 27, 1, { w: 3 });
    m.put("screen", 22, 1, { w: 2 });
    m.put("screen", 33, 1, { w: 2 });
    m.put("stage", 18, 2, { w: 20, h: 5 });
    m.put("podium", 32, 4);
    m.put("large_plant", 18, 2);
    m.put("large_plant", 37, 2);
    m.put("cabinet", 16, 2, { rot: 270 });
    m.put("cabinet", 39, 2, { rot: 90 });
    m.put("plant", 15, 1);
    m.put("plant", 40, 1);
    m.area("Main Stage", 18, 2, 20, 5, { speakerMegaphone: "main-stage" });
    for (let y = 9; y <= 21; y += 2) {
        for (let x = 17; x <= 26; x++) {
            m.put("chair", x, y, { rot: 180 });
        }
        for (let x = 30; x <= 39; x++) {
            m.put("chair", x, y, { rot: 180 });
        }
    }
    m.put("plant", 15, 23);
    m.put("plant", 40, 23);
    m.area("Auditorium", auditorium.ix, 8, auditorium.iw, 15, { listenerMegaphone: "main-stage", place: true });

    // --- Right column: networking lounge + coffee corner
    m.fill(42, 1, 2, 23, "concrete");
    const lounge = m.room(44, 0, 12, 14, "carpet_teal");
    m.door(44, 6, 1, 2);
    m.put("rug_sand", 46, 2, { w: 5, h: 4 });
    m.put("sofa", 47, 2, { w: 3 });
    m.put("round_table", 48, 4);
    m.put("armchair", 46, 4, { rot: 270 });
    m.put("armchair", 50, 4, { rot: 90 });
    m.put("pouf", 48, 5);
    m.put("rug_red", 46, 9, { w: 5, h: 3 });
    m.put("sofa", 47, 11, { w: 3, rot: 180 });
    m.put("round_table", 48, 10);
    m.put("armchair", 46, 10, { rot: 270 });
    m.put("armchair", 50, 10, { rot: 90 });
    m.roundTable(53, 4, "nsw");
    m.roundTable(53, 9, "nsw");
    m.put("large_plant", 45, 1);
    m.put("large_plant", 54, 1);
    m.put("plant", 45, 12);
    m.put("plant", 54, 12);
    m.put("lamp", 51, 2);
    m.area("Networking Lounge", lounge.ix, lounge.iy, lounge.iw, lounge.ih);

    const coffee = m.room(44, 13, 12, 12, "tiles_kitchen");
    m.door(44, 18, 1, 2);
    m.door(49, 24, 2, 1);
    m.put("counter", 54, 15, { h: 6 });
    m.put("coffee_machine", 54, 16, { rot: 90 });
    m.put("coffee_machine", 54, 18, { rot: 90 });
    m.put("mug", 54, 20);
    m.put("water_cooler", 54, 22);
    m.put("bin", 54, 14);
    m.roundTable(47, 16, "ew");
    m.roundTable(51, 16, "ew");
    m.roundTable(47, 21, "ew");
    m.roundTable(51, 21, "ew");
    m.put("plant", 45, 14);
    m.put("plant", 45, 23);
    m.area("Coffee Corner", coffee.ix, coffee.iy, coffee.iw, coffee.ih);

    // --- Lobby and reception
    m.put("rug_blue", 23, 35, { w: 10, h: 3 });
    m.put("counter", 25, 33, { w: 6 });
    m.put("office_chair", 26, 32, { rot: 0 });
    m.put("office_chair", 29, 32, { rot: 0 });
    m.put("laptop", 26, 33);
    m.put("laptop", 29, 33);
    m.put("large_plant", 23, 32);
    m.put("large_plant", 32, 32);
    m.spawn(25, 37, 6, 1);
    m.area("Reception", 20, 31, 16, 8);

    // Waiting areas
    for (const x of [4, 42]) {
        m.put("rug_green", x, 29, { w: 9, h: 6 });
        m.put("sofa", x + 2, 30, { w: 3 });
        m.put("round_table", x + 3, 32);
        m.put("sofa", x + 2, 34, { w: 3, rot: 180 });
        m.put("armchair", x + 1, 32, { rot: 270 });
        m.put("armchair", x + 5, 32, { rot: 90 });
        m.put("lamp", x + 7, 30);
    }
    for (const x of [2, 16, 38, 53]) {
        m.put("large_plant", x, 37);
    }
    m.put("bench", 16, 26, { w: 3 });
    m.put("bench", 37, 26, { w: 3 });
    m.put("screen", 26, 38, { w: 3, rot: 180 });
    m.put("water_cooler", 1, 25);
    m.put("bin", 54, 25);
    m.area("Lobby", 1, 25, 54, 6);

    m.windows(1, 39, 54, 1);
    m.windows(0, 25, 1, 14);
    m.windows(55, 25, 1, 14);
    m.windows(45, 0, 10, 1);

    return {
        builder: m,
        properties: {
            mapName: "Conference Center",
            mapDescription:
                "A conference center with a lobby, an auditorium and its stage (megaphone), three breakout rooms, a networking lounge and a coffee corner.",
            mapCopyright: COPYRIGHT,
        },
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Startup Campus (64 x 46)

function campus() {
    const m = new MapBuilder("campus", 64, 46, "grass");
    m.wallRect(0, 0, 64, 46, "hedge");

    // Garden paths: a ring around the building, and a walk through the south garden
    m.fill(2, 1, 60, 2, "path");
    m.fill(2, 35, 60, 2, "path");
    m.fill(2, 1, 2, 36, "path");
    m.fill(60, 1, 2, 36, "path");
    m.fill(35, 37, 2, 7, "path");
    m.fill(4, 40, 56, 2, "path");

    // --- Building
    m.room(6, 3, 52, 31, "concrete", "wall_ext");
    m.fill(7, 17, 50, 2, "concrete");

    // Top row
    const engineering = m.room(6, 3, 18, 14, "carpet_grey");
    m.door(13, 16, 2, 1);
    m.deskCluster(8, 5, 6);
    m.deskCluster(15, 5, 6);
    m.deskCluster(8, 11, 6);
    m.deskCluster(15, 11, 6);
    m.put("whiteboard", 7, 9, { h: 2, rot: 270 });
    m.put("large_plant", 22, 4);
    m.put("plant", 22, 15);
    m.put("plant", 7, 15);
    m.put("lamp", 7, 4);
    m.area("Engineering Pod", engineering.ix, engineering.iy, engineering.iw, engineering.ih);

    const design = m.room(23, 3, 14, 14, "carpet_green");
    m.door(29, 16, 2, 1);
    m.deskCluster(25, 5, 4);
    m.deskCluster(31, 5, 4);
    m.deskCluster(25, 11, 4);
    m.deskCluster(31, 11, 4);
    m.put("large_plant", 24, 15);
    m.put("large_plant", 35, 15);
    m.put("shelf", 35, 9, { h: 2, rot: 90 });
    m.area("Design Pod", design.ix, design.iy, design.iw, design.ih);

    const boardroom = m.room(36, 3, 12, 14, "wood_dark");
    m.door(44, 16, 2, 1);
    m.put("meeting_table", 39, 7, { w: 6, h: 3 });
    for (let x = 39; x <= 44; x++) {
        m.put("office_chair", x, 6, { rot: 0 });
        m.put("office_chair", x, 10, { rot: 180 });
    }
    for (let y = 7; y <= 9; y++) {
        m.put("office_chair", 38, y, { rot: 270 });
        m.put("office_chair", 45, y, { rot: 90 });
    }
    m.put("laptop", 40, 7, { rot: 180 });
    m.put("laptop", 43, 9);
    m.put("mug", 41, 8);
    m.put("screen", 40, 4, { w: 3 });
    m.put("whiteboard", 37, 6, { h: 3, rot: 270 });
    m.put("large_plant", 37, 4);
    m.put("large_plant", 46, 4);
    m.put("plant", 37, 15);
    m.put("cabinet", 46, 12, { h: 2, rot: 90 });
    m.area("Boardroom", boardroom.ix, boardroom.iy, boardroom.iw, boardroom.ih, MEETING);

    const officeNames = ["Private Office A", "Private Office B"];
    [47, 52].forEach((x, i) => {
        const room = m.room(x, 3, 6, 14, i === 0 ? "carpet_blue" : "carpet_purple");
        const { ix, iy } = room;
        m.door(ix + 1, 16, 2, 1);
        m.put("bookshelf", ix, iy, { w: 2 });
        m.put("plant", ix + 3, iy);
        m.put("desk_monitor", ix, iy + 3, { w: 3 });
        m.put("office_chair", ix + 1, iy + 4, { rot: 180 });
        m.put("lamp", ix + 3, iy + 5);
        m.put("rug_sand", ix, iy + 7, { w: 4, h: 3 });
        m.put("armchair", ix, iy + 8, { rot: 270 });
        m.put("round_table", ix + 1, iy + 8);
        m.put("armchair", ix + 2, iy + 8, { rot: 90 });
        m.put("cabinet", ix + 3, iy + 10, { rot: 90 });
        m.area(officeNames[i], room.ix, room.iy, room.iw, room.ih, MEETING);
    });

    // Corridor decoration
    for (const x of [9, 21, 33, 47, 56]) {
        m.put("plant", x, 17);
    }

    // Bottom row
    const sales = m.room(6, 19, 14, 15, "carpet_blue");
    m.door(12, 19, 2, 1);
    m.deskCluster(8, 22, 4);
    m.deskCluster(14, 22, 4);
    m.deskCluster(8, 27, 4);
    m.deskCluster(14, 27, 4);
    m.put("whiteboard", 7, 32, { w: 3, rot: 180 });
    m.put("large_plant", 18, 32);
    m.put("printer", 16, 20, { w: 2 });
    m.put("bin", 18, 20);
    m.area("Sales Pod", sales.ix, sales.iy, sales.iw, sales.ih);

    const games = m.room(19, 19, 13, 15, "carpet_red");
    m.door(25, 19, 2, 1);
    m.door(22, 33, 2, 1);
    m.put("screen", 20, 23, { h: 3, rot: 270 });
    m.put("rug_blue", 21, 22, { w: 4, h: 5 });
    m.put("sofa", 23, 23, { h: 3, rot: 90 });
    m.put("pouf", 21, 22);
    m.put("pouf", 21, 26);
    m.roundTable(28, 23, "nsw");
    m.roundTable(28, 29, "nsw");
    m.put("cabinet", 30, 21, { h: 2, rot: 90 });
    m.put("shelf", 30, 26, { h: 2, rot: 90 });
    m.put("large_plant", 20, 31);
    m.put("plant", 30, 31);
    m.put("pouf", 24, 30);
    m.put("pouf", 26, 30);
    m.area("Game Room", games.ix, games.iy, games.iw, games.ih);

    const reception = m.room(31, 19, 10, 15, "marble");
    m.door(35, 19, 2, 1);
    m.door(35, 33, 2, 1);
    m.put("counter", 33, 23, { h: 4 });
    m.put("office_chair", 32, 24, { rot: 270 });
    m.put("laptop", 33, 24, { rot: 270 });
    m.put("sofa", 39, 23, { h: 3, rot: 90 });
    m.put("large_plant", 32, 20);
    m.put("large_plant", 39, 20);
    m.put("plant", 32, 32);
    m.put("plant", 39, 32);
    m.put("rug_red", 34, 28, { w: 4, h: 4 });
    m.spawn(35, 29, 2, 2);
    m.area("Reception", reception.ix, reception.iy, reception.iw, reception.ih);

    const kitchen = m.room(40, 19, 11, 15, "tiles_kitchen");
    m.door(44, 19, 2, 1);
    m.door(46, 33, 2, 1);
    m.put("counter", 41, 21, { h: 6 });
    m.put("coffee_machine", 41, 22, { rot: 270 });
    m.put("coffee_machine", 41, 24, { rot: 270 });
    m.put("sink", 41, 27);
    m.put("water_cooler", 41, 29);
    m.put("cabinet", 48, 20, { w: 2 });
    m.put("bin", 41, 32);
    m.put("meeting_table", 44, 24, { w: 5, h: 2 });
    for (let x = 44; x <= 48; x++) {
        m.put("chair", x, 23, { rot: 0 });
        m.put("chair", x, 26, { rot: 180 });
    }
    m.put("mug", 45, 24);
    m.put("mug", 47, 25);
    m.roundTable(45, 30, "ew");
    m.put("plant", 49, 32);
    m.area("Kitchen", kitchen.ix, kitchen.iy, kitchen.iw, kitchen.ih);

    const library = m.room(50, 19, 8, 15, "wood_dark");
    m.door(53, 19, 2, 1);
    for (const y of [21, 24, 27, 30]) {
        m.put("bookshelf", 56, y, { h: 2, rot: 90 });
    }
    m.put("bookshelf", 51, 21, { h: 2, rot: 270 });
    m.put("bookshelf", 51, 30, { h: 2, rot: 270 });
    m.put("rug_green", 52, 26, { w: 3, h: 4 });
    m.put("round_table", 53, 28);
    m.put("armchair", 52, 28, { rot: 270 });
    m.put("armchair", 54, 28, { rot: 90 });
    m.put("books", 53, 28);
    m.put("lamp", 52, 27);
    m.put("desk", 52, 23, { w: 2 });
    m.put("chair", 52, 24, { rot: 180 });
    m.put("plant", 51, 32);
    m.area("Library", library.ix, library.iy, library.iw, library.ih, { silent: true });

    // Building shell: windows on the facade
    m.windows(7, 3, 50, 1, 3, 3);
    m.windows(7, 33, 50, 1, 3, 3);
    m.windows(6, 4, 1, 29, 3, 3);
    m.windows(57, 4, 1, 29, 3, 3);

    // --- Garden
    const trees = [
        [5, 38],
        [9, 43],
        [13, 38],
        [18, 43],
        [22, 38],
        [27, 43],
        [31, 38],
        [41, 38],
        [45, 43],
        [50, 38],
        [54, 43],
        [58, 38],
        [1, 5],
        [1, 12],
        [1, 20],
        [1, 28],
        [62, 5],
        [62, 12],
        [62, 20],
        [62, 28],
        [4, 4],
        [5, 15],
        [4, 26],
        [59, 8],
        [58, 18],
        [59, 30],
        [10, 44],
        [62, 44],
        [1, 44],
    ];
    for (const [x, y] of trees) {
        m.put("tree", x, y);
    }
    for (const x of [8, 17, 26, 44, 53]) {
        m.put("bench", x, 39, { w: 2 });
        m.put("bench", x, 42, { w: 2, rot: 180 });
    }
    for (const [x, y] of [
        [33, 37],
        [38, 37],
        [33, 43],
        [38, 43],
        [20, 34],
        [43, 34],
        [12, 34],
        [52, 34],
    ]) {
        m.put("plant", x, y);
    }
    // Terrace in front of the kitchen
    m.fill(44, 34, 6, 1, "path");
    m.roundTable(46, 38, "ew");
    m.put("lamp", 56, 38);
    m.area("Garden", 4, 37, 56, 8);

    return {
        builder: m,
        properties: {
            mapName: "Startup Campus",
            mapDescription:
                "A startup campus in a garden: engineering, design and sales pods, private offices, a boardroom, a game room, a kitchen and a library.",
            mapCopyright: COPYRIGHT,
        },
    };
}

export const TEMPLATES = [
    { id: "office", build: office },
    { id: "conference", build: conference },
    { id: "campus", build: campus },
];
