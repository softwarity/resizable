import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, effect, ElementRef, viewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import {
  ResizableLayoutRegistry,
  LayoutConfig,
  GridConfig,
  createSingleCellGrid,
  createGrid,
  createDashboardGrid,
} from '@softwarity/resizable';

// Import to register custom elements
import '@softwarity/resizable';

interface SavedConfig {
  name: string;
  config: LayoutConfig;
}

interface SavedGridConfig {
  name: string;
  config: GridConfig;
}

@Component({
  selector: 'app-playground',
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSliderModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatTabsModule,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './playground.component.html',
  styleUrl: './playground.component.scss'
})
export class PlaygroundComponent implements AfterViewInit {
  protected isDarkMode = signal(document.body.classList.contains('dark-mode'));
  protected savedConfigs = signal<SavedConfig[]>([]);
  protected selectedConfigName = signal<string>('');
  protected configNameInput = signal<string>('');

  // Grid mode
  protected editMode = signal(false);
  protected savedGridConfigs = signal<SavedGridConfig[]>([]);
  protected selectedGridConfigName = signal<string>('');
  protected gridConfigNameInput = signal<string>('');

  private readonly previewContainer = viewChild<ElementRef<HTMLElement>>('previewContainer');
  private readonly gridContainer = viewChild<ElementRef<HTMLElement>>('gridContainer');

  constructor() {
    // Load saved configs from localStorage
    this.loadSavedConfigs();
    this.loadSavedGridConfigs();

    // React to dark mode changes
    effect(() => {
      document.body.classList.toggle('dark-mode', this.isDarkMode());
    });
  }

  ngAfterViewInit(): void {
    // Initialize grid with default 2x2 using createGrid
    setTimeout(() => {
      const gridEl = this.gridContainer()?.nativeElement?.querySelector('resizable-grid');
      if (gridEl) {
        (gridEl as any).loadConfig(createGrid({ rows: 2, cols: 2 }));
      }
    });
  }

  toggleColorScheme(): void {
    this.isDarkMode.update(dark => !dark);
  }

  toggleEditMode(): void {
    this.editMode.update(mode => !mode);
  }

  // ============ Split-based layout (legacy) ============

  saveCurrentConfig(): void {
    const name = this.configNameInput().trim();
    if (!name) return;

    const config = ResizableLayoutRegistry.getLayoutConfig();
    const configs = this.savedConfigs();

    const existingIndex = configs.findIndex(c => c.name === name);
    if (existingIndex >= 0) {
      configs[existingIndex] = { name, config };
    } else {
      configs.push({ name, config });
    }

    this.savedConfigs.set([...configs]);
    this.persistConfigs();
    this.configNameInput.set('');
  }

  loadConfig(name: string): void {
    const configs = this.savedConfigs();
    const saved = configs.find(c => c.name === name);
    if (saved) {
      ResizableLayoutRegistry.applyLayoutConfig(saved.config);
      this.selectedConfigName.set(name);
    }
  }

  deleteConfig(name: string): void {
    const configs = this.savedConfigs().filter(c => c.name !== name);
    this.savedConfigs.set(configs);
    this.persistConfigs();
    if (this.selectedConfigName() === name) {
      this.selectedConfigName.set('');
    }
  }

  resetLayout(): void {
    ResizableLayoutRegistry.resetLayout();
    this.selectedConfigName.set('');
  }

  private loadSavedConfigs(): void {
    try {
      const saved = localStorage.getItem('resizable-demo-configs');
      if (saved) {
        this.savedConfigs.set(JSON.parse(saved));
      }
    } catch {
      // Ignore errors
    }
  }

  private persistConfigs(): void {
    try {
      localStorage.setItem('resizable-demo-configs', JSON.stringify(this.savedConfigs()));
    } catch {
      // Ignore errors
    }
  }

  onConfigChange(event: CustomEvent): void {
    console.log('Layout changed:', event.detail);
  }

  // ============ Grid-based layout (new) ============

  resetGrid(): void {
    const gridEl = this.gridContainer()?.nativeElement?.querySelector('resizable-grid');
    if (gridEl) {
      (gridEl as any).loadConfig(createGrid({ rows: 2, cols: 2 }));
    }
    this.selectedGridConfigName.set('');
  }

  resetGridToSingle(): void {
    const gridEl = this.gridContainer()?.nativeElement?.querySelector('resizable-grid');
    if (gridEl) {
      (gridEl as any).loadConfig(createSingleCellGrid());
    }
    this.selectedGridConfigName.set('');
  }

  createGrid3x3(): void {
    const gridEl = this.gridContainer()?.nativeElement?.querySelector('resizable-grid');
    if (gridEl) {
      (gridEl as any).loadConfig(createGrid({ rows: 3, cols: 3 }));
    }
    this.selectedGridConfigName.set('');
  }

  createGridCustom(): void {
    const gridEl = this.gridContainer()?.nativeElement?.querySelector('resizable-grid');
    if (gridEl) {
      // Dashboard layout with header, sidebar, main content, footer
      // Uses async rail segments (sidebar rail doesn't span full height)
      (gridEl as any).loadConfig(createDashboardGrid());
    }
    this.selectedGridConfigName.set('');
  }

  saveCurrentGridConfig(): void {
    const name = this.gridConfigNameInput().trim();
    if (!name) return;

    const gridEl = this.gridContainer()?.nativeElement?.querySelector('resizable-grid');
    if (!gridEl) return;

    const config = (gridEl as any).getConfig() as GridConfig;
    const configs = this.savedGridConfigs();

    const existingIndex = configs.findIndex(c => c.name === name);
    if (existingIndex >= 0) {
      configs[existingIndex] = { name, config };
    } else {
      configs.push({ name, config });
    }

    this.savedGridConfigs.set([...configs]);
    this.persistGridConfigs();
    this.gridConfigNameInput.set('');
  }

  loadGridConfig(name: string): void {
    const configs = this.savedGridConfigs();
    const saved = configs.find(c => c.name === name);
    if (saved) {
      const gridEl = this.gridContainer()?.nativeElement?.querySelector('resizable-grid');
      if (gridEl) {
        (gridEl as any).loadConfig(saved.config);
      }
      this.selectedGridConfigName.set(name);
    }
  }

  deleteGridConfig(name: string): void {
    const configs = this.savedGridConfigs().filter(c => c.name !== name);
    this.savedGridConfigs.set(configs);
    this.persistGridConfigs();
    if (this.selectedGridConfigName() === name) {
      this.selectedGridConfigName.set('');
    }
  }

  private loadSavedGridConfigs(): void {
    try {
      const saved = localStorage.getItem('resizable-demo-grid-configs');
      if (saved) {
        this.savedGridConfigs.set(JSON.parse(saved));
      }
    } catch {
      // Ignore errors
    }
  }

  private persistGridConfigs(): void {
    try {
      localStorage.setItem('resizable-demo-grid-configs', JSON.stringify(this.savedGridConfigs()));
    } catch {
      // Ignore errors
    }
  }

  onCellSplit(event: CustomEvent): void {
    console.log('Cell split:', event.detail);
  }

  onCellRemoved(event: CustomEvent): void {
    console.log('Cell removed:', event.detail);
  }
}
