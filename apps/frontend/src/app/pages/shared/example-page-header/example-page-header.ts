import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

type ExamplePageLink = {
  href: string;
  label: string;
};

@Component({
  imports: [RouterLink],
  selector: 'cva-example-page-header',
  templateUrl: 'example-page-header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamplePageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly links = input<readonly ExamplePageLink[]>([]);
}
