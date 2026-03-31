import { ChangeDetectionStrategy, Component, computed, effect, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  injectMutation,
  injectPaginatedQuery,
  insertAtBottomIfLoaded,
  insertAtPosition,
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
} from 'convex-angular';
import { FunctionArgs } from 'convex/server';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { api } from '../../../convex/_generated/api';
import { Doc, Id } from '../../../convex/_generated/dataModel';

type DemoLane = 'alpha' | 'beta';
type DemoItem = Doc<'optimisticDemoItems'>;
type CreateItemArgs = FunctionArgs<typeof api.optimisticPaginationDemo.createItem>;

@Component({
  imports: [RouterLink, FormsModule, ButtonModule, CardModule, InputNumberModule, ProgressSpinnerModule],
  selector: 'cva-paginated-optimistic-demo',
  templateUrl: 'paginated-optimistic-demo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class PaginatedOptimisticDemo {
  private readonly autoSeededLanes = new Set<DemoLane>();
  private operationSequence = 0;

  readonly selectedLane = model<DemoLane>('alpha');
  readonly pageSize = model(3);
  readonly lastOperation = signal(
    'Reset a lane, load more pages, then try each helper button to see how the list responds immediately.',
  );

  readonly items = injectPaginatedQuery(
    api.optimisticPaginationDemo.listItemsPaginated,
    () => ({ lane: this.selectedLane() }),
    { initialNumItems: this.pageSize },
  );

  readonly resetLane = injectMutation(api.optimisticPaginationDemo.resetLane);
  readonly insertTopItem = injectMutation(api.optimisticPaginationDemo.createItem).withOptimisticUpdate(
    (localStore, args) => {
      insertAtTop({
        paginatedQuery: api.optimisticPaginationDemo.listItemsPaginated,
        argsToMatch: { lane: args.lane },
        localQueryStore: localStore,
        item: this.buildOptimisticItem(args, 'top'),
      });
    },
  );
  readonly insertBottomItem = injectMutation(api.optimisticPaginationDemo.createItem).withOptimisticUpdate(
    (localStore, args) => {
      insertAtBottomIfLoaded({
        paginatedQuery: api.optimisticPaginationDemo.listItemsPaginated,
        argsToMatch: { lane: args.lane },
        localQueryStore: localStore,
        item: this.buildOptimisticItem(args, 'bottom'),
      });
    },
  );
  readonly insertMiddleItem = injectMutation(api.optimisticPaginationDemo.createItem).withOptimisticUpdate(
    (localStore, args) => {
      insertAtPosition({
        paginatedQuery: api.optimisticPaginationDemo.listItemsPaginated,
        argsToMatch: { lane: args.lane },
        sortOrder: 'asc',
        sortKeyFromItem: (item) => item.rank,
        localQueryStore: localStore,
        item: this.buildOptimisticItem(args, 'position'),
      });
    },
  );
  readonly toggleCompleted = injectMutation(api.optimisticPaginationDemo.toggleCompleted).withOptimisticUpdate(
    (localStore, args) => {
      optimisticallyUpdateValueInPaginatedQuery(
        localStore,
        api.optimisticPaginationDemo.listItemsPaginated,
        { lane: this.selectedLane() },
        (item) =>
          item._id === args.id
            ? {
                ...item,
                completed: !item.completed,
              }
            : item,
      );
    },
  );

  readonly loadedCount = computed(() => this.items.results().length);
  readonly helperCards = [
    {
      name: 'insertAtTop',
      note: 'Adds a new row to the first loaded page when the inserted rank belongs above the first item.',
    },
    {
      name: 'insertAtPosition',
      note: 'Places a new row into the correct page based on the same ascending rank used by the server query.',
    },
    {
      name: 'insertAtBottomIfLoaded',
      note: 'Only appends when the final page is already loaded, which keeps unfinished pagination honest.',
    },
    {
      name: 'optimisticallyUpdateValueInPaginatedQuery',
      note: 'Updates already-loaded rows in-place, ideal for toggles and inline edits.',
    },
  ] as const;

  readonly currentLaneStats = computed(() => {
    const results = this.items.results();
    if (results.length === 0) {
      return {
        lowestRank: '—',
        highestRank: '—',
      };
    }

    const sorted = [...results].sort((left, right) => left.rank - right.rank);
    return {
      lowestRank: sorted[0].rank.toFixed(3),
      highestRank: sorted[sorted.length - 1].rank.toFixed(3),
    };
  });

  readonly canInsertAtTop = computed(() => this.loadedCount() > 0);
  readonly canInsertAtPosition = computed(() => this.loadedCount() >= 2);
  readonly canInsertAtBottom = computed(() => this.loadedCount() > 0 && this.items.isExhausted());
  readonly diagnostics = computed(() => ({
    lane: this.selectedLane(),
    loadedCount: this.loadedCount(),
    canLoadMore: this.items.canLoadMore(),
    isExhausted: this.items.isExhausted(),
    lowestRank: this.currentLaneStats().lowestRank,
    highestRank: this.currentLaneStats().highestRank,
  }));

  constructor() {
    effect(() => {
      const lane = this.selectedLane();

      if (!this.items.isSuccess() || this.loadedCount() > 0 || this.autoSeededLanes.has(lane)) {
        return;
      }

      this.autoSeededLanes.add(lane);
      void this.runOperation(
        this.resetLane({ lane }).then(() => this.items.reset()),
        `Seeded the ${lane} lane with the default ranked dataset.`,
      );
    });
  }

  handleLoadMore(): void {
    this.items.loadMore(this.pageSize());
  }

  handleResetPagination(): void {
    this.items.reset();
    this.lastOperation.set('Reset pagination back to the first page.');
  }

  handleResetLane(): void {
    const lane = this.selectedLane();
    this.autoSeededLanes.add(lane);
    void this.runOperation(
      this.resetLane({ lane }).then(() => this.items.reset()),
      `Reset ${lane} to the baseline ranks 10, 20, 30, 40, 50, and 60.`,
    );
  }

  handleInsertAtTop(): void {
    const lane = this.selectedLane();
    const sequence = this.nextSequence();
    const lowestRank = this.findLowestRank();
    const rank = lowestRank - 5 - sequence / 1_000;

    void this.runOperation(
      this.insertTopItem({
        lane,
        title: `${this.formatLane(lane)} top ${sequence}`,
        rank,
        completed: false,
      }),
      `Ran insertAtTop() for ${lane}; optimistic rank ${rank.toFixed(3)} should appear at the first page immediately.`,
    );
  }

  handleInsertAtPosition(): void {
    const lane = this.selectedLane();
    const sequence = this.nextSequence();
    const rank = this.computeMiddleRank(sequence);

    void this.runOperation(
      this.insertMiddleItem({
        lane,
        title: `${this.formatLane(lane)} middle ${sequence}`,
        rank,
        completed: false,
      }),
      `Ran insertAtPosition() for ${lane}; optimistic rank ${rank.toFixed(3)} should land in the sorted middle of the loaded pages.`,
    );
  }

  handleInsertAtBottom(): void {
    const lane = this.selectedLane();
    const sequence = this.nextSequence();
    const rank = this.findHighestRank() + 10 + sequence / 1_000;

    void this.runOperation(
      this.insertBottomItem({
        lane,
        title: `${this.formatLane(lane)} bottom ${sequence}`,
        rank,
        completed: false,
      }),
      `Ran insertAtBottomIfLoaded() for ${lane}; optimistic rank ${rank.toFixed(3)} only appears because the last page is loaded.`,
    );
  }

  handleToggleCompleted(item: DemoItem): void {
    void this.runOperation(
      this.toggleCompleted({ id: item._id }),
      `Ran optimisticallyUpdateValueInPaginatedQuery() for ${item.title}; completed toggled locally before the server response.`,
    );
  }

  trackByItemId(_index: number, item: DemoItem): string {
    return item._id;
  }

  private buildOptimisticItem(args: CreateItemArgs, helperTag: string): DemoItem {
    const sequence = this.nextSequence();
    return {
      _id: `optimistic-${helperTag}-${sequence}` as unknown as Id<'optimisticDemoItems'>,
      _creationTime: Date.now() + sequence,
      title: args.title,
      lane: args.lane,
      rank: args.rank,
      completed: args.completed,
    };
  }

  private computeMiddleRank(sequence: number): number {
    const results = [...this.items.results()].sort((left, right) => left.rank - right.rank);
    if (results.length < 2) {
      return this.findLowestRank() + 0.5 + sequence / 10_000;
    }

    const leftRank = results[0].rank;
    const rightRank = results[1].rank;
    return leftRank + (rightRank - leftRank) / 2 + sequence / 10_000;
  }

  private findLowestRank(): number {
    return this.items.results().reduce((lowest, item) => Math.min(lowest, item.rank), 10);
  }

  private findHighestRank(): number {
    return this.items.results().reduce((highest, item) => Math.max(highest, item.rank), 60);
  }

  private formatLane(lane: DemoLane): string {
    return lane[0].toUpperCase() + lane.slice(1);
  }

  private nextSequence(): number {
    this.operationSequence += 1;
    return this.operationSequence;
  }

  private async runOperation(operation: Promise<unknown>, successMessage: string): Promise<void> {
    try {
      await operation;
      this.lastOperation.set(successMessage);
    } catch (error) {
      this.lastOperation.set(error instanceof Error ? error.message : 'An unknown demo error occurred.');
      console.error(error);
    }
  }
}
