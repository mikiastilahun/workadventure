<script lang="ts">
    import type { Component } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import type { Place, PlaceKind } from "../../World3d/Places/Places";
    import { placesPanelVisibleStore, placesStore, travelDestinationStore } from "../../World3d/Stores/PlacesStore";
    import type { MapTemplateId } from "../../World3d/Templates/MapTemplates";
    import {
        getMapTemplatePreviewUrl,
        getMapTemplateRoomUrl,
        MAP_TEMPLATE_IDS,
    } from "../../World3d/Templates/MapTemplates";
    import { world3dControllerStore } from "../../World3d/World3dController";
    import {
        IconArmchair,
        IconBooks,
        IconCoffee,
        IconDesk,
        IconDoorIn,
        IconMapPin,
        IconMicrophone2,
        IconSearch,
        IconUsersGroup,
        IconX,
    } from "../Icons";

    let search = $state("");

    const kindIcons: Record<PlaceKind, Component> = {
        meeting: IconUsersGroup,
        stage: IconMicrophone2,
        focus: IconBooks,
        desk: IconDesk,
        social: IconCoffee,
        entrance: IconDoorIn,
        other: IconMapPin,
    };

    const kindColors: Record<PlaceKind, string> = {
        meeting: "bg-blue-500/80",
        stage: "bg-purple-500/80",
        focus: "bg-teal-500/80",
        desk: "bg-amber-500/80",
        social: "bg-pink-500/80",
        entrance: "bg-emerald-500/80",
        other: "bg-slate-500/80",
    };

    const filteredPlaces = $derived(
        $placesStore.filter((place) => place.name.toLowerCase().includes(search.trim().toLowerCase())),
    );

    function travel(place: Place) {
        $world3dControllerStore?.travelTo(place);
    }

    function visitTemplate(id: MapTemplateId) {
        window.location.assign(getMapTemplateRoomUrl(id, window.location));
    }

    function close() {
        placesPanelVisibleStore.set(false);
    }
</script>

<div
    class="pointer-events-auto flex max-h-[min(70vh,560px)] w-[min(340px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl bg-contrast/90 text-white shadow-2xl backdrop-blur"
    data-testid="places-panel"
>
    <div class="flex items-center justify-between px-4 pb-2 pt-3">
        <h3 class="m-0 flex items-center gap-2 text-base font-bold">
            <IconArmchair font-size="18" />
            {$LL.world3d.places.title()}
        </h3>
        <button type="button" class="rounded-full p-1 hover:bg-white/10" aria-label="close" onclick={close}>
            <IconX font-size="18" />
        </button>
    </div>

    <div class="px-4 pb-2">
        <label class="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5">
            <IconSearch font-size="16" class="opacity-60" />
            <input
                type="text"
                class="w-full border-none bg-transparent p-0 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-0"
                placeholder={$LL.world3d.places.search()}
                data-testid="places-search"
                bind:value={search}
            />
        </label>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {#if $placesStore.length === 0}
            <p class="m-0 px-2 py-3 text-sm text-white/70">{$LL.world3d.places.empty()}</p>
        {:else if filteredPlaces.length === 0}
            <p class="m-0 px-2 py-3 text-sm text-white/70">{$LL.world3d.places.noResult()}</p>
        {/if}
        <ul class="m-0 list-none p-0">
            {#each filteredPlaces as place (place.id)}
                {@const KindIcon = kindIcons[place.kind]}
                <li>
                    <button
                        type="button"
                        class="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/10"
                        data-testid="place-item"
                        data-place-name={place.name}
                        onclick={() => travel(place)}
                    >
                        <span
                            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {kindColors[
                                place.kind
                            ]}"
                        >
                            <KindIcon font-size="18" />
                        </span>
                        <span class="flex min-w-0 flex-1 flex-col">
                            <span class="truncate text-sm font-semibold">{place.name}</span>
                            <span class="text-xs text-white/60">{$LL.world3d.places.kinds[place.kind]()}</span>
                        </span>
                        <span
                            class="rounded-md px-2 py-1 text-xs font-bold {$travelDestinationStore?.id === place.id
                                ? 'bg-secondary text-white'
                                : 'bg-white/10 text-white/80 group-hover:bg-secondary group-hover:text-white'}"
                        >
                            {$LL.world3d.places.travel()}
                        </span>
                    </button>
                </li>
            {/each}
        </ul>

        <div class="mt-2 border-t border-white/10 px-2 pt-3">
            <div class="text-xs font-bold uppercase tracking-wide text-white/60">
                {$LL.world3d.places.templates()}
            </div>
            <p class="m-0 mt-1 text-xs text-white/60">{$LL.world3d.places.templatesDescription()}</p>
            <div class="mt-2 grid grid-cols-1 gap-2">
                {#each MAP_TEMPLATE_IDS as id (id)}
                    <button
                        type="button"
                        class="flex items-center gap-3 rounded-lg bg-white/5 p-2 text-left hover:bg-white/10"
                        data-testid={`template-${id}`}
                        onclick={() => visitTemplate(id)}
                    >
                        <img
                            src={getMapTemplatePreviewUrl(id, window.location)}
                            alt=""
                            class="h-12 w-16 shrink-0 rounded object-cover [image-rendering:pixelated]"
                        />
                        <span class="flex min-w-0 flex-1 flex-col">
                            <span class="text-sm font-semibold">{$LL.world3d.templates[id].name()}</span>
                            <span class="line-clamp-2 text-xs text-white/60">
                                {$LL.world3d.templates[id].description()}
                            </span>
                        </span>
                        <span class="rounded-md bg-white/10 px-2 py-1 text-xs font-bold">
                            {$LL.world3d.places.visit()}
                        </span>
                    </button>
                {/each}
            </div>
        </div>
    </div>
</div>
