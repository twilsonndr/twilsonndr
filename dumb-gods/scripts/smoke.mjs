// Headless smoke test: boots the built game in Chromium, plays a few seconds,
// opens every panel, forces an ending, and fails on any page error.
// Usage: npm run build && npm run smoke [-- --shots <dir>]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const shotsIdx = process.argv.indexOf('--shots');
const shots = shotsIdx > -1 ? resolve(process.argv[shotsIdx + 1]) : null;
if (shots) mkdirSync(shots, { recursive: true });

const html = readFileSync('dist/index.html');
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
let executablePath;
for (const c of candidates) {
  if (!c || !existsSync(c)) continue;
  executablePath = c;
  // /opt/pw-browsers holds versioned folders; find the binary inside if needed
  break;
}
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push(`console: ${m.text()}`);
});

const shot = async (name) => shots && page.screenshot({ path: join(shots, `${name}.png`) });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(url, { waitUntil: 'load' });
await wait(1500);
await shot('01-title');
await page.click('[data-a="start"]');
await wait(300);
await shot('02-intro');
await page.click('[data-a="skip"]');
await wait(600);

// walk around and zap for a bit
await page.keyboard.down('KeyW');
await wait(1800);
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyD');
await page.keyboard.down('Space');
await wait(1200);
await page.keyboard.up('KeyD');
await page.keyboard.up('Space');
await wait(400);
await shot('03-playing');

const state = await page.evaluate(() => {
  const g = window.dumbGods;
  return { t: g.sim.t, collected: g.sim.stats.collected, started: g.started, tech: g.sim.g.tech };
});
if (!state.started || state.t <= 0.2) errors.push(`game did not advance: ${JSON.stringify(state)}`);

// give ourselves stuff and open panels
await page.evaluate(() => {
  const g = window.dumbGods;
  for (const r of Object.keys(g.sim.res)) g.sim.res[r] = 9;
});
await page.keyboard.press('KeyB');
await wait(300);
await shot('04-bag');
await page.click('[data-a="craft"][data-i="goggles"]');
await wait(200);
await page.keyboard.press('Escape');
await wait(200);
await page.evaluate(() => window.dumbGods.ui.openTalk('labs'));
await wait(300);
await shot('05-talk');
await page.click('[data-a="use"][data-i="goggles"]');
await wait(300);
await shot('06-used');
const safety = await page.evaluate(() => window.dumbGods.sim.f.labs.dials.safety);
if (!(safety > 30)) errors.push(`goggles did not raise safety: ${safety}`);
await page.keyboard.press('Escape');
await page.evaluate(() => window.dumbGods.ui.openTalk('garage'));
await wait(300);
await shot('07-gary');
await page.keyboard.press('Escape');

// fire an event
await page.evaluate(() => { window.dumbGods.eventT = 0; });
await wait(400);
await shot('08-event');
if (await page.$('[data-a="choose"]')) {
  await page.click('[data-a="choose"]');
  await wait(200);
  await page.click('[data-a="ok"]');
}

// wake the loop, look at it
await page.evaluate(() => { const s = window.dumbGods.sim; s.g.tech = 66; s.g.align = 80; });
await wait(800);
await shot('09-loop-wake');
if (await page.$('[data-a="ok"]')) await page.click('[data-a="ok"]');
await wait(600);
await shot('10-late-game');

// good ending path
await page.evaluate(() => { const s = window.dumbGods.sim; s.g.tech = 99.99; s.g.align = 90; s.f.loop.dials.bond = 90; });
await wait(800);
await shot('11-ascend');
if (!(await page.$('[data-a="asc"]'))) errors.push('ascension choice did not show');
else {
  await page.click('[data-a="asc"][data-c="merge"]');
  await wait(400);
  await shot('12-ending');
}

// phone layout
await page.setViewportSize({ width: 390, height: 844 });
await page.click('[data-a="again"]').catch(() => {});
await wait(800);
await shot('13-phone');

await browser.close();
server.close();
if (errors.length) {
  console.error('SMOKE FAILED\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke ok', state);
