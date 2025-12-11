import { Component } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { RowActionsDirective } from '@softwarity/row-actions';
import { BadgeComponent } from '../badge/badge.component';
import { TablePreviewBase } from './table-preview-base';

@Component({
  selector: 'app-table-preview',
  imports: [
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    RowActionsDirective,
    BadgeComponent,
  ],
  templateUrl: './table-preview.component.html',
  styles: [`
  .mat-column-name {
    border-left: 1px dashed var(--mat-sys-outline-variant);
  }
  `],
})
export class TablePreviewComponent extends TablePreviewBase {}
