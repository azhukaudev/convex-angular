import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

interface TodoPageItem {
  _id: string;
  title: string;
  completed: boolean;
}

@Component({
  imports: [FormsModule, RouterLink, ButtonModule, CheckboxModule, InputTextModule, ProgressSpinnerModule],
  selector: 'cva-todo-page',
  templateUrl: 'todo-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class TodoPageComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly alternateHref = input.required<string>();
  readonly alternateLabel = input.required<string>();
  readonly newTask = input.required<string>();
  readonly tasks = input.required<readonly TodoPageItem[]>();
  readonly isLoading = input.required<boolean>();
  readonly spinnerLabel = input('loading');
  readonly spinnerCentered = input(false);
  readonly emptyMessage = input<string | null>(null);

  readonly newTaskChange = output<string>();
  readonly addTodo = output<void>();
  readonly toggleTodo = output<{ id: string; completed: boolean }>();
  readonly deleteTodo = output<string>();
  readonly completeAll = output<void>();
  readonly reopenAll = output<void>();

  handleNewTaskChange(value: string): void {
    this.newTaskChange.emit(value);
  }

  handleAddTodo(): void {
    this.addTodo.emit();
  }

  handleTodoChange(id: string, completed: boolean): void {
    this.toggleTodo.emit({ id, completed });
  }

  handleDeleteTodo(id: string): void {
    this.deleteTodo.emit(id);
  }

  handleCompleteAll(): void {
    this.completeAll.emit();
  }

  handleReopenAll(): void {
    this.reopenAll.emit();
  }
}
