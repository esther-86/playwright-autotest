import 'dotenv/config';
import { chromium } from 'playwright';
import { getBrain } from './brain';
import { extractInteractiveElements } from './observer/treeParser';
import { invariantChecklist, InvariantContext } from './invariants';

async function runExplorer() {
  const startUrl = process.env.TARGET_URL || 'https://academybugs.com/';
  const headless = process.env.HEADLESS !== 'false';
  const maxPages = 5; // Exploration budget for MVP

  console.log('='.repeat(60));
  console.log('🤖 AUTONOMOUS WEB QA EXPLORER (AGENT 1)');
  console.log(`🌐 Origin:      ${startUrl}`);
  console.log(`🧠 Brain:       ${process.env.LLM_PROVIDER || 'antigravity'}`);
  console.log(`📊 Max Budget:  ${maxPages} pages`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const brain = getBrain();

  const visitedUrls = new Set<string>();
  const unvisitedQueue: string[] = [startUrl];

  const candidateBugs: Array<{ pageUrl: string; invariant: string; reason: string }> = [];

  try {
    while (unvisitedQueue.length > 0 && visitedUrls.size < maxPages) {
      const currentUrl = unvisitedQueue.shift()!;
      if (visitedUrls.has(currentUrl)) continue;

      visitedUrls.add(currentUrl);
      console.log(`\n🔍 [Exploring ${visitedUrls.size}/${maxPages}]: ${currentUrl}`);

      await page.goto(currentUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1000);

      // 1. The Eyes: Extract interactive elements
      const elements = await extractInteractiveElements(page);
      console.log(`   👀 Discovered ${elements.length} interactive controls`);

      // 2. Queue Discovery: Add any new same-domain links to queue
      const originHost = new URL(startUrl).hostname;
      for (const el of elements) {
        if (el.role === 'link') {
          // Find internal URLs to queue
          const href = await page.locator(el.selector).getAttribute('href').catch(() => null);
          if (href && !href.startsWith('#') && !href.startsWith('mailto:')) {
            try {
              const fullUrl = new URL(href, currentUrl).href;
              if (new URL(fullUrl).hostname === originHost && !visitedUrls.has(fullUrl)) {
                if (!unvisitedQueue.includes(fullUrl)) {
                  unvisitedQueue.push(fullUrl);
                }
              }
            } catch {}
          }
        }
      }

      // 3. The Brain: Decide the best action on this page
      const decision = await brain.decideNextStep(elements, currentUrl);
      console.log(`   🧠 Brain Decision: ${decision.action} (${decision.reason})`);

      // 4. The Hands: Execute decision
      if (decision.action === 'TEST_INVARIANT') {
        const check = invariantChecklist.find((c) => c.id === decision.invariantId) || invariantChecklist[0];
        const invContext: InvariantContext = { targetUrl: currentUrl, seeds: ['Shoes', 'Bugs'] };

        const res = await check.run(page, invContext);
        if (res.status === 'FAIL') {
          console.log(`   ❌ CANDIDATE BUG FOUND: ${check.name} -> ${res.message}`);
          candidateBugs.push({ pageUrl: currentUrl, invariant: check.name, reason: res.message });
        } else {
          console.log(`   ${res.status === 'PASS' ? '✅' : '⚠️ '} Invariant Result: [${res.status}] ${res.message}`);
        }
      } else if (decision.action === 'CLICK') {
        await page.locator(decision.target).click().catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 EXPLORATION COMPLETE');
    console.log(`Pages Visited:       ${visitedUrls.size}`);
    console.log(`Candidate Bugs Found: ${candidateBugs.length}`);
    console.log('='.repeat(60));

    if (candidateBugs.length > 0) {
      console.log('\n🚨 Candidate Bugs to Hand to Agent 2 (Reproducer):');
      candidateBugs.forEach((b, i) => console.log(`   ${i + 1}. [${b.invariant}] on ${b.pageUrl}\n      ↳ ${b.reason}`));
    }
  } finally {
    await browser.close();
  }
}

runExplorer().catch((err) => {
  console.error('Explorer error:', err);
  process.exit(1);
});
