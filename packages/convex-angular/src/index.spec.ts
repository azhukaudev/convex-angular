import * as publicApi from './index';

// The primary barrel is `export *` from ~20 files, so a new `export` in any of them is public API the moment
// it is written. This list is the reviewable contract: an accidental addition or removal fails here; a
// deliberate one is a one-line diff in the PR (and needs a CHANGELOG entry).
//
// Runtime names only. Interfaces and type aliases are erased and cannot be seen here; removing one is only
// caught if something in the repo (specs, the demo, `apps/docs` examples) still uses it.
const EXPECTED_RUNTIME_EXPORTS = [
  'AUTH0_AUTH',
  'CLERK_AUTH',
  'CONVEX',
  'CONVEX_AUTH',
  'CONVEX_AUTH_GUARD_CONFIG',
  'ConvexError',
  'CvaAuthLoadingDirective',
  'CvaAuthRefreshingDirective',
  'CvaAuthenticatedDirective',
  'CvaUnauthenticatedDirective',
  'convexAuthGuard',
  'convexQueryResolver',
  'convexUnauthGuard',
  'createConvexAuthGuard',
  'injectAction',
  'injectAuth',
  'injectConvex',
  'injectConvexConnectionState',
  'injectMutation',
  'injectPaginatedQuery',
  'injectPrewarmQuery',
  'injectQueries',
  'injectQuery',
  'insertAtBottomIfLoaded',
  'insertAtPosition',
  'insertAtTop',
  'optimisticallyUpdateValueInPaginatedQuery',
  'provideAuth0Auth',
  'provideClerkAuth',
  'provideConvex',
  'provideConvexAuth',
  'provideConvexAuthFromExisting',
  'skipToken',
  'sortByField',
  'ɵrunInResolvedInjectionContext',
];

describe('convex-angular public API surface', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(publicApi).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });
});
