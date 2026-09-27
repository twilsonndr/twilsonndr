// Headless smoke test: boots the built game in Chromium, plays through a bit of
// every chapter (skipping ahead with the debug handle), reaches the ending, and
// fails on any page error.
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
const executablePath = candidates.find((c) => c && existsSync(c));
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
// 960x540 keeps software GL fast enough to actually play; ?lq drops bloom and MSAA
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push(`console: ${m.text()}`);
});

const shot = async (name) => shots && page.screenshot({ path: join(shots, `${name}.png`) });
const wait = (ms) => page.waitForTimeout(ms);
const g = (fn, arg) => page.evaluate(fn, arg);
const simWait = async (secs, cap = 20000) => {
  const t0 = await g(() => window.tinyClaw.sim.time);
  const start = Date.now();
  while ((await g(() => window.tinyClaw.sim.time)) - t0 < secs && Date.now() - start < cap) await wait(100);
};
const hold = async (key, secs) => {
  await page.keyboard.down(key);
  await simWait(secs);
  await page.keyboard.up(key);
};
const skipDialog = async () => {
  for (let i = 0; i < 40 && (await page.$('#dialog:not([hidden])')); i++) {
    await page.click('#dialog [data-a="skip"]');
    await wait(150);
  }
};
const waitPhase = async (phase, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const now = await g(() => window.tinyClaw.phase);
    if (now === phase) return true;
    if (now === 'cine') await page.click('#cine').catch(() => {});
    await skipDialog();
    await wait(200);
  }
  errors.push(`never reached phase ${phase} (at ${await g(() => window.tinyClaw.phase)})`);
  return false;
};

await page.goto(url + '?lq', { waitUntil: 'load' });
await wait(1500);
await shot('01-title');
await page.click('[data-a="play"]');
await wait(500);
await shot('02-intro-dialog');
await skipDialog();
await wait(700);
await shot('03-chapter-card');
await waitPhase('play');

// chapter 1: walk to a ring and snip it
const ring = await g(() => {
  const r = window.tinyClaw.sim.rings[0];
  return { x: r.x, z: r.z };
});
await g((r) => {
  const p = window.tinyClaw.sim.p;
  p.x = r.x - 3;
  p.z = r.z;
}, ring);
// scuttle right toward the ring (real keyboard input), then pinch it
await hold('KeyD', 0.2);
const moved = await g((r) => window.tinyClaw.sim.p.x - (r.x - 3), ring);
if (!(moved > 1)) errors.push(`holding D did not scuttle right: moved ${moved}`);
await g((r) => {
  const p = window.tinyClaw.sim.p;
  p.x = r.x - 0.6;
  p.z = r.z;
}, ring);
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Space');
  await simWait(0.3);
}
// side to side to charge the mega snip
for (let i = 0; i < 8; i++) await hold(i % 2 ? 'KeyA' : 'KeyD', 0.15);
await wait(300);
await shot('04-chapter1');
const ch1 = await g(() => ({ freed: window.tinyClaw.sim.stats.freed, snips: window.tinyClaw.sim.stats.snips, t: window.tinyClaw.sim.time, combo: window.tinyClaw.sim.stats.bestCombo }));
if (ch1.snips < 1) errors.push(`no snips landed: ${JSON.stringify(ch1)}`);
if (ch1.combo < 3) errors.push(`side-to-side combo did not build: ${JSON.stringify(ch1)}`);

// a gull, then clear the chapter
await g(() => {
  const s = window.tinyClaw.sim;
  s.addBlast('gull', s.p.x + 2, s.p.z, 1.35, 1.2);
});
await wait(700);
await shot('05-gull');
await page.keyboard.press('Escape');
await wait(300);
await shot('06-pause');
await page.click('[data-a="resume"]');
await g(() => {
  const s = window.tinyClaw.sim;
  for (const r of s.rings) r.hp = 1;
  for (const r of s.rings) {
    s.p.x = r.x;
    s.p.z = r.z;
    s.p.pinchCd = 0;
    s.step(0.016, { mx: 0, mz: 0, pinch: true, dash: false });
  }
});
// clearing a stage zooms in on Sidney for a victory dance
await waitPhase('dance', 8000);
await g(() => (window.tinyClaw.r.dance.t = 0.9));
await wait(400);
await shot('07-victory-dance');
await waitPhase('play', 20000);

// chapter 2: brigade and a tide wall
await g(() => {
  const s = window.tinyClaw.sim;
  s.addWave(2);
  s.spawnMinion(-4, -3);
  s.spawnMinion(5, -4);
});
await simWait(2.2);
await shot('08-brigade');
// a curling tide wall close up
await g(() => {
  const s = window.tinyClaw.sim;
  for (const w of s.waves) w.z = 1.5;
});
await wait(300);
await shot('08b-wave');
const ch2 = await g(() => ({ ch: window.tinyClaw.sim.chapter, minions: window.tinyClaw.sim.minions.length }));
if (ch2.ch !== 1 || ch2.minions < 1) errors.push(`chapter 2 did not start properly: ${JSON.stringify(ch2)}`);
await g(() => {
  const s = window.tinyClaw.sim;
  s.minionsDown = 8;
});
// outro, then the Moon-grab cutscene
await waitPhase('cine', 20000);
for (const [t, name] of [
  [3.9, '09a-cine-reach'],
  [6.3, '09b-cine-yoink'],
  [10.8, '09c-cine-tides'],
]) {
  await g((tt) => (window.tinyClaw.r.cineT = tt), t);
  await wait(500);
  await shot(name);
}
const tide = await g(() => window.tinyClaw.r.world.tide);
if (!(tide > 0.9)) errors.push(`tides did not go haywire in the cutscene: ${tide}`);
await waitPhase('play', 20000);

// chapter 3: the Admiral
await g(() => {
  const s = window.tinyClaw.sim;
  s.god = true;
  s.boss.t = 0;
  s.boss.step = 0;
});
await simWait(0.9);
await shot('10-boss-slam');
await g(() => {
  const s = window.tinyClaw.sim;
  s.boss.state = 'lock';
  s.boss.t = 0.01;
});
await wait(400);
const stuck = await g(() => window.tinyClaw.sim.boss.state);
if (stuck !== 'stuck') errors.push(`boss claw did not get stuck: ${stuck}`);
await g(() => {
  const s = window.tinyClaw.sim;
  s.p.x = s.boss.screwX - 0.3;
  s.p.z = s.boss.screwZ;
});
await wait(100);
await shot('11-screw');
await page.keyboard.press('Space');
await wait(500);
await shot('12-screw-loose');
const screws = await g(() => window.tinyClaw.sim.boss.screws);
if (screws !== 4) errors.push(`screw pinch did not land: ${screws}`);
// the first screw earns a dance; wait for control to come back
await waitPhase('play', 20000);

// finish him
await g(() => {
  const s = window.tinyClaw.sim;
  s.boss.screws = 1;
  s.boss.state = 'stuck';
  s.boss.t = 5;
  s.p.x = s.boss.screwX - 0.3;
  s.p.z = s.boss.screwZ;
  s.p.pinchCd = 0;
  s.step(0.016, { mx: 0, mz: 0, pinch: true, dash: false });
});
await wait(2500);
await shot('13-boss-down');
for (let i = 0; i < 100 && !(await page.$('#dialog:not([hidden])')); i++) await wait(200);
if (!(await page.$('#dialog:not([hidden])'))) errors.push('ending dialog never showed');
await wait(600);
await shot('14-outro');
await skipDialog();
await wait(800);
await shot('15-win');
if (!(await page.$('[data-a="again"]'))) errors.push('win screen did not show');

// phone: touch emulation, joystick and PINCH button
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const pp = await phone.newPage();
pp.on('pageerror', (e) => errors.push(`phone pageerror: ${e.message}`));
await pp.goto(url, { waitUntil: 'load' });
await pp.waitForTimeout(1200);
await pp.tap('[data-a="play"]');
for (let i = 0; i < 40 && (await pp.$('#dialog:not([hidden])')); i++) {
  await pp.tap('#dialog [data-a="skip"]');
  await pp.waitForTimeout(200);
}
for (let i = 0; i < 60 && (await pp.evaluate(() => window.tinyClaw.phase)) !== 'play'; i++) {
  if (await pp.$('#dialog:not([hidden])')) await pp.tap('#dialog [data-a="skip"]');
  await pp.waitForTimeout(250);
}
const touchVisible = await pp.evaluate(() => getComputedStyle(document.getElementById('touch')).display !== 'none');
if (!touchVisible) errors.push('touch controls hidden on a touch device');
// drag the joystick right with a synthetic touch
const x0 = await pp.evaluate(() => window.tinyClaw.sim.p.x);
const cdp = await phone.newCDPSession(pp);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 600 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y: 600 }] });
const tStart = await pp.evaluate(() => window.tinyClaw.sim.time);
for (let i = 0; i < 100 && (await pp.evaluate(() => window.tinyClaw.sim.time)) - tStart < 0.3; i++) await pp.waitForTimeout(100);
await pp.screenshot({ path: shots ? join(shots, '16-phone.png') : '/dev/null' });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const x1 = await pp.evaluate(() => window.tinyClaw.sim.p.x);
if (!(x1 > x0 + 0.5)) errors.push(`touch joystick did not move the crab: ${x0} -> ${x1}`);
await pp.tap('#t-pinch');
await pp.waitForTimeout(300);
await phone.close();

const final = await g(() => ({ phase: window.tinyClaw.phase, score: window.tinyClaw.sim.stats.score }));
await browser.close();
server.close();
if (errors.length) {
  console.error('SMOKE FAILED\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke ok', { ch1, ch2, final });
