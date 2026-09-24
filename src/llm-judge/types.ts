import { DiscoveredAction } from '../tree-explorer/types';

export type JudgeVerdict = 'PASS' | 'SUSPICIOUS' | 'NEEDS_PROBE' | 'AUTOMATION_FAILURE';
export type BugCategory = 'FUNCTIONAL' | 'VISUAL' | 'CONTENT' | 'ACCESSIBILITY' | 'PERFORMANCE';
export type ProbeType =
  | 'READ_TEXT'
  | 'COUNT'
  | 'GET_ATTRIBUTE'
  | 'BOUNDING_BOX'
  | 'SCREENSHOT_REGION'
  | 'WAIT_AND_RECHECK';

export interface PageEvidence {
  capturedAt: string;
  url: string;
  title: string;
  ariaSnapshot: string;
  visibleText: string;
  controls: Array<{
    tag: string;
    role: string;
    name: string;
    value: string;
    checked: boolean | null;
    disabled: boolean;
  }>;
  viewport: { width: number; height: number } | null;
  scroll: { x: number; y: number; width: number; height: number };
  screenshotBase64?: string;
}

export interface ExpectedOutcome {
  description: string;
  observableEvidence: string;
}

export interface SafeProbeRequest {
  type: ProbeType;
  locator?: string;
  parameter?: string;
  purpose: string;
}

export interface ProbeResult {
  request: SafeProbeRequest;
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface NetworkObservation {
  kind: 'RESPONSE' | 'REQUEST_FAILED';
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  failure?: string;
  durationMs?: number;
}

export interface LLMBugAssessment {
  verdict: JudgeVerdict;
  category?: BugCategory;
  confidence: number;
  title: string;
  expected: string;
  observed: string;
  evidence: string[];
  additionalProbes: SafeProbeRequest[];
}

export interface JudgeInput {
  action: DiscoveredAction;
  expectations: ExpectedOutcome[];
  before: PageEvidence;
  after: PageEvidence;
  consoleErrors: string[];
  failedRequests: Array<{ url: string; status: number }>;
  networkEvents: NetworkObservation[];
  executionError?: string;
  probeResults?: ProbeResult[];
}

export interface LLMJudge {
  readonly providerName: string;
  readonly available: boolean;
  isOperational(): boolean;
  generateExpectations(action: DiscoveredAction, before: PageEvidence): Promise<ExpectedOutcome[]>;
  assess(input: JudgeInput): Promise<LLMBugAssessment>;
}
