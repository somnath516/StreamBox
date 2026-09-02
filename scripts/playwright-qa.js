const { chromium } = require('playwright');

const base = (process.argv[2] || process.env.STREAMBOX_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const pages = ['/index.html', '/player.html', '/upload.html', '/database.html'];
const viewports = [
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    for (const pathname of pages) {
      const page = await context.newPage();
      const issues = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') issues.push(`console:${msg.text()}`);
      });
      page.on('requestfailed', (req) => issues.push(`requestfailed:${req.url()} ${req.failure()?.errorText}`));
      page.on('pageerror', (err) => issues.push(`pageerror:${err.message}`));

      const res = await page.goto(`${base}${pathname}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(500);
      if (pathname === '/player.html') {
        const videoBox = await page.locator('video').boundingBox().catch(() => null);
        if (!videoBox) issues.push('missing-video');
      }

      const broken = await page.evaluate(() => [...document.images]
        .filter((img) => img.currentSrc && img.complete && img.naturalWidth === 0)
        .map((img) => img.currentSrc));
      if (broken.length) issues.push(`broken-images:${broken.join(',')}`);

      results.push({ viewport: viewport.name, page: pathname, status: res?.status(), issues });
      await page.close();
    }
    await context.close();
  }

  await browser.close();
  const failed = results.filter((result) => result.status !== 200 || result.issues.length);
  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
