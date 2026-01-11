# AGENTS.md

Instructions for AI agents working with the convex-angular codebase.

## Project Overview

This is an Nx monorepo containing the Angular client library for [Convex](https://convex.dev), a backend-as-a-service platform.

### Structure

```
convex-angular/
├── packages/
│   └── convex-angular/     # The main library (published to npm)
│       └── src/
│           ├── lib/
│           │   ├── providers/        # Injectable functions (injectQuery, etc.)
│           │   │   └── integrations/ # Auth provider integrations (Clerk, Auth0)
│           │   ├── tokens/           # Dependency injection tokens
│           │   ├── guards/           # Route guards (convexAuthGuard)
│           │   ├── directives/       # Auth helper directives
│           │   ├── types.ts          # Shared type definitions
│           │   └── skip-token.ts     # skipToken for conditional queries
│           └── index.ts              # Public API exports
├── apps/
│   └── frontend/           # Demo todo application
│       └── src/
│           ├── app/        # Angular app components
│           └── convex/     # Convex backend functions
├── package.json            # Root package.json with scripts
├── nx.json                 # Nx configuration
└── convex.json             # Convex configuration
```

### Tech Stack

- **Package Manager**: pnpm
- **Monorepo Tool**: Nx 22.x
- **Framework**: Angular 20.x (signals-based)
- **Backend**: Convex 1.31.x
- **Testing**: Jest with jest-preset-angular
- **Linting**: ESLint with Angular and Nx plugins
- **Build**: ng-packagr for library packaging

## Development Commands

```bash
# Install dependencies
pnpm install

# Library development
pnpm test:library      # Run library tests
pnpm build:library     # Build library for production

# Demo app development
pnpm dev:frontend      # Start Angular dev server
pnpm dev:backend       # Start Convex dev server

# Nx commands
nx lint convex-angular # Lint library
nx test convex-angular # Test library
nx build convex-angular # Build library
```

## Library Architecture

### Provider Functions

The library exposes six main injectable functions:

| Function               | Purpose                       | Returns                                                                          |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `injectQuery`          | Subscribe to reactive queries | `QueryResult` with `data`, `error`, `isLoading`, `status` signals                |
| `injectMutation`       | Execute database mutations    | `MutationResult` with `mutate()`, `data`, `error`, `status`, `reset()` signals   |
| `injectAction`         | Run server actions            | `ActionResult` with `run()`, `data`, `error`, `status`, `reset()` signals        |
| `injectPaginatedQuery` | Load paginated data           | `PaginatedQueryResult` with `results`, `loadMore()`, `canLoadMore` signals       |
| `injectConvex`         | Access raw Convex client      | `ConvexClient` instance                                                          |
| `injectAuth`           | Access authentication state   | `ConvexAuthState` with `isLoading`, `isAuthenticated`, `error`, `status` signals |

### Dependency Flow

```
provideConvex(url)  →  CONVEX token  →  injectConvex()  →  Provider functions
```

All provider functions internally use `injectConvex()` to access the Convex client.

## Coding Conventions

### Angular Patterns

- **Signals**: Use Angular signals for reactive state (`signal()`, `computed()`)
- **Components**: Standalone components with `ChangeDetectionStrategy.OnPush`
- **Selector Prefix**: `cva-` for components (kebab-case), `cva` for directives (camelCase)
- **Injection Context**: All provider functions require injection context (constructor or field initializer)

### Provider Function Pattern

All provider functions follow this structure:

```typescript
export function injectSomething<T extends SomeReference>(
  reference: T,
  argsFn?: () => T['_args'] | SkipToken,
  options?: SomeOptions<T>,
): SomeResult<T> {
  // 1. Assert injection context
  assertInInjectionContext(injectSomething);

  // 2. Inject dependencies
  const convex = injectConvex();
  const destroyRef = inject(DestroyRef);

  // 3. Create internal signals
  const data = signal<ReturnType>(undefined);
  const error = signal<Error | undefined>(undefined);
  const isLoading = signal(false);

  // 4. Create computed signals for derived state
  const status = computed<Status>(() => {
    if (isLoading()) return 'pending';
    if (error()) return 'error';
    return 'success';
  });

  // 5. Set up reactive subscription with effect()
  effect(() => {
    const args = argsFn?.();
    // Handle skipToken
    if (args === skipToken) {
      // Reset state, don't subscribe
      return;
    }
    // Subscribe to Convex
    unsubscribe = convex.onUpdate(reference, args, onSuccess, onError);
  });

  // 6. Register cleanup
  destroyRef.onDestroy(() => unsubscribe?.());

  // 7. Return readonly signals
  return {
    data: data.asReadonly(),
    error: error.asReadonly(),
    isLoading: isLoading.asReadonly(),
    status,
  };
}
```

### Type Patterns

- **FunctionReference**: Typed reference to Convex functions (`FunctionReference<'query'>`, `FunctionReference<'mutation'>`, etc.)
- **Status Types**: Enum-like types for state machines (`'idle' | 'pending' | 'success' | 'error'`)
- **SkipToken**: Unique symbol type for conditional query skipping

### Documentation

- Add comprehensive JSDoc comments to all public APIs
- Include `@example` blocks with practical usage
- Document all parameters and return values
- Keep examples concise but realistic

## Testing Patterns

### Test Setup

Tests use Jest with `jest-preset-angular`. The test setup is in `src/test-setup.ts`:

```typescript
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});
```

### Mocking the Convex Client

Always mock the Convex client in provider tests:

```typescript
let mockConvexClient: jest.Mocked<ConvexClient>;
let mockUnsubscribe: jest.Mock;
let onUpdateCallback: (result: any) => void;
let onErrorCallback: (err: Error) => void;

beforeEach(() => {
  mockUnsubscribe = jest.fn();

  mockConvexClient = {
    client: {
      localQueryResult: jest.fn().mockReturnValue(undefined),
    },
    onUpdate: jest.fn((_query, _args, onUpdate, onError) => {
      onUpdateCallback = onUpdate;
      onErrorCallback = onError;
      return mockUnsubscribe;
    }),
  } as unknown as jest.Mocked<ConvexClient>;

  TestBed.configureTestingModule({
    providers: [{ provide: CONVEX, useValue: mockConvexClient }],
  });
});
```

### Test Component Pattern

Create inline test components to test providers:

```typescript
@Component({
  template: '',
  standalone: true,
})
class TestComponent {
  readonly result = injectQuery(mockQuery, () => ({ count: 10 }));
}

it('should do something', fakeAsync(() => {
  const fixture = TestBed.createComponent(TestComponent);
  fixture.detectChanges();
  tick();

  // Simulate Convex callback
  onUpdateCallback([{ _id: '1', title: 'Test' }]);

  expect(fixture.componentInstance.result.data()).toEqual([...]);
}));
```

### Test Categories

Organize tests into descriptive `describe` blocks:

- `initial state` - Default values before any data
- `subscription` - Subscription setup and data flow
- `error handling` - Error states and recovery
- `skipToken` - Conditional query skipping
- `reactive arguments` - Resubscription on arg changes
- `cleanup` - Unsubscription on destroy
- `status signal` - State machine transitions
- `options callbacks` - onSuccess/onError callbacks

## Adding New Features

### Adding a New Provider Function

1. Create `inject-<name>.ts` in `packages/convex-angular/src/lib/providers/`
2. Define types: `<Name>Reference`, `<Name>Options`, `<Name>Result`
3. Implement the function following the provider pattern
4. Add comprehensive JSDoc documentation
5. Export from `src/index.ts`
6. Create `inject-<name>.spec.ts` with full test coverage
7. Add usage example to README.md

### Adding a New Status Type

1. Add the type to `packages/convex-angular/src/lib/types.ts`
2. Export it (already exported via `export * from './lib/types'`)

## Common Pitfalls

### Injection Context

Provider functions must be called in an injection context:

```typescript
// ✅ Correct - field initializer
class MyComponent {
  readonly todos = injectQuery(api.todos.list, () => ({}));
}

// ✅ Correct - constructor
class MyComponent {
  readonly todos: QueryResult<...>;
  constructor() {
    this.todos = injectQuery(api.todos.list, () => ({}));
  }
}

// ❌ Wrong - method call
class MyComponent {
  loadTodos() {
    this.todos = injectQuery(...); // Error!
  }
}
```

### Signal Reactivity

Arguments must be accessed inside the reactive function:

```typescript
// ✅ Correct - reactive
readonly todos = injectQuery(api.todos.list, () => ({
  category: this.category() // Signal accessed inside function
}));

// ❌ Wrong - not reactive
readonly todos = injectQuery(api.todos.list, () => ({
  category: this.category // Signal not called
}));
```

### Skip Token Usage

Return `skipToken` from the args function, not as an argument:

```typescript
// ✅ Correct
readonly user = injectQuery(api.users.get, () =>
  this.userId() ? { id: this.userId() } : skipToken
);

// ❌ Wrong - skipToken as static arg
readonly user = injectQuery(api.users.get, skipToken);
```

## File Naming

- Source files: `kebab-case.ts`
- Test files: `kebab-case.spec.ts` (co-located with source)
- Components: `component-name.ts` with `component-name.html` template

## Exports

All public APIs must be exported through `packages/convex-angular/src/index.ts`:

```typescript
// Tokens
export * from './lib/tokens/convex';
export * from './lib/tokens/auth';

// Types and utilities
export * from './lib/skip-token';
export * from './lib/types';

// Core providers
export * from './lib/providers/inject-action';
export * from './lib/providers/inject-convex';
export * from './lib/providers/inject-mutation';
export * from './lib/providers/inject-paginated-query';
export * from './lib/providers/inject-query';

// Auth providers
export * from './lib/providers/inject-auth';

// Auth integrations
export * from './lib/providers/integrations/clerk';
export * from './lib/providers/integrations/auth0';

// Auth directives
export * from './lib/directives/auth-helpers';

// Auth guards
export * from './lib/guards/auth-guards';
```

When adding new exports, add them here.

## Version Compatibility

- Angular: `>=20.0.0` (peer dependency)
- Convex: `^1.31.0` (peer dependency)

The library uses Angular signals which require Angular 16+, but the minimum is set to 20 for latest features.
