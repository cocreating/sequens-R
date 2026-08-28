import { expect, test } from '@playwright/test';

async function addModule(page: import('@playwright/test').Page, type: string): Promise<void> {
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator(`.module-choice[data-module-type="${type}"]`).click();
}

test.describe('Piano Roll pro workflow', () => {
  test('edits dynamics, preserves overflow, uses harmony helpers, and exposes navigation/audition', async ({ page }) => {
    await page.goto('/');
    await addModule(page, 'chords');
    await addModule(page, 'piano');
    const piano = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'piano module name' }) });

    await piano.getByRole('group', { name: 'Length' }).getByRole('button', { name: '32 steps' }).click();
    await piano.getByRole('button', { name: 'Add note' }).click();
    const note = piano.locator('.piano-note');
    await note.focus();
    for (let index = 0; index < 20; index += 1) await page.keyboard.press('ArrowRight');
    await expect(note).toHaveAttribute('aria-label', /step 21/u);

    await piano.getByLabel('Selected note velocity').fill('84');
    await piano.getByLabel('Accent selected note').check();
    await expect(note).toHaveAttribute('aria-label', /velocity 112, accented/u);
    await expect(piano.getByRole('group', { name: 'Note velocity lane' })).toBeVisible();

    await piano.getByRole('group', { name: 'Length' }).getByRole('button', { name: '16 steps' }).click();
    await expect(piano.locator('.piano-note')).toHaveCount(0);
    await expect(piano.getByText('1 note preserved beyond loop')).toBeVisible();
    await piano.getByRole('group', { name: 'Length' }).getByRole('button', { name: '32 steps' }).click();
    await expect(piano.locator('.piano-note')).toHaveCount(1);

    await expect(piano.getByLabel('Harmony source')).toHaveValue(/chords-/u);
    await piano.getByRole('button', { name: 'Stamp chord' }).click();
    await expect(piano.locator('.piano-note')).toHaveCount(3);
    await piano.getByRole('button', { name: 'Transpose active notes up one scale degree' }).click();
    await piano.getByRole('button', { name: 'Transpose active notes up one octave' }).click();
    await piano.getByRole('button', { name: 'Transpose active notes down one octave' }).click();

    await piano.getByLabel('Piano roll zoom').selectOption('0.5');
    await expect(piano.getByLabel('Piano roll zoom')).toHaveValue('0.5');
    await piano.getByLabel('Piano roll zoom').selectOption('0.75');
    await expect(piano.getByLabel('Piano roll zoom')).toHaveValue('0.75');
    await piano.getByLabel('Piano roll zoom').selectOption('1.5');
    await expect(piano.getByRole('button', { name: 'Audition C4' })).toBeVisible();
    await piano.getByLabel('Audition edits').check();

    await piano.getByLabel('Load melody example').selectOption('steady-beacon');
    await expect(piano.locator('.piano-note')).toHaveCount(4);
    await expect(piano.getByRole('group', { name: 'Length' }).getByRole('button', { name: '16 steps' })).toHaveAttribute('aria-pressed', 'true');
    await piano.getByLabel('Load melody example').selectOption('longform-journey');
    await expect(piano.locator('.piano-note')).toHaveCount(28);
    await expect(piano.getByRole('group', { name: 'Length' }).getByRole('button', { name: '64 steps' })).toHaveAttribute('aria-pressed', 'true');
  });
});
