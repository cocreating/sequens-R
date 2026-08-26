import { expect, test } from '@playwright/test';

test.describe('Phase 4 desktop studio', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('opens the floating workspace from its icon-only header trigger', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Application version 0.0.1')).toHaveText('v0.0.1');
    const workspaceButton = page.getByRole('button', { name: 'Workspace', exact: true });
    const workspace = page.locator('#studio-workspace');
    await expect(workspaceButton).toHaveText('🧰');
    await expect(workspace).toBeHidden();
    await workspaceButton.click();
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', { name: 'Workspace' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(workspace).toBeHidden();
    await expect(workspaceButton).toBeFocused();
  });

  test('lays modules into parallel lanes and exposes every schema-driven desktop module', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (reason) => pageErrors.push(reason));
    await page.goto('/');
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Output & shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    const columns = await page.locator('.module-list').evaluate((element) => Number(getComputedStyle(element).columnCount));
    expect(columns).toBeGreaterThanOrEqual(2);

    for (const [index, type] of ['arp', 'euclid', 'piano', 'cc', 'mod'].entries()) {
      await page.getByLabel('New module').selectOption(type);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      expect(pageErrors).toEqual([]);
      await expect(page.locator('article')).toHaveCount(4 + index);
    }
    await expect(page.locator('article')).toHaveCount(8);

    const arp = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'arp module name' }) });
    await expect(arp.getByLabel('Direction')).toBeVisible();
    await expect(arp.getByLabel('Follow chords')).toBeVisible();
    const euclid = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'euclid module name' }) });
    await expect(euclid.getByRole('spinbutton', { name: 'Ring 1 steps', exact: true })).toBeVisible();
    await expect(euclid.getByRole('group', { name: 'MIDI channels', exact: true })).toBeVisible();
    const mod = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'mod module name' }) });
    await expect(mod.getByRole('group', { name: 'LFO 3 mode', exact: true })).toBeVisible();

    const piano = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'piano module name' }) });
    const pianoSurface = piano.getByRole('group', { name: /step piano roll/ });
    await pianoSurface.click({ position: { x: 120, y: 120 } });
    await expect(piano.locator('.piano-note')).toHaveCount(1);

    const cc = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'cc module name' }) });
    await cc.getByRole('button', { name: 'Record movement' }).click();
    await cc.getByLabel('Control 1 value').evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '91';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(cc.getByText('1 recorded point')).toBeVisible();
    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.locator('.error')).toContainText('Piano roll');
    await expect(page.locator('.error')).toContainText('CC Control');
  });

  test('expands one module across every desktop lane in its own row', async ({ page }) => {
    await page.goto('/');
    const modules = page.locator('.module-list');
    const drums = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'drums module name' }) });
    const bass = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'bass module name' }) });
    const widthToggle = drums.getByRole('button', { name: 'Full-width layout for Drums' });
    const collapseToggle = drums.getByRole('button', { name: 'Collapse Drums' });
    const moduleMenu = drums.locator('.module-menu > summary');
    const moduleName = drums.getByRole('textbox', { name: 'drums module name' });

    const [widthBox, collapseBox, menuBox, nameBox] = await Promise.all([
      widthToggle.boundingBox(),
      collapseToggle.boundingBox(),
      moduleMenu.boundingBox(),
      moduleName.boundingBox(),
    ]);
    expect(widthBox).not.toBeNull();
    expect(collapseBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(nameBox).not.toBeNull();
    expect(collapseBox!.x).toBeGreaterThanOrEqual(widthBox!.x + widthBox!.width);
    expect(menuBox!.x).toBeGreaterThanOrEqual(collapseBox!.x + collapseBox!.width);
    expect(nameBox!.x).toBeGreaterThanOrEqual(menuBox!.x + menuBox!.width);
    expect(Math.abs(nameBox!.y - widthBox!.y)).toBeLessThan(1);

    await widthToggle.click();
    await expect(widthToggle).toHaveAttribute('aria-pressed', 'true');
    const expanded = await drums.evaluate((element) => ({
      span: getComputedStyle(element).columnSpan,
      width: element.getBoundingClientRect().width,
    }));
    const moduleListWidth = await modules.evaluate((element) => element.getBoundingClientRect().width);
    expect(expanded.span).toBe('all');
    expect(Math.abs(expanded.width - moduleListWidth)).toBeLessThan(1);
    const drumsBox = await drums.boundingBox();
    const bassBox = await bass.boundingBox();
    expect(drumsBox).not.toBeNull();
    expect(bassBox).not.toBeNull();
    expect(bassBox!.y).toBeGreaterThanOrEqual(drumsBox!.y + drumsBox!.height);

    await widthToggle.click();
    await expect(widthToggle).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => drums.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(moduleListWidth);
  });

  test('assigns distinct dark module colors and persists a per-module choice', async ({ page }) => {
    await page.goto('/');
    const drums = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'drums module name' }) });
    const bass = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'bass module name' }) });
    const [drumsBackground, bassBackground] = await Promise.all([
      drums.evaluate((element) => getComputedStyle(element).backgroundColor),
      bass.evaluate((element) => getComputedStyle(element).backgroundColor),
    ]);
    expect(drumsBackground).not.toBe(bassBackground);
    const channels = drumsBackground.match(/\d+/gu)?.slice(0, 3).map(Number) ?? [];
    expect(Math.max(...channels)).toBeLessThan(80);

    await drums.locator('.module-menu > summary').click();
    const color = drums.getByLabel('Drums color');
    await expect(color).toHaveValue('ember');
    await color.selectOption('teal');
    await expect.poll(() => drums.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(drumsBackground);

    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Project saved/u)).toBeVisible();
    await page.reload();
    const restoredDrums = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'drums module name' }) });
    await restoredDrums.locator('.module-menu > summary').click();
    await expect(restoredDrums.getByLabel('Drums color')).toHaveValue('teal');
  });

  test('manages multiple racks, persists the active rack, and supports desktop shortcuts', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'New rack' }).click();
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.getByLabel('Active rack name').fill('Live rack');
    await page.getByRole('button', { name: 'Duplicate rack' }).click();
    await expect(page.getByRole('tab')).toHaveCount(3);
    await page.getByRole('button', { name: 'Delete rack' }).click();
    await expect(page.getByRole('tab')).toHaveCount(2);

    await page.keyboard.press('[');
    await expect(page.getByRole('tab', { selected: true })).toContainText('Rack 1');
    await page.keyboard.press(']');
    await expect(page.getByRole('tab', { selected: true })).toContainText('Live rack');

    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByText('Transport paused')).toBeVisible();

    await page.keyboard.press('Control+s');
    await expect(page.getByText(/Project saved/)).toBeVisible();
    await page.reload();
    await expect(page.getByText('Local project restored')).toBeVisible();
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(page.getByLabel('Active rack name')).toHaveValue('Live rack');
  });

  test('uses desktop audio output and File System Access APIs when available', async ({ page }) => {
    await page.addInitScript(() => {
      const state = { outputId: '', fileName: '', fileSize: 0 };
      (window as typeof window & { __phase4Apis?: typeof state }).__phase4Apis = state;
      Object.defineProperty(AudioContext.prototype, 'setSinkId', {
        configurable: true,
        value: async function (deviceId: string) { state.outputId = deviceId; },
      });
      Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
        configurable: true,
        value: async () => [{ deviceId: 'studio-out', groupId: 'studio', kind: 'audiooutput', label: 'Studio Monitors', toJSON: () => ({}) }],
      });
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async (options: { suggestedName: string }) => {
          state.fileName = options.suggestedName;
          return { createWritable: async () => ({ write: async (blob: Blob) => { state.fileSize = blob.size; }, close: async () => undefined }) };
        },
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh outputs' }).click();
    await page.getByLabel('Internal audio out').selectOption('studio-out');
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __phase4Apis: { outputId: string } }).__phase4Apis.outputId)).toBe('studio-out');

    await page.getByRole('button', { name: 'Rack MIDI' }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __phase4Apis: { fileName: string } }).__phase4Apis.fileName)).toMatch(/\.mid$/u);
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __phase4Apis: { fileSize: number } }).__phase4Apis.fileSize)).toBeGreaterThan(20);
  });

  test('provides per-module contextual help for pointer and keyboard users', async ({ page }) => {
    await page.goto('/');
    const drums = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'drums module name' }) });
    const help = drums.locator('.module-help-panel');

    await drums.locator('.module-menu > summary').click();
    await drums.getByRole('button', { name: 'Turn on help for Drums' }).click();
    await expect(help).toBeVisible();
    await expect(help).toContainText('Contextual help');

    await drums.getByRole('button', { name: 'Mute Drums' }).hover();
    await expect(help.getByRole('heading')).toHaveText('Mute');
    await expect(help).toContainText('scheduled notes or control events');

    await drums.getByRole('group', { name: 'Steps', exact: true }).hover();
    await expect(help.getByRole('heading')).toHaveText('Steps');
    await expect(help).toContainText('16 or 32 sixteenth-note steps');

    await drums.getByLabel('Mutation').focus();
    await expect(help.getByRole('heading')).toHaveText('Mutation level');

    await drums.locator('.module-menu > summary').click();
    await drums.getByRole('button', { name: 'Turn off help for Drums' }).click();
    await expect(help).toBeHidden();
  });
});

test('mobile reproduces, edits, and re-shares a desktop-authored module', async ({ browser }) => {
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const desktop = await desktopContext.newPage();
  await desktop.goto('/');
  await desktop.getByLabel('New module').selectOption('arp');
  await desktop.getByRole('button', { name: 'Add', exact: true }).click();
  await desktop.getByRole('button', { name: 'Share' }).click();
  await expect(desktop.getByText(/Patch link copied/)).toBeVisible();
  const sharedUrl = desktop.url();

  const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const mobile = await mobileContext.newPage();
  await mobile.goto(sharedUrl);
  const arp = mobile.locator('article').filter({ has: mobile.getByRole('textbox', { name: 'arp module name' }) });
  await expect(arp.getByLabel('Direction')).toBeVisible();
  await expect(mobile.getByLabel('New module').getByRole('option', { name: 'Arp' })).toHaveCount(1);
  await arp.getByLabel('Direction').selectOption({ label: 'Down' });
  await mobile.getByRole('button', { name: 'Share' }).click();
  await expect(mobile.getByText(/Patch link copied/)).toBeVisible();
  await mobile.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(mobile.getByText('Transport playing')).toBeVisible();
  await desktopContext.close();
  await mobileContext.close();
});
