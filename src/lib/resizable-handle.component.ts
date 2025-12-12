/**
 * ResizableHandle - A native Web Component for the drag handle between panels
 *
 * This component is created automatically by ResizableSplit.
 * It handles mouse/touch events for resizing and visual feedback for glued handles.
 *
 * Features:
 * - Drag to resize adjacent panels
 * - Dynamic fusion with adjacent handles at same position
 * - Ctrl+hover to show individual handles (bypass fusion)
 * - Visual feedback for glued/fused state
 */

import { ResizableLayoutRegistry } from './resizable-layout.service';

export class ResizableHandle extends HTMLElement {
  private _direction: 'horizontal' | 'vertical' = 'horizontal';
  private _index: number = 0;
  private _splitId: string = '';
  private _isGlued: boolean = false;
  private _isDragging: boolean = false;
  private _hasFusionPotential: boolean = false;

  private boundOnMouseDown = this.onMouseDown.bind(this);
  private boundOnMouseMove = this.onMouseMove.bind(this);
  private boundOnMouseUp = this.onMouseUp.bind(this);
  private boundOnTouchStart = this.onTouchStart.bind(this);
  private boundOnTouchMove = this.onTouchMove.bind(this);
  private boundOnTouchEnd = this.onTouchEnd.bind(this);
  private boundOnMouseEnter = this.onMouseEnter.bind(this);
  private boundOnMouseLeave = this.onMouseLeave.bind(this);
  private boundOnKeyDown = this.onKeyDown.bind(this);
  private boundOnKeyUp = this.onKeyUp.bind(this);

  static get observedAttributes(): string[] {
    return ['direction', 'index', 'split-id', 'glued'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.addEventListener('mousedown', this.boundOnMouseDown);
    this.addEventListener('touchstart', this.boundOnTouchStart, { passive: false });
    this.addEventListener('mouseenter', this.boundOnMouseEnter);
    this.addEventListener('mouseleave', this.boundOnMouseLeave);
    // Global key listeners for Ctrl
    document.addEventListener('keydown', this.boundOnKeyDown);
    document.addEventListener('keyup', this.boundOnKeyUp);
  }

  disconnectedCallback(): void {
    this.removeEventListener('mousedown', this.boundOnMouseDown);
    this.removeEventListener('touchstart', this.boundOnTouchStart);
    this.removeEventListener('mouseenter', this.boundOnMouseEnter);
    this.removeEventListener('mouseleave', this.boundOnMouseLeave);
    document.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('mouseup', this.boundOnMouseUp);
    document.removeEventListener('touchmove', this.boundOnTouchMove);
    document.removeEventListener('touchend', this.boundOnTouchEnd);
    document.removeEventListener('keydown', this.boundOnKeyDown);
    document.removeEventListener('keyup', this.boundOnKeyUp);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'direction':
        this._direction = (newValue as 'horizontal' | 'vertical') || 'horizontal';
        this.updateStyles();
        break;
      case 'index':
        this._index = parseInt(newValue || '0', 10);
        break;
      case 'split-id':
        this._splitId = newValue || '';
        break;
      case 'glued':
        this._isGlued = newValue !== null;
        this.updateGluedState();
        break;
    }
  }

  get direction(): 'horizontal' | 'vertical' {
    return this._direction;
  }

  set direction(value: 'horizontal' | 'vertical') {
    this._direction = value;
    this.setAttribute('direction', value);
    this.updateStyles();
  }

  get index(): number {
    return this._index;
  }

  set index(value: number) {
    this._index = value;
    this.setAttribute('index', String(value));
  }

  get splitId(): string {
    return this._splitId;
  }

  set splitId(value: string) {
    this._splitId = value;
    this.setAttribute('split-id', value);
  }

  get isGlued(): boolean {
    return this._isGlued;
  }

  set isGlued(value: boolean) {
    this._isGlued = value;
    if (value) {
      this.setAttribute('glued', '');
    } else {
      this.removeAttribute('glued');
    }
    this.updateGluedState();
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        --handle-size: 8px;
        --handle-color: light-dark(#cccccc, #555555);
        --handle-hover-color: light-dark(#888888, #888888);
        --handle-active-color: light-dark(#666666, #aaaaaa);
        --handle-glued-color: light-dark(#4a90d9, #5ba0e9);

        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        background: transparent;
        position: relative;
        z-index: 1;
        flex-shrink: 0;
        touch-action: none;
      }

      :host([direction="horizontal"]) {
        cursor: col-resize;
        width: var(--handle-size);
        height: 100%;
      }

      :host([direction="vertical"]) {
        cursor: row-resize;
        height: var(--handle-size);
        width: 100%;
      }

      .handle-bar {
        position: absolute;
        box-sizing: border-box;
        border-style: solid;
        border-color: var(--handle-color);
        transition: border-color 0.15s ease, transform 0.15s ease;
      }

      :host([direction="horizontal"]) .handle-bar {
        border-width: 0 1px;
        height: 20px;
        width: 4px;
      }

      :host([direction="vertical"]) .handle-bar {
        border-width: 1px 0;
        width: 20px;
        height: 4px;
      }

      :host(:hover) .handle-bar {
        border-color: var(--handle-hover-color);
      }

      :host([dragging]) .handle-bar {
        border-color: var(--handle-active-color);
      }

      :host([glued]) .handle-bar {
        border-color: var(--handle-glued-color);
        transform: scale(1.2);
      }

      :host([glued])::after {
        content: '';
        position: absolute;
        background: var(--handle-glued-color);
        opacity: 0.3;
        border-radius: 50%;
        animation: glue-pulse 1s ease-in-out infinite;
      }

      :host([direction="horizontal"][glued])::after {
        width: 12px;
        height: 12px;
      }

      :host([direction="vertical"][glued])::after {
        width: 12px;
        height: 12px;
      }

      /* Fusion potential - shown on hover when handles could fuse */
      :host([fusion-potential]) .handle-bar {
        border-color: var(--handle-fusion-potential-color, #9b59b6);
        transform: scale(1.1);
      }

      :host([fusion-potential])::before {
        content: '';
        position: absolute;
        background: var(--handle-fusion-potential-color, #9b59b6);
        opacity: 0.2;
        border-radius: 2px;
      }

      :host([direction="horizontal"][fusion-potential])::before {
        width: 100%;
        height: 100%;
      }

      :host([direction="vertical"][fusion-potential])::before {
        width: 100%;
        height: 100%;
      }

      @keyframes glue-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 0.3;
        }
        50% {
          transform: scale(1.5);
          opacity: 0.1;
        }
      }
    `;

    const handleBar = document.createElement('div');
    handleBar.className = 'handle-bar';

    this.shadowRoot!.appendChild(style);
    this.shadowRoot!.appendChild(handleBar);
  }

  private updateStyles(): void {
    // Styles are handled via CSS attribute selectors
  }

  private updateGluedState(): void {
    // Visual feedback is handled via CSS [glued] attribute
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Only left click
    event.preventDefault();

    this._isDragging = true;
    this.setAttribute('dragging', '');

    const position = this._direction === 'horizontal' ? event.clientX : event.clientY;

    this.dispatchEvent(new CustomEvent('drag-start', {
      detail: {
        index: this._index,
        position,
        ctrlKey: event.ctrlKey,
      },
      bubbles: true,
      composed: true,
    }));

    document.addEventListener('mousemove', this.boundOnMouseMove);
    document.addEventListener('mouseup', this.boundOnMouseUp);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this._isDragging) return;

    const position = this._direction === 'horizontal' ? event.clientX : event.clientY;

    this.dispatchEvent(new CustomEvent('drag-move', {
      detail: {
        position,
        ctrlKey: event.ctrlKey,
      },
      bubbles: true,
      composed: true,
    }));
  }

  private onMouseUp(): void {
    if (!this._isDragging) return;

    this._isDragging = false;
    this.removeAttribute('dragging');

    document.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('mouseup', this.boundOnMouseUp);

    this.dispatchEvent(new CustomEvent('drag-end', {
      bubbles: true,
      composed: true,
    }));
  }

  private onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) return;
    event.preventDefault();

    this._isDragging = true;
    this.setAttribute('dragging', '');

    const touch = event.touches[0];
    const position = this._direction === 'horizontal' ? touch.clientX : touch.clientY;

    this.dispatchEvent(new CustomEvent('drag-start', {
      detail: {
        index: this._index,
        position,
        ctrlKey: false,
      },
      bubbles: true,
      composed: true,
    }));

    document.addEventListener('touchmove', this.boundOnTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundOnTouchEnd);
  }

  private onTouchMove(event: TouchEvent): void {
    if (!this._isDragging || event.touches.length !== 1) return;
    event.preventDefault();

    const touch = event.touches[0];
    const position = this._direction === 'horizontal' ? touch.clientX : touch.clientY;

    this.dispatchEvent(new CustomEvent('drag-move', {
      detail: {
        position,
        ctrlKey: false,
      },
      bubbles: true,
      composed: true,
    }));
  }

  private onTouchEnd(): void {
    if (!this._isDragging) return;

    this._isDragging = false;
    this.removeAttribute('dragging');

    document.removeEventListener('touchmove', this.boundOnTouchMove);
    document.removeEventListener('touchend', this.boundOnTouchEnd);

    this.dispatchEvent(new CustomEvent('drag-end', {
      bubbles: true,
      composed: true,
    }));
  }

  /** Get the center position of this handle for intersection detection */
  getCenterPosition(): { x: number; y: number } {
    const rect = this.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  /**
   * Handle mouse enter - check for fusion potential with nearby handles.
   * Shows visual feedback when this handle could fuse with others.
   */
  private onMouseEnter(): void {
    if (this._isDragging) return;

    // Check if there are adjacent handles at similar position
    const adjacentHandles = ResizableLayoutRegistry.getAdjacentHandles(
      this, this._splitId, this._index
    );

    if (adjacentHandles.length > 0) {
      this._hasFusionPotential = true;
      this.setAttribute('fusion-potential', '');

      // Also mark adjacent handles as having fusion potential
      adjacentHandles.forEach(({ handle }) => {
        handle.setAttribute('fusion-potential', '');
      });
    }
  }

  /**
   * Handle mouse leave - remove fusion potential visual.
   */
  private onMouseLeave(): void {
    if (this._isDragging) return;

    this._hasFusionPotential = false;
    this.removeAttribute('fusion-potential');

    // Also remove from adjacent handles
    const adjacentHandles = ResizableLayoutRegistry.getAdjacentHandles(
      this, this._splitId, this._index
    );
    adjacentHandles.forEach(({ handle }) => {
      handle.removeAttribute('fusion-potential');
    });
  }

  /**
   * Handle keydown - track Ctrl key for individual handle mode.
   */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Control') {
      ResizableLayoutRegistry.setCtrlPressed(true);
    }
  }

  /**
   * Handle keyup - track Ctrl key release.
   */
  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Control') {
      ResizableLayoutRegistry.setCtrlPressed(false);
    }
  }

  /** Check if this handle has fusion potential with others */
  get hasFusionPotential(): boolean {
    return this._hasFusionPotential;
  }
}

// Register the custom element
if (!customElements.get('resizable-handle')) {
  customElements.define('resizable-handle', ResizableHandle);
}
