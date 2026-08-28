<script lang="ts">
  import type { ScaleName } from '../core/pattern';
  import Transport from './Transport.svelte';

  interface Props {
    bpm: number;
    root: number;
    scale: ScaleName;
    ontap: () => void;
    oninterest: (event: PointerEvent | FocusEvent) => void;
    onbpm: (value: number) => void;
    onbpmcommit: () => void;
    onkey: (root: number, scale: ScaleName) => void;
  }

  let { bpm, root, scale, ontap, oninterest, onbpm, onbpmcommit, onkey }: Props = $props();
</script>

<div class="header-initial-core-actions" role="group" aria-label="Global timing and musical key" onpointermove={oninterest} onfocusin={oninterest}>
  <Transport {bpm} {root} {scale} {ontap} {onbpm} {onbpmcommit} {onkey} />
</div>
