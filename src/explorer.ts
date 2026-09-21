import 'dotenv/config';
import { chromium } from 'playwright';
import { getBrain } from './brain';
import { extractInteractiveElements } from './observer/treeParser';
import { getUrlArchetype } from './observer/archetypes';
import { invariantChecklist, InvariantContext } from './invariants';
import { BugQueue, CandidateBugMetadata } from './queue/bugQueue';
import { logger } from './utils/logger';

async function runExplorer() {
  const startUrl = process.env.TARGET_URL || 'https://academybugs.com/find-bugs/';
  const headless = process.env.HEADLESS !== 'false';
  const timeBudgetSeconds = parseInt(process.env.EXPLORATION_TIME_SECONDS || '300', 10);
  const timeBudgetMs = timeBudgetSeconds * 1000;
  const startTime = Date.now();

  BugQueue.init();

  logger.info('EXPLORER', 'Starting autonomous metamorphic QA explorer', {
    origin: startUrl,
    provider: process.env.LLM_PROVIDER,
    timeBudget: `${timeBudgetSeconds}s`,
    checksRegistered: invariantChecklist.length,
  });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const brain = getBrain();

  // Start Playwright Action Tracing
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  const visitedUrls = new Set<string>();
  const visitedArchetypes = new Set<string>();

  // Queue initial archetypes covering Catalog, Details, Cart, Account, and Auxiliary pages
  const unvisitedQueue: string[] = [
    startUrl,
    'https://academybugs.com/store/dnk-yellow-shoes/',
    'https://academybugs.com/store/dark-grey-jeans/',
    'https://academybugs.com/store/anchor-bracelet/',
    'https://academybugs.com/my-cart/',
    'https://academybugs.com/account/?ec_page=login',
    'https://academybugs.com/account/?ec_page=forgot_password',
    'https://academybugs.com/account/?ec_page=dashboard',
    'https://academybugs.com/account/?ec_page=billing_information',
    'https://academybugs.com/account/?ec_page=order_history',
    'https://academybugs.com/articles/',
    'https://academybugs.com/latest-news/',
    'https://academybugs.com/opportunities-we-provide',
    'https://academybugs.com/what-we-offer',
    'https://academybugs.com/contact-us-form/',
    'https://academybugs.com/request-a-quote/',
  ];

  const knownBugFingerprints = new Set<string>();
  const packagedBugs: string[] = [];
  let itemAddedToCart = false;

  // Pre-seed known bugs from existing queue
  const existingBugs = BugQueue.listPendingBugs();
  for (const eb of existingBugs) {
    knownBugFingerprints.add(`${eb.invariantId}:${eb.title.toLowerCase().trim()}`);
  }

  try {
    while (unvisitedQueue.length > 0 && Date.now() - startTime < timeBudgetMs) {
      const currentUrl = unvisitedQueue.shift()!;
      if (visitedUrls.has(currentUrl)) continue;

      const archetype = getUrlArchetype(currentUrl);
      visitedUrls.add(currentUrl);
      visitedArchetypes.add(archetype);

      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      logger.info('NAVIGATE', `Visiting [${archetype}] [${elapsedSec}s / ${timeBudgetSeconds}s]: ${currentUrl}`);

      try {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(1000);
      } catch (err: any) {
        logger.warn('NAVIGATE', `Failed loading ${currentUrl}: ${err.message}`);
        continue;
      }

      // Dismiss cookie banners
      const cookieBtn = page.locator('button:has-text("Accept"), button:has-text("Functional Only")').first();
      if (await cookieBtn.isVisible().catch(() => false)) {
        await cookieBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // Auto Add-To-Cart seed to prime Cart invariants
      if (!itemAddedToCart && (currentUrl.includes('/store/') || currentUrl.includes('/find-bugs/'))) {
        const addToCartBtn = page.locator(
          '.ec_details_add_to_cart a, .ec_product_add_to_cart a, a:has-text("ADD TO CART"), input[value*="Add to Cart" i]'
        ).first();
        if (await addToCartBtn.isVisible().catch(() => false)) {
          logger.info('ACTION', 'Priming cart state: clicked Add to Cart');
          await addToCartBtn.click().catch(() => {});
          await page.waitForTimeout(1000);
          itemAddedToCart = true;
        }
      }

      // 1. Discover Interactive Elements
      const elements = await extractInteractiveElements(page);
      logger.info('OBSERVER', `Discovered ${elements.length} semantic controls on ${currentUrl}`);

      // 2. Discover new internal links
      const originHost = new URL(startUrl).hostname;
      const discoveredHrefs = await page
        .locator('a[href]')
        .evaluateAll((anchors: any[]) => anchors.map((a) => a.href))
        .catch(() => [] as string[]);

      for (const rawUrl of discoveredHrefs) {
        try {
          const parsed = new URL(rawUrl);
          if (
            parsed.hostname === originHost &&
            !parsed.hash &&
            !visitedUrls.has(parsed.href) &&
            !unvisitedQueue.includes(parsed.href)
          ) {
            const linkArch = getUrlArchetype(parsed.href);
            if (!visitedArchetypes.has(linkArch)) {
              unvisitedQueue.push(parsed.href);
            }
          }
        } catch {}
      }

      // 3. Evaluate Applicable Metamorphic Invariants on this screen
      const invContext: InvariantContext = { targetUrl: currentUrl, seeds: ['Shoes', 'Jeans', 'DNK'] };

      for (const check of invariantChecklist) {
        if (Date.now() - startTime >= timeBudgetMs) break;

        // If check has restricted archetypes, verify match
        if (check.applicableArchetypes && check.applicableArchetypes.length > 0) {
          const matches = check.applicableArchetypes.some((a) => {
            const cleanPattern = a.replace(/:\w+/g, '').replace(/[*]/g, '');
            return currentUrl.includes(cleanPattern);
          });
          if (!matches) continue;
        }

        try {
          const rawRes = await check.run(page, invContext);
          const results = Array.isArray(rawRes) ? rawRes : [rawRes];

          for (const res of results) {
            // Clean-room recovery: If a check navigated away or injected crash overlay, reset view
            const crashOverlay = page.locator('.academy-crash-overlay-bug');
            if (await crashOverlay.isVisible().catch(() => false) || (page.url() !== currentUrl && !currentUrl.includes('login') && !currentUrl.includes('my-cart'))) {
              await page.goto(currentUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
              await page.waitForTimeout(500);
            }

            if (res.status === 'FAIL') {
              const bugTitle = res.details?.title || `${check.name} Failure on ${archetype}`;
              const fp = `${check.id}:${bugTitle.toLowerCase().trim()}`;

              if (!knownBugFingerprints.has(fp)) {
                knownBugFingerprints.add(fp);

                const bugMeta: Omit<CandidateBugMetadata, 'id' | 'createdAt'> = {
                  targetUrl: currentUrl,
                  title: bugTitle,
                  invariantId: check.id,
                  severity: res.details?.severity || 'HIGH',
                  expected: res.details?.expected || check.description,
                  actual: res.details?.actual || res.message,
                  reproductionSteps: res.details?.reproductionSteps || [
                    `Navigate to ${currentUrl}`,
                    `Execute invariant probe "${check.name}"`,
                    `Observe failure: ${res.message}`
                  ],
                  specSnippet: res.details?.specSnippet,
                  consoleErrors: res.details?.consoleErrors || [],
                  failedRequests: res.details?.failedRequests || [],
                };

                const savedBug = BugQueue.saveCandidateBug(bugMeta);
                packagedBugs.push(savedBug.id);

                // Capture and cycle Playwright Action Trace
                await context.tracing.stop({ path: savedBug.tracePath }).catch(() => {});
                await context.tracing.start({ screenshots: true, snapshots: true, sources: true }).catch(() => {});

                logger.error('INVARIANT', `🚨 CANDIDATE BUG DETECTED & PACKAGED: [${savedBug.id}] ${bugTitle}`, {
                  queueFolder: savedBug.folderPath,
                  specFile: savedBug.specPath,
                  reason: res.message,
                });
              }
            } else if (res.status === 'PASS') {
              logger.info('INVARIANT', `✅ [PASS] ${check.name}`);
            }
          }
        } catch (err: any) {
          logger.warn('INVARIANT', `Check ${check.name} encountered runtime error: ${err.message}`);
        }
      }

      // 4. Autonomous Navigation via Brain
      const decision = await brain.decideNextStep(elements, currentUrl);
      if (decision.action === 'CLICK' && decision.target) {
        logger.info('ACTION', `Brain executing: Click on ${decision.target}`);
        await page.locator(decision.target).click().catch(() => {});
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      }
    }

    try {
      await context.tracing.stop();
    } catch {}

    const totalDurationSec = Math.round((Date.now() - startTime) / 1000);
    logger.info(
      'EXPLORER',
      `Exploration complete in ${totalDurationSec}s. Visited: ${visitedUrls.size} pages. Bugs Packaged: ${packagedBugs.length}`
    );

    console.log('\n' + '='.repeat(60));
    console.log('🏁 AUTONOMOUS METAMORPHIC EXPLORER SUMMARY');
    console.log('='.repeat(60));
    console.log(`🌐 Origin:               ${startUrl}`);
    console.log(`⏱️ Duration:             ${totalDurationSec}s`);
    console.log(`📄 Archetypes Visited:   ${visitedArchetypes.size}`);
    console.log(`📦 New Bugs Packaged:    ${packagedBugs.length}`);
    console.log(`📁 Artifact Directory:   queue/`);
    for (const b of packagedBugs) {
      console.log(`   ↳ queue/${b}/ (metadata.json + report.md + repro.spec.ts + trace.zip)`);
    }
    console.log('='.repeat(60));
  } finally {
    await browser.close();
  }
}

runExplorer().catch((err) => {
  logger.error('EXPLORER', 'Fatal explorer crash', { error: err.message, stack: err.stack });
  process.exit(1);
});
