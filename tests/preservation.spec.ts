import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Rao family' })).toBeVisible();
}

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  } else {
    await page.getByRole('navigation', { name: 'Archive navigation' })
      .getByRole('button', { name: name === 'Members' ? /^Members(?: \d+)?$/ : name, exact: name !== 'Members' }).click();
  }
}

test('larger text remains usable across every view at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await start(page);
  await navigate(page, 'Settings');
  await page.getByLabel('Text size').selectOption('large');
  await expect(page.locator('.app-shell')).toHaveClass(/text-large/);
  for (const name of ['Family tree', 'Members', 'Memories', 'Conversations', 'Timeline', 'Backups', 'Settings']) {
    await navigate(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('main')).not.toContainText('Roots needs to reload');
  }
  await navigate(page, 'Members');
  const menuSize = await page.getByRole('button', { name: 'Open navigation', exact: true }).boundingBox();
  expect(menuSize?.width).toBeGreaterThanOrEqual(40);
  expect(menuSize?.height).toBeGreaterThanOrEqual(40);
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const name of ['Essentials', 'Heritage', 'Life & sources', 'More details']) {
    await dialog.getByRole('tab', { name, exact: true }).click();
    expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    const sheet = await dialog.boundingBox();
    const footer = await dialog.locator('.modal-footer').boundingBox();
    expect(Math.abs(sheet!.y + sheet!.height - footer!.y - footer!.height)).toBeLessThanOrEqual(2);
  }
});

test('complete ZIP restores uploaded media and their exact original bytes', async ({ page }, testInfo) => {
  await start(page);
  await navigate(page, 'Memories');
  await page.getByRole('button', { name: 'Add memory', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const text = Buffer.from('Family notes: అమ్మమ్మ, surnames, and ancestral village.\n', 'utf8');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWHsAAAAASUVORK5CYII=', 'base64');
  await dialog.getByLabel('Title').fill('Preserved original files');
  await dialog.getByLabel('The story').fill('Original files must survive replacement.');
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: 'family-notes.txt', mimeType: 'text/plain', buffer: text },
    { name: 'portrait.png', mimeType: 'image/png', buffer: image },
  ]);
  await expect(dialog.locator('.pending-file')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Save memory', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, 'Backups');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export complete ZIP', exact: true }).click();
  const backup = await downloaded;
  const backupPath = testInfo.outputPath('complete.zip');
  await backup.saveAs(backupPath);
  const entries = unzipSync(await readFile(backupPath));
  const manifest = JSON.parse(strFromU8(entries['family.json']));
  expect(manifest.files).toHaveLength(2);
  for (const [name, bytes] of [['family-notes.txt', text], ['portrait.png', image]] as const) {
    const metadata = manifest.files.find((file: { name: string }) => file.name === name);
    expect(Buffer.from(entries[metadata.path])).toEqual(bytes);
  }
  await navigate(page, 'Memories');
  await page.getByRole('button', { name: /Preserved original files/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete memory', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete memory', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Preserved original files/ })).toHaveCount(0);
  await navigate(page, 'Backups');
  await page.getByRole('button', { name: 'Import records or backup', exact: true }).click();
  await page.locator('.backup-import input[type="file"]').setInputFiles(backupPath);
  await expect(page.locator('.backup-preview')).toContainText('2 attachments');
  await page.getByRole('button', { name: 'Review replacement', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace archive', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'Memories');
  await page.getByRole('button', { name: /Preserved original files/ }).click();
  const restored = page.getByRole('dialog');
  await expect(restored.getByRole('img', { name: 'portrait.png', exact: true })).toBeVisible();
  await expect.poll(() => restored.getByRole('img', { name: 'portrait.png', exact: true }).evaluate(e => (e as HTMLImageElement).naturalWidth)).toBe(1);
  const fileDownload = page.waitForEvent('download');
  await restored.getByRole('link', { name: 'family-notes.txt', exact: true }).click();
  const attachment = await fileDownload;
  expect(await readFile((await attachment.path())!)).toEqual(text);
});

test('browser records and reloads a simulated microphone clip', async ({ page }) => {
  await start(page);
  await navigate(page, 'Memories');
  await page.getByRole('button', { name: 'Add memory', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Recorded family conversation');
  await dialog.getByRole('button', { name: 'Record voice', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /Stop.*0:01/ })).toBeVisible();
  await dialog.getByRole('button', { name: /Stop/ }).click();
  await expect(dialog.locator('.pending-file')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Save memory', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await navigate(page, 'Memories');
  await page.getByRole('button', { name: /Recorded family conversation/ }).click();
  const audio = page.getByRole('dialog').locator('audio');
  await expect(audio).toBeVisible();
  await expect.poll(() => audio.evaluate(e => (e as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(1);
  expect(await audio.evaluate(async e => (await fetch((e as HTMLAudioElement).src)).blob().then(b => b.size))).toBeGreaterThan(0);
});

test('GEDCOM genealogy export can be imported through the preview', async ({ page }, testInfo) => {
  await start(page);
  await navigate(page, 'Backups');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export GEDCOM records', exact: true }).click();
  const file = await downloaded;
  const path = testInfo.outputPath('genealogy.ged');
  await file.saveAs(path);
  expect(await readFile(path, 'utf8')).toContain('0 HEAD');
  await page.getByRole('button', { name: 'Import records or backup', exact: true }).click();
  await page.locator('.backup-import input[type="file"]').setInputFiles(path);
  await expect(page.locator('.backup-preview')).toContainText('12 members');
  await expect(page.locator('.backup-preview')).toContainText('This import has no media');
  await page.getByRole('button', { name: 'Review replacement', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace archive', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'Members');
  await expect(page.locator('.people-table tbody tr')).toHaveCount(12);
});

test('production archive loads and accepts edits offline', async ({ page, context }) => {
  test.skip(process.env.ROOTS_UI_PRODUCTION !== '1', 'Service worker requires the production build.');
  await start(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The Rao family' })).toBeVisible();
  await navigate(page, 'Members');
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Given name \/ name/).fill('Offline Asha');
  await dialog.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await navigate(page, 'Members');
  await expect(page.getByRole('button', { name: 'View Offline Asha', exact: true })).toBeVisible();
});
