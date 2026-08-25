<script lang="ts">
  import type { ModuleType } from '../core/pattern';
  import {
    isLegacySound,
    presetsFor,
    SOUND_OUTPUT_SCHEMA,
    SOUND_PARAM_SCHEMAS,
    type SoundState,
  } from '../audio/sound';
  import Knob from './Knob.svelte';

  interface Props {
    moduleId: string;
    moduleType: ModuleType;
    sound: SoundState;
    onparam: (key: string, value: number) => void;
    oncommit: () => void;
    onpreset: (presetId: string) => void;
    onupgrade: () => void;
  }

  let { moduleId, moduleType, sound, onparam, oncommit, onpreset, onupgrade }: Props = $props();
  let schema = $derived(SOUND_PARAM_SCHEMAS[moduleType]);
  let presets = $derived(presetsFor(moduleType));
  let silent = $derived(moduleType === 'mixer' || moduleType === 'cc' || moduleType === 'mod');
  let presetLabel = $derived(moduleType === 'drums' ? 'Kit' : moduleType === 'euclid' ? 'Palette' : 'Preset');
</script>

<details class="sound-panel">
  <summary>Sound</summary>
  <div class="sound-panel-content">
    <div class="sound-preset-row">
      <label for={`${moduleId}-sound-preset`}>{presetLabel}</label>
      <select
        id={`${moduleId}-sound-preset`}
        value={sound.presetId}
        onchange={(event) => onpreset(event.currentTarget.value)}
      >
        {#each presets as preset (preset.id)}
          <option value={preset.id}>{preset.label}</option>
        {/each}
      </select>
      {#if isLegacySound(sound)}
        <button type="button" class="upgrade-sound" onclick={onupgrade}>Upgrade sound</button>
      {/if}
    </div>

    {#if silent}
      <p class="silent-sound-note">Silent control module · no internal voice, panorama, or effect sends.</p>
    {:else}
      <div class="parameters sound-parameters">
        {#each schema as definition (definition.key)}
          <Knob
            id={`${moduleId}-sound-${definition.key}`}
            {definition}
            helpKey={`sound:${moduleType}:${definition.key}`}
            value={sound.params[definition.key] ?? definition.defaultValue}
            onchange={(value) => onparam(definition.key, value)}
            {oncommit}
          />
        {/each}
        {#each SOUND_OUTPUT_SCHEMA as definition (definition.key)}
          <Knob
            id={`${moduleId}-sound-${definition.key}`}
            {definition}
            helpKey={`sound:output:${definition.key}`}
            value={sound[definition.key as 'pan' | 'delaySend' | 'reverbSend']}
            onchange={(value) => onparam(definition.key, value)}
            {oncommit}
          />
        {/each}
      </div>
    {/if}
  </div>
</details>
