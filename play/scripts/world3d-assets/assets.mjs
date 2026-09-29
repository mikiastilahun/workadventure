/**
 * The 3D models used by the 3D view. Every model is CC0 (public domain):
 * - Poly Haven (https://polyhaven.com), photo-scanned / realistic models,
 * - Kenney (https://kenney.nl), furniture kit and car kit.
 *
 * `height` is the real height of the object in meters: the renderer scales the model to it.
 * `rotation` (degrees, around the vertical axis) turns the model so that its front faces +Z.
 * `simplify` (0-1) keeps this ratio of the triangles, for heavy photo-scanned models.
 * `materials` overrides materials by name ({ color, metalness, roughness }): the Kenney palette is pastel, the
 * overrides give the objects the look of real office furniture.
 */
export const KENNEY_PACKS = {
    furniture: {
        url: "https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip",
        folder: "Models/GLTF format",
        page: "https://kenney.nl/assets/furniture-kit",
    },
    car: {
        url: "https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip",
        folder: "Models/GLB format",
        page: "https://kenney.nl/assets/car-kit",
    },
};

const CAR_PAINT = { colormap: { metalness: 0.35, roughness: 0.35 } };

export const ASSETS = [
    // --- Poly Haven ---
    { id: "office_desk", source: "polyhaven", name: "metal_office_desk", height: 0.76, simplify: 0.5 },
    { id: "armchair", source: "polyhaven", name: "modern_arm_chair_01", height: 0.8, simplify: 0.4 },
    { id: "sofa", source: "polyhaven", name: "sofa_02", height: 0.8 },
    { id: "plant", source: "polyhaven", name: "potted_plant_01", height: 1.0, simplify: 0.08 },
    { id: "plant_large", source: "polyhaven", name: "potted_plant_02", height: 1.5, simplify: 0.2 },
    { id: "plant_small", source: "polyhaven", name: "potted_plant_04", height: 0.35, simplify: 0.3 },
    { id: "coffee_table", source: "polyhaven", name: "modern_coffee_table_01", height: 0.42 },
    { id: "round_table", source: "polyhaven", name: "round_wooden_table_01", height: 0.75, simplify: 0.3 },
    { id: "shelves", source: "polyhaven", name: "steel_frame_shelves_01", height: 1.8 },
    { id: "ceiling_light", source: "polyhaven", name: "mounted_fluorescent_lights", height: 0.12, simplify: 0.08 },
    { id: "wall_clock", source: "polyhaven", name: "wall_clock", height: 0.3 },
    { id: "cardboard_box", source: "polyhaven", name: "cardboard_box_01", height: 0.4, simplify: 0.05 },
    { id: "fire_extinguisher", source: "polyhaven", name: "korean_fire_extinguisher_01", height: 0.6, simplify: 0.3 },
    { id: "air_conditioner", source: "polyhaven", name: "exterior_aircon_unit", height: 0.8, simplify: 0.2 },
    { id: "projector_screen", source: "polyhaven", name: "projector_screen", height: 2.0, simplify: 0.3 },
    { id: "dining_table", source: "polyhaven", name: "dining_table", height: 0.76 },
    { id: "trash_bin_outdoor", source: "polyhaven", name: "metal_trash_can", height: 0.9, simplify: 0.2 },
    // --- Kenney furniture kit ---
    {
        id: "office_chair",
        source: "kenney",
        pack: "furniture",
        name: "chairDesk",
        height: 1.05,
        materials: {
            carpet: { color: "#2d3036", roughness: 0.9 },
            metalMedium: { color: "#3a3f47", metalness: 0.6, roughness: 0.4 },
        },
    },
    {
        id: "chair",
        source: "kenney",
        pack: "furniture",
        name: "chairModernCushion",
        height: 0.85,
        materials: {
            carpetBlue: { color: "#56687a", metalness: 0, roughness: 0.85 },
            metal: { color: "#c9ccd1", metalness: 0.8, roughness: 0.3 },
        },
    },
    {
        id: "monitor",
        source: "kenney",
        pack: "furniture",
        name: "computerScreen",
        height: 0.45,
        materials: {
            metalDark: { color: "#15181c", roughness: 0.3 },
            metal: { color: "#2a2e35", metalness: 0.4, roughness: 0.4 },
        },
    },
    {
        id: "keyboard",
        source: "kenney",
        pack: "furniture",
        name: "computerKeyboard",
        height: 0.03,
        materials: { metalDark: { color: "#1e2126" }, metalMedium: { color: "#3a3f47" } },
    },
    {
        id: "laptop",
        source: "kenney",
        pack: "furniture",
        name: "laptop",
        height: 0.24,
        materials: {
            metal: { color: "#a7adb5", metalness: 0.7, roughness: 0.35 },
            metalMedium: { color: "#8d949d", metalness: 0.7, roughness: 0.35 },
            metalDark: { color: "#15181c" },
        },
    },
    {
        id: "fridge",
        source: "kenney",
        pack: "furniture",
        name: "kitchenFridgeLarge",
        height: 1.85,
        materials: {
            metalLight: { color: "#d9dde0", metalness: 0.6, roughness: 0.3 },
            metalMedium: { color: "#6f757d", metalness: 0.7, roughness: 0.3 },
        },
    },
    {
        id: "kitchen_cabinet",
        source: "kenney",
        pack: "furniture",
        name: "kitchenCabinet",
        height: 0.9,
        materials: {
            wood: { color: "#f1f0ec", roughness: 0.5 },
            woodDark: { color: "#3b3f45", roughness: 0.4 },
            metal: { color: "#9aa0a8", metalness: 0.8, roughness: 0.3 },
        },
    },
    {
        id: "kitchen_sink",
        source: "kenney",
        pack: "furniture",
        name: "kitchenSink",
        height: 0.9,
        materials: {
            wood: { color: "#f1f0ec", roughness: 0.5 },
            woodDark: { color: "#3b3f45", roughness: 0.4 },
            metal: { color: "#b8bec6", metalness: 0.9, roughness: 0.2 },
            metalLight: { color: "#cfd4d8", metalness: 0.9, roughness: 0.2 },
        },
    },
    {
        id: "coffee_machine",
        source: "kenney",
        pack: "furniture",
        name: "kitchenCoffeeMachine",
        height: 0.4,
        materials: {
            metalMedium: { color: "#2d3036", roughness: 0.4 },
            metal: { color: "#b8bec6", metalness: 0.9, roughness: 0.25 },
        },
    },
    {
        id: "microwave",
        source: "kenney",
        pack: "furniture",
        name: "kitchenMicrowave",
        height: 0.3,
        materials: {
            metalMedium: { color: "#2d3036", roughness: 0.4 },
            glass: { color: "#1c2a30", roughness: 0.1 },
        },
    },
    {
        id: "toilet",
        source: "kenney",
        pack: "furniture",
        name: "toilet",
        height: 0.8,
        materials: {
            carpetWhite: { color: "#f7f7f5", roughness: 0.15 },
            metalLight: { color: "#d7dce0", metalness: 0.9, roughness: 0.2 },
        },
    },
    {
        id: "bathroom_sink",
        source: "kenney",
        pack: "furniture",
        name: "bathroomSink",
        height: 0.9,
        materials: {
            carpetWhite: { color: "#f7f7f5", roughness: 0.15 },
            metalLight: { color: "#d7dce0", metalness: 0.9, roughness: 0.2 },
        },
    },
    {
        id: "trash_can",
        source: "kenney",
        pack: "furniture",
        name: "trashcan",
        height: 0.45,
        materials: { metal: { color: "#4a4f57", metalness: 0.5, roughness: 0.5 }, metalDark: { color: "#2d3036" } },
    },
    {
        id: "bookcase",
        source: "kenney",
        pack: "furniture",
        name: "bookcaseOpen",
        height: 1.9,
        materials: { wood: { color: "#a5774f", roughness: 0.7 } },
    },
    {
        id: "filing_cabinet",
        source: "kenney",
        pack: "furniture",
        name: "bookcaseClosedDoors",
        height: 1.3,
        materials: {
            wood: { color: "#8f98a3", metalness: 0.5, roughness: 0.45 },
            metal: { color: "#5c636e", metalness: 0.8, roughness: 0.3 },
        },
    },
    {
        id: "drawers",
        source: "kenney",
        pack: "furniture",
        name: "sideTableDrawers",
        height: 0.6,
        materials: {
            wood: { color: "#d8d4cc", roughness: 0.55 },
            metal: { color: "#7a8088", metalness: 0.7, roughness: 0.3 },
        },
    },
    { id: "floor_lamp", source: "kenney", pack: "furniture", name: "lampSquareFloor", height: 1.6 },
    {
        id: "tv",
        source: "kenney",
        pack: "furniture",
        name: "televisionModern",
        height: 0.7,
        materials: { metalDark: { color: "#111317", roughness: 0.2 }, metal: { color: "#2a2e35" } },
    },
    {
        id: "table",
        source: "kenney",
        pack: "furniture",
        name: "table",
        height: 0.75,
        materials: { wood: { color: "#b58d64", roughness: 0.55 } },
    },
    {
        id: "table_round",
        source: "kenney",
        pack: "furniture",
        name: "tableRound",
        height: 0.75,
        materials: { wood: { color: "#e9e6e0", roughness: 0.4 } },
    },
    { id: "coat_rack", source: "kenney", pack: "furniture", name: "coatRackStanding", height: 1.8 },
    { id: "books", source: "kenney", pack: "furniture", name: "books", height: 0.2 },
    // --- Kenney car kit ---
    { id: "car_sedan", source: "kenney", pack: "car", name: "sedan", height: 1.45, materials: CAR_PAINT },
    { id: "car_sedan_sports", source: "kenney", pack: "car", name: "sedan-sports", height: 1.35, materials: CAR_PAINT },
    { id: "car_suv", source: "kenney", pack: "car", name: "suv", height: 1.7, materials: CAR_PAINT },
    { id: "car_suv_luxury", source: "kenney", pack: "car", name: "suv-luxury", height: 1.7, materials: CAR_PAINT },
    { id: "car_hatchback", source: "kenney", pack: "car", name: "hatchback-sports", height: 1.4, materials: CAR_PAINT },
    { id: "van", source: "kenney", pack: "car", name: "van", height: 2.1, materials: CAR_PAINT },
    { id: "delivery_truck", source: "kenney", pack: "car", name: "delivery", height: 3.0, materials: CAR_PAINT },
];
