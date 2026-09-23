import 'dotenv/config';
import { chromium, Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { computeStateFingerprint } from './fingerprint';
import { discoverScreenActions, isUrlExcluded } from './discovery';
import { replayTrace, executeDepthStep } from './executor';
import { synthesizePlaywrightSuite } from './synthesizer';
import { config as defaultConfig, AppConfig } from '../config';
import { DiscoveredAction, StateTreeNode } from './types';

/**
 * Explores the web application as a dynamic State-Transition Tree.
 * Follows DFS to chain actions down user journeys, and backtracks cleanly.
 */
export async function exploreStateTree(config: AppConfig = defaultConfig): Promise<DiscoveredAction[][]> {
  const browser: Browser = await chromium.launch({ headless: config.headless });
  const visitedFingerprints = new Set<string>();
  const completedJourneys: DiscoveredAction[][] = [];
  const timeBudgetMs = config.explorationTimeSeconds * 1000;
  const startTime = Date.now();

  console.log('='.repeat(65));
  console.log('🌲 AUTONOMOUS STATE-TREE WEB QA ENGINE');
  console.log(`🌐 Target URL:   ${config.targetUrl}`);
  console.log(`🔍 Max Depth:    ${config.maxExplorationDepth}`);
  console.log(`📊 Max Breadth:  ${config.maxBreadthPerScreen} actions/screen`);
  console.log(`⏱ Time Budget:  ${config.explorationTimeSeconds}s`);
  console.log(`🕶 Headless:     ${config.headless}`);
  console.log('='.repeat(65));

  try {
    // 1. Initialize Root Node
    console.log('\n[Phase 1: Initializing Root State]');
    const initContext = await browser.newContext();
    const initPage = await initContext.newPage();
    await initPage.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });

    const rootFingerprint = await computeStateFingerprint(initPage);
    visitedFingerprints.add(rootFingerprint);

    const rootActions = await discoverScreenActions(
      initPage,
      config.maxBreadthPerScreen,
      config.includeMenuHeaderFooter,
      config.excludedUrlPatterns
    );
    await initContext.close();

    console.log(`Root state initialized (${rootFingerprint}). Discovered ${rootActions.length} initial actions:`);
    rootActions.forEach((a, i) => console.log(`  ${i + 1}. [${a.category}] ${a.description}`));

    // State Tree tracking for synthesizing all discovered actions into journeys
    interface TreeJourneyNode {
      action?: DiscoveredAction;
      children: TreeJourneyNode[];
    }

    function collectLeafJourneys(
      node: TreeJourneyNode,
      currentTrace: DiscoveredAction[] = []
    ): DiscoveredAction[][] {
      const nextTrace = node.action ? [...currentTrace, node.action] : currentTrace;
      if (node.children.length === 0) {
        return nextTrace.length > 0 ? [nextTrace] : [];
      }
      const result: DiscoveredAction[][] = [];
      for (const child of node.children) {
        result.push(...collectLeafJourneys(child, nextTrace));
      }
      return result;
    }

    const rootJourneyTree: TreeJourneyNode = {
      children: rootActions.map((a) => ({ action: a, children: [] })),
    };

    interface StackNode {
      id: string;
      depth: number;
      fingerprint: string;
      url: string;
      traceSoFar: DiscoveredAction[];
      screenActions: DiscoveredAction[];
      unexploredEntries: { action: DiscoveredAction; journeyNode: TreeJourneyNode }[];
    }

    const stack: StackNode[] = [
      {
        id: 'node-root',
        depth: 0,
        fingerprint: rootFingerprint,
        url: config.targetUrl,
        traceSoFar: [],
        screenActions: rootActions,
        unexploredEntries: rootActions.map((a, i) => ({
          action: a,
          journeyNode: rootJourneyTree.children[i],
        })),
      },
    ];

    // 2. DFS Traversal Loop
    console.log('\n[Phase 2: Executing State-Tree Traversal]');
    while (stack.length > 0 && Date.now() - startTime < timeBudgetMs) {
      const currentNode = stack[stack.length - 1];

      // Termination Condition: Max depth or no actions left at this node
      if (currentNode.unexploredEntries.length === 0 || currentNode.depth >= config.maxExplorationDepth) {
        if (currentNode.traceSoFar.length > 0) {
          const flowSummary = currentNode.traceSoFar.map((s) => s.description).join(' ➔ ');
          console.log(`\n✔ Completed Branch (${currentNode.traceSoFar.length} steps): ${flowSummary}`);
        }
        stack.pop();
        continue;
      }

      // Pick next unexplored action from current node
      const { action, journeyNode } = currentNode.unexploredEntries.shift()!;
      console.log(`\n▶ [Depth ${currentNode.depth + 1}] Exploring: "${action.description}"`);

      // Clean Backtracking: Replay trace up to this node in a fresh browser context
      const { page, context } = await replayTrace(browser, config.targetUrl, currentNode.traceSoFar);

      // Execute Depth Step
      const { nextFingerprint, transitioned, error } = await executeDepthStep(
        page,
        action,
        currentNode.fingerprint
      );

      if (error) {
        console.log(`  ⚠ Step failed: ${error}`);
        await context.close();
        continue;
      }

      // If action caused a state transition and is not an already-visited state loop
      if (transitioned && !visitedFingerprints.has(nextFingerprint)) {
        const currentUrl = page.url();
        const currentPath = currentUrl.split('?')[0].replace(/\/+$/, '');
        const parentPath = currentNode.url.split('?')[0].replace(/\/+$/, '');

        // Breadth Discovery on the resulting screen
        const newActions = await discoverScreenActions(
          page,
          config.maxBreadthPerScreen,
          config.includeMenuHeaderFooter,
          config.excludedUrlPatterns
        );

        // Generalized State Equivalence Rule:
        // If the URL path is identical and the screen's interactive affordances are:
        // 1. Functionally equivalent (e.g. in-place sort, filter, limit adjustments) OR
        // 2. A subset of parent screen affordances (e.g. dismissing a banner/overlay/dialog),
        // then the screen remains the same state (in-place interaction) without branching.
        const parentActions = currentNode.screenActions;
        const prevSig = parentActions.map((a) => `${a.category}:${a.actionType}`).sort().join(';');
        const nextSig = newActions.map((a) => `${a.category}:${a.actionType}`).sort().join(';');
        const controlsAreEquivalent = prevSig === nextSig && parentActions.length === newActions.length;

        const parentActionKeys = new Set(
          parentActions.map((a) => `${a.category}:${a.actionType}:${a.description}`)
        );
        const isSubsetOfParent =
          newActions.length <= parentActions.length &&
          newActions.every((na) => parentActionKeys.has(`${na.category}:${na.actionType}:${na.description}`));

        if (currentPath === parentPath && (controlsAreEquivalent || isSubsetOfParent)) {
          console.log(`  ℹ In-place interaction (no screen transition).`);
          completedJourneys.push([...currentNode.traceSoFar, action]);
          await context.close();
          continue;
        }

        visitedFingerprints.add(nextFingerprint);
        console.log(`  ✨ Transitioned to new state: ${nextFingerprint}`);

        if (isUrlExcluded(currentUrl, config.excludedUrlPatterns)) {
          console.log(`  ⛔ Excluded URL reached (${currentUrl}). Not expanding actions.`);
          completedJourneys.push([...currentNode.traceSoFar, action]);
          await context.close();
          continue;
        }

        console.log(`  Discovered ${newActions.length} new actions in this state:`);
        newActions.forEach((a, i) => console.log(`  |_ ${i + 1}. [${a.category}] ${a.description}`));

        // Attach newly discovered actions as children in the State Tree
        journeyNode.children = newActions.map((a) => ({ action: a, children: [] }));

        // Push child state node onto stack to continue DFS
        stack.push({
          id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          depth: currentNode.depth + 1,
          fingerprint: nextFingerprint,
          url: currentUrl,
          traceSoFar: [...currentNode.traceSoFar, action],
          screenActions: newActions,
          unexploredEntries: newActions.map((a, i) => ({
            action: a,
            journeyNode: journeyNode.children[i],
          })),
        });
      } else if (transitioned && visitedFingerprints.has(nextFingerprint)) {
        console.log(`  🔄 State loop detected (${nextFingerprint}). Concluding branch.`);
        completedJourneys.push([...currentNode.traceSoFar, action]);
      } else {
        console.log(`  ℹ In-place interaction (no screen transition).`);
        completedJourneys.push([...currentNode.traceSoFar, action]);
      }

      await context.close();
    }

    if (Date.now() - startTime >= timeBudgetMs) {
      console.log(`\n⏱ Exploration stopped: reached time budget of ${config.explorationTimeSeconds}s.`);
    }

    // 3. Synthesize Standalone Test Suite for All Discovered Leaf Journeys
    console.log('\n[Phase 3: Synthesizing Standalone Playwright Test Suite]');
    const allDiscoveredJourneys = collectLeafJourneys(rootJourneyTree);
    const specContent = synthesizePlaywrightSuite(config.targetUrl, allDiscoveredJourneys);

    const artifactsDir = path.resolve(process.cwd(), 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    const specPath = path.join(artifactsDir, 'state-tree-journeys.spec.ts');
    fs.writeFileSync(specPath, specContent, 'utf-8');

    const jsonPath = path.join(artifactsDir, 'state-tree-journeys.json');
    fs.writeFileSync(jsonPath, JSON.stringify(allDiscoveredJourneys, null, 2), 'utf-8');

    console.log(`\n🎉 Exploration complete! Synthesized ${allDiscoveredJourneys.length} multi-step tests.`);
    console.log(`📁 Test file written to: ${specPath}`);
    console.log(`📁 JSON artifact written to: ${jsonPath}\n`);

    return allDiscoveredJourneys;
  } finally {
    await browser.close();
  }
}

// Direct CLI Execution
if (require.main === module) {
  const runnerConfig: AppConfig = { ...defaultConfig };
  if (process.argv[2]) {
    runnerConfig.targetUrl = process.argv[2];
  }

  exploreStateTree(runnerConfig).catch((err) => {
    console.error('Fatal State-Tree error:', err);
    process.exit(1);
  });
}
