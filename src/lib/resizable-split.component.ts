/**
 * ResizableSplit - A native Web Component for creating resizable panel layouts
 *
 * Usage:
 * <resizable-split direction="horizontal">
 *   <resizable-panel flex="1">Content 1</resizable-panel>
 *   <resizable-panel flex="2">Content 2</resizable-panel>
 * </resizable-split>
 */

import { ResizableHandle } from './resizable-handle.component';
import { ResizablePanel } from './resizable-panel.component';
import { ResizableLayoutRegistry } from './resizable-layout.service';

export interface SplitConfig {
  direction: 'horizontal' | 'vertical';
  panels: { id: string; size: number }[];
}

const HANDLE_SIZE = 8; // pixels - must match CSS --handle-size

export class ResizableSplit extends HTMLElement {
  private _direction: 'horizontal' | 'vertical' = 'horizontal';
  private _minPanelSize: number = 50; // pixels
  private _initialized = false;
  private _panels: ResizablePanel[] = [];
  private _handles: ResizableHandle[] = [];
  private _overlay: HTMLDivElement | null = null;
  private _dragState: {
    handle: ResizableHandle;
    handleIndex: number;
    startPos: number;
    startSizes: number[]; // percentages
    containerSize: number; // pixels (excluding handles)
  } | null = null;

  readonly splitId = `split-${Math.random().toString(36).substr(2, 9)}`;

  static get observedAttributes(): string[] {
    return ['direction', 'min-panel-size'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    // Wait for children to be parsed
    requestAnimationFrame(() => {
      this.initializePanels();
      ResizableLayoutRegistry.registerSplit(this.splitId, this);
    });
  }

  disconnectedCallback(): void {
    ResizableLayoutRegistry.unregisterSplit(this.splitId);
    this.removeOverlay();
    this._handles.forEach(h => h.remove());
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'direction':
        this._direction = (newValue as 'horizontal' | 'vertical') || 'horizontal';
        if (this._initialized) {
          this.updateDirection();
        }
        break;
      case 'min-panel-size':
        this._minPanelSize = parseFloat(newValue || '50');
        break;
    }
  }

  get direction(): 'horizontal' | 'vertical' {
    return this._direction;
  }

  set direction(value: 'horizontal' | 'vertical') {
    this._direction = value;
    this.setAttribute('direction', value);
  }

  get minPanelSize(): number {
    return this._minPanelSize;
  }

  set minPanelSize(value: number) {
    this._minPanelSize = value;
    this.setAttribute('min-panel-size', String(value));
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: flex;
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative;
        box-sizing: border-box;
      }

      :host([direction="horizontal"]) {
        flex-direction: row;
      }

      :host([direction="vertical"]) {
        flex-direction: column;
      }

      ::slotted(resizable-panel) {
        overflow: hidden;
      }
    `;

    const slot = document.createElement('slot');

    this.shadowRoot!.appendChild(style);
    this.shadowRoot!.appendChild(slot);
  }

  private initializePanels(): void {
    // Get direct children that are resizable-panel only
    this._panels = Array.from(this.children).filter(
      (el): el is ResizablePanel => el.tagName.toLowerCase() === 'resizable-panel'
    );

    if (this._panels.length === 0) return;

    // Calculate total flex value
    const totalFlex = this._panels.reduce((sum, p) => sum + (p.flex || 1), 0);

    // Calculate the percentage each handle takes from the total space
    const numHandles = this._panels.length - 1;
    const containerRect = this.getBoundingClientRect();
    const containerSize = this._direction === 'horizontal' ? containerRect.width : containerRect.height;
    const totalHandleSpace = numHandles * HANDLE_SIZE;
    const handlePercentage = containerSize > 0 ? (totalHandleSpace / containerSize) * 100 : 0;

    // Available percentage for panels (100% minus handle space)
    const availablePercent = 100 - handlePercentage;

    // Set direction and initial size for each panel
    this._panels.forEach((panel) => {
      panel.direction = this._direction;
      const flex = panel.flex || 1;
      // Calculate percentage of available space based on flex ratio
      const percent = (flex / totalFlex) * availablePercent;
      panel.setSize(percent);
    });

    // Create handles between panels
    this.createHandles();
    this._initialized = true;
  }

  private createHandles(): void {
    // Remove existing handles
    this._handles.forEach(h => h.remove());
    this._handles = [];

    // Create a handle after each panel except the last
    for (let i = 0; i < this._panels.length - 1; i++) {
      const handle = document.createElement('resizable-handle') as ResizableHandle;
      handle.direction = this._direction;
      handle.index = i;
      handle.splitId = this.splitId;

      // Insert handle after the panel
      this._panels[i].after(handle);
      this._handles.push(handle);

      // Listen to handle events
      handle.addEventListener('drag-start', ((e: CustomEvent) => this.onDragStart(e, handle, i)) as EventListener);
      handle.addEventListener('drag-move', ((e: CustomEvent) => this.onDragMove(e)) as EventListener);
      handle.addEventListener('drag-end', (() => this.onDragEnd()) as EventListener);
    }
  }

  private updateDirection(): void {
    this._panels.forEach(panel => {
      panel.direction = this._direction;
    });
    this._handles.forEach(handle => {
      handle.direction = this._direction;
    });
  }

  private onDragStart(event: CustomEvent, handle: ResizableHandle, handleIndex: number): void {
    if (this._panels.length < 2) return;

    const { position, ctrlKey } = event.detail;

    // Create overlay to capture mouse events over iframes
    this.createOverlay();

    // Get container size (excluding handles)
    const containerRect = this.getBoundingClientRect();
    const totalSize = this._direction === 'horizontal' ? containerRect.width : containerRect.height;
    const totalHandleSpace = this._handles.length * HANDLE_SIZE;
    const containerSize = totalSize - totalHandleSpace;

    // Store current sizes as percentages
    const startSizes = this._panels.map(p => p.currentSize);

    this._dragState = {
      handle,
      handleIndex,
      startPos: position,
      startSizes,
      containerSize,
    };

    // Register with layout service for intersection detection
    ResizableLayoutRegistry.startDrag(this.splitId, handleIndex, this._direction, handle, !ctrlKey);
  }

  private onDragMove(event: CustomEvent): void {
    if (!this._dragState) return;

    const { position, ctrlKey } = event.detail;
    const { handleIndex, startPos, startSizes, containerSize } = this._dragState;

    // Calculate delta in pixels
    const deltaPixels = position - startPos;

    // Convert to percentage delta for this split
    const deltaPercent = containerSize > 0 ? (deltaPixels / containerSize) * 100 : 0;

    // Apply the delta
    this.applyDelta(deltaPercent, handleIndex, startSizes);

    // If not Ctrl key, update position for snap detection and propagate to fused handles
    if (!ctrlKey) {
      // Update drag position to check for snap/fusion with nearby handles
      ResizableLayoutRegistry.updateDragPosition(position);
      // Propagate to all handles in the fused group
      ResizableLayoutRegistry.propagateDrag(this.splitId, deltaPixels);
    } else {
      console.log('[Fusion] Ctrl key pressed - skipping propagation');
    }
  }

  /** Apply a percentage delta to the panels adjacent to the handle */
  applyDelta(deltaPercent: number, handleIndex: number, startSizes: number[]): void {
    const beforeIndex = handleIndex;
    const afterIndex = handleIndex + 1;

    // Calculate minimum percentage based on pixel minimum (0 allows full collapse)
    const containerRect = this.getBoundingClientRect();
    const totalSize = this._direction === 'horizontal' ? containerRect.width : containerRect.height;
    const totalHandleSpace = this._handles.length * HANDLE_SIZE;
    const containerSize = totalSize - totalHandleSpace;
    // Use minPanelSize for minimum, 0 allows complete collapse
    const minPercent = containerSize > 0 && this._minPanelSize > 0
      ? (this._minPanelSize / containerSize) * 100
      : 0;

    // Calculate new sizes
    let beforeSize = startSizes[beforeIndex] + deltaPercent;
    let afterSize = startSizes[afterIndex] - deltaPercent;

    // Apply minimum constraints (allowing 0 for full collapse)
    if (beforeSize < minPercent) {
      beforeSize = minPercent;
      afterSize = startSizes[beforeIndex] + startSizes[afterIndex] - minPercent;
    }
    if (afterSize < minPercent) {
      afterSize = minPercent;
      beforeSize = startSizes[beforeIndex] + startSizes[afterIndex] - minPercent;
    }

    // Apply new sizes
    this._panels[beforeIndex]?.setSize(beforeSize);
    this._panels[afterIndex]?.setSize(afterSize);
  }

  /** Called by layout service when a glued handle moves (delta in pixels) */
  onGluedDragPixels(deltaPixels: number, handleIndex: number): void {
    // Convert pixels to percentage for this split
    const containerRect = this.getBoundingClientRect();
    const totalSize = this._direction === 'horizontal' ? containerRect.width : containerRect.height;
    const totalHandleSpace = this._handles.length * HANDLE_SIZE;
    const containerSize = totalSize - totalHandleSpace;

    const deltaPercent = containerSize > 0 ? (deltaPixels / containerSize) * 100 : 0;

    // Get current sizes for the calculation
    const startSizes = this._panels.map(p => p.currentSize);
    this.applyDelta(deltaPercent, handleIndex, startSizes);
  }

  /**
   * Apply drag from initial sizes (used by fused handles).
   * This ensures each fused handle moves relative to its own starting point.
   */
  applyDragFromInitial(deltaPixels: number, handleIndex: number, initialSizes: number[]): void {
    // Convert pixels to percentage for this split
    const containerRect = this.getBoundingClientRect();
    const totalSize = this._direction === 'horizontal' ? containerRect.width : containerRect.height;
    const totalHandleSpace = this._handles.length * HANDLE_SIZE;
    const containerSize = totalSize - totalHandleSpace;

    const deltaPercent = containerSize > 0 ? (deltaPixels / containerSize) * 100 : 0;

    // Apply delta using the initial sizes from when this handle was fused
    this.applyDelta(deltaPercent, handleIndex, initialSizes);
  }

  /** Get container size in pixels (excluding handles) */
  getContainerSize(): number {
    const containerRect = this.getBoundingClientRect();
    const totalSize = this._direction === 'horizontal' ? containerRect.width : containerRect.height;
    const totalHandleSpace = this._handles.length * HANDLE_SIZE;
    return totalSize - totalHandleSpace;
  }

  private onDragEnd(): void {
    this._dragState = null;
    this.removeOverlay();
    ResizableLayoutRegistry.endDrag();
    this.emitConfigChange();
  }

  private createOverlay(): void {
    if (this._overlay) return;

    this._overlay = document.createElement('div');
    this._overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      cursor: ${this._direction === 'horizontal' ? 'col-resize' : 'row-resize'};
      background: transparent;
    `;
    document.body.appendChild(this._overlay);
  }

  private removeOverlay(): void {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  private emitConfigChange(): void {
    const config = this.getConfig();
    this.dispatchEvent(new CustomEvent('config-change', {
      detail: config,
      bubbles: true,
      composed: true,
    }));
  }

  /** Get current configuration for saving */
  getConfig(): SplitConfig {
    return {
      direction: this._direction,
      panels: this._panels.map(p => ({
        id: p.panelId,
        size: p.currentSize,
      })),
    };
  }

  /** Apply a saved configuration */
  applyConfig(config: SplitConfig): void {
    if (config.direction) {
      this.direction = config.direction;
    }
    config.panels?.forEach((panelConfig, index) => {
      if (this._panels[index]) {
        this._panels[index].setSize(panelConfig.size);
      }
    });
  }

  /** Get handles for intersection detection */
  getHandles(): ResizableHandle[] {
    return this._handles;
  }

  /** Get panels */
  getPanels(): ResizablePanel[] {
    return this._panels;
  }
}

// Register the custom element
if (!customElements.get('resizable-split')) {
  customElements.define('resizable-split', ResizableSplit);
}
