import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { injectConvexConnectionState, injectQuery } from 'convex-angular';
import { MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

import { api } from './convex/api';

@Component({
  selector: 'app-todo-shell',
  template: `
    @if (connection().isWebSocketConnected) {
      <p>Live</p>
    } @else {
      <p>Offline</p>
    }

    @for (todo of todos.data() ?? []; track todo._id) {
      <li>{{ todo.title }}</li>
    }
  `,
})
export class TodoShell {
  readonly todos = injectQuery(api.todos.list, () => ({ count: 20 }));
  readonly connection = injectConvexConnectionState();
}

describe('TodoShell during a server render', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('never establishes a subscription and never touches the connection state', fakeAsync(() => {
    const convex = new MockConvexClient({ disabled: true });
    TestBed.configureTestingModule({
      imports: [TodoShell],
      providers: [provideConvexTesting(convex)],
    });

    const fixture = TestBed.createComponent(TodoShell);
    fixture.detectChanges();
    tick();

    // The subscribe call succeeds and hands back a no-op unsubscribe — the
    // subscription is simply never established, exactly as with the real
    // disabled client. Nothing is captured, so absence alone proves nothing;
    // `refusedSubscriptions` records what was asked for and skipped.
    expect(convex.querySubscriptions).toHaveLength(0);
    expect(convex.refusedSubscriptions).toEqual([{ kind: 'query', query: api.todos.list, args: { count: 20 } }]);

    // The warm cache is never consulted while disabled, and there is no auth.
    expect(convex.localQueryResultCalls).toHaveLength(0);
    expect(convex.getAuth()).toBeUndefined();

    // The connection helper short-circuits to a static disconnected state
    // instead of reading through to the client. Both counters record the
    // attempt when one is made, so zero means "never looked".
    expect(convex.connectionStateReads).toBe(0);
    expect(convex.connectionStateSubscriptions).toBe(0);
    expect(fixture.componentInstance.connection().isWebSocketConnected).toBe(false);

    expect(() => convex.client).toThrow('ConvexClient is disabled');
  }));

  it('rejects a one-shot query instead of resolving nothing', async () => {
    const convex = new MockConvexClient({ disabled: true });

    await expect(convex.query(api.todos.list, { count: 20 })).rejects.toThrow('ConvexClient is disabled');
  });

  it('reads, subscribes and releases the connection state once in the browser', fakeAsync(() => {
    const convex = new MockConvexClient();
    TestBed.configureTestingModule({
      imports: [TodoShell],
      providers: [provideConvexTesting(convex)],
    });

    const fixture = TestBed.createComponent(TodoShell);
    fixture.detectChanges();
    tick();

    expect(convex.refusedSubscriptions).toHaveLength(0);
    expect(convex.connectionStateReads).toBe(1);
    expect(convex.connectionStateSubscriptions).toBe(1);
    expect(convex.connectionStateUnsubscribes).toBe(0);

    // Every warm-cache lookup the query helper made, with the args it used.
    expect(convex.localQueryResultCalls).toEqual([{ queryName: 'todos:list', args: { count: 20 } }]);

    fixture.destroy();

    expect(convex.connectionStateUnsubscribes).toBe(1);
  }));
});
