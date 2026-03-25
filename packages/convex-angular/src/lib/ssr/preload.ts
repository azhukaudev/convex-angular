import { ArgsAndOptions, FunctionReference, FunctionReturnType, getFunctionName } from 'convex/server';

import { fetchQuery } from './http';
import { parseSerializedConvexSsrValue, serializeConvexSsrValue } from './serialization';
import { ConvexServerOptions, Preloaded } from './types';

export async function preloadQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: ArgsAndOptions<Query, ConvexServerOptions>
): Promise<Preloaded<Query>> {
  const value = await fetchQuery(query, ...args);

  return {
    __type: query,
    _name: getFunctionName(query),
    _argsJSON: serializeConvexSsrValue(args[0] ?? {}),
    _valueJSON: serializeConvexSsrValue(value),
  };
}

export function preloadedQueryResult<Query extends FunctionReference<'query'>>(
  preloaded: Preloaded<Query>,
): FunctionReturnType<Query> {
  return parseSerializedConvexSsrValue<FunctionReturnType<Query>>(preloaded._valueJSON);
}
