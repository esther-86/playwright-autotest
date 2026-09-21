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
import { cartArithmeticCheck } from './cartArithmetic';
import { cartQuantityMutationCheck } from './cartQuantityMutation';
import { uiThreadLivenessCheck } from './uiThreadLiveness';
import { responseFinalityCheck } from './responseFinality';
import { brokenLinkReachabilityCheck } from './brokenLinkReachability';
import { outboundUriSyntaxCheck } from './outboundUriSyntax';
import { visualGeometryCheck } from './visualGeometry';
import { contentIntegrityCheck } from './contentIntegrity';
import { interactiveActionIntegrityCheck } from './interactiveActionIntegrity';

export * from './types';
export * from './cartArithmetic';
export * from './cartQuantityMutation';
export * from './uiThreadLiveness';
export * from './responseFinality';
export * from './brokenLinkReachability';
export * from './outboundUriSyntax';
export * from './visualGeometry';
export * from './contentIntegrity';
export * from './interactiveActionIntegrity';

export const invariantChecklist: InvariantCheck[] = [
  perPageLimitCheck,
  cartArithmeticCheck,
  cartQuantityMutationCheck,
  uiThreadLivenessCheck,
  responseFinalityCheck,
  brokenLinkReachabilityCheck,
  outboundUriSyntaxCheck,
  visualGeometryCheck,
  contentIntegrityCheck,
  interactiveActionIntegrityCheck,
  filterMonotonicityCheck,
  sortingOrderCheck,
  paginationDisjointnessCheck,
  canaryCheck,
  identityCheck,
  deepLinkIdempotenceCheck,
  cartTransitionCheck,
  boundaryValueCheck,
];
