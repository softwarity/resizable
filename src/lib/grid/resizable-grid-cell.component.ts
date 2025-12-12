/**
 * ResizableGridCell - Web Component for a single cell in the grid
 *
 * Displays content and (in edit mode) split buttons on each edge.
 * Supports drag & drop to swap cells in edit mode.
 */

import { GridService } from './grid.service';

export class ResizableGridCell extends HTMLElement {
  private _cellId: string = '';
  private _gridService: GridService | null = null;
  private _editMode: boolean = false;
  private _isDragging: boolean = false;

  static get observedAttributes(): string[] {
    return ['cell-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
  }

  disconnectedCallback(): void {
    // Clean up drag events
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'cell-id' && newValue) {
      this._cellId = newValue;
      this.render();
    }
  }

  set gridService(service: GridService) {
    this._gridService = service;
  }

  set editMode(value: boolean) {
    this._editMode = value;
    this.render();
  }

  get cellId(): string {
    return this._cellId;
  }

  get gridService(): GridService | null {
    return this._gridService;
  }

  private render(): void {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          box-sizing: border-box;
          overflow: hidden;
        }

        .cell-container {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .cell-content {
          width: 100%;
          height: 100%;
          overflow: auto;
        }

        /* Split buttons - only visible in edit mode */
        .split-buttons {
          display: none;
        }

        :host(.edit-mode) .split-buttons {
          display: block;
        }

        .split-button {
          position: absolute;
          background: var(--split-button-bg, #f0f0f0);
          border: 1px solid var(--cell-border-color, #ccc);
          border-radius: 50%;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          color: var(--split-button-color, #333);
          opacity: 0;
          transition: opacity 0.2s, background-color 0.2s;
          z-index: 10;
        }

        .cell-container:hover .split-button {
          opacity: 0.7;
        }

        .split-button:hover {
          opacity: 1 !important;
          background: var(--split-button-hover-bg, #4a90d9);
          color: white;
        }

        .split-button.top {
          top: 4px;
          left: 50%;
          transform: translateX(-50%);
        }

        .split-button.bottom {
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%);
        }

        .split-button.left {
          left: 4px;
          top: 50%;
          transform: translateY(-50%);
        }

        .split-button.right {
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
        }

        /* Close button */
        .close-button {
          position: absolute;
          top: 4px;
          right: 4px;
          background: var(--split-button-bg, #f0f0f0);
          border: 1px solid var(--cell-border-color, #ccc);
          border-radius: 50%;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 12px;
          color: var(--split-button-color, #333);
          opacity: 0;
          transition: opacity 0.2s, background-color 0.2s;
          z-index: 10;
        }

        .cell-container:hover .close-button {
          opacity: 0.7;
        }

        .close-button:hover {
          opacity: 1 !important;
          background: #e74c3c;
          color: white;
        }

        /* Drag handle */
        .drag-handle {
          position: absolute;
          top: 4px;
          left: 4px;
          background: var(--split-button-bg, #f0f0f0);
          border: 1px solid var(--cell-border-color, #ccc);
          border-radius: 3px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
          opacity: 0;
          transition: opacity 0.2s, background-color 0.2s;
          z-index: 10;
        }

        .drag-handle svg {
          width: 12px;
          height: 12px;
          fill: var(--split-button-color, #333);
        }

        .cell-container:hover .drag-handle {
          opacity: 0.7;
        }

        .drag-handle:hover {
          opacity: 1 !important;
          background: var(--split-button-hover-bg, #4a90d9);
        }

        .drag-handle:hover svg {
          fill: white;
        }

        .drag-handle:active {
          cursor: grabbing;
        }

        /* Drag states */
        :host(.dragging) {
          opacity: 0.5;
        }

        :host(.drag-over) {
          outline: 2px dashed var(--split-button-hover-bg, #4a90d9) !important;
          outline-offset: -2px;
        }

        :host(.drag-over)::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--split-button-hover-bg, rgba(74, 144, 217, 0.1));
          pointer-events: none;
        }
      </style>

      <div class="cell-container">
        <div class="cell-content">
          <slot></slot>
        </div>
        ${this._editMode ? this.renderEditControls() : ''}
      </div>
    `;

    if (this._editMode) {
      this.classList.add('edit-mode');
      this.setupEditEvents();
    } else {
      this.classList.remove('edit-mode');
    }
  }

  private renderEditControls(): string {
    // SVG icon for drag handle (6-dot grip)
    const dragIcon = `<svg viewBox="0 0 24 24"><circle cx="8" cy="6" r="2"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/></svg>`;

    return `
      <div class="split-buttons">
        <div class="drag-handle" draggable="true" title="Drag to swap with another cell">${dragIcon}</div>
        <button class="split-button top" data-action="split-top" title="Split horizontally (add cell above)">+</button>
        <button class="split-button bottom" data-action="split-bottom" title="Split horizontally (add cell below)">+</button>
        <button class="split-button left" data-action="split-left" title="Split vertically (add cell to left)">+</button>
        <button class="split-button right" data-action="split-right" title="Split vertically (add cell to right)">+</button>
        <button class="close-button" data-action="close" title="Remove this cell">×</button>
      </div>
    `;
  }

  private setupEditEvents(): void {
    this.shadowRoot!.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (button as HTMLElement).dataset['action'];
        if (action) {
          this.handleAction(action);
        }
      });
    });

    // Set up drag & drop events
    this.setupDragEvents();
  }

  private setupDragEvents(): void {
    const dragHandle = this.shadowRoot!.querySelector('.drag-handle');
    if (!dragHandle) return;

    // Drag start
    dragHandle.addEventListener('dragstart', (e: Event) => {
      const dragEvent = e as DragEvent;
      this._isDragging = true;
      this.classList.add('dragging');

      // Store the cell ID being dragged
      dragEvent.dataTransfer?.setData('text/plain', this._cellId);
      dragEvent.dataTransfer!.effectAllowed = 'move';

      // Notify other cells that a drag started
      this.dispatchEvent(new CustomEvent('cell-drag-start', {
        detail: { cellId: this._cellId },
        bubbles: true,
        composed: true,
      }));
    });

    // Drag end
    dragHandle.addEventListener('dragend', () => {
      this._isDragging = false;
      this.classList.remove('dragging');

      // Notify that drag ended
      this.dispatchEvent(new CustomEvent('cell-drag-end', {
        detail: { cellId: this._cellId },
        bubbles: true,
        composed: true,
      }));
    });

    // Allow drop on this cell
    this.addEventListener('dragover', (e: DragEvent) => {
      if (!this._editMode) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      this.classList.add('drag-over');
    });

    this.addEventListener('dragleave', () => {
      this.classList.remove('drag-over');
    });

    this.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      this.classList.remove('drag-over');

      const sourceCellId = e.dataTransfer?.getData('text/plain');
      if (sourceCellId && sourceCellId !== this._cellId) {
        // Emit swap event
        this.dispatchEvent(new CustomEvent('cell-swap', {
          detail: { sourceCellId, targetCellId: this._cellId },
          bubbles: true,
          composed: true,
        }));
      }
    });
  }

  private handleAction(action: string): void {
    if (!this._gridService) return;

    switch (action) {
      case 'split-top':
        // Split horizontal, new cell on top (original stays at bottom)
        const newTopCellId = this._gridService.splitCellHorizontal(this._cellId, 50);
        if (newTopCellId) {
          this.dispatchCellEvent('cell-split', { newCellId: newTopCellId, direction: 'horizontal', position: 'top' });
        }
        break;

      case 'split-bottom':
        // Split horizontal, original stays at top
        const newBottomCellId = this._gridService.splitCellHorizontal(this._cellId, 50);
        if (newBottomCellId) {
          this.dispatchCellEvent('cell-split', { newCellId: newBottomCellId, direction: 'horizontal', position: 'bottom' });
        }
        break;

      case 'split-left':
        // Split vertical, new cell on left
        const newLeftCellId = this._gridService.splitCellVertical(this._cellId, 50);
        if (newLeftCellId) {
          this.dispatchCellEvent('cell-split', { newCellId: newLeftCellId, direction: 'vertical', position: 'left' });
        }
        break;

      case 'split-right':
        // Split vertical, original stays at left
        const newRightCellId = this._gridService.splitCellVertical(this._cellId, 50);
        if (newRightCellId) {
          this.dispatchCellEvent('cell-split', { newCellId: newRightCellId, direction: 'vertical', position: 'right' });
        }
        break;

      case 'close':
        if (this._gridService.removeCell(this._cellId)) {
          this.dispatchCellEvent('cell-removed', { cellId: this._cellId });
        }
        break;
    }
  }

  private dispatchCellEvent(eventName: string, detail: any): void {
    this.dispatchEvent(new CustomEvent(eventName, {
      detail: { ...detail, cellId: this._cellId },
      bubbles: true,
      composed: true,
    }));
  }
}

// Register the custom element
if (!customElements.get('resizable-grid-cell')) {
  customElements.define('resizable-grid-cell', ResizableGridCell);
}
