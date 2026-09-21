import { Page } from 'playwright';

export interface InvariantContext {
  targetUrl: string;
  seeds?: string[];
  targetSelector?: string;
  params?: Record<string, any>;
}

export interface InvariantResultDetails {
  title?: string;
  expected?: string;
  actual?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  reproductionSteps?: string[];
  specSnippet?: string;
  consoleErrors?: string[];
  failedRequests?: Array<{ url: string; status: number }>;
}

export interface InvariantResult {
  passed: boolean;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  message: string;
  details?: InvariantResultDetails;
}

export interface InvariantCheck {
  id: string;
  name: string;
  description: string;
  applicableArchetypes?: string[];
  run: (page: Page, context: InvariantContext) => Promise<InvariantResult | InvariantResult[]>;
}
