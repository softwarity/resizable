import { Component, effect, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TablePreviewComponent } from '../table-preview/table-preview.component';
import { TablePreviewNativeComponent } from '../table-preview-native/table-preview-native.component';
import { LoadingIndicatorComponent } from '../loading-indicator/loading-indicator.component';

const PALETTES = [
  'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
  'orange', 'chartreuse', 'spring-green', 'azure', 'violet', 'rose'
] as const;

@Component({
  imports: [
    MatIconModule,
    TablePreviewComponent,
    TablePreviewNativeComponent,
    LoadingIndicatorComponent,
  ],
  templateUrl: './playground.component.html',
  styleUrl: './playground.component.scss'
})
export class PlaygroundComponent {
  protected leftDisabled = signal(false);
  protected rightDisabled = signal(false);
  protected selectedVariant = signal<'' | 'filled' | 'tonal'>('');

  protected isDarkMode = signal(document.body.classList.contains('dark-mode'));

  // Table syntax: 'component' = <mat-table>, 'native' = <table mat-table>
  protected isNativeTable = signal(false);

  // Row height
  protected rowHeight = signal<32 | 48 | 52 | 64>(52);

  // Palette selection
  protected palettes = PALETTES;
  protected selectedPalette = signal<string>('');

  // Override configurations for each variant (distinct colors, unchecked by default)
  protected containerOverride = signal({ enabled: false, light: '#ff6b6b', dark: '#8b0000' }); // Red tones
  protected filledOverride = signal({ enabled: false, light: '#4ecdc4', dark: '#006666' });    // Cyan tones
  protected tonalOverride = signal({ enabled: false, light: '#ffe66d', dark: '#806600' });     // Yellow tones

  constructor() {
    // React to config changes to update custom background
    effect(() => {
      this.containerOverride();
      this.filledOverride();
      this.tonalOverride();
      this.updateCustomBackground();
    });

    // React to row height changes
    effect(() => {
      this.updateRowHeight(this.rowHeight());
    });
  }

  private styleElement: HTMLStyleElement | null = null;

  updateCustomBackground(): void {
    const container = this.containerOverride();
    const filled = this.filledOverride();
    const tonal = this.tonalOverride();

    const hasAnyOverride = container.enabled || filled.enabled || tonal.enabled;

    if (hasAnyOverride) {
      if (!this.styleElement) {
        this.styleElement = document.createElement('style');
        document.head.appendChild(this.styleElement);
      }
      const lines: string[] = [];
      if (container.enabled) {
        lines.push(`--row-actions-container-background-color: light-dark(${container.light}, ${container.dark});`);
      }
      if (filled.enabled) {
        lines.push(`--row-actions-filled-background-color: light-dark(${filled.light}, ${filled.dark});`);
      }
      if (tonal.enabled) {
        lines.push(`--row-actions-tonal-background-color: light-dark(${tonal.light}, ${tonal.dark});`);
      }
      this.styleElement.textContent = `:root { ${lines.join(' ')} }`;
    } else if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }

  toggleOverride(variant: 'container' | 'filled' | 'tonal'): void {
    const signalMap = {
      container: this.containerOverride,
      filled: this.filledOverride,
      tonal: this.tonalOverride
    };
    signalMap[variant].update(v => ({ ...v, enabled: !v.enabled }));
  }

  updateOverrideColor(variant: 'container' | 'filled' | 'tonal', mode: 'light' | 'dark', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const signalMap = {
      container: this.containerOverride,
      filled: this.filledOverride,
      tonal: this.tonalOverride
    };
    signalMap[variant].update(v => ({ ...v, [mode]: value }));
  }

  toggleColorScheme(): void {
    this.isDarkMode.update(dark => !dark);
    document.body.classList.toggle('dark-mode', this.isDarkMode());
  }

  onPaletteChange(palette: string): void {
    const html = document.documentElement;
    // Remove all palette classes
    PALETTES.forEach(p => html.classList.remove(p));
    // Add selected palette class
    if (palette) {
      html.classList.add(palette);
    }
    this.selectedPalette.set(palette);
  }

  onVariantChange(variant: '' | 'filled' | 'tonal'): void {
    this.selectedVariant.set(variant);
  }

  toggleTableSyntax(): void {
    this.isNativeTable.update(native => !native);
  }

  private rowHeightStyleElement: HTMLStyleElement | null = null;

  private updateRowHeight(height: number): void {
    if (!this.rowHeightStyleElement) {
      this.rowHeightStyleElement = document.createElement('style');
      document.head.appendChild(this.rowHeightStyleElement);
    }
    this.rowHeightStyleElement.textContent = `
      .table-preview-wrapper {
        --row-height: ${height}px;
      }
      .table-preview-wrapper mat-row,
      .table-preview-wrapper tr[mat-row] {
        --mat-table-row-item-container-height: var(--row-height);
      }
    `;
  }

  onRowHeightChange(height: number): void {
    this.rowHeight.set(height as 32 | 48 | 52 | 64);
  }
}
