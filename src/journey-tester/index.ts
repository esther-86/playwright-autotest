import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { config, AppConfig } from '../config';
import { invariantChecklist, InvariantCheck, InvariantContext, InvariantResult } from '../invariants';
import { BugQueue, CandidateBugMetadata } from '../queue/bugQueue';
import { DiscoveredAction } from '../tree-explorer/types';
import {
  capturePageEvidence,
  createLLMJudge,
  createNetworkRecorder,
  executeSafeProbes,
  sanitizeNetworkUrl,
} from '../llm-judge';
import { settlePage, timing } from '../timing';

/**
 * Stage 2: Autonomous Journey Invariant Explorer
 *
 * Replays state-tree journeys discovered in Stage 1 ('url:explore'),
 * probes for metamorphic invariant failures, runtime errors, and broken workflows,
 * and outputs confirmed defect folders with metadata.json, report.md, repro.spec.ts, and trace.zip.
 */
export async function runJourneyExplorer(appConfig: AppConfig = config) {
  const artifactsDir = path.resolve(process.cwd(), 'artifacts');
  const specPath = path.join(artifactsDir, 'state-tree-journeys.spec.ts');
  const jsonPath = path.join(artifactsDir, 'state-tree-journeys.json');
  const bugsDir = path.join(artifactsDir, 'bugs');

  BugQueue.setOutputDir(bugsDir);
  BugQueue.init();

  console.log('='.repeat(65));
  console.log('🔬 STAGE 2: AUTONOMOUS JOURNEY INVARIANT TESTER');
  console.log(`🌐 Target URL:           ${appConfig.targetUrl}`);
  console.log(`⚙ Invariant Mode:        ${appConfig.invariantMode}`);
  console.log(`⏱ Time Budget:          ${appConfig.journeyTimeBudgetSeconds}s`);
  console.log(`🕶 Headless:             ${appConfig.headless}`);
  const llmJudge = createLLMJudge(appConfig);
  console.log(`🧠 LLM Judge:            ${llmJudge.available ? `ON — ${llmJudge.providerName}` : 'OFF'}`);
  console.log('='.repeat(65));

  if (appConfig.llmJudgeEnabled && !llmJudge.available) {
    console.warn(
      `⚠ LLM_JUDGE_ENABLED=true, but provider "${appConfig.llmProvider}" has no usable judge configuration. ` +
      'Continuing with deterministic checks.'
    );
  }

  // 1. Prerequisite Check: Ensure Stage 1 has run
  if (!fs.existsSync(specPath) && !fs.existsSync(jsonPath)) {
    console.error(`\n❌ Error: State-Tree artifact 'artifacts/state-tree-journeys.spec.ts' not found!`);
    console.error(`Please run 'npm run url:explore' first to discover and generate journey scenarios.\n`);
    process.exit(1);
  }

  // 2. Load Journey Scenarios
  let journeys: DiscoveredAction[][] = [];
  if (fs.existsSync(jsonPath)) {
    try {
      journeys = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch {
      journeys = [];
    }
  }

  // Fallback: Parse spec.ts if json is missing or empty
  if (journeys.length === 0 && fs.existsSync(specPath)) {
    journeys = parseJourneysFromSpec(fs.readFileSync(specPath, 'utf-8'));
  }

  if (journeys.length === 0) {
    console.error('\n⚠ No journeys found in artifacts! Run npm run url:explore to generate journeys.');
    process.exit(1);
  }

  if (appConfig.maxJourneysToTest > 0) {
    journeys = journeys.slice(0, appConfig.maxJourneysToTest);
  }

  console.log(`\n📋 Loaded ${journeys.length} journey scenario(s) from artifacts.`);

  const browser: Browser = await chromium.launch({ headless: appConfig.headless });
  const detectedDefects: Array<{ id: string; invariantId: string; title: string; folderPath: string }> = [];
  const startTime = Date.now();
  const timeBudgetMs = appConfig.journeyTimeBudgetSeconds * 1000;

  try {
    for (let jIdx = 0; jIdx < journeys.length; jIdx++) {
      if (Date.now() - startTime >= timeBudgetMs) {
        console.log(`\n⏱ Journey testing stopped: reached time budget of ${appConfig.journeyTimeBudgetSeconds}s.`);
        break;
      }

      const journey = journeys[jIdx];
      const journeyTitle = journey.map((s) => s.description).join(' ➔ ');
      console.log(`\n▶ [Journey ${jIdx + 1}/${journeys.length}] Testing: "${journeyTitle}"`);

      const context = await browser.newContext();
      // Start Playwright action tracing for artifact capture
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = await context.newPage();
      const networkRecorder = createNetworkRecorder(page);

      const consoleErrors: string[] = [];
      const uncaughtPageErrors: string[] = [];
      const failedRequests: Array<{ url: string; status: number }> = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
        uncaughtPageErrors.push(err.message);
      });
      page.on('response', (resp) => {
        if (resp.status() >= 400 && !resp.url().includes('favicon') && !resp.url().includes('.png')) {
          failedRequests.push({ url: sanitizeNetworkUrl(resp.url()), status: resp.status() });
        }
      });
      page.on('requestfailed', (request) => {
        failedRequests.push({ url: sanitizeNetworkUrl(request.url()), status: 0 });
      });

      let executionError: string | null = null;
      const completedSteps: string[] = [];
      let llmBugMeta: Omit<CandidateBugMetadata, 'id' | 'createdAt'> | null = null;

      try {
        await page.goto(appConfig.targetUrl, { waitUntil: 'domcontentloaded', timeout: timing.navigationMs });
        completedSteps.push(`Navigate to ${appConfig.targetUrl}`);

        for (let sIdx = 0; sIdx < journey.length; sIdx++) {
          const step = journey[sIdx];
          const errorsBeforeStep = consoleErrors.length;
          const requestsBeforeStep = failedRequests.length;
          const beforeEvidence = llmJudge.isOperational()
            ? await capturePageEvidence(page, appConfig.llmJudgeIncludeScreenshots)
            : null;
          const expectations = beforeEvidence
            ? await llmJudge.generateExpectations(step, beforeEvidence).catch((error: any) => {
                console.warn(`  ⚠ LLM expectation generation failed: ${error.message}`);
                return [];
              })
            : [];

          // The mark is taken immediately before dispatch so only network work
          // causally associated with this action is presented to the judge.
          const networkMark = networkRecorder.mark();

          const locator = page.locator(step.locator).first();
          await locator.waitFor({ state: 'visible', timeout: timing.actionMs });

          if (step.actionType === 'CLICK') {
            await locator.click();
          } else if (step.actionType === 'SELECT') {
            await locator.selectOption(step.value || { index: 1 });
          } else if (step.actionType === 'CHECK') {
            await locator.check();
          } else if (step.actionType === 'TYPE') {
            await locator.fill(step.value || 'test');
          }

          await settlePage(page);
          completedSteps.push(`Step ${sIdx + 1}: ${step.description}`);

          if (beforeEvidence && llmJudge.isOperational()) {
            const afterEvidence = await capturePageEvidence(page, appConfig.llmJudgeIncludeScreenshots);
            const judgeInput = {
              action: step,
              expectations,
              before: beforeEvidence,
              after: afterEvidence,
              consoleErrors: consoleErrors.slice(errorsBeforeStep),
              failedRequests: failedRequests.slice(requestsBeforeStep),
              networkEvents: networkRecorder.since(networkMark),
            };

            let assessment = await llmJudge.assess(judgeInput).catch((error: any) => {
              console.warn(`  ⚠ LLM outcome assessment failed: ${error.message}`);
              return null;
            });

            if (assessment?.verdict === 'NEEDS_PROBE' && assessment.additionalProbes.length > 0) {
              const probeResults = await executeSafeProbes(page, assessment.additionalProbes);
              assessment = await llmJudge.assess({ ...judgeInput, probeResults }).catch((error: any) => {
                console.warn(`  ⚠ LLM probe reassessment failed: ${error.message}`);
                return assessment;
              });
            }

            if (assessment) {
              console.log(
                `  🧠 Step ${sIdx + 1}: ${assessment.verdict} ` +
                `(confidence ${assessment.confidence.toFixed(2)}) — ${assessment.title}`
              );
            }

            if (
              assessment?.verdict === 'SUSPICIOUS' &&
              assessment.confidence >= appConfig.llmJudgeMinConfidence &&
              !llmBugMeta
            ) {
              llmBugMeta = {
                targetUrl: afterEvidence.url,
                title: `[LLM ${assessment.category || 'FUNCTIONAL'} Candidate] ${assessment.title}`,
                invariantId: `LLM_${assessment.category || 'FUNCTIONAL'}_JUDGE`,
                severity: assessment.category === 'VISUAL' || assessment.category === 'CONTENT' ? 'LOW' : 'MEDIUM',
                expected: assessment.expected,
                actual: [assessment.observed, ...assessment.evidence].filter(Boolean).join('\n- '),
                reproductionSteps: [...completedSteps],
                consoleErrors: [...consoleErrors],
                failedRequests: [...failedRequests],
                networkEvents: networkRecorder.since(networkMark),
                specSnippet: generateReproSnippet(journey.slice(0, sIdx + 1)),
              };
            }
          }
        }
      } catch (err: any) {
        executionError = err.message;
      }

      // Check for crash overlay or fatal error
      const crashOverlay = page.locator('[class*="crash" i], [class*="fatal" i], .error-page');
      const hasCrash = await crashOverlay.isVisible().catch(() => false);

      let bugMeta: Omit<CandidateBugMetadata, 'id' | 'createdAt'> | null = null;

      if (hasCrash || executionError) {
        bugMeta = {
          targetUrl: page.url(),
          title: `UI Crash / Execution Failure on "${journeyTitle.slice(0, 50)}"`,
          invariantId: 'uiThreadLiveness',
          severity: 'HIGH',
          expected: 'Page actions must complete smoothly without UI crash or execution timeout',
          actual: executionError ? `Execution failed: ${executionError}` : 'UI crash overlay detected',
          reproductionSteps: completedSteps,
          consoleErrors: [...consoleErrors],
          failedRequests: [...failedRequests],
          specSnippet: generateReproSnippet(journey),
        };
      } else if (llmBugMeta) {
        bugMeta = llmBugMeta;
      } else {
        // Invariant Evaluation
        const invariantsToRun = selectInvariantsForScreen(
          page,
          appConfig.invariantMode,
          invariantChecklist
        );

        for (const check of invariantsToRun) {
          const invContext: InvariantContext = {
            targetUrl: page.url(),
          };

          try {
            const rawRes = await check.run(page, invContext);
            const results = Array.isArray(rawRes) ? rawRes : [rawRes];

            for (const res of results) {
              if (res.status === 'FAIL') {
                bugMeta = {
                  targetUrl: page.url(),
                  title: res.details?.title || `${check.name} Failure on "${journeyTitle.slice(0, 40)}"`,
                  invariantId: check.id,
                  severity: res.details?.severity || 'HIGH',
                  expected: res.details?.expected || check.description,
                  actual: res.details?.actual || res.message,
                  reproductionSteps: res.details?.reproductionSteps || completedSteps,
                  consoleErrors: [...consoleErrors, ...(res.details?.consoleErrors || [])],
                  failedRequests: [...failedRequests, ...(res.details?.failedRequests || [])],
                  specSnippet: res.details?.specSnippet || generateReproSnippet(journey),
                };
                break;
              }
            }
          } catch {}

          if (bugMeta) break;
        }

        // Only actual uncaught page exceptions are independently actionable.
        // console.error output remains evidence for the action-scoped LLM judge,
        // but third-party scripts commonly use it for recoverable diagnostics.
        if (!bugMeta && uncaughtPageErrors.length > 0) {
          bugMeta = {
            targetUrl: page.url(),
            title: `Uncaught Page Exception on "${journeyTitle.slice(0, 40)}"`,
            invariantId: 'interactiveActionIntegrity',
            severity: 'MEDIUM',
            expected: 'No uncaught JavaScript exceptions during the user flow',
            actual: `Uncaught page exceptions: ${uncaughtPageErrors.join('; ')}`,
            reproductionSteps: completedSteps,
            consoleErrors: uncaughtPageErrors,
            failedRequests,
            specSnippet: generateReproSnippet(journey),
          };
        }
      }

      if (bugMeta) {
        // Save Candidate Bug: generates BUG-XXX folder with metadata.json, report.md, repro.spec.ts
        const savedBug = BugQueue.saveCandidateBug(bugMeta);

        // Capture action trace archive into the bug folder: trace.zip
        await context.tracing.stop({ path: savedBug.tracePath }).catch(() => {});

        detectedDefects.push({
          id: savedBug.id,
          invariantId: bugMeta.invariantId,
          title: bugMeta.title,
          folderPath: savedBug.folderPath,
        });

        console.log(`  🚨 DEFECT DETECTED & PACKAGED: [${savedBug.id}] ${bugMeta.title}`);
        console.log(`     📁 Folder:   ${savedBug.folderPath}`);
        console.log(`     📄 Report:   report.md`);
        console.log(`     🧪 Repro:    repro.spec.ts`);
        console.log(`     📦 Trace:    trace.zip`);
        console.log(`     📊 Metadata: metadata.json`);
      } else {
        await context.tracing.stop().catch(() => {});
        console.log(`  ✔ Journey passed all invariants`);
      }

      networkRecorder.stop();
      await context.close();
    }

    // 3. Summarize Results
    console.log('\n' + '='.repeat(65));
    console.log(`🎉 Journey testing complete! Tested scenarios in ${Math.round((Date.now() - startTime) / 1000)}s.`);
    console.log(`🚨 Total Defects Detected: ${detectedDefects.length}`);
    if (detectedDefects.length > 0) {
      console.log(`📁 Defects written to: ${bugsDir}\n`);
      detectedDefects.forEach((d) => {
        console.log(`  - [${d.id}] [${d.invariantId}] ${d.title} (${d.folderPath})`);
      });
    } else {
      console.log(`✅ All tested journeys satisfied metamorphic invariants!\n`);
    }
  } finally {
    await browser.close();
  }
}

/**
 * Selects applicable invariants based on screen affordances (SMART mode) or returns all (ALL mode).
 */
function selectInvariantsForScreen(
  page: Page,
  mode: 'SMART' | 'ALL',
  allInvariants: InvariantCheck[]
): InvariantCheck[] {
  if (mode === 'ALL') return allInvariants;

  // SMART Mode: Run invariants relevant to general web invariants and screen controls
  const priorityIds = [
    'uiThreadLiveness',
    'interactiveActionIntegrity',
    'contentIntegrity',
    'perPageLimit',
    'sortingOrder',
    'cartArithmetic',
    'brokenLinkReachability',
  ];

  return allInvariants.filter((inv) => priorityIds.includes(inv.id));
}

/**
 * Generates test body reproduction snippet for repro.spec.ts.
 */
function generateReproSnippet(steps: DiscoveredAction[]): string {
  return steps
    .map((s, i) => {
      const escapedLoc = s.locator.replace(/'/g, "\\'");
      let code = `await locator_${i + 1}.click();`;
      if (s.actionType === 'SELECT') {
        code = `await locator_${i + 1}.selectOption('${s.value || '1'}');`;
      } else if (s.actionType === 'TYPE') {
        code = `await locator_${i + 1}.fill('${s.value || 'test'}');`;
      }
      return `    // Step ${i + 1}: ${s.description}
    const locator_${i + 1} = page.locator('${escapedLoc}').first();
    await expect(locator_${i + 1}).toBeVisible();
    ${code}
    await page.waitForLoadState('domcontentloaded');`;
    })
    .join('\n');
}

/**
 * Basic parser to extract journeys from state-tree-journeys.spec.ts if JSON artifact is unavailable.
 */
function parseJourneysFromSpec(specContent: string): DiscoveredAction[][] {
  const journeys: DiscoveredAction[][] = [];
  const testBlocks = specContent.split("test('Journey ");

  for (let i = 1; i < testBlocks.length; i++) {
    const block = testBlocks[i];
    const locatorRegex = /page\.locator\('([^']+)'\)/g;
    const actions: DiscoveredAction[] = [];
    let match;

    while ((match = locatorRegex.exec(block)) !== null) {
      actions.push({
        id: `parsed_step_${actions.length + 1}`,
        category: 'STATE_MUTATION',
        locator: match[1],
        actionType: 'CLICK',
        description: `Action on ${match[1]}`,
        expectedInvariant: 'Step executes successfully',
      });
    }

    if (actions.length > 0) {
      journeys.push(actions);
    }
  }

  return journeys;
}

// Direct CLI Execution
if (require.main === module) {
  runJourneyExplorer().catch((err) => {
    console.error('Fatal Journey Explorer error:', err);
    process.exit(1);
  });
}
