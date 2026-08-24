<script lang="ts">
  interface Props {
    playing: boolean;
    bpm: number;
    beats?: number;
    syncBeat?: number | null;
    className?: string;
  }

  let { playing, bpm, beats = 4, syncBeat = 0, className = '' }: Props = $props();
  let element: HTMLDivElement;

  $effect(() => {
    const active = playing;
    const tempo = bpm;
    const cycleBeats = Math.max(0.25, beats);
    const correctionBeat = syncBeat ?? 0;
    if (!active || !Number.isFinite(tempo) || tempo <= 0) {
      if (typeof element.getAnimations === 'function') element.getAnimations().forEach((animation) => animation.cancel());
      element.style.transform = 'translateX(-100%)';
      return;
    }

    const duration = cycleBeats * 60 / tempo * 1000;
    const offset = ((correctionBeat % cycleBeats) + cycleBeats) % cycleBeats * 60 / tempo * 1000;
    if (typeof element.animate === 'function') {
      const animation = element.animate(
        [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }],
        { duration, iterations: Number.POSITIVE_INFINITY, easing: 'linear' },
      );
      animation.currentTime = offset;
      return () => animation.cancel();
    }

    let frame = 0;
    const startedAt = performance.now() - offset;
    const render = (now: number): void => {
      const progress = ((now - startedAt) % duration) / duration;
      element.style.transform = `translateX(${(progress - 1) * 100}%)`;
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div bind:this={element} class={`compositor-playhead ${className}`} aria-hidden="true"></div>
