import { ConvexHttpClient } from 'convex/browser';
import { ArgsAndOptions, FunctionReference, FunctionReturnType } from 'convex/server';

import { ConvexServerOptions } from './types';

function readEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env?.[name];
}

function readConfiguredConvexUrl(): string | undefined {
  return readEnv('NG_APP_CONVEX_URL');
}

function getConvexUrl(deploymentUrl: string | undefined): string {
  const url = deploymentUrl ?? readConfiguredConvexUrl();

  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Convex deployment URL is missing. Pass { url } or set NG_APP_CONVEX_URL.');
  }

  return url;
}

function setupClient(options: ConvexServerOptions = {}): ConvexHttpClient {
  return new ConvexHttpClient(getConvexUrl(options.url), {
    skipConvexDeploymentUrlCheck: options.skipConvexDeploymentUrlCheck,
    auth: options.token,
    fetch: async (input, init) => {
      return fetch(input, {
        cache: 'no-store',
        ...init,
      });
    },
  });
}

export async function fetchQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: ArgsAndOptions<Query, ConvexServerOptions>
): Promise<FunctionReturnType<Query>> {
  const [fnArgs, options] = args;
  const client = setupClient(options ?? {});
  return client.query(query, (fnArgs ?? {}) as Query['_args']);
}

export async function fetchMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  ...args: ArgsAndOptions<Mutation, ConvexServerOptions>
): Promise<FunctionReturnType<Mutation>> {
  const [fnArgs, options] = args;
  const client = setupClient(options ?? {});
  return client.mutation(mutation, (fnArgs ?? {}) as Mutation['_args']);
}

export async function fetchAction<Action extends FunctionReference<'action'>>(
  action: Action,
  ...args: ArgsAndOptions<Action, ConvexServerOptions>
): Promise<FunctionReturnType<Action>> {
  const [fnArgs, options] = args;
  const client = setupClient(options ?? {});
  return client.action(action, (fnArgs ?? {}) as Action['_args']);
}
