import * as testingApi from './index';

// The secondary entry points use named exports, so they are safe by construction; this still pins them.
const EXPECTED_RUNTIME_EXPORTS = [
  'MockConvexAuthProvider',
  'MockConvexClient',
  'provideConvexAuthTesting',
  'provideConvexTesting',
];

describe('convex-angular/testing public API surface', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(testingApi).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });
});
