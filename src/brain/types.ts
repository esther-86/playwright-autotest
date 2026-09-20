export interface PageElement {
  role: string;
  name: string;
  selector: string;
}

export type BrainDecision =
  | { action: 'CLICK'; target: string; reason: string }
  | { action: 'TYPE'; target: string; text: string; reason: string }
  | { action: 'TEST_INVARIANT'; invariantId: string; reason: string }
  | { action: 'STOP'; reason: string };

export interface LLMBrain {
  providerName: string;
  decideNextStep: (elements: PageElement[], currentUrl: string) => Promise<BrainDecision>;
}
