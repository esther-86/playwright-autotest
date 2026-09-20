import { Page } from 'playwright';

export interface InvariantContext {
  targetUrl: string;
  seeds: string[];
}

export interface InvariantResult {
  passed: boolean;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  message: string;
}

export interface InvariantCheck {
  id: string;
  name: string;
  description: string;
  run: (page: Page, context: InvariantContext) => Promise<InvariantResult>;
}
