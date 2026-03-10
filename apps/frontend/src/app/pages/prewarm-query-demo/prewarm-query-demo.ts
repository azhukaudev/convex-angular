import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, model, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { injectPrewarmQuery, injectQuery, skipToken } from 'convex-angular';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { api } from '../../../convex/_generated/api';
import { Doc, Id } from '../../../convex/_generated/dataModel';

type OpenMode = 'normal' | 'prewarm';

type DemoRun = {
  token: number;
  id: Id<'todos'>;
  mode: OpenMode;
  prewarmStartedAt: number | null;
  navigationStartedAt: number | null;
  resolvedAt: number | null;
};

type DemoHistoryEntry = {
  token: number;
  id: Id<'todos'>;
  title: string;
  mode: OpenMode;
  prewarmLeadMs: number | null;
  timeToDataMs: number | null;
  timestamp: Date;
};

@Component({
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule, CardModule, InputNumberModule, ProgressSpinnerModule],
  selector: 'cva-prewarm-query-demo',
  templateUrl: 'prewarm-query-demo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class PrewarmQueryDemo {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private nextRunToken = 0;
  private pendingNavigationTimer: ReturnType<typeof setTimeout> | null = null;

  readonly prewarmLeadMs = model(350);

  readonly todos = injectQuery(api.todos.listTodos, () => ({ count: 8 }));
  readonly prewarmTodo = injectPrewarmQuery(api.todos.getTodoById, {
    extendSubscriptionFor: 8_000,
  });

  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly selectedTodoId = computed(() => {
    const id = this.queryParamMap().get('id');
    return id ? (id as Id<'todos'>) : null;
  });

  readonly selectedMode = computed<OpenMode | null>(() => {
    if (!this.selectedTodoId()) {
      return this.activeRun()?.mode ?? null;
    }

    return this.queryParamMap().get('mode') === 'prewarm' ? 'prewarm' : 'normal';
  });

  readonly todoDetail = injectQuery(api.todos.getTodoById, () => {
    const id = this.selectedTodoId();
    if (!id) {
      return skipToken;
    }

    return {
      id,
    };
  });

  readonly activeRun = signal<DemoRun | null>(null);
  readonly history = signal<DemoHistoryEntry[]>([]);

  readonly selectedTodo = computed(() => this.todoDetail.data() ?? null);
  readonly selectedTodoTitle = computed(() => {
    const selectedId = this.selectedTodoId() ?? this.activeRun()?.id ?? null;
    if (!selectedId) {
      return null;
    }

    return (
      this.todos.data()?.find((todo) => todo._id === selectedId)?.title ?? this.selectedTodo()?.title ?? 'Selected todo'
    );
  });

  readonly isPrewarmPending = computed(() => {
    const run = this.activeRun();
    return !!run && run.mode === 'prewarm' && run.navigationStartedAt === null;
  });

  readonly timeToDataMs = computed(() => {
    const run = this.activeRun();
    if (!run || run.navigationStartedAt === null || run.resolvedAt === null) {
      return null;
    }

    return Math.round(run.resolvedAt - run.navigationStartedAt);
  });

  readonly prewarmHeadStartMs = computed(() => {
    const run = this.activeRun();
    if (!run || run.prewarmStartedAt === null || run.navigationStartedAt === null) {
      return null;
    }

    return Math.round(run.navigationStartedAt - run.prewarmStartedAt);
  });

  readonly detailStatusLabel = computed(() => {
    if (this.isPrewarmPending()) {
      return 'prewarming';
    }

    if (!this.selectedTodoId()) {
      return 'idle';
    }

    return this.todoDetail.status();
  });

  readonly currentSummary = computed(() => {
    if (this.isPrewarmPending()) {
      return `Prewarming ${this.selectedTodoTitle() ?? 'the selected todo'} before navigation.`;
    }

    if (!this.selectedTodoId()) {
      return 'Pick a todo below, then compare a cold open against prewarm + open.';
    }

    if (this.todoDetail.isLoading()) {
      return `Loading ${this.selectedMode() === 'prewarm' ? 'a prewarmed' : 'a cold'} detail query.`;
    }

    if (this.todoDetail.error()) {
      return 'The detail query failed. Try opening the todo again.';
    }

    if (this.selectedTodo()) {
      return `${this.selectedMode() === 'prewarm' ? 'Prewarmed' : 'Cold'} detail query resolved successfully.`;
    }

    return 'The detail query completed but the todo no longer exists.';
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearPendingNavigation());

    effect(() => {
      const run = this.activeRun();
      if (!run || run.navigationStartedAt === null || run.resolvedAt !== null) {
        return;
      }
      const navigationStartedAt = run.navigationStartedAt;

      if (this.selectedTodoId() !== run.id) {
        return;
      }

      if (this.todoDetail.status() !== 'success') {
        return;
      }

      const resolvedAt = performance.now();
      this.activeRun.update((currentRun) =>
        currentRun?.token === run.token ? { ...currentRun, resolvedAt } : currentRun,
      );

      const resolvedTodo = this.todoDetail.data() as Doc<'todos'> | null | undefined;
      this.history.update((entries) =>
        [
          {
            token: run.token,
            id: run.id,
            title: resolvedTodo?.title ?? this.selectedTodoTitle() ?? 'Deleted todo',
            mode: run.mode,
            prewarmLeadMs:
              run.prewarmStartedAt === null ? null : Math.round(navigationStartedAt - run.prewarmStartedAt),
            timeToDataMs: Math.round(resolvedAt - navigationStartedAt),
            timestamp: new Date(),
          },
          ...entries,
        ].slice(0, 8),
      );
    });
  }

  openNormally(id: Id<'todos'>): void {
    this.clearPendingNavigation();
    const token = ++this.nextRunToken;
    this.activeRun.set({
      token,
      id,
      mode: 'normal',
      prewarmStartedAt: null,
      navigationStartedAt: performance.now(),
      resolvedAt: null,
    });

    void this.navigateToTodo(id, 'normal');
  }

  prewarmAndOpen(id: Id<'todos'>): void {
    this.clearPendingNavigation();
    const token = ++this.nextRunToken;
    const prewarmStartedAt = performance.now();

    this.activeRun.set({
      token,
      id,
      mode: 'prewarm',
      prewarmStartedAt,
      navigationStartedAt: null,
      resolvedAt: null,
    });

    this.prewarmTodo.prewarm({
      id,
    });

    this.pendingNavigationTimer = setTimeout(() => {
      this.pendingNavigationTimer = null;
      this.activeRun.update((currentRun) =>
        currentRun?.token === token ? { ...currentRun, navigationStartedAt: performance.now() } : currentRun,
      );
      void this.navigateToTodo(id, 'prewarm');
    }, this.prewarmLeadMs());
  }

  clearSelection(): void {
    this.clearPendingNavigation();
    this.activeRun.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        id: null,
        mode: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  isSelected(id: Id<'todos'>): boolean {
    return this.selectedTodoId() === id;
  }

  private navigateToTodo(id: Id<'todos'>, mode: OpenMode) {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { id, mode },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private clearPendingNavigation(): void {
    if (this.pendingNavigationTimer !== null) {
      clearTimeout(this.pendingNavigationTimer);
      this.pendingNavigationTimer = null;
    }
  }
}
