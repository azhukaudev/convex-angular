import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Inline status message (replaces PrimeNG's p-message) — Material has no
 * inline message component; snackbars are the wrong shape for form errors.
 */
@Component({
  imports: [MatIconModule],
  selector: 'cva-message',
  template: `
    <div
      class="message"
      [class.message--error]="severity() === 'error'"
      [class.message--warn]="severity() === 'warn'"
      role="alert"
    >
      <mat-icon>{{ severity() === 'error' ? 'error' : 'warning' }}</mat-icon>
      <span>{{ text() }}</span>
    </div>
  `,
  styleUrl: 'message.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class Message {
  readonly severity = input.required<'error' | 'warn'>();
  readonly text = input.required<string>();
}
