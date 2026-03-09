import { OptimisticLocalStore } from 'convex/browser';
import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
  getFunctionName,
  makeFunctionReference,
} from 'convex/server';
import { Value, compareValues, convexToJson } from 'convex/values';

import { PaginatedQueryArgs, PaginatedQueryItem, PaginatedQueryReference } from './inject-paginated-query';
import {
  insertAtBottomIfLoaded,
  insertAtPosition,
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
} from './paginated-optimistic-updates';

type Message = {
  author: string;
  content?: string;
  rank?: number;
  read?: boolean;
};

const mockPaginatedQuery = makeFunctionReference<
  'query',
  { paginationOpts: PaginationOptions; channel?: string; listId?: string },
  PaginationResult<Message>
>('messages:list') as PaginatedQueryReference;

class LocalQueryStoreFake implements OptimisticLocalStore {
  private readonly queries: Record<string, Record<string, { args: Record<string, Value>; value: undefined | Value }>> =
    {};

  setQuery(query: FunctionReference<'query'>, args: any, value: any): void {
    const queriesByName = this.queries[getFunctionName(query)] ?? {};
    this.queries[getFunctionName(query)] = queriesByName;

    const rawArgs = args ?? {};
    const serializedArgs = JSON.stringify(convexToJson(rawArgs));
    queriesByName[serializedArgs] = { args: rawArgs, value };
  }

  getAllQueries<Query extends FunctionReference<'query'>>(
    query: Query,
  ): Array<{
    args: FunctionArgs<Query>;
    value: undefined | FunctionReturnType<Query>;
  }> {
    return Object.values(this.queries[getFunctionName(query)] ?? {}).map((queryResult) => ({
      args: queryResult.args as FunctionArgs<Query>,
      value: queryResult.value as undefined | FunctionReturnType<Query>,
    }));
  }

  getQuery(query: FunctionReference<'query'>, args: any) {
    const serializedArgs = JSON.stringify(convexToJson(args ?? {}));
    return this.queries[getFunctionName(query)]?.[serializedArgs]?.value as Value | undefined;
  }
}

function argsMatch<Query extends PaginatedQueryReference>(options: {
  args: FunctionArgs<Query>;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
}) {
  const { args, argsToMatch } = options;
  if (argsToMatch === undefined) {
    return true;
  }

  return Object.keys(argsToMatch).every((key) => {
    const typedKey = key as keyof PaginatedQueryArgs<Query>;
    return compareValues(args[typedKey] as Value | undefined, argsToMatch[typedKey] as Value | undefined) === 0;
  });
}

function setupPages<Query extends PaginatedQueryReference>(options: {
  localQueryStore: LocalQueryStoreFake;
  paginatedQuery: Query;
  args: PaginatedQueryArgs<Query>;
  pages: Array<Array<PaginatedQueryItem<Query>>>;
  isDone: boolean;
  instanceId?: string;
}) {
  let currentCursor: string | null = null;

  for (let index = 0; index < options.pages.length; index += 1) {
    const page = options.pages[index];
    const nextCursor = `cursor${index}`;

    options.localQueryStore.setQuery(
      options.paginatedQuery,
      {
        ...options.args,
        paginationOpts: {
          cursor: currentCursor,
          id: options.instanceId ?? JSON.stringify(options.args),
          numItems: 10,
        },
      },
      {
        page,
        continueCursor: nextCursor,
        isDone: index === options.pages.length - 1 ? options.isDone : false,
      },
    );

    currentCursor = nextCursor;
  }
}

function getPaginatedQueryResults<Query extends PaginatedQueryReference>(options: {
  localQueryStore: LocalQueryStoreFake;
  query: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  instanceId?: string;
}) {
  const { localQueryStore, query, argsToMatch, instanceId } = options;
  const allQueries = localQueryStore.getAllQueries(query);
  const relevantQueries = allQueries.filter(
    (queryResult) =>
      argsMatch({ args: queryResult.args, argsToMatch }) &&
      (instanceId === undefined ||
        (queryResult.args.paginationOpts as PaginationOptions & { id: string }).id === instanceId),
  );

  const loadedQueries: Array<{
    args: FunctionArgs<Query>;
    value: FunctionReturnType<Query>;
  }> = [];

  for (const queryResult of relevantQueries) {
    if (queryResult.value !== undefined) {
      loadedQueries.push({ args: queryResult.args, value: queryResult.value });
    }
  }

  const firstPage = loadedQueries.find((queryResult) => queryResult.args.paginationOpts.cursor === null);

  if (firstPage === undefined) {
    return [];
  }

  const results = [...firstPage.value.page];
  let currentCursor = firstPage.value.continueCursor;

  while (currentCursor !== null) {
    const nextPage = loadedQueries.find((queryResult) => queryResult.args.paginationOpts.cursor === currentCursor);

    if (nextPage === undefined) {
      break;
    }

    results.push(...nextPage.value.page);
    if (nextPage.value.isDone) {
      break;
    }
    currentCursor = nextPage.value.continueCursor;
  }

  return results;
}

describe('paginated optimistic updates', () => {
  describe('optimisticallyUpdateValueInPaginatedQuery', () => {
    it('updates matching items across loaded pages only', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { channel: 'general' },
        pages: [
          [
            { author: 'Alice', read: false },
            { author: 'Bob', read: false },
          ],
          [{ author: 'Charlie', read: false }],
        ],
        isDone: false,
      });
      localQueryStore.setQuery(
        mockPaginatedQuery,
        {
          channel: 'general',
          paginationOpts: { cursor: 'loading', id: 'general', numItems: 10 },
        },
        undefined,
      );
      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { channel: 'marketing' },
        pages: [[{ author: 'Dana', read: false }]],
        isDone: true,
      });

      optimisticallyUpdateValueInPaginatedQuery(
        localQueryStore,
        mockPaginatedQuery,
        { channel: 'general' },
        (currentValue) => (currentValue.author === 'Bob' ? { ...currentValue, read: true } : currentValue),
      );

      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { channel: 'general' },
        }),
      ).toEqual([
        { author: 'Alice', read: false },
        { author: 'Bob', read: true },
        { author: 'Charlie', read: false },
      ]);
      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { channel: 'marketing' },
        }),
      ).toEqual([{ author: 'Dana', read: false }]);
    });
  });

  describe('insertAtTop', () => {
    it('does not insert if the query is not loaded', () => {
      const localQueryStore = new LocalQueryStoreFake();

      insertAtTop({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', content: 'Hello' },
      });

      expect(localQueryStore.getAllQueries(mockPaginatedQuery)).toHaveLength(0);
    });

    it('inserts at the top and respects filters', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { channel: 'general' },
        pages: [[{ author: 'Alice' }, { author: 'Bob' }]],
        isDone: false,
      });
      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { channel: 'marketing' },
        pages: [[{ author: 'Charlie' }]],
        isDone: false,
      });

      insertAtTop({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore,
        argsToMatch: { channel: 'general' },
        item: { author: 'Sarah' },
      });

      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { channel: 'general' },
        }),
      ).toEqual([{ author: 'Sarah' }, { author: 'Alice' }, { author: 'Bob' }]);
      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { channel: 'marketing' },
        }),
      ).toEqual([{ author: 'Charlie' }]);
    });
  });

  describe('insertAtBottomIfLoaded', () => {
    it('only inserts when the last page is loaded', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: {},
        pages: [[{ author: 'Alice' }], [{ author: 'Bob' }]],
        isDone: false,
      });

      insertAtBottomIfLoaded({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore,
        item: { author: 'Sarah' },
      });

      expect(getPaginatedQueryResults({ localQueryStore, query: mockPaginatedQuery })).toEqual([
        { author: 'Alice' },
        { author: 'Bob' },
      ]);

      const doneStore = new LocalQueryStoreFake();
      setupPages({
        localQueryStore: doneStore,
        paginatedQuery: mockPaginatedQuery,
        args: {},
        pages: [[{ author: 'Alice' }], [{ author: 'Bob' }]],
        isDone: true,
      });

      insertAtBottomIfLoaded({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore: doneStore,
        item: { author: 'Sarah' },
      });

      expect(getPaginatedQueryResults({ localQueryStore: doneStore, query: mockPaginatedQuery })).toEqual([
        { author: 'Alice' },
        { author: 'Bob' },
        { author: 'Sarah' },
      ]);
    });
  });

  describe('insertAtPosition', () => {
    it('inserts in the middle for descending lists', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: {},
        pages: [
          [
            { author: 'Dave', rank: 40 },
            { author: 'Charlie', rank: 30 },
          ],
          [
            { author: 'Bob', rank: 20 },
            { author: 'Alice', rank: 10 },
          ],
        ],
        isDone: false,
      });

      insertAtPosition({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 15 },
        sortOrder: 'desc',
        sortKeyFromItem: (item) => item.rank ?? 0,
      });

      expect(getPaginatedQueryResults({ localQueryStore, query: mockPaginatedQuery })).toEqual([
        { author: 'Dave', rank: 40 },
        { author: 'Charlie', rank: 30 },
        { author: 'Bob', rank: 20 },
        { author: 'Sarah', rank: 15 },
        { author: 'Alice', rank: 10 },
      ]);
    });

    it('respects filters and keeps paginated streams separated by paginationOpts.id', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { listId: 'list-1' },
        pages: [[{ author: 'Alice', rank: 10 }], [{ author: 'Charlie', rank: 30 }]],
        isDone: true,
        instanceId: 'stream-a',
      });
      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { listId: 'list-1' },
        pages: [[{ author: 'Bob', rank: 20 }], [{ author: 'Dave', rank: 40 }]],
        isDone: true,
        instanceId: 'stream-b',
      });
      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { listId: 'list-2' },
        pages: [[{ author: 'Eve', rank: 50 }]],
        isDone: true,
        instanceId: 'stream-c',
      });

      insertAtPosition({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore,
        argsToMatch: { listId: 'list-1' },
        item: { author: 'Sarah', rank: 25 },
        sortOrder: 'asc',
        sortKeyFromItem: (item) => item.rank ?? 0,
      });

      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { listId: 'list-1' },
          instanceId: 'stream-a',
        }),
      ).toEqual([
        { author: 'Alice', rank: 10 },
        { author: 'Sarah', rank: 25 },
        { author: 'Charlie', rank: 30 },
      ]);
      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { listId: 'list-1' },
          instanceId: 'stream-b',
        }),
      ).toEqual([
        { author: 'Bob', rank: 20 },
        { author: 'Sarah', rank: 25 },
        { author: 'Dave', rank: 40 },
      ]);
      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { listId: 'list-2' },
          instanceId: 'stream-c',
        }),
      ).toEqual([{ author: 'Eve', rank: 50 }]);
    });
  });
});
