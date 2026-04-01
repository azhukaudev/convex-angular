import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { injectQueries, skipToken } from 'convex-angular';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { api } from '../../../convex/_generated/api';
import { ExamplePageHeaderComponent } from '../shared/example-page-header/example-page-header';

@Component({
  imports: [
    ExamplePageHeaderComponent,
    JsonPipe,
    FormsModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    InputNumberModule,
    ProgressSpinnerModule,
  ],
  selector: 'cva-multi-query-demo',
  templateUrl: 'multi-query-demo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class MultiQueryDemo {
  readonly pageLinks = [
    { href: '/examples/basic', label: 'Basic Example' },
    { href: '/examples/paginated', label: 'Paginated Example' },
    { href: '/auth/login', label: 'Auth Example' },
  ];

  readonly showPreview = model(true);
  readonly showFullList = model(true);
  readonly showCurrentUser = model(false);
  readonly previewCount = model(3);
  readonly fullCount = model(8);

  readonly queries = injectQueries(() => ({
    ...(this.showPreview()
      ? {
          preview: {
            query: api.todos.listTodos,
            args: { count: this.previewCount() },
          },
        }
      : {}),
    ...(this.showFullList()
      ? {
          fullList: {
            query: api.todos.listTodos,
            args: { count: this.fullCount() },
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
