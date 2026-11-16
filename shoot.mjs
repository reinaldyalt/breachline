// Screenshots for BREACHLINE: serves game/, opens each ?shot= scene headless,
// waits for window.__shotReady, saves the canvas as JPEG.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, 'package.json'));
const puppeteer = require('/home/hatch/workspace/tmp-render/node_modules/puppeteer');
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const port = Number.parseInt(process.argv[2] ?? '8093', 10);
const mode = process.argv[3] ?? 'shots';

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: here, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1500));

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));
page.on('console', (msg) => { if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text()); });

if (mode === 'shots') {
  for (const shot of shots) {
    const url = `http://localhost:${port}/index.html${shot.query}`;
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('window.__shotReady === true', { timeout: 30000 });
    await page.screenshot({ path: join(here, 'screenshots', shot.name), type: 'jpeg', quality: 82 });
    console.log('saved', shot.name);
  }
} else if (mode === 'auto') {
  // Autopilot verification: load with ?auto=1, let it play, sample state.
  await page.goto(`http://localhost:${port}/index.html?auto=1&seed=7`, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await page.evaluate(() => {
      const g = window.__game;
      return { phase: g.state.phase, round: g.state.round, hp: g.playerHp, alive: g.playerAlive, enemies: g.enemiesAlive, allies: g.alliesAlive, kills: g.state.kills, money: g.state.money, score: [g.state.scoreUs, g.state.scoreThem], bomb: g.state.bomb.state };
    });
    console.log(`t+${(i + 1) * 3 + 2}s`, JSON.stringify(s));
    if (s.phase === 'roundEnd' || s.phase === 'matchEnd') break;
  }
  await page.screenshot({ path: '/tmp/auto-check.jpg', type: 'jpeg', quality: 80 });
  console.log('saved /tmp/auto-check.jpg');
}

await browser.close();
server.kill();
console.log('done');
