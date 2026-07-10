import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type PageHeaderLink = {
  readonly label: string;
  readonly path: string;
};

/**
 * Shared demo-page header: title, optional description, home link, and an
 * optional row of related-example links. Extracted so the nine demo pages do
 * not repeat the same header markup (which would trip check:duplication).
 */
@Component({
  imports: [RouterLink],
  selector: 'cva-page-header',
  templateUrl: 'page-header.html',
  styleUrl: 'page-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly pageTitle = input.required<string>();
  readonly description = input('');
  readonly links = input<readonly PageHeaderLink[]>([]);
}
