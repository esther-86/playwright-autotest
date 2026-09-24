import fs from 'fs';
import path from 'path';

export interface CandidateBugMetadata {
  id: string;
  createdAt: string;
  targetUrl: string;
  reproductionStartUrl?: string;
  lifecycle?: 'CANDIDATE' | 'CONFIRMED';
  title: string;
  invariantId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  expected: string;
  actual: string;
  reproductionSteps: string[];
  specSnippet?: string;
  automatedAssertion?: string;
  consoleErrors?: string[];
  failedRequests?: Array<{ url: string; status: number }>;
  networkEvents?: Array<{
    kind: 'RESPONSE' | 'REQUEST_FAILED';
    method: string;
    url: string;
    resourceType: string;
    status?: number;
    failure?: string;
    durationMs?: number;
  }>;
}

let bugsDirectory = path.resolve(process.cwd(), 'artifacts', 'bugs');

export class BugQueue {
  static setOutputDir(dir: string) {
    bugsDirectory = dir;
  }

  static getOutputDir(): string {
    return bugsDirectory;
  }

  static init() {
    if (!fs.existsSync(bugsDirectory)) {
      fs.mkdirSync(bugsDirectory, { recursive: true });
    }
  }

  static getNextBugId(): string {
    this.init();
    const existingNumbers = fs.readdirSync(bugsDirectory)
      .map((name) => name.match(/^BUG-(\d+)$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    return `BUG-${String(nextNum).padStart(3, '0')}`;
  }

  static generateReportMd(meta: CandidateBugMetadata): string {
    const stepsList = meta.reproductionSteps.map((step, idx) => `${idx + 1}. ${step}`).join('\n');
    return `# Candidate Bug Report: ${meta.id}

## Overview
- **Candidate ID:** \`${meta.id}\`
- **Title:** ${meta.title}
- **Invariant Violated:** \`${meta.invariantId}\`
- **Severity:** \`${meta.severity}\`
- **Target URL:** [${meta.targetUrl}](${meta.targetUrl})
- **Lifecycle:** \`${meta.lifecycle || 'CANDIDATE'}\`
- **Discovered At:** ${meta.createdAt}

---

## Behavioral Invariant Assertion
### Expected Behavior
${meta.expected}

### Observed Behavior
${meta.actual}

---

## Candidate Action Trace (Unminimized)
${stepsList}

---

## Playwright Candidate Spec
\`\`\`typescript
${meta.specSnippet || `// Replay steps on ${meta.targetUrl}
import { test, expect } from '@playwright/test';

test('${meta.title}', async ({ page }) => {
  await page.goto('${meta.targetUrl}');
  // Assert invariant holds
});`}
\`\`\`

---

## Execution Artifacts
- **Reproduction Spec:** \`repro.spec.ts\`
- **Trace Archive:** \`trace.zip\`
- **Console Errors:** ${meta.consoleErrors?.length || 0}
- **Failed HTTP Requests:** ${meta.failedRequests?.length || 0}
- **Action-correlated Network Events:** ${meta.networkEvents?.length || 0}
`;
  }

  static saveCandidateBug(meta: Omit<CandidateBugMetadata, 'id' | 'createdAt'>): { id: string; folderPath: string; tracePath: string; specPath: string } {
    this.init();
    const id = this.getNextBugId();
    const folderPath = path.join(bugsDirectory, id);
    fs.mkdirSync(folderPath, { recursive: true });

    const fullMeta: CandidateBugMetadata = {
      id,
      createdAt: new Date().toISOString(),
      lifecycle: 'CANDIDATE',
      ...meta,
    };

    // 1. metadata.json
    fs.writeFileSync(path.join(folderPath, 'metadata.json'), JSON.stringify(fullMeta, null, 2), 'utf8');

    // 2. report.md
    const reportMd = this.generateReportMd(fullMeta);
    fs.writeFileSync(path.join(folderPath, 'report.md'), reportMd, 'utf8');

    // 3. Standalone test spec inside the bug folder: artifacts/bugs/BUG-XXX/repro.spec.ts
    const specSnippet = fullMeta.specSnippet || `// Reproduction for ${id}\nawait page.goto('${fullMeta.targetUrl}');\n// Invariant violated: ${fullMeta.actual}`;
    const requiresManualOracle = fullMeta.invariantId.startsWith('LLM_') && !fullMeta.automatedAssertion;
    const startUrl = fullMeta.reproductionStartUrl || fullMeta.targetUrl;
    const specCode = `import { test, expect } from '@playwright/test';

test.describe('${id}: ${meta.title.replace(/'/g, "\\'")}', () => {
  test('replay candidate action trace', async ({ page }) => {
    ${requiresManualOracle ? `test.skip(true, 'LLM candidate requires a deterministic oracle from Phase 3 verification');` : ''}
    await page.goto('${startUrl}');
    ${specSnippet}
    ${fullMeta.automatedAssertion || ''}
  });
});
`;
    const specPath = path.join(folderPath, 'repro.spec.ts');
    fs.writeFileSync(specPath, specCode, 'utf8');

    return {
      id,
      folderPath,
      tracePath: path.join(folderPath, 'trace.zip'),
      specPath,
    };
  }

  static listPendingBugs(): CandidateBugMetadata[] {
    this.init();
    const folders = fs.readdirSync(bugsDirectory).filter((f: string) => f.startsWith('BUG-'));
    const bugs: CandidateBugMetadata[] = [];

    for (const folder of folders) {
      const metaPath = path.join(bugsDirectory, folder, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        try {
          const content = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          bugs.push(content);
        } catch {}
      }
    }

    return bugs;
  }
}
