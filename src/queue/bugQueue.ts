import fs from 'fs';
import path from 'path';

export interface CandidateBugMetadata {
  id: string;
  createdAt: string;
  targetUrl: string;
  title: string;
  invariantId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  expected: string;
  actual: string;
  reproductionSteps: string[];
  specSnippet?: string;
  consoleErrors?: string[];
  failedRequests?: Array<{ url: string; status: number }>;
}

const QUEUE_DIR = path.resolve(process.cwd(), 'queue');

export class BugQueue {
  static init() {
    if (!fs.existsSync(QUEUE_DIR)) {
      fs.mkdirSync(QUEUE_DIR, { recursive: true });
    }
  }

  static getNextBugId(): string {
    this.init();
    const existing = fs.readdirSync(QUEUE_DIR).filter((f: string) => f.startsWith('BUG-'));
    const nextNum = existing.length + 1;
    return `BUG-${String(nextNum).padStart(3, '0')}`;
  }

  static generateReportMd(meta: CandidateBugMetadata): string {
    const stepsList = meta.reproductionSteps.map((step, idx) => `${idx + 1}. ${step}`).join('\n');
    return `# Defect Report: ${meta.id}

## Overview
- **Defect ID:** \`${meta.id}\`
- **Title:** ${meta.title}
- **Invariant Violated:** \`${meta.invariantId}\`
- **Severity:** \`${meta.severity}\`
- **Target URL:** [${meta.targetUrl}](${meta.targetUrl})
- **Discovered At:** ${meta.createdAt}

---

## Behavioral Invariant Assertion
### Expected Behavior
${meta.expected}

### Observed Behavior
${meta.actual}

---

## 1-Minimal Reproduction Sequence
${stepsList}

---

## Standalone Playwright Reproduction Spec
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
`;
  }

  static saveCandidateBug(meta: Omit<CandidateBugMetadata, 'id' | 'createdAt'>): { id: string; folderPath: string; tracePath: string; specPath: string } {
    this.init();
    const id = this.getNextBugId();
    const folderPath = path.join(QUEUE_DIR, id);
    fs.mkdirSync(folderPath, { recursive: true });

    const fullMeta: CandidateBugMetadata = {
      id,
      createdAt: new Date().toISOString(),
      ...meta,
    };

    // 1. metadata.json
    fs.writeFileSync(path.join(folderPath, 'metadata.json'), JSON.stringify(fullMeta, null, 2), 'utf8');

    // 2. report.md
    const reportMd = this.generateReportMd(fullMeta);
    fs.writeFileSync(path.join(folderPath, 'report.md'), reportMd, 'utf8');

    // 3. Standalone test spec inside the bug folder: queue/BUG-XXX/repro.spec.ts
    const specSnippet = fullMeta.specSnippet || `// Reproduction for ${id}\nawait page.goto('${fullMeta.targetUrl}');\n// Invariant violated: ${fullMeta.actual}`;
    const specCode = `import { test, expect } from '@playwright/test';

test.describe('${id}: ${meta.title.replace(/'/g, "\\'")}', () => {
  test('reproduce invariant failure', async ({ page }) => {
    await page.goto('${meta.targetUrl}');
    ${specSnippet}
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
    const folders = fs.readdirSync(QUEUE_DIR).filter((f: string) => f.startsWith('BUG-'));
    const bugs: CandidateBugMetadata[] = [];

    for (const folder of folders) {
      const metaPath = path.join(QUEUE_DIR, folder, 'metadata.json');
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
