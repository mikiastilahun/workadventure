/**
 * Records a few seconds of the microphone track we actually send (after noise suppression), then plays them back:
 * the only way to hear yourself as others do. Recorded rather than looped back live, which would feed the speakers
 * into the microphone.
 */
export async function recordAndPlayBack(
    track: MediaStreamTrack,
    durationMs: number,
    speakerDeviceId: string | undefined,
    onPlaybackStart: () => void,
): Promise<void> {
    const recorder = new MediaRecorder(new MediaStream([track]));
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
        chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
    });
    recorder.start();
    await new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs);
    });
    recorder.stop();
    await stopped;

    const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
    try {
        const audio = new Audio(url);
        // Play on the speaker the user picked; Firefox and older Safari have no setSinkId
        if (speakerDeviceId && audio.setSinkId) {
            await audio.setSinkId(speakerDeviceId).catch(() => undefined);
        }
        onPlaybackStart();
        await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}
