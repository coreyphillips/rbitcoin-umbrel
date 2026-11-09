// The README screenshots (docs/images) and the app store gallery
// (rbitcoin-node/gallery): the dashboard in docker/web/html, unchanged, fed
// sample node metrics that evolve over 15 simulated minutes of polls, once
// for a synced node (light theme) and once mid-way through the first sync
// (dark theme). The figures are made up but shaped like a real mainnet node's.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
//   CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//   node scripts/screenshots.mjs
//
// Install Playwright outside the repository, as for docker/tests/browser.test.mjs.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = fileURLToPath(new URL('..', import.meta.url));
const root = `${repo}docker/web/html/`;
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url;
  if (!/^\/[a-z.-]+$/.test(path)) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(root + path);
    res.setHeader('Content-Type', path.endsWith('.mjs') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

// Deterministic jitter in [-1, 1].
const wobble = (i, seed) => Math.sin(i * 0.23 + seed) * 0.55 + Math.sin(i * 0.071 + seed * 3) * 0.3 + Math.sin(i * 1.3 + seed * 7) * 0.15;
const START = new Date('2026-11-09T15:24:00');
const STEPS = 180; // 15 minutes of 5 s polls

const scenarios = {
  // A synced node: Ready, serving wallets, following the tip.
  ready: (i, now) => {
    const blockAt = [37, 141];
    const found = blockAt.filter(s => i >= s).length;
    const blocks = 974806 + found;
    const lastBlock = found ? START.getTime() / 1000 + blockAt[found - 1] * 5 : now - 380;
    let rx = 0, tx = 0;
    for (let k = 0; k <= i; k++) {
      const burst = blockAt.includes(k) ? 1 : blockAt.includes(k - 1) ? 0.5 : 0;
      rx += 5 * (62000 + 24000 * wobble(k, 1)) + burst * 420000;
      tx += 5 * (31000 + 12000 * wobble(k, 2)) + burst * 610000;
    }
    const sinceBlock = found ? i - blockAt[found - 1] : i + 76;
    const txs = Math.round(31800 + sinceBlock * 21 + 260 * wobble(i, 3));
    return {
      ready: 200, progress: { phase: 'ready' },
      metrics: {
        blocks, headers: blocks, tip: lastBlock,
        started: START.getTime() / 1000 - (6 * 86400 + 4 * 3600 + 17 * 60),
        rss: 2_380_000_000 + Math.round(40_000_000 * wobble(i, 4)),
        in: 0, out: 16, nets: { ipv4: 12, ipv6: 4, onion: 0, i2p: 0, cjdns: 0 },
        rx: 38_400_000_000 + rx, tx: 21_900_000_000 + tx,
        mempoolTxs: txs, mempoolBytes: Math.round(txs * 980), minFee: 1.0,
      },
    };
  },
  // The first sync, past the halfway mark.
  sync: (i, now) => {
    let blocks = 731240, rx = 0;
    for (let k = 0; k <= i; k++) {
      const n = Math.round(41 + 9 * wobble(k, 5));
      blocks += n; rx += n * 1_620_000 + 5 * 90000;
    }
    return {
      ready: 503, progress: { phase: 'catch-up' },
      metrics: {
        blocks, headers: 974808, tip: 1649000000 + (blocks - 731240) * 600,
        started: START.getTime() / 1000 - (9 * 3600 + 12 * 60),
        rss: 1_410_000_000 + Math.round(60_000_000 * wobble(i, 6)),
        in: 0, out: 16, nets: { ipv4: 13, ipv6: 3, onion: 0, i2p: 0, cjdns: 0 },
        rx: 196_000_000_000 + rx, tx: 1_240_000_000 + i * 5 * 21000,
        mempoolTxs: 0, mempoolBytes: 0, minFee: 1.0,
      },
    };
  },
};

function metricsText(m) {
  const lines = [
    `rbitcoin_blocks ${m.blocks}`, `rbitcoin_headers ${m.headers}`, `rbitcoin_tip_time_seconds ${Math.round(m.tip)}`,
    `process_start_time_seconds ${Math.round(m.started)}`, `process_resident_memory_bytes ${m.rss}`,
    `rbitcoin_connections{direction="in"} ${m.in}`, `rbitcoin_connections{direction="out"} ${m.out}`,
    ...Object.entries(m.nets).map(([net, n]) => `rbitcoin_peers{network="${net}"} ${n}`),
    `rbitcoin_network_receive_bytes_total ${Math.round(m.rx)}`, `rbitcoin_network_transmit_bytes_total ${Math.round(m.tx)}`,
    `rbitcoin_mempool_transactions ${m.mempoolTxs}`, `rbitcoin_mempool_bytes ${m.mempoolBytes}`,
    `rbitcoin_mempool_max_weight 300000000`, `rbitcoin_mempool_min_fee_sat_per_vb ${m.minFee}`,
  ];
  return lines.join('\n') + '\n';
}

async function shoot(page_, gallery, scenario, theme, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme });
  await context.addInitScript(t => localStorage.setItem('rbitcoin.dashboard', JSON.stringify({ theme: t, interval: 5, window: 15 })), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: START });
  let step = 0, current = scenario(0, START.getTime() / 1000);
  const json = v => ({ contentType: 'application/json', body: JSON.stringify(v) });
  await page.route('**/config.json', r => r.fulfill(json({ lan: 'umbrel.local:50011', internal: 'rbitcoin-node_node_1:50001', appVersion: '0.9.99-1' })));
  const defaults = { maxOutbound: 16, maxInbound: 125, mempoolSize: 300, logLevel: 'info' };
  await page.route('**/api/settings', r => r.fulfill(json({ saved: defaults, defaults, revision: 'r', lastLaunched: defaults, restartRequired: false })));
  await page.route('**/node/readyz', r => r.fulfill({ status: current.ready, body: 'status' }));
  await page.route('**/node/progress', r => r.fulfill(json(current.progress)));
  await page.route('**/node/metrics', r => {
    current = scenario(step, START.getTime() / 1000 + step * 5);
    step++;
    return r.fulfill({ contentType: 'text/plain', body: metricsText(current.metrics) });
  });
  await page.goto(origin);
  await page.waitForTimeout(300);
  for (let i = 0; i < STEPS; i++) {
    await page.clock.runFor(5000);
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${repo}rbitcoin-node/gallery/${gallery}`, fullPage: false, animations: 'disabled' });
  await page.screenshot({ path: `${repo}docs/images/${page_}`, fullPage: true, animations: 'disabled' });
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log(`${page_} and gallery/${gallery} after ${step} polls`);
  await context.close();
}

const view = { width: 1440, height: 900 };
await shoot('dashboard-ready.png', '1.png', scenarios.ready, 'light', view);
await shoot('dashboard-sync.png', '2.png', scenarios.sync, 'dark', view);
await browser.close();
server.close();
