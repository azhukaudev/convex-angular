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
   */
  authToken?: () => string | null | undefined | Promise<string | null | undefined>;
}

/**
 * Resolved SSR configuration registered by provideConvex.
 *
 * @internal
 */
export interface ConvexSsrConfig {
  url: string;
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
