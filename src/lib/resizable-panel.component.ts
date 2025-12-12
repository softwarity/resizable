/**
 * ResizablePanel - A native Web Component for panel content in a resizable layout
 *
 * Usage:
 * <resizable-panel flex="1" min="100px" max="500px">
 *   Content here
 * </resizable-panel>
 */

export class ResizablePanel extends HTMLElement {
  private _flex: number = 1;
  private _min: string | null = null;
  private _max: string | null = null;
  private _direction: 'horizontal' | 'vertical' = 'horizontal';
  private _currentSize: number = 0; // Stored as percentage (0-100)

  readonly panelId: string;

  static get observedAttributes(): string[] {
    return ['flex', 'min', 'max', 'panel-id'];
  }

  constructor() {
    super();
    this.panelId = this.getAttribute('panel-id') || `panel-${Math.random().toString(36).slice(2, 11)}`;
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'flex':
        this._flex = parseFloat(newValue || '1');
        break;
      case 'min':
        this._min = newValue;
        this.updateMinMax();
        break;
      case 'max':
        this._max = newValue;
        this.updateMinMax();
        break;
    }
  }

  get flex(): number {
    return this._flex;
  }

  set flex(value: number) {
    this._flex = value;
    this.setAttribute('flex', String(value));
  }

  get min(): string | null {
    return this._min;
  }

  set min(value: string | null) {
    this._min = value;
    if (value) {
      this.setAttribute('min', value);
    } else {
      this.removeAttribute('min');
    }
    this.updateMinMax();
  }

  get max(): string | null {
    return this._max;
  }

  set max(value: string | null) {
    this._max = value;
    if (value) {
      this.setAttribute('max', value);
    } else {
      this.removeAttribute('max');
    }
    this.updateMinMax();
  }

  get direction(): 'horizontal' | 'vertical' {
    return this._direction;
  }

  set direction(value: 'horizontal' | 'vertical') {
    this._direction = value;
    this.updateMinMax();
    // Re-apply size with new direction
    if (this._currentSize > 0) {
      this.setSize(this._currentSize);
    }
  }

  get currentSize(): number {
    return this._currentSize;
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        overflow: hidden;
        position: relative;
        box-sizing: border-box;
        min-width: 0;
        min-height: 0;
      }

      .content {
        width: 100%;
        height: 100%;
        overflow: auto;
      }

      /* Ensure nested resizable-split takes full size */
      ::slotted(resizable-split) {
        width: 100% !important;
        height: 100% !important;
      }
    `;

    const content = document.createElement('div');
    content.className = 'content';

    const slot = document.createElement('slot');
    content.appendChild(slot);

    this.shadowRoot!.appendChild(style);
    this.shadowRoot!.appendChild(content);
  }

  private updateMinMax(): void {
    const isHorizontal = this._direction === 'horizontal';

    // Reset all constraints first
    this.style.minWidth = '';
    this.style.maxWidth = '';
    this.style.minHeight = '';
    this.style.maxHeight = '';

    if (this._min) {
      if (isHorizontal) {
        this.style.minWidth = this._min;
      } else {
        this.style.minHeight = this._min;
      }
    }

    if (this._max) {
      if (isHorizontal) {
        this.style.maxWidth = this._max;
      } else {
        this.style.maxHeight = this._max;
      }
    }
  }

  /** Set the panel size as a percentage (0-100) */
  setSize(percent: number): void {
    this._currentSize = percent;
    const isHorizontal = this._direction === 'horizontal';

    // Use flex-basis with percentage
    // flex: 0 0 X% means no grow, no shrink, basis of X%
    this.style.flex = `0 0 ${percent}%`;

    // Set cross-axis to 100%
    if (isHorizontal) {
      this.style.height = '100%';
    } else {
      this.style.width = '100%';
    }

    // Emit size change event
    this.dispatchEvent(new CustomEvent('size-change', {
      detail: { size: percent, panelId: this.panelId },
      bubbles: true,
      composed: true,
    }));
  }
}

// Register the custom element
if (!customElements.get('resizable-panel')) {
  customElements.define('resizable-panel', ResizablePanel);
}
