export type ActionCategory =
  | 'STATE_MUTATION'
  | 'PAGINATION'
  | 'SORTING'
  | 'NAVIGATION'
  | 'CONFIGURABLE_ITEM'
  | 'FILTER'
  | 'FORM_INTERACTION';

export interface DiscoveredAction {
  id: string;
  category: ActionCategory;
  locator: string; // Accessible Playwright locator (e.g. role=button[name="ADD TO CART"])
  actionType: 'CLICK' | 'SELECT' | 'TYPE' | 'CHECK';
  value?: string;
  description: string;
  expectedInvariant: string;
}

export interface StateTreeNode {
  id: string;
  depth: number;
  fingerprint: string;
  url: string;
  traceSoFar: DiscoveredAction[];
  unexploredActions: DiscoveredAction[];
}

export type ExplorationConfig = import('../config').AppConfig;
