import 'dotenv/config';
import { chromium } from 'playwright';
import { invariantChecklist, InvariantContext } from './invariants';

async function main() {
  const targetUrl = process.env.TARGET_URL || 'https://academybugs.com/';
  const headless = process.env.HEADLESS !== 'false';

  console.log('='.repeat(60));
  console.log('🚀 METAMORPHIC & INVARIANT WEB TEST RUNNER');
  console.log(`🌐 Target:   ${targetUrl}`);
  console.log(`📋 Checks:   ${invariantChecklist.length} Invariants Registered`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const harvestedSeeds: string[] = [];

  // 1. Passive Network Interceptor: Sniff JSON responses
  page.on('response', async (res) => {
    try {
      const contentType = res.headers()['content-type'] || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        const text = JSON.stringify(json);
        const matches = text.match(/"(title|name|heading|sku)"\s*:\s*"([^"]+)"/gi);
        if (matches) {
          for (const m of matches) {
            const val = m.split(':')[1]?.replace(/["']/g, '').trim();
            if (val && val.length > 5 && val.length < 80 && !val.startsWith('http')) {
              harvestedSeeds.push(val);
            }
          }
        }
      }
    } catch { }
  });

  console.log('\n[Phase 1: Observation & Seed Harvesting]');
  console.log(`Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // 2. DOM Harvest Fallback if network had no clean JSON
  if (harvestedSeeds.length === 0) {
    console.log('Sniffing DOM items for fallback seeds...');
    const domTitles = await page.locator('td.title a, h1, h2, h3, [role="article"] a').allInnerTexts();
    for (const t of domTitles) {
      const clean = t.trim();
      if (clean.length > 6 && !clean.includes('Login') && !clean.includes('Sign up')) {
        harvestedSeeds.push(clean);
      }
    }
  }

  const uniqueSeeds = Array.from(new Set(harvestedSeeds)).slice(0, 5);
  console.log(`🌱 Harvested ${uniqueSeeds.length} seeds:`);
  uniqueSeeds.forEach((s, idx) => console.log(`   ${idx + 1}. "${s}"`));

  const invContext: InvariantContext = {
    targetUrl,
    seeds: uniqueSeeds,
  };

  // 3. Run the Checklist
  console.log('\n[Phase 2: Executing Invariant Checklist]');
  console.log('-'.repeat(60));

  const results: { name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; message: string }[] = [];

  for (let i = 0; i < invariantChecklist.length; i++) {
    const check = invariantChecklist[i];
    process.stdout.write(`[${i + 1}/${invariantChecklist.length}] ${check.name}... `);

    try {
      if (page.url() !== targetUrl) {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => { });
        await page.waitForTimeout(1000);
      }
      const res = await check.run(page, invContext);
      results.push({ name: check.name, status: res.status, message: res.message });

      if (res.status === 'PASS') {
        console.log('✅ PASS');
      } else if (res.status === 'SKIPPED') {
        console.log('⚠️  SKIPPED');
      } else {
        console.log('❌ FAIL');
      }
      console.log(`    ↳ ${res.message}`);
    } catch (err: any) {
      results.push({ name: check.name, status: 'FAIL', message: err.message });
      console.log('❌ ERROR');
      console.log(`    ↳ ${err.message}`);
    }
  }

  // 4. Summary Table
  console.log('\n' + '='.repeat(60));
  console.log('📊 INVARIANT VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'SKIPPED' ? '⚠️ ' : '❌';
    console.log(`${icon} [${r.status.padEnd(7)}] ${r.name}`);
  }
  console.log('='.repeat(60));

  await browser.close();
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
