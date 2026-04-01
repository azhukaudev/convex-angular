import { WritableSignal } from '@angular/core';
import { injectAction, injectMutation } from 'convex-angular';

import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

function toTodoId(id: string): Id<'todos'> {
  return id as Id<'todos'>;
}

export function createTodoPageActions(newTask: WritableSignal<string>) {
  const addTodo = injectMutation(api.todos.addTodo, {
    onSuccess: () => newTask.set(''),
  });
  const completeTodo = injectMutation(api.todos.completeTodo);
  const reopenTodo = injectMutation(api.todos.reopenTodo);
  const deleteTodo = injectMutation(api.todos.deleteTodo);
  const completeAll = injectAction(api.todoFunctions.completeAllTodos);
  const reopenAll = injectAction(api.todoFunctions.reopenAllTodos);

  const runOperation = async (operation: Promise<unknown>) => {
    try {
      await operation;
    } catch (error) {
      console.error(error);
    }
  };

  return {
    handleTodoChange(id: string, completed: boolean) {
      if (completed) {
        void runOperation(reopenTodo({ id: toTodoId(id) }));
        return;
      }

      void runOperation(completeTodo({ id: toTodoId(id) }));
    },
    handleAddTodo() {
      void runOperation(addTodo({ title: newTask() }));
    },
    handleDeleteTodo(id: string) {
      void runOperation(deleteTodo({ id: toTodoId(id) }));
    },
    handleCompleteAll() {
      void runOperation(completeAll({}));
    },
    handleReopenAll() {
      void runOperation(reopenAll({}));
    },
  };
}
