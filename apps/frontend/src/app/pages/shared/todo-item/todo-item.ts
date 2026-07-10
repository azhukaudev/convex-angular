import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';

import { Doc } from '../../../../convex/_generated/dataModel';

/**
 * One todo row (completion checkbox + delete button), shared by the basic
 * and paginated list demos.
 */
@Component({
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatIconModule],
  selector: 'cva-todo-item',
  templateUrl: 'todo-item.html',
  styleUrl: 'todo-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodoItem {
  readonly todo = input.required<Doc<'todos'>>();
  readonly toggled = output<void>();
  readonly deleted = output<void>();
}
