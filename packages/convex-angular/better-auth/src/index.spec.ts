import * as betterAuthApi from './index';

// The secondary entry points use named exports, so they are safe by construction; this still pins them.
const EXPECTED_RUNTIME_EXPORTS = ['injectBetterAuth', 'provideBetterAuth'];

describe('convex-angular/better-auth public API surface', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(betterAuthApi).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });
});
