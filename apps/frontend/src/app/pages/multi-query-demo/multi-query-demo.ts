import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { injectQueries, skipToken } from 'convex-angular';

import { api } from '../../../convex/_generated/api';
import { numberField } from '../shared/number-field';
import { PageHeader } from '../shared/page-header/page-header';

@Component({
  imports: [
    JsonPipe,
    FormsModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    PageHeader,
  ],
  selector: 'cva-multi-query-demo',
  templateUrl: 'multi-query-demo.html',
  styleUrl: 'multi-query-demo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class MultiQueryDemo {
  readonly showPreview = model(true);
  readonly showFullList = model(true);
  readonly showCurrentUser = model(false);
  readonly previewCount = numberField(3, 1, 20);
  readonly fullCount = numberField(8, 1, 50);

  readonly queries = injectQueries(() => ({
    ...(this.showPreview()
      ? {
          preview: {
            query: api.todos.listTodos,
            args: { count: this.previewCount.effective() },
          },
        }
      : {}),
    ...(this.showFullList()
      ? {
          fullList: {
            query: api.todos.listTodos,
            args: { count: this.fullCount.effective() },
          },
        }
      : {}),
    currentUser: this.showCurrentUser()
      ? {
          query: api.auth.getCurrentUser,
          args: {},
        }
      : skipToken,
  }));

  readonly activeKeys = computed(() => Object.keys(this.queries.statuses()));
  readonly successfulKeys = computed(() =>
    Object.entries(this.queries.statuses())
      .filter(([, status]) => status === 'success')
      .map(([key]) => key),
  );

  hasKey(key: string): boolean {
    return key in this.queries.statuses();
  }
}
