# AGENTS.md

## Purpose

- This repository is an Nx workspace for the `convex-angular` library plus a demo Angular app and local Convex backend code.
- Prefer repo-specific commands and conventions from this file over generic Angular, Nx, Jest, or Convex defaults.
- The default branch is `main`.
- Use `pnpm` for package management.

## Workspace Layout

- `packages/convex-angular/`: publishable Angular library.
- `apps/frontend/`: demo Angular application.
- `apps/frontend/src/convex/`: demo Convex functions and generated API types.
- Root project name: `@convex-angular/source`.
- Main Nx projects with build/lint/test targets: `convex-angular`, `frontend`.

## Existing Local Rules

- Preserve existing code comments unless the task explicitly requires changing or removing them.
- Add comments only for non-obvious logic or behavior contracts.
- Avoid comments that just restate the code.

## Cursor And Copilot Rules

- No `.cursor/rules/` files were found.
- No `.cursorrules` file was found.
- No `.github/copilot-instructions.md` file was found.
- Do not invent hidden editor rules; follow repository files and this document.

## Install And Dev Commands

- Install dependencies: `pnpm install`
- Start the demo frontend: `pnpm dev:frontend`
- Equivalent frontend serve command: `pnpm nx serve frontend`
- Start Convex local development: `pnpm dev:backend`
- Show all Nx projects: `pnpm nx show projects`
- Inspect one project config: `pnpm nx show project convex-angular --json`

## Build Commands

- Build the demo app: `pnpm build:frontend`
- Equivalent app build: `pnpm nx build frontend`
- Build the library: `pnpm build:library`
- Equivalent library build: `pnpm nx build convex-angular`
- Build everything with a build target: `pnpm nx run-many -t build`

## Lint Commands

- Lint the demo app: `pnpm nx lint frontend`
- Lint the library: `pnpm nx lint convex-angular`
- Lint both main projects: `pnpm nx run-many -t lint --projects frontend,convex-angular`
- Lint a single file: `pnpm nx lint convex-angular --lintFilePatterns=packages/convex-angular/src/index.ts`
- Apply ESLint autofixes when appropriate: `pnpm nx lint convex-angular --fix`

## Test Commands

- Run demo app tests: `pnpm nx test frontend`
- Run library tests: `pnpm test:library`
- Equivalent library test command: `pnpm nx test convex-angular`
- Run both main test suites: `pnpm nx run-many -t test --projects frontend,convex-angular`
- Run tests with CI config: `pnpm nx test convex-angular --configuration=ci`
- Run one test file in the library: `pnpm nx test convex-angular --testFile=packages/convex-angular/src/lib/providers/inject-query.spec.ts --runInBand`
- Run one test file in the app: `pnpm nx test frontend --testFile=apps/frontend/src/app/pages/auth-login/auth-login.spec.ts --runInBand`
- Run one named test: `pnpm nx test convex-angular --testFile=packages/convex-angular/src/lib/providers/inject-query.spec.ts --testNamePattern="supports injectRef outside an injection context" --runInBand`
- Jest executor options are available through Nx; prefer `--testFile` and `--testNamePattern` over custom shell wrappers.

## Formatting Commands

- Check formatting: `pnpm prettier --check .`
- Rewrite formatting: `pnpm prettier --write .`
- Markdown files are formatted with Prettier too; use it after large edits to docs.

## Generated And Derived Files

- Do not hand-edit files under `apps/frontend/src/convex/_generated/`.
- Treat generated Convex API/data model files as outputs, not sources.
- If generated types are stale, regenerate them through the normal Convex workflow instead of patching them manually.

## Import Style

- Prettier enforces sorted imports with these groups: builtin, third-party, `@convex-angular/*`, then relative imports.
- Keep a blank line between import groups.
- Use single quotes.
- Use trailing commas.
- Keep lines within the configured `printWidth` of 120 when practical.
- In app code, import library APIs from `convex-angular`, not deep paths inside `packages/convex-angular/src/...`.
- Relative imports should usually be last.

## TypeScript And Angular Style

- The app and library both run with strict TypeScript settings.
- Respect `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`.
- Angular template type checking is strict; do not work around template errors with `any` unless there is a strong reason.
- Prefer explicit exported types for public library APIs.
- Keep internal helpers local to the file unless they are reused.
- Prefer `unknown` over `any` in library code, then narrow safely.
- The library has a few ESLint allowances for `any` and empty functions; do not treat that as a general style preference.

## Naming Conventions

- Use PascalCase for classes, interfaces, exported types, and Angular injection tokens.
- Use camelCase for functions, variables, parameters, methods, signals, and component fields.
- Use SCREAMING_SNAKE_CASE for exported route tables and injection-token-like constants such as `AUTH_ROUTES` and `CONVEX_AUTH`.
- Use kebab-case filenames.
- Angular selectors use the `cva` prefix.
- Components use element selectors like `cva-todo-list`.
- Directives use attribute selectors with `cva` camelCase.

## Angular App Patterns

- The demo app uses standalone Angular components.
- Components generally set `changeDetection: ChangeDetectionStrategy.OnPush`.
- Lazy route components are default exports because routes use `loadComponent: () => import(...)` without `.then(...)`.
- Shared route arrays are exported named constants such as `AUTH_ROUTES` and `EXAMPLE_ROUTES`.
- Prefer Angular signals, `computed`, `effect`, `model`, and `inject` over older RxJS-heavy component state patterns.
- Mark component fields `readonly` unless they truly mutate identity.

## Library Patterns

- The library favors named exports from focused files and re-exports them through `packages/convex-angular/src/index.ts`.
- Public API changes usually require updating `packages/convex-angular/src/index.ts`.
- Keep runtime guards and helper functions small and explicit.
- Preserve good error messages; many thrown errors are intentionally user-facing guidance.
- Normalize unknown thrown values into `Error` objects before storing or rethrowing them.
- Prefer behavior-preserving internal refactors over wide public API churn.

## Error Handling

- In library code, convert unknown errors to `Error` instances with actionable messages.
- Include enough context in error text for users to fix misconfiguration quickly.
- Avoid swallowing errors silently.
- In the demo app, caught async UI actions may log with `console.error`, but library helpers should keep error state available to consumers.
- When a function intentionally catches and suppresses an error, leave the reason obvious in code.

## Testing Style

- Tests use Jest with `jest-preset-angular`.
- Test files are colocated as `*.spec.ts` next to their source files.
- Angular tests commonly use `TestBed`, `fakeAsync`, and `tick`.
- The Jest test setup enables `errorOnUnknownElements` and `errorOnUnknownProperties`; missing declarations/imports should be fixed, not ignored.
- Prefer focused tests with descriptive `it(...)` names that explain behavior, not implementation details.
- For library behavior, cover state transitions, error paths, cleanup, and type-sensitive edges.

## Convex-Specific Notes

- Demo app pages import generated Convex references from `apps/frontend/src/convex/_generated/api` and `dataModel`.
- Environment variables used by the demo frontend include `NG_APP_CONVEX_URL`, `NG_APP_CONVEX_SITE_URL`, and `NG_APP_SITE_URL`.
- SSR helpers in the library intentionally read `NG_APP_CONVEX_URL`; do not reintroduce Next-style env aliases unless explicitly requested.

## Agent Workflow Guidance

- Prefer `pnpm nx ...` commands when a target exists rather than ad hoc tool invocations.
- Before changing public library behavior, inspect nearby specs and update or add tests in the same area.
- Before changing lazy-loaded app pages, check route imports so default exports stay compatible.
- If you touch public library exports, verify both the library build and the relevant tests.
- For docs-only changes, still keep commands and file paths exact and current.
