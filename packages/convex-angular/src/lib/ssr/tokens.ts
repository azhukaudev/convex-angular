import { InjectionToken } from '@angular/core';
import { ConvexHttpClient } from 'convex/browser';

/**
 * Options controlling server-side rendering behavior of convex-angular.
 *
 * @see {@link provideConvex}
 *
 * @public
 */
export interface ConvexSsrOptions {
  /**
   * Fetch query results over HTTP during server-side rendering and transfer
   * them to the browser via Angular's TransferState, so the server HTML
   * contains data and the hydrated client renders instantly without a
   * loading flash.
   *
   * @defaultValue true
   */
  fetchOnServer?: boolean;

  /**
   * Optional factory producing a JWT for authenticated server-side query
   * fetches, for example read from the request cookies. Resolved once per
   * server render. Returning null or undefined fetches unauthenticated.
   * Whenever a token is applied, the rendered markup contains that user's
   * data, so the response must be served `Cache-Control: private` (or
   * `no-store`) whether or not results are transferred — see
   * `transferAuthenticatedResults`.
   */
  authToken?: () => string | null | undefined | Promise<string | null | undefined>;

  /**
   * Transfer authenticated query results to the browser via TransferState.
   * When authenticated results are transferred, they are embedded in the
   * rendered HTML — such responses MUST be served with
   * `Cache-Control: private` (or `no-store`) so a shared cache can never
   * serve one user's data to another. Set to false to keep authenticated
   * results out of the TransferState payload only: the rendered markup still
   * contains them, so the `Cache-Control` rule still applies. The hydrated
   * client re-fetches live (a brief loading state after hydration).
   * Has no effect when `authToken` is not configured or resolves no token.
   *
   * @defaultValue true
   */
  transferAuthenticatedResults?: boolean;
}

/**
 * Resolved SSR configuration registered by provideConvex.
 *
 * @internal
 */
export interface ConvexSsrConfig {
  ssr: ConvexSsrOptions;
}

/**
 * Injection token holding the resolved SSR configuration.
 *
 * @internal
 */
export const CONVEX_SSR_CONFIG = new InjectionToken<ConvexSsrConfig>('CONVEX_SSR_CONFIG');

/**
 * The subset of ConvexHttpClient used for server-side query fetches.
 * Modeled as its own type so tests can provide lightweight fakes.
 *
 * @internal
 */
export type ConvexHttpQueryClient = Pick<ConvexHttpClient, 'query' | 'setAuth'>;

/**
 * Injection token for the HTTP client used for server-side query fetches.
 *
 * @internal
 */
export const CONVEX_HTTP_CLIENT = new InjectionToken<ConvexHttpQueryClient>('CONVEX_HTTP_CLIENT');
