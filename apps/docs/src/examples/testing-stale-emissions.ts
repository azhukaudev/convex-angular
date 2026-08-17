import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { injectQuery } from 'convex-angular';
import { MockConvexClient, MockQuerySubscription, provideConvexTesting } from 'convex-angular/testing';

import { api, type Todo, type TodoId } from './convex/api';

@Component({
  selector: 'app-category-todos',
  template: `
    @for (todo of todos.data() ?? []; track todo._id) {
      <li>{{ todo.title }}</li>
    }
  `,
})
export class CategoryTodos {
  readonly category = signal('work');
  readonly todos = injectQuery(api.todos.listByCategory, () => ({ category: this.category() }));
}

/** Narrows away the `undefined` the capture arrays return when nothing matched. */
function requireLastQuerySubscription(convex: MockConvexClient): MockQuerySubscription {
  const subscription = convex.lastQuerySubscription();
  if (!subscription) {
    throw new Error('Expected a captured query subscription');
  }
  return subscription;
}

function todo(id: string, title: string): Todo {
  return { _id: id as TodoId, _creationTime: 0, title, description: '', completed: false, priority: 0 };
}

const workTodo = todo('work-1', 'Write docs');
const homeTodo = todo('home-1', 'Water plants');

describe('CategoryTodos staleness guards', () => {
  let convex: MockConvexClient;

  beforeEach(() => {
    convex = new MockConvexClient();
    TestBed.configureTestingModule({
      imports: [CategoryTodos],
      providers: [provideConvexTesting(convex)],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('guards against a retired callback firing after a re-subscribe', fakeAsync(() => {
    const fixture = TestBed.createComponent(CategoryTodos);
    fixture.detectChanges();
    tick();

    const first = convex.querySubscriptions[0];

    fixture.componentInstance.category.set('home');
    fixture.detectChanges();
    tick();

    expect(convex.querySubscriptions).toHaveLength(2);
    expect(first.unsubscribed).toBe(true);
    // The helper released the old subscription exactly once.
    expect(first.unsubscribeCount).toBe(1);

    // `emit` is gated on unsubscribe, exactly as the real client is: it cannot
    // reach the helper at all. This is the only realistic behaviour.
    first.emit([workTodo]);
    expect(fixture.componentInstance.todos.data()).toBeUndefined();

    // `emitAfterUnsubscribe` invokes the retired callback directly, past that
    // gate. The real client cannot do this — `unsubscribe()` removes the
    // listener synchronously — so this asserts nothing about production
    // behaviour. It exists purely to reach the helper's defensive generation
    // guard, which is otherwise unreachable.
    first.emitAfterUnsubscribe([workTodo]);
    expect(fixture.componentInstance.todos.data()).toBeUndefined();

    requireLastQuerySubscription(convex).emit([homeTodo]);

    expect(fixture.componentInstance.todos.data()).toEqual([homeTodo]);
  }));

  it('guards against a retired error callback firing after destroy', fakeAsync(() => {
    const fixture = TestBed.createComponent(CategoryTodos);
    fixture.detectChanges();
    tick();

    const subscription = convex.querySubscriptions[0];
    subscription.emit([workTodo]);

    fixture.destroy();

    expect(subscription.unsubscribeCount).toBe(1);

    subscription.emitErrorAfterUnsubscribe(new Error('never reaches a live client'));

    expect(fixture.componentInstance.todos.status()).toBe('success');
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
  }));
});
