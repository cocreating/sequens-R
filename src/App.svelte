<script lang="ts">
  import { loadRackFromFragment } from './lib/share/fragment';
  import { STARTER_RACK } from './lib/share/starter';

  let loadState = $state<'loading' | 'ready' | 'invalid'>('loading');
  let moduleCount = $state(STARTER_RACK.modules.length);
  let loadMessage = $state('Loading local patch…');

  $effect(() => {
    void loadRackFromFragment(window.location.hash)
      .then((rack) => {
        moduleCount = (rack ?? STARTER_RACK).modules.length;
        loadMessage = rack ? 'Shared patch loaded locally' : 'Starter rack ready';
        loadState = 'ready';
      })
      .catch(() => {
        loadMessage = 'This patch version cannot be opened.';
        loadState = 'invalid';
      });
  });
</script>

<svelte:head>
  <title>sequens-R · generative MIDI sequencer</title>
</svelte:head>

<main>
  <header class="masthead">
    <p class="eyebrow">Local generative MIDI</p>
    <h1>sequens<span>-</span>R</h1>
  </header>

  <section class="foundation" aria-labelledby="foundation-title">
    <div>
      <p class="status" data-state={loadState}>{loadMessage}</p>
      <h2 id="foundation-title">The foundations are in place.</h2>
      <p>Deterministic patterns, compact link patches, offline installation and an isolated audio-ready context.</p>
    </div>
    <dl>
      <div><dt>Modules</dt><dd>{moduleCount}</dd></div>
      <div><dt>Schema</dt><dd>01</dd></div>
      <div><dt>Network</dt><dd>Local</dd></div>
    </dl>
  </section>

  {#if !crossOriginIsolated}
    <p class="warning" role="alert">Cross-origin isolation is unavailable. Run through the local Vite server.</p>
  {/if}
</main>
