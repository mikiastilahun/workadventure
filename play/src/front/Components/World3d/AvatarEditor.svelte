<script lang="ts">
    import { get } from "svelte/store";
    import { LL } from "../../../i18n/i18n-svelte";
    import type { AvatarConfig } from "../../World3d/Avatar/AvatarConfig";
    import {
        BODY_TYPES,
        BOTTOM_STYLES,
        CLOTHING_COLORS,
        EYEWEAR_STYLES,
        FACIAL_HAIR_STYLES,
        HAIR_COLORS,
        HAIR_STYLES,
        HEADWEAR_STYLES,
        randomAvatarConfig,
        SKIN_COLORS,
        TOP_STYLES,
    } from "../../World3d/Avatar/AvatarConfig";
    import { avatarConfigStore, avatarEditorVisibleStore } from "../../World3d/Stores/AvatarStore";
    import { IconDice, IconWalk, IconX } from "../Icons";
    import AvatarPreview from "./AvatarPreview.svelte";

    type OptionValue =
        | (typeof HAIR_STYLES)[number]
        | (typeof TOP_STYLES)[number]
        | (typeof BOTTOM_STYLES)[number]
        | (typeof HEADWEAR_STYLES)[number]
        | (typeof EYEWEAR_STYLES)[number]
        | (typeof FACIAL_HAIR_STYLES)[number]
        | (typeof BODY_TYPES)[number];

    type OptionField = {
        kind: "options";
        key: "bodyType" | "hairStyle" | "facialHair" | "topStyle" | "bottomStyle" | "headwear" | "eyewear";
        values: readonly OptionValue[];
    };
    type ColorField = {
        kind: "colors";
        key: "skinColor" | "hairColor" | "topColor" | "bottomColor" | "shoesColor" | "headwearColor";
        values: readonly string[];
    };
    type Field = OptionField | ColorField;
    type Section = { id: "body" | "hair" | "outfit" | "accessories"; fields: Field[] };

    const sections: Section[] = [
        {
            id: "body",
            fields: [
                { kind: "options", key: "bodyType", values: BODY_TYPES },
                { kind: "colors", key: "skinColor", values: SKIN_COLORS },
            ],
        },
        {
            id: "hair",
            fields: [
                { kind: "options", key: "hairStyle", values: HAIR_STYLES },
                { kind: "colors", key: "hairColor", values: HAIR_COLORS },
                { kind: "options", key: "facialHair", values: FACIAL_HAIR_STYLES },
            ],
        },
        {
            id: "outfit",
            fields: [
                { kind: "options", key: "topStyle", values: TOP_STYLES },
                { kind: "colors", key: "topColor", values: CLOTHING_COLORS },
                { kind: "options", key: "bottomStyle", values: BOTTOM_STYLES },
                { kind: "colors", key: "bottomColor", values: CLOTHING_COLORS },
                { kind: "colors", key: "shoesColor", values: CLOTHING_COLORS },
            ],
        },
        {
            id: "accessories",
            fields: [
                { kind: "options", key: "headwear", values: HEADWEAR_STYLES },
                { kind: "colors", key: "headwearColor", values: CLOTHING_COLORS },
                { kind: "options", key: "eyewear", values: EYEWEAR_STYLES },
            ],
        },
    ];

    let draft: AvatarConfig = $state({ ...get(avatarConfigStore) });
    let activeSection: Section["id"] = $state("body");
    let walking = $state(false);

    const currentSection = $derived(sections.find((section) => section.id === activeSection) ?? sections[0]);

    function setOption(key: OptionField["key"], value: OptionValue) {
        // Each field only accepts the values of its own list: look the value up in that list to keep strict types
        switch (key) {
            case "bodyType":
                draft.bodyType = BODY_TYPES.find((v) => v === value) ?? draft.bodyType;
                break;
            case "hairStyle":
                draft.hairStyle = HAIR_STYLES.find((v) => v === value) ?? draft.hairStyle;
                break;
            case "facialHair":
                draft.facialHair = FACIAL_HAIR_STYLES.find((v) => v === value) ?? draft.facialHair;
                break;
            case "topStyle":
                draft.topStyle = TOP_STYLES.find((v) => v === value) ?? draft.topStyle;
                break;
            case "bottomStyle":
                draft.bottomStyle = BOTTOM_STYLES.find((v) => v === value) ?? draft.bottomStyle;
                break;
            case "headwear":
                draft.headwear = HEADWEAR_STYLES.find((v) => v === value) ?? draft.headwear;
                break;
            case "eyewear":
                draft.eyewear = EYEWEAR_STYLES.find((v) => v === value) ?? draft.eyewear;
                break;
        }
    }

    function setColor(key: ColorField["key"], value: string) {
        draft[key] = value;
    }

    function randomize() {
        draft = randomAvatarConfig();
    }

    function close() {
        avatarEditorVisibleStore.set(false);
    }

    function save() {
        avatarConfigStore.set({ ...draft });
        close();
    }

    function onKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            close();
        }
    }
</script>

<svelte:window onkeydown={onKeyDown} />

<div
    class="pointer-events-auto fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-6"
    data-testid="avatar-editor"
    role="dialog"
    aria-modal="true"
    aria-labelledby="avatar-editor-title"
>
    <div
        class="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-contrast/95 text-white shadow-2xl sm:flex-row"
    >
        <div
            class="relative h-64 shrink-0 bg-gradient-to-b from-sky-400/40 to-emerald-300/20 sm:h-auto sm:min-h-[460px] sm:w-2/5"
        >
            <AvatarPreview config={draft} {walking} />
            <div class="absolute bottom-3 left-0 right-0 flex flex-col items-center gap-2 px-3">
                <p class="m-0 text-center text-xs text-white/80">{$LL.world3d.avatar.rotateHint()}</p>
                <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors {walking
                        ? 'bg-secondary text-white'
                        : 'bg-black/30 text-white/90 hover:bg-black/40'}"
                    aria-pressed={walking}
                    data-testid="avatar-preview-walk"
                    onclick={() => (walking = !walking)}
                >
                    <IconWalk font-size="16" />
                    {$LL.world3d.avatar.walk()}
                </button>
            </div>
        </div>
        <div class="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <h2 id="avatar-editor-title" class="m-0 text-xl font-bold">{$LL.world3d.avatar.title()}</h2>
                    <p class="m-0 mt-1 text-sm text-white/70">{$LL.world3d.avatar.subtitle()}</p>
                </div>
                <button
                    type="button"
                    class="rounded-full p-2 hover:bg-white/10"
                    aria-label={$LL.world3d.avatar.cancel()}
                    onclick={close}
                >
                    <IconX font-size="20" />
                </button>
            </div>

            <div class="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-white/5 p-1" role="tablist">
                {#each sections as section (section.id)}
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeSection === section.id}
                        data-testid={`avatar-section-${section.id}`}
                        class="flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors {activeSection ===
                        section.id
                            ? 'bg-secondary text-white'
                            : 'text-white/70 hover:bg-white/10'}"
                        onclick={() => (activeSection = section.id)}
                    >
                        {$LL.world3d.avatar.sections[section.id]()}
                    </button>
                {/each}
            </div>

            <div class="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                {#each currentSection.fields as field (field.key)}
                    <div>
                        <div class="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
                            {$LL.world3d.avatar.fields[field.key]()}
                        </div>
                        {#if field.kind === "options"}
                            <div class="flex flex-wrap gap-2">
                                {#each field.values as value (value)}
                                    <button
                                        type="button"
                                        data-testid={`avatar-option-${field.key}-${value}`}
                                        class="rounded-full border px-3 py-1 text-sm transition-colors {draft[
                                            field.key
                                        ] === value
                                            ? 'border-secondary bg-secondary/30 text-white'
                                            : 'border-white/20 text-white/80 hover:border-white/50'}"
                                        onclick={() => setOption(field.key, value)}
                                    >
                                        {$LL.world3d.avatar.options[value]()}
                                    </button>
                                {/each}
                            </div>
                        {:else}
                            <div class="flex flex-wrap gap-2">
                                {#each field.values as color (color)}
                                    <button
                                        type="button"
                                        data-testid={`avatar-color-${field.key}-${color.slice(1)}`}
                                        aria-label={color}
                                        class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 {draft[
                                            field.key
                                        ] === color
                                            ? 'scale-110 border-white ring-2 ring-secondary'
                                            : 'border-white/20'}"
                                        style="background-color: {color}"
                                        onclick={() => setColor(field.key, color)}
                                    ></button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>

            <div class="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-4">
                <button
                    type="button"
                    class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white/10"
                    data-testid="avatar-randomize"
                    onclick={randomize}
                >
                    <IconDice font-size="18" />
                    {$LL.world3d.avatar.randomize()}
                </button>
                <div class="flex gap-2">
                    <button
                        type="button"
                        class="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-white/10"
                        onclick={close}
                    >
                        {$LL.world3d.avatar.cancel()}
                    </button>
                    <button
                        type="button"
                        class="rounded-lg bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary-600"
                        data-testid="avatar-save"
                        onclick={save}
                    >
                        {$LL.world3d.avatar.save()}
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
