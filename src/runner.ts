import 'dotenv/config';
import { chromium } from 'playwright';
import { invariantChecklist, InvariantContext } from './invariants';

async function main() {
  const targetUrl = process.env.TARGET_URL || 'https://academybugs.com/find-bugs/';
  const headless = process.env.HEADLESS !== 'false';

  console.log('='.repeat(60));
  console.log('🚀 METAMORPHIC & INVARIANT WEB TEST RUNNER');
  console.log(`🌐 Target:   ${targetUrl}`);
  console.log(`📋 Checks:   ${invariantChecklist.length} Invariants Registered`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless });

  try {
    // -------------------------------------------------------------
    // Phase 1: Observation & Dynamic Seed Harvesting
    // -------------------------------------------------------------
    console.log('\n[Phase 1: Observation & Seed Harvesting]');
    console.log(`Navigating to ${targetUrl}...`);

    const harvestContext = await browser.newContext();
    const harvestPage = await harvestContext.newPage();
    const harvestedSeeds: string[] = [];

    // Sniff network responses for background JSON
    harvestPage.on('response', async (res) => {
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
      } catch {}
    });

    await harvestPage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await harvestPage.waitForTimeout(2000);

    // Fallback: Sniff visible headings / product titles from DOM
    if (harvestedSeeds.length === 0) {
      console.log('Sniffing DOM items for fallback seeds...');
      const domTitles = await harvestPage
        .locator('h1, h2, h3, [role="article"] a, [class*="title" i] a, td.title a')
        .allInnerTexts();

      for (const t of domTitles) {
        const clean = t.trim();
        if (clean.length > 4 && !clean.includes('Login') && !clean.includes('Sign up') && !clean.includes('Cookie')) {
          harvestedSeeds.push(clean);
        }
      }
    }

    await harvestContext.close();

    const uniqueSeeds = Array.from(new Set(harvestedSeeds)).slice(0, 5);
    console.log(`🌱 Harvested ${uniqueSeeds.length} seeds:`);
    uniqueSeeds.forEach((s, idx) => console.log(`   ${idx + 1}. "${s}"`));

    const invContext: InvariantContext = {
      targetUrl,
      seeds: uniqueSeeds,
    };

    // -------------------------------------------------------------
    // Phase 2: Isolated Execution of Invariant Checklist
    // -------------------------------------------------------------
    console.log('\n[Phase 2: Executing Invariant Checklist]');
    console.log('-'.repeat(60));

    const results: { name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; message: string }[] = [];

    for (let i = 0; i < invariantChecklist.length; i++) {
      const check = invariantChecklist[i];
      process.stdout.write(`[${i + 1}/${invariantChecklist.length}] ${check.name}... `);

      // Clean-room isolation: each invariant gets a fresh context and page
      const isolatedContext = await browser.newContext();
      const isolatedPage = await isolatedContext.newPage();

      try {
        await isolatedPage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await isolatedPage.waitForTimeout(1000);

        const rawRes = await check.run(isolatedPage, invContext);
        const checkResults = Array.isArray(rawRes) ? rawRes : [rawRes];

        for (const res of checkResults) {
          const entryName = res.details?.title || check.name;
          results.push({ name: entryName, status: res.status, message: res.message });

          if (res.status === 'PASS') {
            console.log('✅ PASS');
          } else if (res.status === 'SKIPPED') {
            console.log('⚠️  SKIPPED');
          } else {
            console.log('❌ FAIL');
          }
          console.log(`    ↳ ${res.message}`);
        }
      } catch (err: any) {
        results.push({ name: check.name, status: 'FAIL', message: err.message });
        console.log('❌ ERROR');
        console.log(`    ↳ ${err.message}`);
      } finally {
        await isolatedContext.close();
      }
    }

    // -------------------------------------------------------------
    // Phase 3: Verification Summary & Exit Code
    // -------------------------------------------------------------
    console.log('\n' + '='.repeat(60));
    console.log('📊 INVARIANT VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    for (const r of results) {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'SKIPPED' ? '⚠️ ' : '❌';
      console.log(`${icon} [${r.status.padEnd(7)}] ${r.name}`);
    }
    console.log('='.repeat(60));

    const hasFailures = results.some((r) => r.status === 'FAIL');
    if (hasFailures) {
      console.error('\n❌ Suite finished with invariant failures (exiting with code 1 for CI).');
      process.exit(1);
    } else {
      console.log('\n✅ All active invariants passed successfully.');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
