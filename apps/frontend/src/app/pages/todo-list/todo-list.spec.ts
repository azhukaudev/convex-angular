import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { injectAction, injectMutation, injectQuery } from 'convex-angular';

import TodoList from './todo-list';

jest.mock('convex-angular', () => ({
  injectAction: jest.fn(),
  injectMutation: jest.fn(),
  injectQuery: jest.fn(),
}));

const injectQueryMock = injectQuery as unknown as jest.Mock;
const injectMutationMock = injectMutation as unknown as jest.Mock;
const injectActionMock = injectAction as unknown as jest.Mock;

describe('TodoList', () => {
  beforeEach(async () => {
    injectQueryMock.mockReset();
    injectMutationMock.mockReset();
    injectActionMock.mockReset();

    injectQueryMock.mockReturnValue({
      data: signal([]),
      isLoading: signal(false),
    });

    await TestBed.configureTestingModule({
      imports: [TodoList],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('calls mutation helpers directly without .mutate()', async () => {
    const reopenTodo = jest.fn().mockResolvedValue(null);
    const completeTodo = jest.fn().mockResolvedValue(null);
    const addTodo = jest.fn().mockResolvedValue(null);
    const deleteTodo = jest.fn().mockResolvedValue(null);

    injectMutationMock
      .mockReturnValueOnce(addTodo)
      .mockReturnValueOnce(completeTodo)
      .mockReturnValueOnce(reopenTodo)
      .mockReturnValueOnce(deleteTodo);
    injectActionMock
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null));

    const fixture = TestBed.createComponent(TodoList);
    const component = fixture.componentInstance;

    component.newTask.set('Ship docs');

    component.handleTodoChange('todo-1' as never, false);
    component.handleTodoChange('todo-2' as never, true);
    component.handleAddTodo();
    component.handleDeleteTodo('todo-3' as never);

    await Promise.resolve();

    expect(completeTodo).toHaveBeenCalledWith({ id: 'todo-1' });
    expect(reopenTodo).toHaveBeenCalledWith({ id: 'todo-2' });
    expect(addTodo).toHaveBeenCalledWith({ title: 'Ship docs' });
    expect(deleteTodo).toHaveBeenCalledWith({ id: 'todo-3' });
  });

  it('calls action helpers directly without .run()', async () => {
    const completeAll = jest.fn().mockResolvedValue(null);
    const reopenAll = jest.fn().mockResolvedValue(null);

    injectMutationMock
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null));
    injectActionMock.mockReturnValueOnce(completeAll).mockReturnValueOnce(reopenAll);

    const fixture = TestBed.createComponent(TodoList);
    const component = fixture.componentInstance;

    component.handleCompleteAll();
    component.handleReopenAll();

    await Promise.resolve();

    expect(completeAll).toHaveBeenCalledWith({});
    expect(reopenAll).toHaveBeenCalledWith({});
  });
});
