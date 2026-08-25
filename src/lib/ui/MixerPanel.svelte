<script lang="ts">
  import { RACK_MIX_SCHEMA, type RackMixState } from '../audio/sound';
  import type { MeterReading } from '../audio/rack-graph';
  import type { RackModule } from '../state/rack';
  import Knob from './Knob.svelte';

  interface Props {
    id: string;
    modules: readonly RackModule[];
    mix: RackMixState;
    meters: Readonly<Record<string, MeterReading>>;
    masterMeter: MeterReading;
    onpatch: (id: string, patch: Partial<RackModule>) => void;
    onsound: (id: string, key: string, value: number) => void;
    onmix: (key: keyof RackMixState, value: number) => void;
    oncommit: () => void;
  }

  let { id, modules, mix, meters, masterMeter, onpatch, onsound, onmix, oncommit }: Props = $props();

  function valueOf(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }

  function meterPercent(reading: MeterReading | undefined): number {
    return Math.max(0, Math.min(100, ((reading?.peakDbfs ?? -120) + 60) / 60 * 100));
  }
</script>

<div class="mixer-panel" data-help-key="mixer" role="group" aria-label="Module mixer">
  <div class="mixer-channels">
    {#each modules.filter((module) => module.type !== 'mixer') as target (target.id)}
      <section class="mixer-channel" aria-label={`${target.name} channel`}>
        <div class="mixer-channel-heading">
          <strong>{target.name}</strong>
          <button type="button" data-help-key="mixer-solo" aria-label={`Solo ${target.name} from mixer`} aria-pressed={target.solo} onclick={() => onpatch(target.id, { solo: !target.solo })}>S</button>
          <button type="button" data-help-key="mixer-mute" aria-label={`Mute ${target.name} from mixer`} aria-pressed={target.mute} onclick={() => onpatch(target.id, { mute: !target.mute })}>M</button>
        </div>
        <div class="mix-meter" aria-label={`${target.name} peak ${Math.round(meters[target.id]?.peakDbfs ?? -120)} dBFS`}>
          <span style:width={`${meterPercent(meters[target.id])}%`}></span>
        </div>
        <div class="mixer-channel-controls">
          <label for={`${id}-mix-level-${target.id}`}>Level</label>
          <input id={`${id}-mix-level-${target.id}`} data-help-key="mixer-level" type="range" min="0" max="1" step="0.01" value={target.level} aria-valuetext={`${Math.round(target.level * 100)} percent`} oninput={(event) => onpatch(target.id, { level: valueOf(event) })} onchange={oncommit} />
          <label for={`${id}-mix-pan-${target.id}`}>Pan</label>
          <input id={`${id}-mix-pan-${target.id}`} type="range" min="-100" max="100" step="1" value={target.sound.pan} oninput={(event) => onsound(target.id, 'pan', valueOf(event))} onchange={oncommit} />
          <label for={`${id}-mix-delay-${target.id}`}>Delay</label>
          <input id={`${id}-mix-delay-${target.id}`} type="range" min="0" max="100" step="1" value={target.sound.delaySend} oninput={(event) => onsound(target.id, 'delaySend', valueOf(event))} onchange={oncommit} />
          <label for={`${id}-mix-reverb-${target.id}`}>Reverb</label>
          <input id={`${id}-mix-reverb-${target.id}`} type="range" min="0" max="100" step="1" value={target.sound.reverbSend} oninput={(event) => onsound(target.id, 'reverbSend', valueOf(event))} onchange={oncommit} />
        </div>
      </section>
    {/each}
  </div>

  <section class="rack-master" aria-label="Rack master">
    <div class="rack-master-heading">
      <strong>Rack master</strong>
      <output>{Math.round(masterMeter.peakDbfs)} dBFS</output>
    </div>
    <div class="mix-meter master" aria-label={`Master peak ${Math.round(masterMeter.peakDbfs)} dBFS`}>
      <span style:width={`${meterPercent(masterMeter)}%`}></span>
    </div>
    <div class="rack-master-controls">
      {#each RACK_MIX_SCHEMA as definition (definition.key)}
        <Knob id={`${id}-rack-mix-${definition.key}`} {definition} value={mix[definition.key as keyof RackMixState]} onchange={(value) => onmix(definition.key as keyof RackMixState, value)} {oncommit} />
      {/each}
    </div>
  </section>
</div>
