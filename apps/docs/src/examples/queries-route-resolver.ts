import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap, type Routes } from '@angular/router';
import { convexQueryResolver, injectQuery } from 'convex-angular';

import { api } from './convex/api';

/** A route matched on `:id` always has one, but the type does not say so. */
function requireParam(paramMap: ParamMap, name: string): string {
  const value = paramMap.get(name);
  if (value === null) {
    throw new Error(`Missing route parameter: ${name}`);
  }
  return value;
}

@Component({
  selector: 'app-user-profile',
  template: `
    <!-- The warm-cache path keeps status() at 'pending' with
         isRefetching() true until the live subscription confirms the
         value, so render the data with a refreshing hint — not a skeleton. -->
    @if (profile.data(); as user) {
      <h1>{{ user.name }}</h1>
      @if (profile.isRefetching()) {
        <span aria-live="polite">Refreshing…</span>
      }
    } @else if (profile.status() === 'error') {
      <p role="alert">{{ profile.error()?.message }}</p>
    } @else {
      <p>Loading…</p>
    }
  `,
})
export class UserProfileComponent {
  // `route.snapshot` is not a signal: the router reuses this component when only `:id` changes, so a snapshot read
  // inside the args function would never re-run and the page would keep showing the first user. `paramMap` emits
  // synchronously, so `requireSync` gives a Signal<ParamMap> without an `undefined` initial value.
  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });

  // The resolver's value is not read here. The component simply subscribes
  // to the same query with the same args and hits the warm cache.
  readonly profile = injectQuery(api.users.getProfile, () => ({
    userId: requireParam(this.params(), 'id'),
  }));
}

export const routes: Routes = [
  {
    path: 'users/:id',
    component: UserProfileComponent,
    resolve: {
      profile: convexQueryResolver(api.users.getProfile, (route) => ({ userId: requireParam(route.paramMap, 'id') }), {
        keepSubscribedFor: 10_000,
      }),
    },
  },
];
