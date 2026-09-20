import 'dotenv/config';
import { chromium } from 'playwright';
import { getBrain } from './brain';
import { extractInteractiveElements } from './observer/treeParser';
import { invariantChecklist, InvariantContext } from './invariants';
import { logger } from './utils/logger';

async function runExplorer() {
  const startUrl = process.env.TARGET_URL || 'https://academybugs.com/';
  const headless = process.env.HEADLESS !== 'false';
  const maxPages = 5; // Exploration budget for MVP

  logger.info('EXPLORER', `Starting autonomous exploration`, { origin: startUrl, provider: process.env.LLM_PROVIDER, maxBudget: maxPages });

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
      logger.info('NAVIGATE', `Visiting page ${visitedUrls.size}/${maxPages}: ${currentUrl}`);

      const navStart = Date.now();
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded' }).catch((err) => {
        logger.error('NAVIGATE', `Failed to load ${currentUrl}`, { error: err.message });
      });
      await page.waitForTimeout(1000);

      // 1. The Eyes: Extract interactive elements
      const elements = await extractInteractiveElements(page);
      logger.info('OBSERVER', `Discovered ${elements.length} interactive elements on ${currentUrl}`);

      // 2. Queue Discovery: Extract all valid internal links in 1 single pass (instant)
      const originHost = new URL(startUrl).hostname;
      const discoveredHrefs = await page
        .locator('a[href]')
        .evaluateAll((anchors: any[]) => anchors.map((a) => a.href))
        .catch(() => [] as string[]);

      let newLinksFound = 0;
      for (const rawUrl of discoveredHrefs) {
        try {
          const parsed = new URL(rawUrl);
          // Only same origin, ignore anchors (#) and mailto
          if (
            parsed.hostname === originHost &&
            !parsed.hash &&
            !visitedUrls.has(parsed.href) &&
            !unvisitedQueue.includes(parsed.href)
          ) {
            unvisitedQueue.push(parsed.href);
            newLinksFound++;
          }
        } catch {}
      }

      if (newLinksFound > 0) {
        logger.info('QUEUE', `Queued ${newLinksFound} new internal pages (Queue size: ${unvisitedQueue.length})`);
      }

      // 3. The Brain: Decide the best action on this page
      const decision = await brain.decideNextStep(elements, currentUrl);
      logger.info('BRAIN', `Action: ${decision.action} (${decision.reason})`);

      // 4. The Hands: Execute decision
      if (decision.action === 'TEST_INVARIANT') {
        const check = invariantChecklist.find((c) => c.id === decision.invariantId) || invariantChecklist[0];
        const invContext: InvariantContext = { targetUrl: currentUrl, seeds: ['Shoes', 'Bugs'] };

        const res = await check.run(page, invContext);
        if (res.status === 'FAIL') {
          logger.error('INVARIANT', `CANDIDATE BUG DETECTED: [${check.name}] on ${currentUrl}`, { reason: res.message });
          candidateBugs.push({ pageUrl: currentUrl, invariant: check.name, reason: res.message });
        } else {
          logger.info('INVARIANT', `Result: [${res.status}] ${check.name}`, { message: res.message });
        }
      } else if (decision.action === 'CLICK') {
        logger.info('ACTION', `Clicking target: ${decision.target}`);
        await page.locator(decision.target).click().catch((err) => {
          logger.warn('ACTION', `Click failed on ${decision.target}`, { error: err.message });
        });
        await page.waitForLoadState('networkidle').catch(() => {});
      }
    }

    logger.info('EXPLORER', `Exploration complete. Visited: ${visitedUrls.size} pages. Bugs: ${candidateBugs.length}`);
  } finally {
    await browser.close();
  }
}

runExplorer().catch((err) => {
  logger.error('EXPLORER', 'Fatal explorer crash', { error: err.message, stack: err.stack });
  process.exit(1);
});
