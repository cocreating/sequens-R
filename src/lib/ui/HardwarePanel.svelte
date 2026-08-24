<script lang="ts">
  import type { MidiManagerState } from '../midi/manager';

  interface Props {
    state: MidiManagerState;
    onconnect: () => void;
    onclock: (portId: string, enabled: boolean) => void;
  }

  let { state, onconnect, onclock }: Props = $props();
</script>

<section class="hardware-panel" data-app-help-key="hardware" aria-labelledby="hardware-heading">
  <div>
    <h2 id="hardware-heading">Hardware MIDI</h2>
    <p>MIDI access is optional. Internal sound and exports work without it.</p>
  </div>
  <button type="button" class="has-emoticon" data-app-help-key="connect-hardware" onclick={onconnect}><span class="button-emoticon" aria-hidden="true">{state.connected ? '🔄' : '🎛️'}</span>{state.connected ? 'Refresh hardware' : 'Connect hardware'}</button>
  {#if state.permission === 'denied'}
    <p class="midi-recovery" role="alert">MIDI access is blocked. Open this site’s permissions in the browser address bar, allow MIDI devices, then try again.</p>
  {/if}
  {#if state.connected && state.outputs.length === 0}
    <p class="midi-empty">No MIDI outputs found. Connect a device; it will appear here without a reload.</p>
  {/if}
  {#if state.outputs.length > 0}
    <ul class="midi-ports" aria-label="MIDI outputs">
      {#each state.outputs as output (output.id)}
        <li>
          <span>{output.name}{output.manufacturer ? ` · ${output.manufacturer}` : ''}</span>
          <span>{output.state}</span>
          <label data-app-help-key="midi-clock"><input type="checkbox" checked={state.clockPortIds.includes(output.id)} onchange={(event) => onclock(output.id, event.currentTarget.checked)} /> Send clock</label>
        </li>
      {/each}
    </ul>
  {/if}
</section>
