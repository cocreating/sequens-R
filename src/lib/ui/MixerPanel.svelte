<script lang="ts">
  import { RACK_MIX_SCHEMA, SOUND_OUTPUT_SCHEMA, type RackMixState } from '../audio/sound';
  import type { MeterReading } from '../audio/rack-graph';
  import type { RackModule } from '../state/rack';
  import Knob from './Knob.svelte';

  const PAN_DEFINITION = SOUND_OUTPUT_SCHEMA.find(({ key }) => key === 'pan')!;
  const DELAY_DEFINITION = SOUND_OUTPUT_SCHEMA.find(({ key }) => key === 'delaySend')!;
  const REVERB_DEFINITION = SOUND_OUTPUT_SCHEMA.find(({ key }) => key === 'reverbSend')!;
  const METER_SEGMENTS = Array.from({ length: 12 }, (_, index) => 11 - index);

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
    showPan?: boolean;
    showSends?: boolean;
    ariaLabel?: string;
  }

  let { id, modules, mix, meters, masterMeter, onpatch, onsound, onmix, oncommit, showPan = true, showSends = true, ariaLabel = 'Rack mixer' }: Props = $props();

  function valueOf(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }

  function meterPercent(reading: MeterReading | undefined): number {
    return Math.max(0, Math.min(100, ((reading?.peakDbfs ?? -120) + 60) / 60 * 100));
  }

  function activeMeterSegments(reading: MeterReading | undefined): number {
    return Math.ceil(meterPercent(reading) / 100 * METER_SEGMENTS.length);
  }

  function meterDbfs(reading: MeterReading | undefined): number {
    return Math.max(-60, Math.min(0, reading?.peakDbfs ?? -60));
  }
</script>

<div class="mixer-panel" data-help-key="mixer" role="group" aria-label={ariaLabel}>
  <div class="mixer-channels">
    {#each modules as target (target.id)}
      <section class="mixer-channel" aria-label={`${target.name} channel`}>
        <div class="mixer-channel-heading">
          <strong>{target.name}</strong>
          <button type="button" data-help-key="mixer-solo" aria-label={`Solo ${target.name} from mixer`} aria-pressed={target.solo} onclick={() => onpatch(target.id, { solo: !target.solo })}>S</button>
          <button type="button" data-help-key="mixer-mute" aria-label={`Mute ${target.name} from mixer`} aria-pressed={target.mute} onclick={() => onpatch(target.id, { mute: !target.mute })}>M</button>
        </div>
        <div class="mixer-channel-level">
          <div class="mix-meter level-led-meter" role="meter" aria-label={`${target.name} peak ${Math.round(meters[target.id]?.peakDbfs ?? -120)} dBFS`} aria-valuemin="-60" aria-valuemax="0" aria-valuenow={meterDbfs(meters[target.id])}>
            {#each METER_SEGMENTS as segment (segment)}
              <span class="level-led" data-zone={segment >= 10 ? 'clip' : segment >= 8 ? 'warn' : 'safe'} data-active={segment < activeMeterSegments(meters[target.id])}></span>
            {/each}
          </div>
          <div class="mixer-level-control">
            <label for={`${id}-mix-level-${target.id}`}>Level</label>
            <input class="mixer-level-fader" id={`${id}-mix-level-${target.id}`} data-help-key="mixer-level" type="range" min="0" max="1" step="0.01" value={target.level} style:--fader-fill={`${target.level * 100}%`} aria-orientation="vertical" aria-valuetext={`${Math.round(target.level * 100)} percent`} oninput={(event) => onpatch(target.id, { level: valueOf(event) })} onchange={oncommit} />
            <output for={`${id}-mix-level-${target.id}`}>{Math.round(target.level * 100)}%</output>
          </div>
        </div>
        {#if showPan || showSends}
          <div class="mixer-channel-knobs" data-pan-visible={showPan}>
            {#if showPan}
              <Knob id={`${id}-mix-pan-${target.id}`} definition={PAN_DEFINITION} value={target.sound.pan} onchange={(value) => onsound(target.id, 'pan', value)} {oncommit} />
            {/if}
            {#if showSends}
              <Knob id={`${id}-mix-delay-${target.id}`} definition={DELAY_DEFINITION} value={target.sound.delaySend} onchange={(value) => onsound(target.id, 'delaySend', value)} {oncommit} />
              <Knob id={`${id}-mix-reverb-${target.id}`} definition={REVERB_DEFINITION} value={target.sound.reverbSend} onchange={(value) => onsound(target.id, 'reverbSend', value)} {oncommit} />
            {/if}
          </div>
        {/if}
      </section>
    {/each}
  </div>

  <section class="rack-master" aria-label="Rack master">
    <div class="rack-master-heading">
      <strong>Rack master</strong>
      <output>{Math.round(masterMeter.peakDbfs)} dBFS</output>
    </div>
    <div class="rack-master-controls">
      <div class="rack-master-meter">
        <span>Output</span>
        <div class="mix-meter master level-led-meter" role="meter" aria-label={`Master peak ${Math.round(masterMeter.peakDbfs)} dBFS`} aria-valuemin="-60" aria-valuemax="0" aria-valuenow={meterDbfs(masterMeter)}>
          {#each METER_SEGMENTS as segment (segment)}
            <span class="level-led" data-zone={segment >= 10 ? 'clip' : segment >= 8 ? 'warn' : 'safe'} data-active={segment < activeMeterSegments(masterMeter)}></span>
          {/each}
        </div>
      </div>
      {#each RACK_MIX_SCHEMA as definition (definition.key)}
        <Knob id={`${id}-rack-mix-${definition.key}`} {definition} value={mix[definition.key as keyof RackMixState]} onchange={(value) => onmix(definition.key as keyof RackMixState, value)} {oncommit} />
      {/each}
    </div>
  </section>
</div>
