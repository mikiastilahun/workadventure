<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import * as THREE from "three";
    import type { AvatarConfig } from "../../World3d/Avatar/AvatarConfig";
    import { AvatarModel } from "../../World3d/Models/AvatarModel";
    import { ModelToolkit } from "../../World3d/Models/Materials";

    interface Props {
        config: AvatarConfig;
        walking?: boolean;
    }

    let { config, walking = false }: Props = $props();

    let container: HTMLDivElement | undefined = $state();
    let canvas: HTMLCanvasElement | undefined = $state();
    let renderer: THREE.WebGLRenderer | undefined;
    let model: AvatarModel | undefined;
    let animationFrame: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let dragStartX: number | undefined;
    let yaw = 0.5;
    let autoRotate = true;
    const toolkit = new ModelToolkit();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const clock = new THREE.Clock();

    onMount(() => {
        if (!canvas || !container) {
            return;
        }
        try {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        } catch (e) {
            console.error("Could not create the avatar preview", e);
            return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.shadowMap.enabled = true;

        scene.add(new THREE.HemisphereLight("#ffffff", "#8a7a66", 1.3));
        const light = new THREE.DirectionalLight("#fff4e0", 2);
        light.position.set(2, 4, 3);
        light.castShadow = true;
        scene.add(light);
        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(0.7, 40),
            new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.25 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        model = new AvatarModel(toolkit, config);
        model.root.traverse((object) => {
            object.castShadow = true;
        });
        scene.add(model.root);
        camera.position.set(0, 1.0, 3.4);
        camera.lookAt(0, 0.62, 0);

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();
        loop();
    });

    function resize() {
        if (!renderer || !container) {
            return;
        }
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width === 0 || height === 0) {
            return;
        }
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    function loop() {
        animationFrame = requestAnimationFrame(loop);
        const delta = Math.min(clock.getDelta(), 0.1);
        if (!model || !renderer) {
            return;
        }
        if (autoRotate) {
            yaw += delta * 0.4;
        }
        model.faceImmediately(yaw);
        model.update(delta, walking);
        renderer.render(scene, camera);
    }

    $effect(() => {
        model?.setConfig(config);
        model?.root.traverse((object) => {
            object.castShadow = true;
        });
    });

    function onPointerDown(event: PointerEvent) {
        dragStartX = event.clientX;
        autoRotate = false;
        canvas?.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
        if (dragStartX === undefined) {
            return;
        }
        yaw += (event.clientX - dragStartX) * 0.012;
        dragStartX = event.clientX;
    }

    function onPointerUp(event: PointerEvent) {
        dragStartX = undefined;
        canvas?.releasePointerCapture(event.pointerId);
    }

    onDestroy(() => {
        if (animationFrame !== undefined) {
            cancelAnimationFrame(animationFrame);
        }
        resizeObserver?.disconnect();
        model?.dispose();
        toolkit.dispose();
        renderer?.dispose();
    });
</script>

<div bind:this={container} class="relative h-full w-full overflow-hidden">
    <!-- Absolutely positioned: the size of the drawing buffer must never feed back into the size of the container -->
    <canvas
        bind:this={canvas}
        class="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
        data-testid="avatar-preview"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
    ></canvas>
</div>
