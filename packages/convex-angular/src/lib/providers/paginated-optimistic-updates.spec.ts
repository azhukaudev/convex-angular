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
  sortByField,
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
  /** Cursor of the very first stored page. Defaults to `null`, Convex's marker for the first page of a stream. */
  initialCursor?: string;
  /** Stores the pages back-to-front, so store order no longer matches the cursor chain. */
  storeReversed?: boolean;
}) {
  const instanceId = options.instanceId ?? JSON.stringify(options.args);
  const entries = options.pages.map((page, index) => ({
    args: {
      ...options.args,
      paginationOpts: {
        cursor: index === 0 ? (options.initialCursor ?? null) : `cursor${index - 1}`,
        id: instanceId,
        numItems: 10,
      },
    },
    value: {
      page,
      continueCursor: `cursor${index}`,
      isDone: index === options.pages.length - 1 ? options.isDone : false,
    },
  }));

  for (const entry of options.storeReversed === true ? [...entries].reverse() : entries) {
    options.localQueryStore.setQuery(options.paginatedQuery, entry.args, entry.value);
  }
}

function getPaginatedPages<Query extends PaginatedQueryReference>(options: {
  localQueryStore: LocalQueryStoreFake;
  query: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  instanceId?: string;
  initialCursor?: string;
}) {
  const { localQueryStore, query, argsToMatch, instanceId } = options;
  const initialCursor = options.initialCursor ?? null;
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

  const firstPage = loadedQueries.find((queryResult) => queryResult.args.paginationOpts.cursor === initialCursor);

  if (firstPage === undefined) {
    return [];
  }

  const pages = [[...firstPage.value.page]];
  let currentCursor = firstPage.value.continueCursor;

  while (currentCursor !== null) {
    const nextPage = loadedQueries.find((queryResult) => queryResult.args.paginationOpts.cursor === currentCursor);

    if (nextPage === undefined) {
      break;
    }

    pages.push([...nextPage.value.page]);
    if (nextPage.value.isDone) {
      break;
    }
    currentCursor = nextPage.value.continueCursor;
  }

  return pages;
}

function getPaginatedQueryResults<Query extends PaginatedQueryReference>(options: {
  localQueryStore: LocalQueryStoreFake;
  query: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  instanceId?: string;
  initialCursor?: string;
}) {
  return getPaginatedPages(options).flat();
}

type InsertAtPositionScenario = {
  sortOrder: 'asc' | 'desc';
  pages: Message[][];
  item: Message;
  expectedPages: Message[][];
  isDone?: boolean;
  initialCursor?: string;
};

function insertAtPositionAndReadPages(scenario: InsertAtPositionScenario) {
  const localQueryStore = new LocalQueryStoreFake();

  setupPages({
    localQueryStore,
    paginatedQuery: mockPaginatedQuery,
    args: {},
    pages: scenario.pages,
    isDone: scenario.isDone ?? false,
    initialCursor: scenario.initialCursor,
  });

  insertAtPosition({
    paginatedQuery: mockPaginatedQuery,
    localQueryStore,
    item: scenario.item,
    sortOrder: scenario.sortOrder,
    sortKeyFromItem: (element) => element.rank ?? 0,
  });

  return getPaginatedPages({ localQueryStore, query: mockPaginatedQuery, initialCursor: scenario.initialCursor });
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

    it('leaves pages belonging to a different argument set untouched', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { channel: 'general' },
        pages: [[{ author: 'Alice', read: false }], [{ author: 'Bob', read: false }]],
        isDone: true,
      });
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
        (currentValue) => ({ ...currentValue, read: true }),
      );

      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { channel: 'general' },
        }),
      ).toEqual([
        { author: 'Alice', read: true },
        { author: 'Bob', read: true },
      ]);
      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { channel: 'marketing' },
        }),
      ).toEqual([{ author: 'Dana', read: false }]);
    });

    it('skips cached results that are not paginated pages', () => {
      const localQueryStore = new LocalQueryStoreFake();
      const nullValuedArgs = {
        channel: 'general',
        paginationOpts: { cursor: 'null-valued', id: 'general', numItems: 10 },
      };
      const pagelessArgs = {
        channel: 'general',
        paginationOpts: { cursor: 'pageless', id: 'general', numItems: 10 },
      };

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { channel: 'general' },
        pages: [[{ author: 'Alice', read: false }]],
        isDone: true,
      });
      localQueryStore.setQuery(mockPaginatedQuery, nullValuedArgs, null);
      localQueryStore.setQuery(mockPaginatedQuery, pagelessArgs, { continueCursor: 'next', isDone: true });

      expect(() =>
        optimisticallyUpdateValueInPaginatedQuery(
          localQueryStore,
          mockPaginatedQuery,
          { channel: 'general' },
          (currentValue) => ({ ...currentValue, read: true }),
        ),
      ).not.toThrow();

      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { channel: 'general' },
        }),
      ).toEqual([{ author: 'Alice', read: true }]);
      expect(localQueryStore.getQuery(mockPaginatedQuery, nullValuedArgs)).toBeNull();
      expect(localQueryStore.getQuery(mockPaginatedQuery, pagelessArgs)).toEqual({
        continueCursor: 'next',
        isDone: true,
      });
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

    it('requires every argument in argsToMatch to match, even when an earlier stream matches some of them', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { channel: 'general', listId: 'list-2' },
        pages: [[{ author: 'Charlie' }]],
        isDone: true,
      });
      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { channel: 'general', listId: 'list-1' },
        pages: [[{ author: 'Alice' }, { author: 'Bob' }]],
        isDone: true,
      });

      insertAtTop({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore,
        argsToMatch: { channel: 'general', listId: 'list-1' },
        item: { author: 'Sarah' },
      });

      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { channel: 'general', listId: 'list-1' },
        }),
      ).toEqual([{ author: 'Sarah' }, { author: 'Alice' }, { author: 'Bob' }]);
      expect(
        getPaginatedQueryResults({
          localQueryStore,
          query: mockPaginatedQuery,
          argsToMatch: { channel: 'general', listId: 'list-2' },
        }),
      ).toEqual([{ author: 'Charlie' }]);
    });

    it('inserts into the first page even when a later page was cached first', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { channel: 'general' },
        pages: [[{ author: 'Alice' }, { author: 'Bob' }], [{ author: 'Charlie' }]],
        isDone: true,
        storeReversed: true,
      });

      insertAtTop({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore,
        argsToMatch: { channel: 'general' },
        item: { author: 'Sarah' },
      });

      expect(getPaginatedPages({ localQueryStore, query: mockPaginatedQuery })).toEqual([
        [{ author: 'Sarah' }, { author: 'Alice' }, { author: 'Bob' }],
        [{ author: 'Charlie' }],
      ]);
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

    it('appends to the final page of the matching stream, not to another stream that is already complete', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { listId: 'list-2' },
        pages: [[{ author: 'Charlie' }]],
        isDone: true,
      });
      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: { listId: 'list-1' },
        pages: [[{ author: 'Alice' }], [{ author: 'Bob' }]],
        isDone: true,
      });

      insertAtBottomIfLoaded({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore,
        argsToMatch: { listId: 'list-1' },
        item: { author: 'Sarah' },
      });

      expect(
        getPaginatedPages({ localQueryStore, query: mockPaginatedQuery, argsToMatch: { listId: 'list-1' } }),
      ).toEqual([[{ author: 'Alice' }], [{ author: 'Bob' }, { author: 'Sarah' }]]);
      expect(
        getPaginatedQueryResults({ localQueryStore, query: mockPaginatedQuery, argsToMatch: { listId: 'list-2' } }),
      ).toEqual([{ author: 'Charlie' }]);
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

    it.each<InsertAtPositionScenario>([
      {
        sortOrder: 'asc',
        pages: [
          [
            { author: 'Alice', rank: 20 },
            { author: 'Bob', rank: 30 },
          ],
          [
            { author: 'Charlie', rank: 40 },
            { author: 'Dave', rank: 50 },
          ],
        ],
        item: { author: 'Sarah', rank: 10 },
        expectedPages: [
          [
            { author: 'Sarah', rank: 10 },
            { author: 'Alice', rank: 20 },
            { author: 'Bob', rank: 30 },
          ],
          [
            { author: 'Charlie', rank: 40 },
            { author: 'Dave', rank: 50 },
          ],
        ],
      },
      {
        sortOrder: 'desc',
        pages: [
          [
            { author: 'Dave', rank: 50 },
            { author: 'Charlie', rank: 40 },
          ],
          [
            { author: 'Bob', rank: 30 },
            { author: 'Alice', rank: 20 },
          ],
        ],
        item: { author: 'Sarah', rank: 60 },
        expectedPages: [
          [
            { author: 'Sarah', rank: 60 },
            { author: 'Dave', rank: 50 },
            { author: 'Charlie', rank: 40 },
          ],
          [
            { author: 'Bob', rank: 30 },
            { author: 'Alice', rank: 20 },
          ],
        ],
      },
    ])('prepends to the first page when the item sorts before every loaded item ($sortOrder)', (scenario) => {
      expect(insertAtPositionAndReadPages(scenario)).toEqual(scenario.expectedPages);
    });

    it.each<InsertAtPositionScenario>([
      {
        sortOrder: 'asc',
        initialCursor: 'earlier-page',
        pages: [
          [
            { author: 'Alice', rank: 20 },
            { author: 'Bob', rank: 30 },
          ],
          [
            { author: 'Charlie', rank: 40 },
            { author: 'Dave', rank: 50 },
          ],
        ],
        item: { author: 'Sarah', rank: 20 },
        expectedPages: [
          [
            { author: 'Alice', rank: 20 },
            { author: 'Bob', rank: 30 },
          ],
          [
            { author: 'Charlie', rank: 40 },
            { author: 'Dave', rank: 50 },
          ],
        ],
      },
      {
        sortOrder: 'desc',
        initialCursor: 'earlier-page',
        pages: [
          [
            { author: 'Dave', rank: 50 },
            { author: 'Charlie', rank: 40 },
          ],
          [
            { author: 'Bob', rank: 30 },
            { author: 'Alice', rank: 20 },
          ],
        ],
        item: { author: 'Sarah', rank: 50 },
        expectedPages: [
          [
            { author: 'Dave', rank: 50 },
            { author: 'Charlie', rank: 40 },
          ],
          [
            { author: 'Bob', rank: 30 },
            { author: 'Alice', rank: 20 },
          ],
        ],
      },
    ])(
      'does not insert ahead of the earliest loaded page when earlier pages are still missing ($sortOrder)',
      (scenario) => {
        expect(insertAtPositionAndReadPages(scenario)).toEqual(scenario.expectedPages);
      },
    );

    it.each<InsertAtPositionScenario>([
      {
        sortOrder: 'asc',
        isDone: true,
        pages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
          ],
          [
            { author: 'Charlie', rank: 30 },
            { author: 'Dave', rank: 40 },
          ],
        ],
        item: { author: 'Sarah', rank: 40 },
        expectedPages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
          ],
          [
            { author: 'Charlie', rank: 30 },
            { author: 'Dave', rank: 40 },
            { author: 'Sarah', rank: 40 },
          ],
        ],
      },
      {
        sortOrder: 'desc',
        isDone: true,
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
        item: { author: 'Sarah', rank: 10 },
        expectedPages: [
          [
            { author: 'Dave', rank: 40 },
            { author: 'Charlie', rank: 30 },
          ],
          [
            { author: 'Bob', rank: 20 },
            { author: 'Alice', rank: 10 },
            { author: 'Sarah', rank: 10 },
          ],
        ],
      },
    ])('appends behind an item with the same sort key when the final page is loaded ($sortOrder)', (scenario) => {
      expect(insertAtPositionAndReadPages(scenario)).toEqual(scenario.expectedPages);
    });

    it.each<InsertAtPositionScenario>([
      {
        sortOrder: 'asc',
        isDone: false,
        pages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
          ],
          [
            { author: 'Charlie', rank: 30 },
            { author: 'Dave', rank: 40 },
          ],
        ],
        item: { author: 'Sarah', rank: 40 },
        expectedPages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
          ],
          [
            { author: 'Charlie', rank: 30 },
            { author: 'Dave', rank: 40 },
          ],
        ],
      },
      {
        sortOrder: 'desc',
        isDone: false,
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
        item: { author: 'Sarah', rank: 10 },
        expectedPages: [
          [
            { author: 'Dave', rank: 40 },
            { author: 'Charlie', rank: 30 },
          ],
          [
            { author: 'Bob', rank: 20 },
            { author: 'Alice', rank: 10 },
          ],
        ],
      },
    ])('does not insert past the last loaded page while more pages remain ($sortOrder)', (scenario) => {
      expect(insertAtPositionAndReadPages(scenario)).toEqual(scenario.expectedPages);
    });

    it.each<InsertAtPositionScenario>([
      {
        sortOrder: 'asc',
        pages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
          ],
          [
            { author: 'Charlie', rank: 30 },
            { author: 'Dave', rank: 40 },
          ],
        ],
        item: { author: 'Sarah', rank: 25 },
        expectedPages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
            { author: 'Sarah', rank: 25 },
          ],
          [
            { author: 'Charlie', rank: 30 },
            { author: 'Dave', rank: 40 },
          ],
        ],
      },
      {
        sortOrder: 'desc',
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
        item: { author: 'Sarah', rank: 25 },
        expectedPages: [
          [
            { author: 'Dave', rank: 40 },
            { author: 'Charlie', rank: 30 },
            { author: 'Sarah', rank: 25 },
          ],
          [
            { author: 'Bob', rank: 20 },
            { author: 'Alice', rank: 10 },
          ],
        ],
      },
    ])('appends to the page that precedes the first page sorting after the item ($sortOrder)', (scenario) => {
      expect(insertAtPositionAndReadPages(scenario)).toEqual(scenario.expectedPages);
    });

    it.each<InsertAtPositionScenario>([
      {
        sortOrder: 'asc',
        pages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
          ],
          [
            { author: 'Charlie', rank: 25 },
            { author: 'Dave', rank: 30 },
          ],
        ],
        item: { author: 'Sarah', rank: 25 },
        expectedPages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
          ],
          [
            { author: 'Sarah', rank: 25 },
            { author: 'Charlie', rank: 25 },
            { author: 'Dave', rank: 30 },
          ],
        ],
      },
      {
        sortOrder: 'desc',
        pages: [
          [
            { author: 'Dave', rank: 40 },
            { author: 'Charlie', rank: 30 },
          ],
          [
            { author: 'Bob', rank: 25 },
            { author: 'Alice', rank: 10 },
          ],
        ],
        item: { author: 'Sarah', rank: 25 },
        expectedPages: [
          [
            { author: 'Dave', rank: 40 },
            { author: 'Charlie', rank: 30 },
          ],
          [
            { author: 'Sarah', rank: 25 },
            { author: 'Bob', rank: 25 },
            { author: 'Alice', rank: 10 },
          ],
        ],
      },
    ])('keeps a page whose leading item ties with the item as the insertion page ($sortOrder)', (scenario) => {
      expect(insertAtPositionAndReadPages(scenario)).toEqual(scenario.expectedPages);
    });

    it.each<InsertAtPositionScenario>([
      {
        sortOrder: 'asc',
        pages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
            { author: 'Charlie', rank: 30 },
          ],
        ],
        item: { author: 'Sarah', rank: 20 },
        expectedPages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Sarah', rank: 20 },
            { author: 'Bob', rank: 20 },
            { author: 'Charlie', rank: 30 },
          ],
        ],
      },
      {
        sortOrder: 'desc',
        pages: [
          [
            { author: 'Charlie', rank: 30 },
            { author: 'Bob', rank: 20 },
            { author: 'Alice', rank: 10 },
          ],
        ],
        item: { author: 'Sarah', rank: 20 },
        expectedPages: [
          [
            { author: 'Charlie', rank: 30 },
            { author: 'Sarah', rank: 20 },
            { author: 'Bob', rank: 20 },
            { author: 'Alice', rank: 10 },
          ],
        ],
      },
    ])('inserts ahead of the first item within a page that ties with the item ($sortOrder)', (scenario) => {
      expect(insertAtPositionAndReadPages(scenario)).toEqual(scenario.expectedPages);
    });

    it('ignores empty and unloaded pages when choosing the insertion point', () => {
      const localQueryStore = new LocalQueryStoreFake();
      const unloadedTailArgs = { paginationOpts: { cursor: 'cursor2', id: 'stream-a', numItems: 10 } };
      const unloadedStreamArgs = { paginationOpts: { cursor: null, id: 'stream-b', numItems: 10 } };

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: {},
        pages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
          ],
          [],
          [{ author: 'Charlie', rank: 30 }],
        ],
        isDone: false,
        instanceId: 'stream-a',
      });
      localQueryStore.setQuery(mockPaginatedQuery, unloadedTailArgs, undefined);
      localQueryStore.setQuery(mockPaginatedQuery, unloadedStreamArgs, undefined);

      expect(() =>
        insertAtPosition({
          paginatedQuery: mockPaginatedQuery,
          localQueryStore,
          item: { author: 'Sarah', rank: 25 },
          sortOrder: 'asc',
          sortKeyFromItem: (item) => item.rank ?? 0,
        }),
      ).not.toThrow();

      expect(getPaginatedPages({ localQueryStore, query: mockPaginatedQuery, instanceId: 'stream-a' })).toEqual([
        [
          { author: 'Alice', rank: 10 },
          { author: 'Bob', rank: 20 },
          { author: 'Sarah', rank: 25 },
        ],
        [],
        [{ author: 'Charlie', rank: 30 }],
      ]);
      expect(localQueryStore.getQuery(mockPaginatedQuery, unloadedTailArgs)).toBeUndefined();
      expect(localQueryStore.getQuery(mockPaginatedQuery, unloadedStreamArgs)).toBeUndefined();
    });

    it('orders loaded pages by their leading item rather than by cache insertion order', () => {
      const localQueryStore = new LocalQueryStoreFake();

      setupPages({
        localQueryStore,
        paginatedQuery: mockPaginatedQuery,
        args: {},
        pages: [
          [
            { author: 'Alice', rank: 10 },
            { author: 'Bob', rank: 20 },
          ],
          [
            { author: 'Charlie', rank: 30 },
            { author: 'Dave', rank: 40 },
          ],
        ],
        isDone: true,
        storeReversed: true,
      });

      insertAtPosition({
        paginatedQuery: mockPaginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 25 },
        sortOrder: 'asc',
        sortKeyFromItem: (item) => item.rank ?? 0,
      });

      expect(getPaginatedPages({ localQueryStore, query: mockPaginatedQuery })).toEqual([
        [
          { author: 'Alice', rank: 10 },
          { author: 'Bob', rank: 20 },
          { author: 'Sarah', rank: 25 },
        ],
        [
          { author: 'Charlie', rank: 30 },
          { author: 'Dave', rank: 40 },
        ],
      ]);
    });
  });

  describe('sortByField', () => {
    it('extracts a single field as the sort key', () => {
      const key = sortByField<{ rank: number }>('rank');
      expect(key({ rank: 42 })).toBe(42);
    });

    it('extracts multiple fields as a composite sort key', () => {
      const key = sortByField<{ rank: number; _creationTime: number }>('rank', '_creationTime');
      expect(key({ rank: 42, _creationTime: 1000 })).toEqual([42, 1000]);
    });
  });
});
