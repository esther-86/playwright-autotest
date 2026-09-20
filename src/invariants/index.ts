import { InvariantCheck } from './types';
import { canaryCheck } from './canary';
import { identityCheck } from './identity';
import { filterMonotonicityCheck } from './filterMonotonicity';
import { sortingOrderCheck } from './sortingOrder';
import { paginationDisjointnessCheck } from './paginationDisjointness';
import { deepLinkIdempotenceCheck } from './deepLinkIdempotence';
import { perPageLimitCheck } from './perPageLimit';
import { cartTransitionCheck } from './cartTransition';
import { boundaryValueCheck } from './boundaryValue';

export * from './types';

export const invariantChecklist: InvariantCheck[] = [
  canaryCheck,
  identityCheck,
  filterMonotonicityCheck,
  sortingOrderCheck,
  paginationDisjointnessCheck,
  deepLinkIdempotenceCheck,
  perPageLimitCheck,
  cartTransitionCheck,
  boundaryValueCheck,
];
