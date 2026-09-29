import { get, writable } from "svelte/store";
import type { AvatarConfig } from "../Avatar/AvatarConfig";
import { parseAvatarConfig, randomAvatarConfig } from "../Avatar/AvatarConfig";

const STORAGE_KEY = "world3d.avatar";
const CUSTOMIZED_STORAGE_KEY = "world3d.avatarCustomized";

function loadAvatar(): AvatarConfig {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? parseAvatarConfig(JSON.parse(stored)) : undefined;
        if (parsed) {
            return parsed;
        }
    } catch (e) {
        console.warn("Could not read the stored 3D avatar", e);
    }
    // First visit: a random avatar right away. It is dressed like the Woka as soon as the Woka is known.
    const avatar = randomAvatarConfig();
    saveAvatar(avatar);
    return avatar;
}

function saveAvatar(avatar: AvatarConfig): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(avatar));
    } catch {
        // Storage unavailable: the avatar is still broadcast for this session.
    }
}

function readCustomized(): boolean {
    try {
        return localStorage.getItem(CUSTOMIZED_STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

function createAvatarConfigStore() {
    const store = writable<AvatarConfig>(loadAvatar());
    const customized = writable(readCustomized());
    return {
        subscribe: store.subscribe,
        /** True once the user saved an avatar in the 3D avatar editor */
        customized: { subscribe: customized.subscribe },
        /**
         * An avatar chosen by the user in the avatar editor. From then on, the avatar does not follow the Woka anymore.
         */
        set(avatar: AvatarConfig) {
            saveAvatar(avatar);
            store.set(avatar);
            customized.set(true);
            try {
                localStorage.setItem(CUSTOMIZED_STORAGE_KEY, "true");
            } catch {
                // Only kept for this session
            }
        },
        /**
         * An avatar computed from the Woka of the user. Ignored if the user customized their 3D avatar.
         */
        setFromWoka(avatar: AvatarConfig) {
            if (get(customized)) {
                return;
            }
            saveAvatar(avatar);
            store.set(avatar);
        },
    };
}

/**
 * The 3D avatar of the current user. It is persisted locally and broadcast to the other players as a public player
 * variable (see World3dController). Until the user customizes it, it wears the colors of their Woka.
 */
export const avatarConfigStore = createAvatarConfigStore();

export const avatarEditorVisibleStore = writable(false);
