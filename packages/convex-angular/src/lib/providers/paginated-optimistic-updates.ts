import { OptimisticLocalStore } from 'convex/browser';
import { FunctionArgs, FunctionReference, FunctionReturnType, PaginationOptions } from 'convex/server';
import { Value, compareValues } from 'convex/values';

import { PaginatedQueryArgs, PaginatedQueryItem, PaginatedQueryReference } from './inject-paginated-query';
import { serializeConvexArgsStable } from './serialize-convex-args-stable';

type LocalQueryResult<Query extends FunctionReference<'query'>> = {
  args: FunctionArgs<Query>;
  value: undefined | FunctionReturnType<Query>;
};

type LoadedResult<Query extends FunctionReference<'query'>> = {
  args: FunctionArgs<Query>;
  value: FunctionReturnType<Query>;
};

function matchesArgs<Query extends PaginatedQueryReference>(
  args: FunctionArgs<Query>,
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>,
): boolean {
  if (argsToMatch === undefined) {
    return true;
  }

  return Object.keys(argsToMatch).every((key) => {
    const typedKey = key as keyof PaginatedQueryArgs<Query>;
    return compareValues(args[typedKey] as Value | undefined, argsToMatch[typedKey] as Value | undefined) === 0;
  });
}

function hasPaginatedPage(value: unknown): value is { page: unknown[]; isDone: boolean } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { page?: unknown[] }).page);
}

/**
 * Optimistically update matching items across all locally cached pages for a
 * paginated query.
 */
export function optimisticallyUpdateValueInPaginatedQuery<Query extends PaginatedQueryReference>(
  localStore: OptimisticLocalStore,
  query: Query,
  args: PaginatedQueryArgs<Query>,
  updateValue: (currentValue: PaginatedQueryItem<Query>) => PaginatedQueryItem<Query>,
): void {
  const expectedArgs = serializeConvexArgsStable(args as Record<string, Value>);

  for (const queryResult of localStore.getAllQueries(query)) {
    if (queryResult.value === undefined) {
      continue;
    }

    const innerArgs = Object.fromEntries(
      Object.entries(queryResult.args).filter(([key]) => key !== 'paginationOpts'),
    ) as PaginatedQueryArgs<Query>;

    if (serializeConvexArgsStable(innerArgs as Record<string, Value>) !== expectedArgs) {
      continue;
    }

    if (!hasPaginatedPage(queryResult.value)) {
      continue;
    }

    localStore.setQuery(query, queryResult.args, {
      ...queryResult.value,
      page: queryResult.value.page.map((item) => updateValue(item as PaginatedQueryItem<Query>)),
    } as FunctionReturnType<Query>);
  }
}

/**
 * Optimistically insert an item at the top of a paginated query.
 */
export function insertAtTop<Query extends PaginatedQueryReference>(options: {
  paginatedQuery: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  localQueryStore: OptimisticLocalStore;
  item: PaginatedQueryItem<Query>;
}): void {
  const { paginatedQuery, argsToMatch, localQueryStore, item } = options;
  const queriesThatMatch = localQueryStore
    .getAllQueries(paginatedQuery)
    .filter((queryResult) => matchesArgs(queryResult.args, argsToMatch));

  const firstPage = queriesThatMatch.find((queryResult) => queryResult.args.paginationOpts.cursor === null);

  if (firstPage === undefined || firstPage.value === undefined) {
    return;
  }

  localQueryStore.setQuery(paginatedQuery, firstPage.args, {
    ...firstPage.value,
    page: [item, ...firstPage.value.page],
  });
}

/**
 * Optimistically insert an item at the bottom of a paginated query, but only
 * if the final page is already loaded.
 */
export function insertAtBottomIfLoaded<Query extends PaginatedQueryReference>(options: {
  paginatedQuery: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  localQueryStore: OptimisticLocalStore;
  item: PaginatedQueryItem<Query>;
}): void {
  const { paginatedQuery, localQueryStore, item, argsToMatch } = options;
  const queriesThatMatch = localQueryStore
    .getAllQueries(paginatedQuery)
    .filter((queryResult) => matchesArgs(queryResult.args, argsToMatch));

  const lastPage = queriesThatMatch.find((queryResult) => queryResult.value !== undefined && queryResult.value.isDone);

  if (lastPage === undefined || lastPage.value === undefined) {
    return;
  }

  localQueryStore.setQuery(paginatedQuery, lastPage.args, {
    ...lastPage.value,
    page: [...lastPage.value.page, item],
  });
}

/**
 * Optimistically insert an item into a paginated query using the same sort key
 * and sort order as the server query.
 */
export function insertAtPosition<Query extends PaginatedQueryReference>(options: {
  paginatedQuery: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  sortOrder: 'asc' | 'desc';
  sortKeyFromItem: (element: PaginatedQueryItem<Query>) => Value | Value[];
  localQueryStore: OptimisticLocalStore;
  item: PaginatedQueryItem<Query>;
}): void {
  const { paginatedQuery, sortOrder, sortKeyFromItem, localQueryStore, item, argsToMatch } = options;

  const queries = localQueryStore.getAllQueries(paginatedQuery) as Array<LocalQueryResult<Query>>;
  const queryGroups: Record<string, LocalQueryResult<Query>[]> = {};

  for (const queryResult of queries) {
    if (!matchesArgs(queryResult.args, argsToMatch)) {
      continue;
    }

    const key = serializeConvexArgsStable(
      Object.fromEntries(
        Object.entries(queryResult.args).map(([argKey, value]) => [
          argKey,
          argKey === 'paginationOpts' ? { id: (value as PaginationOptions & { id: string }).id } : value,
        ]),
      ) as Record<string, Value>,
    );
    queryGroups[key] ??= [];
    queryGroups[key].push(queryResult);
  }

  for (const pageQueries of Object.values(queryGroups)) {
    insertAtPositionInPages({
      pageQueries,
      paginatedQuery,
      sortOrder,
      sortKeyFromItem,
      localQueryStore,
      item,
    });
  }
}

function insertAtPositionInPages<Query extends PaginatedQueryReference>(options: {
  pageQueries: LocalQueryResult<Query>[];
  paginatedQuery: Query;
  sortOrder: 'asc' | 'desc';
  sortKeyFromItem: (element: PaginatedQueryItem<Query>) => Value | Value[];
  localQueryStore: OptimisticLocalStore;
  item: PaginatedQueryItem<Query>;
}): void {
  const { pageQueries, sortOrder, sortKeyFromItem, localQueryStore, item, paginatedQuery } = options;
  const insertedKey = sortKeyFromItem(item);
  const sortedPages = pageQueries
    .filter(
      (queryResult): queryResult is LoadedResult<Query> =>
        queryResult.value !== undefined && queryResult.value.page.length > 0,
    )
    .sort((left, right) => {
      const leftKey = sortKeyFromItem(left.value.page[0]);
      const rightKey = sortKeyFromItem(right.value.page[0]);
      return sortOrder === 'asc' ? compareValues(leftKey, rightKey) : compareValues(rightKey, leftKey);
    });

  const firstLoadedPage = sortedPages[0];
  if (firstLoadedPage === undefined) {
    return;
  }

  const firstPageKey = sortKeyFromItem(firstLoadedPage.value.page[0]);
  const isBeforeFirstPage =
    sortOrder === 'asc' ? compareValues(insertedKey, firstPageKey) <= 0 : compareValues(insertedKey, firstPageKey) >= 0;

  if (isBeforeFirstPage) {
    if (firstLoadedPage.args.paginationOpts.cursor !== null) {
      return;
    }

    localQueryStore.setQuery(paginatedQuery, firstLoadedPage.args, {
      ...firstLoadedPage.value,
      page: [item, ...firstLoadedPage.value.page],
    });
    return;
  }

  const lastLoadedPage = sortedPages[sortedPages.length - 1];
  if (lastLoadedPage === undefined) {
    return;
  }

  const lastPageKey = sortKeyFromItem(lastLoadedPage.value.page[lastLoadedPage.value.page.length - 1]);
  const isAfterLastPage =
    sortOrder === 'asc' ? compareValues(insertedKey, lastPageKey) >= 0 : compareValues(insertedKey, lastPageKey) <= 0;

  if (isAfterLastPage) {
    if (!lastLoadedPage.value.isDone) {
      return;
    }

    localQueryStore.setQuery(paginatedQuery, lastLoadedPage.args, {
      ...lastLoadedPage.value,
      page: [...lastLoadedPage.value.page, item],
    });
    return;
  }

  const successorPageIndex = sortedPages.findIndex((pageQuery) =>
    sortOrder === 'asc'
      ? compareValues(sortKeyFromItem(pageQuery.value.page[0]), insertedKey) > 0
      : compareValues(sortKeyFromItem(pageQuery.value.page[0]), insertedKey) < 0,
  );

  const pageToUpdate =
    successorPageIndex === -1 ? sortedPages[sortedPages.length - 1] : sortedPages[successorPageIndex - 1];

  if (pageToUpdate === undefined) {
    return;
  }

  const indexWithinPage = pageToUpdate.value.page.findIndex((existingItem) =>
    sortOrder === 'asc'
      ? compareValues(sortKeyFromItem(existingItem), insertedKey) >= 0
      : compareValues(sortKeyFromItem(existingItem), insertedKey) <= 0,
  );

  localQueryStore.setQuery(paginatedQuery, pageToUpdate.args, {
    ...pageToUpdate.value,
    page:
      indexWithinPage === -1
        ? [...pageToUpdate.value.page, item]
        : [
            ...pageToUpdate.value.page.slice(0, indexWithinPage),
            item,
            ...pageToUpdate.value.page.slice(indexWithinPage),
          ],
  });
}
