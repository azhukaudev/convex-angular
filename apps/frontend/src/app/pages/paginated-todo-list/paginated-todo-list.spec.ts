import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { injectAction, injectMutation, injectPaginatedQuery } from 'convex-angular';

import PaginatedTodoList from './paginated-todo-list';

jest.mock('convex-angular', () => ({
  injectAction: jest.fn(),
  injectMutation: jest.fn(),
  injectPaginatedQuery: jest.fn(),
}));

const injectPaginatedQueryMock = injectPaginatedQuery as unknown as jest.Mock;
const injectMutationMock = injectMutation as unknown as jest.Mock;
const injectActionMock = injectAction as unknown as jest.Mock;

describe('PaginatedTodoList', () => {
  beforeEach(async () => {
    injectPaginatedQueryMock.mockReset();
    injectMutationMock.mockReset();
    injectActionMock.mockReset();

    injectPaginatedQueryMock.mockReturnValue({
      results: signal([]),
      error: signal<Error | undefined>(undefined),
      isLoadingFirstPage: signal(false),
      isLoadingMore: signal(false),
      canLoadMore: jest.fn().mockReturnValue(false),
      isExhausted: jest.fn().mockReturnValue(false),
      loadMore: jest.fn(),
      reset: jest.fn(),
    });

    await TestBed.configureTestingModule({
      imports: [PaginatedTodoList],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('calls shared todo actions directly', async () => {
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

    const fixture = TestBed.createComponent(PaginatedTodoList);
    const component = fixture.componentInstance;

    component.newTask.set('Ship docs');

    component.todoActions.handleTodoChange('todo-1', false);
    component.todoActions.handleTodoChange('todo-2', true);
    component.todoActions.handleAddTodo();
    component.todoActions.handleDeleteTodo('todo-3');

    await Promise.resolve();

    expect(completeTodo).toHaveBeenCalledWith({ id: 'todo-1' });
    expect(reopenTodo).toHaveBeenCalledWith({ id: 'todo-2' });
    expect(addTodo).toHaveBeenCalledWith({ title: 'Ship docs' });
    expect(deleteTodo).toHaveBeenCalledWith({ id: 'todo-3' });
  });

  it('retries by loading more when more pages are available', () => {
    const loadMore = jest.fn();
    injectPaginatedQueryMock.mockReturnValue({
      results: signal([]),
      error: signal<Error | undefined>(new Error('nope')),
      isLoadingFirstPage: signal(false),
      isLoadingMore: signal(false),
      canLoadMore: jest.fn().mockReturnValue(true),
      isExhausted: jest.fn().mockReturnValue(false),
      loadMore,
      reset: jest.fn(),
    });
    injectMutationMock
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null));
    injectActionMock
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null));

    const fixture = TestBed.createComponent(PaginatedTodoList);
    const component = fixture.componentInstance;

    component.pageSize.set(7);
    component.handleRetry();

    expect(loadMore).toHaveBeenCalledWith(7);
  });

  it('retries by resetting when pagination is exhausted', () => {
    const reset = jest.fn();
    injectPaginatedQueryMock.mockReturnValue({
      results: signal([]),
      error: signal<Error | undefined>(new Error('nope')),
      isLoadingFirstPage: signal(false),
      isLoadingMore: signal(false),
      canLoadMore: jest.fn().mockReturnValue(false),
      isExhausted: jest.fn().mockReturnValue(true),
      loadMore: jest.fn(),
      reset,
    });
    injectMutationMock
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null));
    injectActionMock
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null))
      .mockReturnValueOnce(jest.fn().mockResolvedValue(null));

    const fixture = TestBed.createComponent(PaginatedTodoList);
    const component = fixture.componentInstance;

    component.handleRetry();

    expect(reset).toHaveBeenCalled();
  });
});
