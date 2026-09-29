<script lang="ts">
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { mapEditorModeStore } from "../../Stores/MapEditorStore";
    import { avatarEditorVisibleStore } from "../../World3d/Stores/AvatarStore";
    import { placesPanelVisibleStore, travelDestinationStore } from "../../World3d/Stores/PlacesStore";
    import { cameraModeStore, preferredViewModeStore, viewModeStore } from "../../World3d/Stores/ViewModeStore";
    import { world3dControllerStore } from "../../World3d/World3dController";
    import {
        IconCube,
        IconMap,
        IconMapPin,
        IconRotate,
        IconRotateClockwise,
        IconShirt,
        IconSquare,
        IconWalk,
        IconZoomReset,
    } from "../Icons";
    import PlacesPanel from "./PlacesPanel.svelte";

    let showHint = $state(false);
    let hintTimeout: ReturnType<typeof setTimeout> | undefined;

    const is3d = $derived($viewModeStore === "3d");

    $effect(() => {
        if (is3d) {
            showHint = true;
            clearTimeout(hintTimeout);
            hintTimeout = setTimeout(() => (showHint = false), 8000);
        } else {
            showHint = false;
        }
    });

    onDestroy(() => clearTimeout(hintTimeout));

    const buttonClass =
        "flex h-10 w-10 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary";
</script>

{#if !$mapEditorModeStore}
    <div
        class="pointer-events-none absolute bottom-20 end-16 z-20 flex flex-col items-end gap-2 sm:bottom-4"
        data-testid="world3d-hud"
    >
        {#if $placesPanelVisibleStore}
            <PlacesPanel />
        {/if}

        {#if showHint}
            <div
                class="pointer-events-none rounded-full bg-contrast/80 px-3 py-1.5 text-xs text-white shadow backdrop-blur"
                data-testid="world3d-hint"
            >
                {$LL.world3d.hud.controlsHint()}
            </div>
        {/if}

        <div class="pointer-events-auto flex items-center gap-1 rounded-xl bg-contrast/80 p-1 shadow-lg backdrop-blur">
            {#if preferredViewModeStore.webglSupported}
                <button
                    type="button"
                    class="{buttonClass} {is3d ? 'bg-secondary' : ''}"
                    title={is3d ? $LL.world3d.hud.switchTo2d() : $LL.world3d.hud.switchTo3d()}
                    aria-label={is3d ? $LL.world3d.hud.switchTo2d() : $LL.world3d.hud.switchTo3d()}
                    data-testid="world3d-toggle"
                    data-view-mode={$viewModeStore}
                    onclick={() => preferredViewModeStore.toggle()}
                >
                    {#if is3d}
                        <IconCube font-size="22" />
                    {:else}
                        <IconSquare font-size="22" />
                    {/if}
                </button>
            {/if}
            {#if is3d}
                <button
                    type="button"
                    class={buttonClass}
                    title={$cameraModeStore === "game" ? $LL.world3d.hud.overview() : $LL.world3d.hud.gameView()}
                    aria-label={$cameraModeStore === "game" ? $LL.world3d.hud.overview() : $LL.world3d.hud.gameView()}
                    data-testid="world3d-camera-mode"
                    data-camera-mode={$cameraModeStore}
                    onclick={() => cameraModeStore.toggle()}
                >
                    {#if $cameraModeStore === "game"}
                        <IconMap font-size="20" />
                    {:else}
                        <IconWalk font-size="20" />
                    {/if}
                </button>
                <button
                    type="button"
                    class={buttonClass}
                    title={$LL.world3d.hud.rotateLeft()}
                    aria-label={$LL.world3d.hud.rotateLeft()}
                    data-testid="world3d-rotate-left"
                    onclick={() => $world3dControllerStore?.rotateQuarter(-1)}
                >
                    <IconRotate font-size="20" />
                </button>
                <button
                    type="button"
                    class={buttonClass}
                    title={$LL.world3d.hud.rotateRight()}
                    aria-label={$LL.world3d.hud.rotateRight()}
                    data-testid="world3d-rotate-right"
                    onclick={() => $world3dControllerStore?.rotateQuarter(1)}
                >
                    <IconRotateClockwise font-size="20" />
                </button>
                <button
                    type="button"
                    class={buttonClass}
                    title={$LL.world3d.hud.resetCamera()}
                    aria-label={$LL.world3d.hud.resetCamera()}
                    data-testid="world3d-reset-camera"
                    onclick={() => $world3dControllerStore?.resetCamera()}
                >
                    <IconZoomReset font-size="20" />
                </button>
            {/if}
            <div class="mx-0.5 h-6 w-px bg-white/20"></div>
            <button
                type="button"
                class="{buttonClass} {$placesPanelVisibleStore ? 'bg-white/15' : ''}"
                title={$LL.world3d.hud.places()}
                aria-label={$LL.world3d.hud.places()}
                aria-expanded={$placesPanelVisibleStore}
                data-testid="world3d-places"
                onclick={() => placesPanelVisibleStore.update((visible) => !visible)}
            >
                <IconMapPin font-size="20" />
            </button>
            {#if preferredViewModeStore.webglSupported}
                <button
                    type="button"
                    class={buttonClass}
                    title={$LL.world3d.hud.avatar()}
                    aria-label={$LL.world3d.hud.avatar()}
                    data-testid="world3d-avatar"
                    onclick={() => avatarEditorVisibleStore.set(true)}
                >
                    <IconShirt font-size="20" />
                </button>
            {/if}
        </div>
    </div>

    {#if $travelDestinationStore}
        <div
            class="pointer-events-none absolute bottom-36 left-1/2 z-20 sm:bottom-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-contrast/85 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur"
            data-testid="world3d-travelling"
        >
            <IconWalk font-size="18" />
            {$LL.world3d.places.travelling({ place: $travelDestinationStore.name })}
        </div>
    {/if}
{/if}
