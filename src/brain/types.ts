export interface PageElement {
  role: string;
  name: string;
  selector: string;
}

export interface InvariantTestSelection {
  invariantId: string;
  targetSelector?: string;
  params?: Record<string, any>;
  reason: string;
}

export type BrainDecision =
  | { action: 'CLICK'; target: string; reason: string }
  | { action: 'TYPE'; target: string; text: string; reason: string }
  | { action: 'TEST_INVARIANT'; invariantId: string; targetSelector?: string; params?: Record<string, any>; reason: string }
  | { action: 'NAVIGATE'; url: string; reason: string }
  | { action: 'STOP'; reason: string };

export interface LLMBrain {
  providerName: string;
  decideNextStep: (elements: PageElement[], currentUrl: string) => Promise<BrainDecision>;
  selectInvariantsForPage: (elements: PageElement[], currentUrl: string) => Promise<InvariantTestSelection[]>;
}
