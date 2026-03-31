import { Signal, computed } from '@angular/core';
import { FunctionReturnType, getFunctionName } from 'convex/server';

import { parseSerializedConvexSsrValue } from '../ssr/serialization';
import { Preloaded, TransferredPreloadedQuery } from '../ssr/types';
import { QueryReference, QueryResult, injectQuery } from './inject-query';

export interface PreloadedQueryResult<Query extends QueryReference> extends Omit<QueryResult<Query>, 'data'> {
  data: Signal<FunctionReturnType<Query>>;
  preloadedData: Signal<FunctionReturnType<Query>>;
  isHydratedFromServer: Signal<boolean>;
  liveQuery: QueryResult<Query>;
}

export function injectPreloadedQuery<Query extends QueryReference>(
  query: Query,
  preloaded: Preloaded<Query> | TransferredPreloadedQuery,
): PreloadedQueryResult<Query> {
  if (typeof preloaded !== 'object' || preloaded === null) {
    throw new Error('Invalid transferred preloaded query payload: expected an object.');
  }

  if (typeof preloaded._name !== 'string') {
    throw new Error('Invalid transferred preloaded query payload: missing _name.');
  }

  if (typeof preloaded._argsJSON !== 'string') {
    throw new Error('Invalid transferred preloaded query payload: missing _argsJSON.');
  }

  if (typeof preloaded._valueJSON !== 'string') {
    throw new Error('Invalid transferred preloaded query payload: missing _valueJSON.');
  }

  const expectedName = getFunctionName(query);
  if (preloaded._name !== expectedName) {
    throw new Error(
      `Transferred preloaded query does not match the provided query reference. ` +
        `Expected "${expectedName}", received "${preloaded._name}".`,
    );
  }

  try {
    parseSerializedConvexSsrValue(preloaded._argsJSON);
  } catch {
    throw new Error('Invalid transferred preloaded query payload: malformed _argsJSON.');
  }

  try {
    parseSerializedConvexSsrValue(preloaded._valueJSON);
  } catch {
    throw new Error('Invalid transferred preloaded query payload: malformed _valueJSON.');
  }

  const args = parseSerializedConvexSsrValue<Query['_args']>(preloaded._argsJSON);
  const initialData = parseSerializedConvexSsrValue<FunctionReturnType<Query>>(preloaded._valueJSON);

  const liveQuery = injectQuery(query, () => args);
  const preloadedData = computed(() => initialData);
  const data = computed(() => {
    const liveData = liveQuery.data();
    return liveData === undefined ? preloadedData() : liveData;
  });
  const isHydratedFromServer = computed(() => liveQuery.data() === undefined);

  return {
    ...liveQuery,
    data,
    preloadedData,
    isHydratedFromServer,
    liveQuery,
  };
}
