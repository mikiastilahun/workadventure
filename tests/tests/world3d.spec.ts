import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { getPage } from "./utils/auth";
import { isMobile } from "./utils/isMobile";
import { play_url } from "./utils/urls";

/**
 * The 3D templates are static maps served by the front itself (play/public/map-templates).
 */
function templateUrl(template: "office" | "conference" | "campus", slug: string): string {
    const playHost = new URL(play_url).host;
    return new URL(`/_/${slug}/${playHost}/map-templates/${template}/map.tmj?view=3d`, play_url).toString();
}

function label(page: Page, player: string) {
    return page.locator(`[data-testid="world3d-label"][data-player="${player}"]`);
}

function remoteLabel(page: Page, name: string) {
    return page.locator('[data-testid="world3d-label"]', {
        has: page.locator('[data-testid="world3d-name"]', { hasText: name }),
    });
}

async function getLocalPosition(page: Page): Promise<{ x: number; y: number }> {
    const localLabel = label(page, "local");
    await expect(localLabel).toHaveAttribute("data-x", /\d+/);
    return {
        x: Number(await localLabel.getAttribute("data-x")),
        y: Number(await localLabel.getAttribute("data-y")),
    };
}

async function getAvatar(page: Page, name: string): Promise<Record<string, unknown>> {
    const value = await remoteLabel(page, name).getAttribute("data-avatar");
    const parsed: unknown = JSON.parse(value ?? "{}");
    return typeof parsed === "object" && parsed !== null ? { ...parsed } : {};
}

test.describe("3D world @nowebkit", () => {
    test.beforeEach("The 3D controls are designed for desktop in this suite", ({ page }) => {
        test.skip(isMobile(page), "Pointer camera controls are tested on desktop only");
    });

    test("should display the world in 3D and switch between 2D and 3D", async ({ browser }) => {
        await using page = await getPage(browser, "Alice", templateUrl("office", "world3d-toggle"));

        const canvas = page.locator("#world3d-canvas");
        const toggle = page.getByTestId("world3d-toggle");
        await expect(canvas).toBeVisible();
        await expect(toggle).toHaveAttribute("data-view-mode", "3d");
        await expect(label(page, "local")).toBeVisible();

        await toggle.click();
        await expect(toggle).toHaveAttribute("data-view-mode", "2d");
        await expect(canvas).toBeHidden();

        await toggle.click();
        await expect(toggle).toHaveAttribute("data-view-mode", "3d");
        await expect(canvas).toBeVisible();
    });

    test("should switch between the game camera and the overview camera", async ({ browser }) => {
        await using page = await getPage(browser, "Alice", templateUrl("office", "world3d-camera"));

        const canvas = page.locator("#world3d-canvas");
        const cameraButton = page.getByTestId("world3d-camera-mode");
        await expect(cameraButton).toHaveAttribute("data-camera-mode", "game");
        await expect(canvas).toHaveAttribute("data-camera-mode", "game");

        await cameraButton.click();
        await expect(cameraButton).toHaveAttribute("data-camera-mode", "overview");
        await expect(canvas).toHaveAttribute("data-camera-mode", "overview");

        await cameraButton.click();
        await expect(canvas).toHaveAttribute("data-camera-mode", "game");
    });

    test("should broadcast the customized avatar to the other players, including late joiners", async ({ browser }) => {
        // Several players rendering a 3D world: slower than the other tests on CI machines without GPU
        test.setTimeout(240_000);
        await using bob = await getPage(browser, "Bob", templateUrl("office", "world3d-avatar"));
        {
            // Alice leaves before Eve joins: without GPU, three 3D pages at once are too slow
            await using alice = await getPage(browser, "Alice", templateUrl("office", "world3d-avatar"));

            await bob.getByTestId("world3d-avatar").click();
            await expect(bob.getByTestId("avatar-editor")).toBeVisible();
            await expect(bob.getByTestId("avatar-preview")).toBeVisible();
            await bob.getByTestId("avatar-section-hair").click();
            await bob.getByTestId("avatar-option-hairStyle-curly").click();
            await bob.getByTestId("avatar-color-hairColor-e86aa6").click();
            await bob.getByTestId("avatar-section-accessories").click();
            await bob.getByTestId("avatar-option-headwear-crown").click();
            await bob.getByTestId("avatar-save").click();
            await expect(bob.getByTestId("avatar-editor")).toBeHidden();

            // Bob's own avatar is updated right away
            await expect(label(bob, "local")).toHaveAttribute("data-avatar", /"hairStyle":"curly"/);

            // Alice sees Bob's new avatar
            await expect(remoteLabel(alice, "Bob")).toBeAttached({ timeout: 20_000 });
            await expect(remoteLabel(alice, "Bob")).toHaveAttribute("data-avatar", /"headwear":"crown"/, {
                timeout: 20_000,
            });
            const bobSeenByAlice = await getAvatar(alice, "Bob");
            expect(bobSeenByAlice["hairStyle"]).toBe("curly");
            expect(bobSeenByAlice["hairColor"]).toBe("#e86aa6");
        }

        // Eve joins after the change and receives it too
        await using eve = await getPage(browser, "Eve", templateUrl("office", "world3d-avatar"));
        await expect(remoteLabel(eve, "Bob")).toHaveAttribute("data-avatar", /"headwear":"crown"/, {
            timeout: 60_000,
        });
    });

    test("should list the places of the map and walk the player to one of them", async ({ browser }) => {
        await using page = await getPage(browser, "Alice", templateUrl("office", "world3d-places"));

        await page.getByTestId("world3d-places").click();
        const panel = page.getByTestId("places-panel");
        await expect(panel).toBeVisible();
        await expect(panel.getByTestId("place-item")).toHaveCount(9);

        await panel.getByTestId("places-search").fill("cafe");
        await expect(panel.getByTestId("place-item")).toHaveCount(1);
        await panel.locator('[data-place-name="Cafeteria"]').click();

        // The Cafeteria area is x: 32 → 544, y: 832 → 1056 (see play/public/map-templates/office/map.tmj)
        await expect
            .poll(
                async () => {
                    const position = await getLocalPosition(page);
                    return position.x >= 32 && position.x <= 544 && position.y >= 800 && position.y <= 1056;
                },
                { timeout: 60_000 },
            )
            .toBe(true);
        await expect(page.getByTestId("world3d-travelling")).toBeHidden({ timeout: 30_000 });
    });

    test("should walk to the point clicked in 3D", async ({ browser }) => {
        await using page = await getPage(browser, "Alice", templateUrl("office", "world3d-click"));

        const start = await getLocalPosition(page);
        const box = await label(page, "local").boundingBox();
        expect(box).not.toBeNull();
        const { x, y, height } = box ?? { x: 0, y: 0, height: 0 };
        // A point of the floor on the left of the player (the top of the screen is covered by the camera box)
        await page.mouse.click(Math.max(x - 220, 20), y + height + 40);
        await expect.poll(async () => (await getLocalPosition(page)).x, { timeout: 20_000 }).toBeLessThan(start.x - 32);
    });

    test("should move relatively to the camera after rotating it", async ({ browser }) => {
        await using page = await getPage(browser, "Alice", templateUrl("office", "world3d-rotate"));
        const canvas = page.locator("#world3d-canvas");
        await expect(canvas).toHaveAttribute("data-quarter-turns", "0");

        // Orbiting clockwise, the camera now looks towards the right of the map: "up" must move the player right
        // (the reception, where the player spawns, is free on the right of the spawn tiles)
        await page.getByTestId("world3d-rotate-right").click();
        await expect(canvas).toHaveAttribute("data-quarter-turns", "1");
        const start = await getLocalPosition(page);
        await page.keyboard.down("ArrowUp");
        await expect.poll(async () => (await getLocalPosition(page)).x).toBeGreaterThan(start.x + 32);
        await page.keyboard.up("ArrowUp");
        const end = await getLocalPosition(page);
        expect(Math.abs(end.y - start.y)).toBeLessThan(8);
    });

    test("should sit on a chair, be seen seated by the others, and stand up when walking", async ({ browser }) => {
        await using alice = await getPage(browser, "Alice", templateUrl("office", "world3d-sit"));
        await using bob = await getPage(browser, "Bob", templateUrl("office", "world3d-sit"));

        const canvas = alice.locator("#world3d-canvas");
        await expect(canvas).toHaveAttribute("data-nearest-seat", /^\d+,\d+$/, { timeout: 30_000 });
        const [x, y] = ((await canvas.getAttribute("data-nearest-seat")) ?? "0,0").split(",").map(Number);
        await alice.mouse.click(x ?? 0, y ?? 0);
        await expect(canvas).toHaveAttribute("data-seated", "true", { timeout: 30_000 });
        await expect(label(alice, "local")).toHaveAttribute("data-seated", "true");

        // Bob sees Alice seated
        await expect(remoteLabel(bob, "Alice")).toHaveAttribute("data-seated", "true", { timeout: 20_000 });

        // Walking stands up
        await alice.keyboard.down("ArrowDown");
        await expect(canvas).toHaveAttribute("data-seated", "false");
        await alice.keyboard.up("ArrowDown");
        await expect(remoteLabel(bob, "Alice")).toHaveAttribute("data-seated", "false", { timeout: 20_000 });
    });

    test("should add doors to the doorways and ceilings to the rooms", async ({ browser }) => {
        await using page = await getPage(browser, "Alice", templateUrl("office", "world3d-doors"));
        const canvas = page.locator("#world3d-canvas");
        await expect(canvas).toHaveAttribute("data-doorways", /^[1-9]\d*$/, { timeout: 30_000 });
        await expect(canvas).toHaveAttribute("data-indoor-cells", /^[1-9]\d+$/);
        await expect(canvas).toHaveAttribute("data-seats", /^[1-9]\d*$/);
    });
});
