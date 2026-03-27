import { FunctionReference } from 'convex/server';

/**
 * Preloaded Convex query payload that can be transferred from server rendering
 * into a client-side reactive query.
 */
export type Preloaded<Query extends FunctionReference<'query'>> = {
  __type: Query;
  _name: string;
  _argsJSON: string;
  _valueJSON: string;
};

/**
 * Serialized preloaded query payload after it crosses the Angular TransferState
 * boundary. The original query reference does not survive transport.
 */
export interface TransferredPreloadedQuery {
  _name: string;
  _argsJSON: string;
  _valueJSON: string;
}

/**
 * Options shared by SSR/server-side Convex helpers.
 */
export interface ConvexServerOptions {
  /**
   * JWT token used for authenticated server-side requests.
   */
  token?: string;

  /**
   * Explicit Convex deployment URL.
   * Falls back to NG_APP_CONVEX_URL when omitted.
   */
  url?: string;

  /**
   * Skip deployment URL validation for self-hosted backends.
   */
  skipConvexDeploymentUrlCheck?: boolean;
}
