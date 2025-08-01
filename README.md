# convex-angular

[![NPM version](https://img.shields.io/npm/v/convex-angular?color=limegreen&label=npm)](https://www.npmjs.com/package/convex-angular)
[![GitHub license](https://img.shields.io/badge/license-MIT-limegreen.svg)](https://github.com/azhukau-dev/convex-angular/blob/main/LICENSE)
[![NPM downloads](https://img.shields.io/npm/dm/convex-angular?color=limegreen&label=downloads)](https://www.npmjs.com/package/convex-angular)

The Angular client for Convex.

## ✨ Features

- 🔌 Core providers: `injectQuery`, `injectMutation`, `injectAction`, and `injectConvex`
- 📡 Signal Integration: [Angular Signals](https://angular.dev/guide/signals) for reactive state
- 🛡️ Error Handling: Built-in error states and loading
- 🧹 Auto Cleanup: Automatic lifecycle management

## 🚀 Getting Started

1. Install the dependencies:

```bash
npm install convex convex-angular
```

2. Add `provideConvex` to your `app.config.ts` file:

```typescript
import { provideConvex } from 'convex-angular';

export const appConfig: ApplicationConfig = {
  providers: [provideConvex('https://<your-convex-deployment>.convex.cloud')],
};
```

3. 🎉 That's it! You can now use the injection providers in your app.

## 📖 Usage

### Fetching data

Use `injectQuery` to fetch data from the database.

```typescript
import { injectQuery } from 'convex-angular';

@Component({
  selector: 'app-root',
  template: `
    <ul>
      @for (todo of todos.data(); track todo._id) {
        <li>{{ todo.name }}</li>
      }
    </ul>
  `,
})
export class AppComponent {
  readonly todos = injectQuery(api.todo.listTodos);
}
```

### Mutating data

Use `injectMutation` to mutate the database.

```typescript
import { injectMutation } from 'convex-angular';

@Component({
  selector: 'app-root',
  template: `
    <button (click)="addTodo.mutate({ id: '1', name: 'Buy groceries' })">
      Add Todo
    </button>
  `,
})
export class AppComponent {
  readonly addTodo = injectMutation(api.todo.addTodo);
}
```

### Running actions

Use `injectAction` to run actions.

```typescript
import { injectAction } from 'convex-angular';

@Component({
  selector: 'app-root',
  template: `<button (click)="resetTodos.run({})">Reset Todos</button>`,
})
export class AppComponent {
  readonly resetTodos = injectAction(api.todoFunctions.resetTodos);
}
```

### Using the Convex client

Use `injectConvex` to get full flexibility of the Convex client.

```typescript
import { injectConvex } from 'convex-angular';

@Component({
  selector: 'app-root',
  template: `<button (click)="completeAllTodos()">Complete All Todos</button>`,
})
export class AppComponent {
  readonly convex = injectConvex();

  completeAllTodos() {
    this.convex.mutation(api.todoFunctions.completeAllTodos, {});
  }
}
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request.

## ⚖️ License

[MIT](https://github.com/azhukau-dev/convex-angular/blob/main/LICENSE)
