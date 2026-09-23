import { chromium } from 'playwright';
import { getBrain } from './brain';
import { extractInteractiveElements, getMainContentLocator, isInExplorationScope } from './observer/treeParser';
import { getUrlArchetype } from './observer/archetypes';
import { invariantChecklist, InvariantContext } from './invariants';
import { BugQueue, CandidateBugMetadata } from './queue/bugQueue';
import { logger } from './utils/logger';
import { config } from './config';
import { settlePage, timing } from './timing';

export interface FlowPage {
  url: string;
  depth: number;
  reachedFrom: string;
  trigger: string;
}

async function runExplorer() {
  const startUrl = config.targetUrl;
  const maxDepth = config.maxExplorationDepth;
  const headless = config.headless;
  const timeBudgetSeconds = config.explorationTimeSeconds;
  const timeBudgetMs = timeBudgetSeconds * 1000;
  const startTime = Date.now();

  BugQueue.init();

  logger.info('EXPLORER', 'Starting autonomous metamorphic QA explorer', {
    origin: startUrl,
    provider: config.llmProvider,
    timeBudget: `${timeBudgetSeconds}s`,
    maxDepth,
    availableInvariants: invariantChecklist.length,
  });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const brain = getBrain();

  // Start Playwright Action Tracing
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  const visitedUrls = new Set<string>();
  const visitedArchetypes = new Set<string>();

  // Feature-Flow Ledger maintains causal ancestry
  const flowQueue: FlowPage[] = [
    {
      url: startUrl,
      depth: 0,
      reachedFrom: 'START',
      trigger: 'Initial target',
    },
  ];

  const rootOrigin = new URL(startUrl).origin;

  function mayFollow(
    sourceWasInMainContent: boolean,
    depth: number,
    destination: URL,
  ): boolean {
    return (
      sourceWasInMainContent &&
      depth < maxDepth &&
      destination.origin === rootOrigin
    );
  }


  const knownBugFingerprints = new Set<string>();
  const packagedBugs: string[] = [];

  // Pre-seed known bugs from existing queue
  const existingBugs = BugQueue.listPendingBugs();
  for (const eb of existingBugs) {
    knownBugFingerprints.add(`${eb.invariantId}:${eb.title.toLowerCase().trim()}`);
  }

  // Invariant lookup map
  const invariantMap = new Map(invariantChecklist.map((c) => [c.id, c]));

  try {
    while (flowQueue.length > 0 && Date.now() - startTime < timeBudgetMs) {
      const currentFlow = flowQueue.shift()!;
      const currentUrl = currentFlow.url;
      if (visitedUrls.has(currentUrl)) continue;

      const archetype = getUrlArchetype(currentUrl);
      visitedUrls.add(currentUrl);
      visitedArchetypes.add(archetype);

      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      logger.info(
        'NAVIGATE',
        `Visiting [${archetype}] [Depth ${currentFlow.depth}/${maxDepth}] [${elapsedSec}s / ${timeBudgetSeconds}s]: ${currentUrl} (via: ${currentFlow.trigger})`
      );

      try {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: timing.explorerNavigationMs });
        await settlePage(page);
      } catch (err: any) {
        logger.warn('NAVIGATE', `Failed loading ${currentUrl}: ${err.message}`);
        continue;
      }

      // Universal dismissal of common cookie / consent dialogs
      const cookieBtn = page.locator(
        'button:has-text("Accept"), button:has-text("Functional Only"), button:has-text("Agree"), [aria-label*="cookie" i] button'
      ).first();
      if (await cookieBtn.isVisible().catch(() => false)) {
        await cookieBtn.click().catch(() => {});
        await settlePage(page);
      }

      const mainContent = getMainContentLocator(page);
      const hasMain = (await mainContent.count().catch(() => 0)) > 0;

      // 1. Discover Interactive Elements strictly scoped inside main-content
      const elements = await extractInteractiveElements(page);
      logger.info('OBSERVER', `Discovered ${elements.length} semantic controls in main content on ${currentUrl}`);

      // 2. Discover new navigation links dynamically from within main content
      const linkCandidates = (hasMain ? mainContent : page).locator('a[href]:visible');
      const linkCount = await linkCandidates.count().catch(() => 0);

      let newlyQueued = 0;
      for (let i = 0; i < Math.min(linkCount, 35); i++) {
        try {
          const anchor = linkCandidates.nth(i);
          const rawUrl = await anchor.getAttribute('href');
          if (!rawUrl || rawUrl === '#' || rawUrl.startsWith('javascript:')) continue;

          // Scope check: must belong to mainContent and avoid blocked chrome ancestors
          const inScope = hasMain ? await isInExplorationScope(anchor, mainContent) : true;
          if (!inScope) {
            continue;
          }

          const parsed = new URL(rawUrl, currentUrl);
          const linkText = (await anchor.innerText().catch(() => '')) || 'In-scope card/link';

          if (
            !parsed.hash &&
            !visitedUrls.has(parsed.href) &&
            !flowQueue.some((f) => f.url === parsed.href) &&
            mayFollow(inScope, currentFlow.depth, parsed)
          ) {
            newlyQueued++;
            flowQueue.push({
              url: parsed.href,
              depth: currentFlow.depth + 1,
              reachedFrom: currentUrl,
              trigger: linkText.trim().replace(/\s+/g, ' ').slice(0, 40),
            });
          }
        } catch {}
      }
      logger.info('FLOW', `Discovered and queued ${newlyQueued} in-scope feature-flow routes from ${currentUrl}`);


      // 3. LLM Runtime Invariant Selection & Parameterization
      const selections = await brain.selectInvariantsForPage(elements, currentUrl);
      logger.info('BRAIN', `Selected ${selections.length} applicable metamorphic invariants for this screen`);

      for (const sel of selections) {
        if (Date.now() - startTime >= timeBudgetMs) break;

        const check = invariantMap.get(sel.invariantId);
        if (!check) continue;

        const invContext: InvariantContext = {
          targetUrl: currentUrl,
          targetSelector: sel.targetSelector,
          params: sel.params,
        };

        try {
          const rawRes = await check.run(page, invContext);
          const results = Array.isArray(rawRes) ? rawRes : [rawRes];

          for (const res of results) {
            // Clean-room recovery: If a test triggered crash overlay or navigated away, restore screen
            const crashOverlay = page.locator('[class*="crash" i]');
            if ((await crashOverlay.isVisible().catch(() => false)) || page.url() !== currentUrl) {
              await page.goto(currentUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
              await settlePage(page);
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

                // Capture Playwright Action Trace and cycle tracing
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

      // 4. Autonomous Navigation via Brain with Feature-Flow Boundary Protection
      const decision = await brain.decideNextStep(elements, currentUrl);
      if (decision.action === 'CLICK' && decision.target) {
        const targetLocator = page.locator(decision.target).first();
        const hasTarget = (await targetLocator.count().catch(() => 0)) > 0;

        if (hasTarget && hasMain) {
          const inScope = await isInExplorationScope(targetLocator, mainContent);
          if (!inScope) {
            logger.warn(
              'SCOPE',
              `Action target out of scope (chrome/nav ancestor detected): "${decision.target}" - SKIPPED_OUT_OF_SCOPE`
            );
            continue;
          }
        }

        logger.info('ACTION', `Brain navigating: Click on ${decision.target}`);
        await targetLocator.click().catch(() => {});
        await page.waitForLoadState('domcontentloaded').catch(() => {});

        const navigatedUrl = page.url();
        if (
          navigatedUrl !== currentUrl &&
          !visitedUrls.has(navigatedUrl) &&
          !flowQueue.some((f) => f.url === navigatedUrl)
        ) {
          try {
            const parsed = new URL(navigatedUrl);
            if (mayFollow(true, currentFlow.depth, parsed)) {
              flowQueue.unshift({
                url: navigatedUrl,
                depth: currentFlow.depth + 1,
                reachedFrom: currentUrl,
                trigger: `Brain action: ${decision.target}`,
              });
              logger.info('FLOW', `Brain action navigated directly to child route [Depth ${currentFlow.depth + 1}]: ${navigatedUrl}`);
            }
          } catch {}
        }
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
    console.log(`📄 Pages Visited:        ${visitedUrls.size}`);
    console.log(`📦 New Bugs Packaged:    ${packagedBugs.length}`);
    console.log(`📁 Local Defect Queue:   queue/`);
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
