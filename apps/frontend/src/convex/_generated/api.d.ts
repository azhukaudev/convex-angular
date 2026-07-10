/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { ApiFromModules, FilterApi, FunctionReference } from 'convex/server';

import type * as auth from '../auth.js';
import type * as http from '../http.js';
import type * as optimisticPaginationDemo from '../optimisticPaginationDemo.js';
import type * as todoFunctions from '../todoFunctions.js';
import type * as todos from '../todos.js';

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  http: typeof http;
  optimisticPaginationDemo: typeof optimisticPaginationDemo;
  todoFunctions: typeof todoFunctions;
  todos: typeof todos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, 'public'>>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, 'internal'>>;

export declare const components: {
  betterAuth: import('@convex-dev/better-auth/_generated/component.js').ComponentApi<'betterAuth'>;
};
