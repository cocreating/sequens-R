import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Phase 5 polish', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('captures and launches a scene at the shared transport boundary', async ({ page }) => {
    await page.goto('/');
    const drums = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'drums module name' }) });
    await drums.getByRole('button', { name: 'Drums slot 2' }).click();
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Capture scene' }).click();
    await expect(page.getByLabel('Scene 1 name')).toHaveValue('Scene 1');
    await page.getByLabel('Scene 1 name').fill('Drop');
    await page.getByRole('button', { name: 'Close workspace' }).click();
    await drums.getByRole('button', { name: 'Drums slot 3' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Launch Drop' }).click();
    await expect(page.getByText('Drop queued for the next bar')).toBeVisible();
    await expect(drums.getByRole('button', { name: 'Drums slot 2' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Pause' }).click();
  });

  test('integrates available Chromium scheduling, session, transition, wake-lock, and diagnostics APIs', async ({ page }) => {
    await page.addInitScript(() => {
      const state = { tasks: 0, transitions: 0, wakeRequests: 0, wakeReleases: 0, actions: [] as string[] };
      (window as typeof window & { __phase5Apis?: typeof state }).__phase5Apis = state;
      Object.defineProperty(window, 'scheduler', { configurable: true, value: {
        postTask: async (callback: () => unknown) => { state.tasks += 1; return callback(); },
      } });
      Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (callback: () => unknown) => {
        state.transitions += 1;
        const updateCallbackDone = Promise.resolve(callback());
        return { finished: updateCallbackDone, ready: Promise.resolve(), updateCallbackDone, skipTransition: () => undefined };
      } });
      Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: {
        metadata: null,
        playbackState: 'none',
        setActionHandler: (action: string) => state.actions.push(action),
        setPositionState: () => undefined,
      } });
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
        request: async () => {
          state.wakeRequests += 1;
          return Object.assign(new EventTarget(), {
            released: false,
            release: async function () { this.released = true; state.wakeReleases += 1; },
          });
        },
      } });
      const renderCapacity = Object.assign(new EventTarget(), {
        start: function () {
          window.setTimeout(() => this.dispatchEvent(Object.assign(new Event('update'), {
            averageLoad: 0.24,
            peakLoad: 0.42,
            underrunRatio: 0,
          })), 10);
        },
        stop: () => undefined,
        averageLoad: 0.24,
        peakLoad: 0.42,
        underrunRatio: 0,
      });
      Object.defineProperty(AudioContext.prototype, 'renderCapacity', { configurable: true, get: () => renderCapacity });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Module', exact: true }).click();
    await page.locator('.module-choice[data-module-type="acid"]').click();
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Close workspace' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Transport playing')).toBeVisible();
    await page.waitForTimeout(350);
    const state = await page.evaluate(() => (window as typeof window & { __phase5Apis: { tasks: number; transitions: number; wakeRequests: number; actions: string[] } }).__phase5Apis);
    expect(state.tasks).toBeGreaterThan(0);
    expect(state.transitions).toBeGreaterThan(0);
    expect(state.wakeRequests).toBe(1);
    expect(state.actions).toEqual(expect.arrayContaining(['play', 'pause', 'stop']));
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByText('Diagnostics', { exact: true }).click();
    await expect(page.getByText('Average render load').locator('..').getByText('0.240')).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
  });

  test('keeps core flows working when Phase 5 APIs are absent', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));
    await page.addInitScript(() => {
      Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
      Object.defineProperty(window, 'scheduler', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
      Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: undefined });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Module', exact: true }).click();
    await page.locator('.module-choice[data-module-type="acid"]').click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Transport playing')).toBeVisible();
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByText('Diagnostics', { exact: true }).click();
    await expect(page.getByText('Render Capacity API is unavailable')).toBeVisible();
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Pause' }).click();
  });

  test('supports keyboard rack navigation and piano-note authoring', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'New rack' }).click();
    const activeTab = page.getByRole('tab', { selected: true });
    await activeTab.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { selected: true })).toContainText('Rack 1');
    await page.getByRole('button', { name: 'Close workspace' }).click();
    await page.getByRole('button', { name: 'Add Module', exact: true }).click();
    await page.locator('.module-choice[data-module-type="piano"]').click();
    const piano = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'piano module name' }) });
    await expect(piano.getByRole('button', { name: 'Add note' }).locator('svg')).toBeVisible();
    await piano.getByRole('button', { name: 'Add note' }).click();
    await expect(piano.locator('.piano-note')).toHaveCount(1);
    await piano.locator('.piano-note').focus();
    await page.keyboard.press('ArrowRight');
    await expect(piano.locator('.piano-note')).toHaveAttribute('aria-label', /step 2/u);
  });

  test('provides general contextual help across the app', async ({ page }) => {
    await page.goto('/');
    const readout = page.locator('#app-help-readout');

    await page.getByRole('button', { name: 'Turn on general help' }).click();
    await expect(readout).toBeVisible();
    await expect(readout.getByRole('heading')).toHaveText('General Help');

    await page.getByRole('button', { name: 'Play', exact: true }).hover();
    await expect(readout.getByRole('heading')).toHaveText('Play');
    await expect(readout).toContainText('audio scheduler');

    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Capture scene' }).focus();
    await expect(readout.getByRole('heading')).toHaveText('Capture scene');

    await page.getByRole('heading', { name: 'Hardware MIDI' }).hover();
    await expect(readout.getByRole('heading')).toHaveText('Hardware MIDI');

    await page.getByRole('button', { name: 'Rack MIDI' }).focus();
    await expect(readout.getByRole('heading')).toHaveText('Rack MIDI');

    await page.getByRole('button', { name: 'Close workspace' }).click();
    const drums = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'drums module name' }) });
    await drums.hover();
    await expect(readout.getByRole('heading')).toHaveText('Module panel');

    await page.keyboard.press('Escape');
    await expect(readout).toBeHidden();
    await expect(page.getByRole('button', { name: 'Turn on general help' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('keeps the global header compact and responsive', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.brand p')).toBeVisible();
    await expect(page.locator('.brand-title-full')).toBeVisible();
    await expect(page.locator('.brand-title-compact')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Tap BPM' })).toHaveText('TAB');
    await expect(page.locator('.header-play svg')).toBeVisible();
    await expect(page.locator('.header-play svg')).toHaveAttribute('data-tone', 'positive');
    await expect(page.getByRole('button', { name: 'Stop' }).locator('svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop' }).locator('svg')).toHaveAttribute('data-tone', 'danger');
    await expect(page.getByRole('button', { name: 'Share' }).locator('svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share' }).locator('svg')).toHaveAttribute('data-tone', 'navigation');
    await expect(page.locator('.app-help-toggle svg')).toBeVisible();
    await expect(page.locator('.app-help-toggle svg')).toHaveAttribute('data-tone', 'help');
    await expect(page.getByRole('button', { name: 'Random' }).locator('svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Random' }).locator('svg')).toHaveAttribute('data-tone', 'creative');
    const addModule = page.getByRole('button', { name: 'Add Module', exact: true });
    await expect(addModule).toContainText('Add Module');
    await expect(page.locator('.app-header-controls')).toContainText('Add Module');
    expect(await addModule.evaluate((button) => button.closest('.app-header-controls') !== null)).toBe(true);

    await addModule.click();
    await expect(page.getByRole('dialog', { name: 'Add a module' })).toBeVisible();
    await expect(page.locator('.module-choice')).toHaveCount(11);
    await expect(page.locator('.module-choice[data-module-type="acid"]')).toContainText('Resonant 303-style melodic sequence');
    await page.getByRole('button', { name: 'Close module library' }).click();

    const actionTops = await page.locator('.app-header-controls > button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
    expect(new Set(actionTops).size).toBe(1);
    const actionNames = await page.locator('.app-header-controls > button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    expect(actionNames).toEqual(['Workspace', 'Mixer', 'Add Module', 'Random', 'Stop', 'Share', 'Turn on general help', 'Play']);
    const headerControls = page.locator('.app-header > .app-header-controls');
    await expect(headerControls).toBeVisible();
    await expect(page.locator('.app-header .transport-fields')).toHaveCount(1);
    await expect(page.locator('main .transport-fields')).toHaveCount(0);

    const tempoTrigger = headerControls.getByRole('button', { name: /^Tempo \d+ BPM$/u });
    const [desktopTapBox, desktopTempoBox] = await Promise.all([
      headerControls.getByRole('button', { name: 'Tap BPM' }).boundingBox(),
      tempoTrigger.boundingBox(),
    ]);
    expect(desktopTapBox!.x + desktopTapBox!.width).toBeLessThanOrEqual(desktopTempoBox!.x);
    await expect(headerControls.locator('.transport-fields > button')).toHaveCount(3);
    await expect(headerControls.locator('.transport-fields > button svg')).toHaveCount(2);
    expect(await headerControls.locator('.transport-fields > button').allTextContents()).toEqual(['TAB', '', '']);
    await expect(headerControls.locator('.transport-fields select')).toHaveCount(0);
    await tempoTrigger.click();
    const tempo = page.locator('#tempo');
    await expect(tempo).toHaveAttribute('step', '1');
    await expect(page.getByRole('button', { name: 'Decrease BPM' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Increase BPM' })).toHaveCount(0);
    const tempoSlider = page.getByRole('slider', { name: 'Adjust BPM' });
    await expect(tempoSlider).toBeVisible();
    await tempoSlider.focus();
    await page.keyboard.press('ArrowUp');
    await expect(tempo).toHaveValue('119');
    await tempo.fill('118');
    const fieldTops = await page.locator('.transport-fields > button').evaluateAll((fields) => fields.map((field) => field.getBoundingClientRect().top));
    expect(new Set(fieldTops).size).toBe(1);
    await page.getByRole('button', { name: 'Close tempo controls' }).click();
    await headerControls.getByRole('button', { name: 'Key C minor' }).click();
    const keyPanel = page.getByRole('dialog', { name: 'Root & scale' });
    await keyPanel.getByRole('group', { name: 'Root note' }).getByRole('button', { name: 'D', exact: true }).click();
    await expect(keyPanel).toBeVisible();
    await keyPanel.getByRole('group', { name: 'Scale' }).getByRole('button', { name: 'dorian', exact: true }).click();
    await expect(headerControls.getByRole('button', { name: 'Key D dorian' })).toBeVisible();
    await expect(keyPanel).toBeVisible();
    await page.getByRole('button', { name: 'Close key controls' }).click();
    await page.getByRole('button', { name: 'Tap BPM' }).click();
    await expect(page.getByText('Tap tempo · tap again')).toBeVisible();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Tap BPM' }).click();
    expect(await tempo.inputValue()).toMatch(/^\d+$/u);
    await expect(page.getByText(/Tap tempo · \d+ BPM/u)).toBeVisible();

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true }).locator('svg')).toBeVisible();
    await expect(page.getByText('Transport playing')).toBeVisible();
    await expect.poll(async () => Number(await page.locator('.bar-progress').getAttribute('data-sync-beat'))).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const pausedBeat = Number(await page.locator('.bar-progress').getAttribute('data-sync-beat'));
    expect(pausedBeat).toBeGreaterThan(0);
    await expect(page.locator('.bar-progress')).toHaveAttribute('data-playhead-state', 'paused');
    const frozenStepPlayhead = page.locator('.step-grid .compositor-playhead').first();
    await expect(frozenStepPlayhead).toHaveAttribute('data-playhead-state', 'paused');
    expect(await frozenStepPlayhead.evaluate((playhead) => (playhead as HTMLElement).style.transform)).not.toBe('translateX(-100%)');
    await expect(page.getByRole('button', { name: 'Play', exact: true }).locator('svg')).toBeVisible();
    await expect(page.getByText('Transport paused')).toBeVisible();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true }).locator('svg')).toBeVisible();
    expect(Number(await page.locator('.bar-progress').getAttribute('data-sync-beat'))).toBeCloseTo(pausedBeat, 3);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.locator('.bar-progress')).toHaveAttribute('data-sync-beat', '');
    await expect(frozenStepPlayhead).toHaveAttribute('data-playhead-state', 'stopped');

    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.brand p')).toBeHidden();
    await expect(page.locator('.brand-title-full')).toBeHidden();
    await expect(page.locator('.brand-title-compact')).toBeVisible();
    await expect(page.locator('.brand-title-compact')).toHaveCSS('border-radius', '50%');
    expect(await page.getByRole('heading', { name: 'sequens-R' }).evaluate((heading) => (heading as HTMLElement).innerText)).toBe('s-R');
    const mobileHeaderControls = await headerControls.boundingBox();
    expect(mobileHeaderControls).not.toBeNull();
    expect(mobileHeaderControls!.x + mobileHeaderControls!.width).toBeLessThanOrEqual(375);
    const mobileControlSelector = '.app-header-controls > .transport-fields > button, .app-header-controls > button';
    const mobileOrder = await page.locator(mobileControlSelector).evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    expect(mobileOrder[0]).toBe('Tap BPM');
    expect(mobileOrder[1]).toMatch(/^Tempo \d+ BPM$/u);
    expect(mobileOrder.slice(2)).toEqual(['Key D dorian', 'Workspace', 'Mixer', 'Add Module', 'Random', 'Stop', 'Share', 'Turn on general help', 'Play']);
    expect(mobileOrder.at(-1)).toBe('Play');
    const mobileControlHeights = await page.locator(mobileControlSelector).evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(new Set(mobileControlHeights).size).toBe(1);
    const mobileControlRows = await page.locator(mobileControlSelector).evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
    expect(new Set(mobileControlRows).size).toBeGreaterThan(1);
    await expect(page.locator('.app-header .transport-fields')).toBeVisible();
    await expect(page.locator('main .transport-fields')).toHaveCount(0);
    const [mobileTapBox, mobileTempoBox] = await Promise.all([
      headerControls.getByRole('button', { name: 'Tap BPM' }).boundingBox(),
      headerControls.getByRole('button', { name: /^Tempo \d+ BPM$/u }).boundingBox(),
    ]);
    expect(mobileTapBox!.x + mobileTapBox!.width).toBeLessThanOrEqual(mobileTempoBox!.x);

    await expect(page.locator('.app-header')).toHaveCSS('position', 'sticky');
    await expect(page.locator('.performance-deck')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Scroll to top' })).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 500));
    await expect(page.getByRole('button', { name: 'Scroll to top' })).toBeVisible();
    expect((await page.locator('.app-header').boundingBox())!.y).toBeCloseTo(0, 0);
    await page.getByRole('button', { name: 'Scroll to top' }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('uses compact Heroicons for recognizable workspace actions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Workspace', exact: true }).locator('svg')).toBeVisible();
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();

    const iconActions = ['Undo', 'Redo', 'Save', 'Export', 'Demos projects', 'New rack', 'Duplicate rack', 'Capture scene', 'Connect hardware', 'Refresh outputs', 'Rack MIDI', 'Mix WAV', 'WAV stems'] as const;

    for (const name of iconActions) {
      await expect(page.getByRole('button', { name, exact: true }).locator('svg')).toBeVisible();
    }
    await expect(page.locator('.import-project svg')).toBeVisible();
    await expect(page.locator('.module-menu > summary').first().locator('svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete rack' })).toHaveText('Delete rack');
  });

  test('has no serious accessibility violations and exposes an installable offline PWA', async ({ page, request, context }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();
    const response = await request.get(new URL(manifestHref!, page.url()).toString());
    expect(response.ok()).toBe(true);
    const manifest = await response.json() as { name?: string; icons?: unknown[]; display?: string };
    expect(manifest.name).toBe('sequens-R');
    expect(manifest.icons?.length).toBeGreaterThan(0);
    expect(manifest.display).toBe('standalone');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'sequens-R' })).toBeVisible();
    await context.setOffline(false);
  });
});
