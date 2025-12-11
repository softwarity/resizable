import { Component, input } from '@angular/core';

@Component({
  selector: 'app-badge',
  template: `<span class="badge" [attr.data-type]="type()">{{ label() }}</span>`,
  styleUrl: './badge.component.scss'
})
export class BadgeComponent {
  readonly type = input.required<string>();
  readonly label = input.required<string>();
}
