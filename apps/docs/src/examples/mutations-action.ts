import { Component } from '@angular/core';
import { ConvexError, injectAction } from 'convex-angular';

import { api } from './convex/api';

@Component({
  selector: 'app-send-email',
  template: `
    <button type="button" (click)="send()" [disabled]="sendEmail.isLoading()">Send welcome email</button>

    @if (sendEmail.isSuccess()) {
      <p>Queued as {{ sendEmail.data()?.id }}</p>
    }
    @if (sendEmail.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
  `,
})
export class SendEmailComponent {
  readonly sendEmail = injectAction(api.emails.send, {
    onSuccess: (result) => console.log('sent', result.id),
    onError: (err) => console.error('send failed', err),
  });

  async send(): Promise<void> {
    try {
      // `run()` resolves with the action's return value and rejects on
      // failure, exactly like `mutate()` does for mutations.
      const { id } = await this.sendEmail.run({ to: 'user@example.com', subject: 'Welcome' });
      console.log(id);
    } catch (error) {
      if (error instanceof ConvexError) {
        console.error(error.data);
      }
    }
  }
}
