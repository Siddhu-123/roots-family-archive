// Captures the README screenshots from the built-in fictional Rao family sample.
// Usage: npm run dev -- --port 4183 --strictPort   (in another terminal)
//        node scripts/capture-screenshots.mjs [baseURL]
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://127.0.0.1:4183';
const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: existsSync(localChrome) ? localChrome : undefined });
const out = 'docs/screenshots';

async function shot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', name);
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await desktop.goto(base);
await desktop.getByText('The Rao family').first().waitFor();
await shot(desktop, 'tree');
for (const [label, name] of [['Members', 'members'], ['Memories', 'memories'], ['Timeline', 'timeline']]) {
  await desktop.getByRole('button', { name: new RegExp(`^${label}`) }).or(desktop.getByRole('link', { name: new RegExp(`^${label}`) })).first().click();
  await shot(desktop, name);
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto(base);
await mobile.getByText('The Rao family').first().waitFor();
await shot(mobile, 'mobile-tree');
await browser.close();
