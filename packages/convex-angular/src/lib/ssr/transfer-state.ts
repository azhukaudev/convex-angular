import { TransferState, makeStateKey } from '@angular/core';
import { FunctionReference, OptionalRestArgs, getFunctionName } from 'convex/server';

import { serializeConvexSsrValue } from './serialization';
import { Preloaded, TransferredPreloadedQuery } from './types';

function serializeArgs(args: unknown): string {
  return serializeConvexSsrValue(args ?? {});
}

function getPreloadedStateKey(name: string, argsJSON: string) {
  return makeStateKey<string>(`convex-angular:ssr:${name}:${argsJSON}`);
}

function assertTransferredPreloadedQuery(
  value: unknown,
): asserts value is TransferredPreloadedQuery {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid transferred preloaded query payload: expected an object.');
  }

  const payload = value as Record<string, unknown>;

  if (typeof payload['_name'] !== 'string') {
    throw new Error('Invalid transferred preloaded query payload: missing _name.');
  }

  if (typeof payload['_argsJSON'] !== 'string') {
    throw new Error('Invalid transferred preloaded query payload: missing _argsJSON.');
  }

  if (typeof payload['_valueJSON'] !== 'string') {
    throw new Error('Invalid transferred preloaded query payload: missing _valueJSON.');
  }
}

export function transferPreloadedQuery<Query extends FunctionReference<'query'>>(
  preloaded: Preloaded<Query>,
  transferState: TransferState,
): void {
  transferState.set(
    getPreloadedStateKey(preloaded._name, preloaded._argsJSON),
    JSON.stringify({
      _name: preloaded._name,
      _argsJSON: preloaded._argsJSON,
      _valueJSON: preloaded._valueJSON,
    } satisfies TransferredPreloadedQuery),
  );
}

export function readTransferredPreloadedQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  transferState: TransferState,
  ...args: OptionalRestArgs<Query>
): TransferredPreloadedQuery | null {
  const stateKey = getPreloadedStateKey(getFunctionName(query), serializeArgs(args[0] ?? {}));

  if (!transferState.hasKey(stateKey)) {
    return null;
  }

  const payload = transferState.get(stateKey, '');
  transferState.remove(stateKey);

  if (payload.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('Invalid transferred preloaded query payload: malformed JSON.');
  }

  assertTransferredPreloadedQuery(parsed);
  return parsed;
}
