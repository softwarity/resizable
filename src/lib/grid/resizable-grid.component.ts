/**
 * ResizableGrid - Web Component for a grid-based resizable layout
 *
 * This is the main container that renders cells and rail handles.
 * It uses CSS positioning based on rail positions (percentages).
 */

import { GridService } from './grid.service';
import { GridConfig, createDefault2x2Grid, Rail } from './grid.model';
import './resizable-grid-cell.component';
import './resizable-rail-handle.component';

const RAIL_HANDLE_SIZE = 12; // pixels - larger for easier hover detection

export class ResizableGrid extends HTMLElement {
  private _gridService: GridService;
  private _editMode: boolean = false;
  private _unsubscribe: (() => void) | null = null;
  private _defaultCellTemplate: string | null = null;
  private _minCellSize: number = 0; // Allow full collapse - rails will push stacked rails when dragged

  static get observedAttributes(): string[] {
    return ['edit-mode', 'default-cell-template', 'min-cell-size'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._gridService = new GridService();
  }

  connectedCallback(): void {
    // Load default config if not already configured
    if (this._gridService.getAllCells().length === 0) {
      this._gridService.loadConfig(createDefault2x2Grid());
    }

    // Subscribe to changes
    this._unsubscribe = this._gridService.subscribe(() => this.render());

    this.render();
  }

  disconnectedCallback(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'edit-mode') {
      this._editMode = newValue !== null && newValue !== 'false';
      this.render();
    } else if (name === 'default-cell-template') {
      this._defaultCellTemplate = newValue;
    } else if (name === 'min-cell-size') {
      this._minCellSize = newValue ? parseInt(newValue, 10) : 0;
    }
  }

  // ============ Public API ============

  get gridService(): GridService {
    return this._gridService;
  }

  get editMode(): boolean {
    return this._editMode;
  }

  set editMode(value: boolean) {
    this._editMode = value;
    if (value) {
      this.setAttribute('edit-mode', '');
    } else {
      this.removeAttribute('edit-mode');
    }
    this.render();
  }

  loadConfig(config: GridConfig): void {
    this._gridService.loadConfig(config);
  }

  getConfig(): GridConfig {
    return this._gridService.getConfig();
  }

  /**
   * Set a default template for new cells
   * The template can use {{cellId}} placeholder which will be replaced with the actual cell ID
   */
  set defaultCellTemplate(template: string | null) {
    this._defaultCellTemplate = template;
  }

  get defaultCellTemplate(): string | null {
    return this._defaultCellTemplate;
  }

  /**
   * Minimum cell size in pixels. Set to 0 to allow full collapse.
   */
  set minCellSize(value: number) {
    this._minCellSize = value;
    if (value > 0) {
      this.setAttribute('min-cell-size', String(value));
    } else {
      this.removeAttribute('min-cell-size');
    }
  }

  get minCellSize(): number {
    return this._minCellSize;
  }

  // ============ Rendering ============

  private render(): void {
    const cells = this._gridService.getAllCells();
    const rails = this._gridService.getDraggableRails();

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          --rail-handle-size: ${RAIL_HANDLE_SIZE}px;
          --rail-color: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1));
          --rail-hover-color: light-dark(rgba(0, 0, 0, 0.3), rgba(255, 255, 255, 0.3));
          --rail-active-color: light-dark(#4a90d9, #6ab0f3);
          --cell-border-color: light-dark(#e0e0e0, #333);
          --split-button-bg: light-dark(#f0f0f0, #444);
          --split-button-hover-bg: light-dark(#4a90d9, #6ab0f3);
          --split-button-color: light-dark(#333, #fff);
        }

        .grid-container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        }

        /* Cells layer */
        .cells-layer {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
        }

        .cells-layer > * {
          pointer-events: auto;
        }

        /* Rails layer (on top for interaction) */
        .rails-layer {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
        }

        .rails-layer > * {
          pointer-events: auto;
        }

        /* Edit mode styles */
        :host([edit-mode]) .cells-layer resizable-grid-cell {
          outline: 1px dashed var(--cell-border-color);
        }

        /* Default cell content styling */
        .default-cell-content {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--cell-default-bg, light-dark(#f5f5f5, #2a2a2a));
          color: var(--cell-default-color, light-dark(#666, #999));
          font-size: 12px;
          font-family: monospace;
          overflow: hidden;
        }

        .default-cell-content span {
          padding: 4px 8px;
          background: var(--cell-default-label-bg, light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.05)));
          border-radius: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 90%;
        }

        /* Edge-collapsed rails - semi-transparent by default, fully visible on hover */
        resizable-rail-handle[edge-collapsed] {
          opacity: 0.3;
          transition: opacity 0.15s;
        }

        resizable-rail-handle[edge-collapsed]:hover {
          opacity: 1;
        }
      </style>

      <div class="grid-container">
        <div class="cells-layer">
          ${cells.map(cell => this.renderCell(cell.id)).join('')}
        </div>
        <div class="rails-layer">
          ${rails.map(rail => this.renderRailHandle(rail)).join('')}
        </div>
      </div>
    `;

    // Set up cell references to grid service
    this.shadowRoot!.querySelectorAll('resizable-grid-cell').forEach(el => {
      (el as any).gridService = this._gridService;
      (el as any).editMode = this._editMode;
    });

    // Set up rail handle events
    // First, compute which rail is the "center" for each group of aligned rails and the grip offset
    const centerRailsInfo = this.computeCenterRails(rails);

    this.shadowRoot!.querySelectorAll('resizable-rail-handle').forEach(el => {
      const railId = el.getAttribute('rail-id');
      (el as any).gridService = this._gridService;
      (el as any).containerElement = this;
      (el as any).minCellSize = this._minCellSize;
      // Set adjacent cell count for grip dots display
      if (railId) {
        (el as any).adjacentCellCount = this._gridService.getRailCellCount(railId);
        // Mark if this rail is the center of its aligned group
        const info = centerRailsInfo.get(railId);
        (el as any).isCenterRail = info?.isCenter ?? false;
        (el as any).gripOffset = info?.offset ?? 0;
      }
    });

    // Set up cell swap event listener
    this.shadowRoot!.addEventListener('cell-swap', ((e: CustomEvent) => {
      const { sourceCellId, targetCellId } = e.detail;
      if (this._gridService.swapCells(sourceCellId, targetCellId)) {
        this.dispatchEvent(new CustomEvent('cells-swapped', {
          detail: { sourceCellId, targetCellId },
          bubbles: true,
          composed: true,
        }));
      }
    }) as EventListener);
  }

  private renderCell(cellId: string): string {
    const bounds = this._gridService.getCellBounds(cellId);
    if (!bounds) return '';

    // Check if there's user-provided content for this cell via slot
    const hasSlottedContent = this.querySelector(`[slot="${cellId}"]`) !== null;

    // Default template if no slotted content
    const defaultContent = this._defaultCellTemplate
      ? this._defaultCellTemplate.replace(/\{\{cellId\}\}/g, cellId)
      : `<div class="default-cell-content"><span>${cellId}</span></div>`;

    // If no slotted content, we put the default content directly
    // Otherwise, we use a slot
    const cellContent = hasSlottedContent
      ? `<slot name="${cellId}"></slot>`
      : defaultContent;

    return `
      <resizable-grid-cell
        cell-id="${cellId}"
        style="
          position: absolute;
          left: ${bounds.left}%;
          top: ${bounds.top}%;
          width: ${bounds.right - bounds.left}%;
          height: ${bounds.bottom - bounds.top}%;
        "
      >
        ${cellContent}
      </resizable-grid-cell>
    `;
  }

  private renderRailHandle(rail: Rail): string {
    // Get rail bounds (the segment's extent)
    const bounds = this._gridService.getRailBounds(rail.id);
    const start = bounds?.start ?? 0;
    const end = bounds?.end ?? 100;

    const edgeTolerance = 1; // 1% tolerance for edge detection
    const isAtEdge = rail.position <= edgeTolerance || rail.position >= 100 - edgeTolerance;
    // Keep 8px visible inside when at edge (4px goes outside)
    const edgeInset = 8;

    if (rail.direction === 'vertical') {
      // Vertical rail = vertical line segment = dragged horizontally
      // The segment goes from start% to end% vertically (top to bottom)

      // Adjust position for rails at the edge - mostly outside, just a bit visible
      let leftStyle: string;
      if (rail.position <= edgeTolerance) {
        // At left edge - mostly outside, only edgeInset pixels visible
        leftStyle = `left: -${RAIL_HANDLE_SIZE - edgeInset}px;`;
      } else if (rail.position >= 100 - edgeTolerance) {
        // At right edge - mostly outside, only edgeInset pixels visible
        leftStyle = `right: -${RAIL_HANDLE_SIZE - edgeInset}px;`;
      } else {
        // Normal positioning - centered on rail
        leftStyle = `left: calc(${rail.position}% - ${RAIL_HANDLE_SIZE / 2}px);`;
      }

      return `
        <resizable-rail-handle
          rail-id="${rail.id}"
          direction="vertical"
          ${isAtEdge ? 'edge-collapsed' : ''}
          style="
            position: absolute;
            ${leftStyle}
            top: ${start}%;
            width: ${RAIL_HANDLE_SIZE}px;
            height: ${end - start}%;
          "
        ></resizable-rail-handle>
      `;
    } else {
      // Horizontal rail = horizontal line segment = dragged vertically
      // The segment goes from start% to end% horizontally (left to right)

      // Adjust position for rails at the edge - mostly outside, just a bit visible
      let topStyle: string;
      if (rail.position <= edgeTolerance) {
        // At top edge - mostly outside, only edgeInset pixels visible
        topStyle = `top: -${RAIL_HANDLE_SIZE - edgeInset}px;`;
      } else if (rail.position >= 100 - edgeTolerance) {
        // At bottom edge - mostly outside, only edgeInset pixels visible
        topStyle = `bottom: -${RAIL_HANDLE_SIZE - edgeInset}px;`;
      } else {
        // Normal positioning - centered on rail
        topStyle = `top: calc(${rail.position}% - ${RAIL_HANDLE_SIZE / 2}px);`;
      }

      return `
        <resizable-rail-handle
          rail-id="${rail.id}"
          direction="horizontal"
          ${isAtEdge ? 'edge-collapsed' : ''}
          style="
            position: absolute;
            left: ${start}%;
            ${topStyle}
            width: ${end - start}%;
            height: ${RAIL_HANDLE_SIZE}px;
          "
        ></resizable-rail-handle>
      `;
    }
  }

  /**
   * Get container dimensions for constraint calculations
   */
  getContainerSize(): { width: number; height: number } {
    const rect = this.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /**
   * Compute which rails are the "center" of their aligned groups.
   * For a group of aligned rails, only one should show the grip handle.
   * Also computes the offset needed to position the grip at the global center.
   */
  private computeCenterRails(rails: Rail[]): Map<string, { isCenter: boolean; offset: number }> {
    const railInfo = new Map<string, { isCenter: boolean; offset: number }>();
    const processed = new Set<string>();

    for (const rail of rails) {
      if (processed.has(rail.id)) continue;

      // Get all rails aligned with this one
      const alignedRails = this._gridService.getAdjacentAlignedRails(rail.id, 1);

      // Mark all as processed and set default (not center)
      for (const r of alignedRails) {
        processed.add(r.id);
        railInfo.set(r.id, { isCenter: false, offset: 0 });
      }

      if (alignedRails.length === 1) {
        // Only one rail in the group, it's the center with no offset
        railInfo.set(alignedRails[0].id, { isCenter: true, offset: 0 });
      } else {
        // Multiple rails - find the one whose segment contains or is closest to the global center
        const railsWithBounds: { id: string; start: number; end: number }[] = [];

        for (const r of alignedRails) {
          const bounds = this._gridService.getRailBounds(r.id);
          if (bounds) {
            railsWithBounds.push({ id: r.id, start: bounds.start, end: bounds.end });
          }
        }

        if (railsWithBounds.length === 0) continue;

        // Find total extent and global center
        const minStart = Math.min(...railsWithBounds.map(r => r.start));
        const maxEnd = Math.max(...railsWithBounds.map(r => r.end));
        const globalCenter = (minStart + maxEnd) / 2;

        // Find rail whose segment contains the global center, or is closest to it
        let centerRail = railsWithBounds[0];
        let minDist = Infinity;

        for (const r of railsWithBounds) {
          // Check if this segment contains the global center
          if (globalCenter >= r.start && globalCenter <= r.end) {
            centerRail = r;
            minDist = 0;
            break;
          }
          // Otherwise find closest
          const midpoint = (r.start + r.end) / 2;
          const dist = Math.abs(midpoint - globalCenter);
          if (dist < minDist) {
            minDist = dist;
            centerRail = r;
          }
        }

        // Calculate offset: where is globalCenter relative to this rail's segment?
        // The grip is at 50% of the segment by default
        // We need to move it so it appears at globalCenter
        const segmentMidpoint = (centerRail.start + centerRail.end) / 2;
        const segmentLength = centerRail.end - centerRail.start;

        // Offset in percentage of the segment's length
        // (globalCenter - segmentMidpoint) gives the absolute offset in %
        // We need to convert to % of segment length for the CSS calc
        const offsetPercent = segmentLength > 0
          ? ((globalCenter - segmentMidpoint) / segmentLength) * 100
          : 0;

        railInfo.set(centerRail.id, { isCenter: true, offset: offsetPercent });
      }
    }

    return railInfo;
  }
}

// Register the custom element
if (!customElements.get('resizable-grid')) {
  customElements.define('resizable-grid', ResizableGrid);
}
