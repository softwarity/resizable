/**
 * ResizableRailHandle - Web Component for dragging rails
 *
 * This is the interactive handle that appears on non-fixed rails.
 * Dragging it moves the rail and all cells attached to it.
 */

import { GridService } from './grid.service';
import type { ResizableGrid } from './resizable-grid.component';

// Global overlay state - shared across all rail handles
// This prevents the overlay from being removed when rails are re-rendered during drag
let globalOverlay: HTMLDivElement | null = null;
let globalOverlayOwner: ResizableRailHandle | null = null; // instance that owns the overlay
let globalDragCleanup: (() => void) | null = null; // cleanup function for current drag
let instanceCounter = 0;

// Fusion zone constants
const FUSION_ZONE_OUTER = 5; // 5% = outer zone (slow blink, "approaching")
const FUSION_ZONE_MIDDLE = 2.5; // 2.5% = middle zone (medium blink, "slowing")
const FUSION_ZONE_INNER = 1; // 1% = inner zone (fast blink, "imminent")
const FUSION_DWELL_TIME_MS = 400; // Time to stay in inner zone before fusion

// DEBUG: Check for orphan overlays
function cleanOrphanOverlay(): void {
  const orphan = document.querySelector('[data-rail-overlay]');
  if (orphan && !globalOverlay) {
    console.warn('[RailHandle] Removing orphan overlay');
    orphan.remove();
  }
}

export class ResizableRailHandle extends HTMLElement {
  private _railId: string = '';
  private _instanceId: number;
  private _direction: 'vertical' | 'horizontal' = 'vertical';
  private _gridService: GridService | null = null;
  private _containerElement: ResizableGrid | null = null;
  private _isDragging: boolean = false;
  private _ctrlPressed: boolean = false;
  private _alignedRailIds: string[] = [];
  private _boundOnKeyChange: ((e: KeyboardEvent) => void) | null = null;
  private _minCellSize: number = 0;
  private _adjacentCellCount: number = 2; // Default: 1 cell on each side
  private _isCenterRail: boolean = true; // Whether this rail is the center of its aligned group
  private _gripOffset: number = 0; // Offset in % to position grip at global center
  private _canMove: boolean = true; // Whether this rail can be moved without creating aberrations

  // Fusion state
  private _fusionCandidateId: string | null = null; // Rail ID we might fuse with
  private _fusionDwellTimer: ReturnType<typeof setTimeout> | null = null;
  private _inFusionZone: boolean = false;

  static get observedAttributes(): string[] {
    return ['rail-id', 'direction', 'highlighted'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._instanceId = ++instanceCounter;
  }

  connectedCallback(): void {
    this.render();
    this.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.addEventListener('mouseenter', this.onMouseEnter.bind(this));
    this.addEventListener('mouseleave', this.onMouseLeave.bind(this));
  }

  disconnectedCallback(): void {
    // NEVER remove overlay here - it will be removed by onMouseUp
    // The component may be destroyed during drag (grid re-render) but overlay must persist
    this.cleanupKeyListeners();
  }

  get railId(): string {
    return this._railId;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'rail-id' && newValue) {
      this._railId = newValue;
    } else if (name === 'direction' && newValue) {
      this._direction = newValue as 'vertical' | 'horizontal';
      this.render();
    }
  }

  set gridService(service: GridService) {
    this._gridService = service;
  }

  set containerElement(element: ResizableGrid) {
    this._containerElement = element;
  }

  set minCellSize(value: number) {
    this._minCellSize = value;
  }

  set adjacentCellCount(value: number) {
    if (this._adjacentCellCount !== value) {
      this._adjacentCellCount = value;
      this.render();
    }
  }

  get adjacentCellCount(): number {
    return this._adjacentCellCount;
  }

  set isCenterRail(value: boolean) {
    if (this._isCenterRail !== value) {
      this._isCenterRail = value;
      this.render();
    }
  }

  get isCenterRail(): boolean {
    return this._isCenterRail;
  }

  set gripOffset(value: number) {
    if (this._gripOffset !== value) {
      this._gripOffset = value;
      this.render();
    }
  }

  get gripOffset(): number {
    return this._gripOffset;
  }

  set canMove(value: boolean) {
    if (this._canMove !== value) {
      this._canMove = value;
      if (!value) {
        this.setAttribute('disabled', '');
      } else {
        this.removeAttribute('disabled');
      }
      this.render();
    }
  }

  get canMove(): boolean {
    return this._canMove;
  }

  private render(): void {
    const cursor = this._canMove
      ? (this._direction === 'vertical' ? 'col-resize' : 'row-resize')
      : 'not-allowed';

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          cursor: ${cursor};
          z-index: 100;
        }

        /* Disabled state - rail cannot be moved */
        :host([disabled]) {
          cursor: not-allowed;
          opacity: 0.5;
        }

        :host([disabled]) .handle::before {
          background: var(--rail-disabled-color, light-dark(rgba(200, 0, 0, 0.2), rgba(255, 100, 100, 0.2))) !important;
        }

        :host([disabled]) .grip {
          display: none !important;
        }

        /* When grip is shown, this rail should be above others */
        :host([show-grip]),
        :host([highlighted="solo"]),
        :host([dragging]) {
          z-index: 101;
        }

        .handle {
          width: 100%;
          height: 100%;
          background: transparent;
          transition: background-color 0.15s;
          position: relative;
        }

        /* Center line - always visible but subtle */
        .handle::before {
          content: '';
          position: absolute;
          background: var(--rail-color, light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15)));
          transition: background-color 0.15s, opacity 0.15s, width 0.15s, height 0.15s;
          z-index: 1;
        }

        :host([direction="vertical"]) .handle::before {
          left: 50%;
          top: 0;
          bottom: 0;
          width: 1px;
          transform: translateX(-50%);
        }

        :host([direction="horizontal"]) .handle::before {
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          transform: translateY(-50%);
        }

        /* Hover state - thicker line */
        :host(:hover) .handle::before,
        :host([highlighted]) .handle::before {
          background: var(--rail-hover-color, light-dark(rgba(0, 0, 0, 0.4), rgba(255, 255, 255, 0.4)));
        }

        :host([direction="vertical"]:hover) .handle::before,
        :host([direction="vertical"][highlighted]) .handle::before {
          width: 3px;
        }

        :host([direction="horizontal"]:hover) .handle::before,
        :host([direction="horizontal"][highlighted]) .handle::before {
          height: 3px;
        }

        /* Highlighted state (aligned rails) - colored line */
        :host([highlighted="aligned"]) .handle::before {
          background: var(--rail-aligned-color, light-dark(#4a90d9, #6ab0f3));
        }

        /* Solo mode highlight (Ctrl pressed) */
        :host([highlighted="solo"]) .handle::before {
          background: var(--rail-solo-color, light-dark(#e67e22, #f39c12));
        }

        /* Solo mode disabled - rail cannot be split from its neighbors */
        :host([highlighted="solo-disabled"]) {
          cursor: not-allowed;
        }

        :host([highlighted="solo-disabled"]) .handle::before {
          background: var(--rail-solo-disabled-color, light-dark(rgba(150, 150, 150, 0.4), rgba(100, 100, 100, 0.4)));
        }

        :host([highlighted="solo-disabled"]) .grip {
          display: none;
        }

        /* Dragging state */
        :host([dragging]) .handle::before {
          background: var(--rail-active-color, light-dark(#2ecc71, #27ae60));
        }

        :host([direction="vertical"][dragging]) .handle::before {
          width: 3px;
        }

        :host([direction="horizontal"][dragging]) .handle::before {
          height: 3px;
        }

        /* Grip handle - the draggable knob */
        .grip {
          position: absolute;
          left: 50%;
          top: calc(50% + ${this._direction === 'vertical' ? this._gripOffset : 0}%);
          transform: translate(-50%, -50%);
          border-radius: 3px;
          opacity: 0;
          transition: opacity 0.15s, background-color 0.15s, box-shadow 0.15s;
          background: var(--rail-grip-bg, light-dark(#fff, #333));
          border: 1px solid var(--rail-grip-border, light-dark(rgba(0,0,0,0.2), rgba(255,255,255,0.2)));
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          /* High z-index to be above other rails' lines at intersections */
          z-index: 1000;
        }

        :host([direction="horizontal"]) .grip {
          left: calc(50% + ${this._gripOffset}%);
          top: 50%;
        }

        /* In solo mode, reset grip to center of THIS segment (ignore offset) */
        :host([highlighted="solo"]) .grip {
          left: 50% !important;
          top: 50% !important;
        }

        :host([direction="vertical"]) .grip {
          width: 10px;
          min-height: 14px;
          flex-direction: column;
          gap: 2px;
          padding: 3px 0;
        }

        :host([direction="horizontal"]) .grip {
          min-width: 14px;
          height: 10px;
          flex-direction: row;
          gap: 2px;
          padding: 0 3px;
        }

        /* Grip dots inside */
        .grip .dot {
          width: 3px;
          height: 3px;
          min-width: 3px;
          min-height: 3px;
          border-radius: 50%;
          background: var(--rail-grip-dot, light-dark(rgba(0,0,0,0.3), rgba(255,255,255,0.4)));
        }

        /* Non-center grips are hidden by default */
        .grip.non-center {
          display: none;
        }

        /* Show center grip on hover when show-grip is set */
        :host([show-grip]) .grip.center {
          opacity: 1;
        }

        /* In solo mode, show ALL grips (including non-center) at their segment center */
        :host([highlighted="solo"]) .grip {
          display: flex;
          opacity: 1;
        }

        /* Highlighted aligned - blue grip */
        :host([highlighted="aligned"][show-grip]) .grip {
          border-color: var(--rail-aligned-color, light-dark(#4a90d9, #6ab0f3));
          box-shadow: 0 0 0 2px var(--rail-aligned-color, light-dark(rgba(74, 144, 217, 0.3), rgba(106, 176, 243, 0.3)));
        }

        :host([highlighted="aligned"][show-grip]) .grip .dot {
          background: var(--rail-aligned-color, light-dark(#4a90d9, #6ab0f3));
        }

        /* Solo mode - orange grip */
        :host([highlighted="solo"]) .grip {
          opacity: 1;
          border-color: var(--rail-solo-color, light-dark(#e67e22, #f39c12));
          box-shadow: 0 0 0 2px var(--rail-solo-color, light-dark(rgba(230, 126, 34, 0.3), rgba(243, 156, 18, 0.3)));
        }

        :host([highlighted="solo"]) .grip .dot {
          background: var(--rail-solo-color, light-dark(#e67e22, #f39c12));
        }

        /* Dragging state */
        :host([dragging]) .grip {
          opacity: 1;
          border-color: var(--rail-active-color, light-dark(#2ecc71, #27ae60));
          box-shadow: 0 0 0 2px var(--rail-active-color, light-dark(rgba(46, 204, 113, 0.3), rgba(39, 174, 96, 0.3)));
        }

        :host([dragging]) .grip .dot {
          background: var(--rail-active-color, light-dark(#2ecc71, #27ae60));
        }

        /* Fusion zone indicator - pulsing/blinking animations at different speeds */
        @keyframes fusion-pulse-slow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        @keyframes fusion-pulse-medium {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }

        @keyframes fusion-pulse-fast {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

        @keyframes fusion-flash {
          0% {
            opacity: 1;
            box-shadow: 0 0 0 0 var(--rail-fusion-color, light-dark(rgba(46, 204, 113, 0.8), rgba(39, 174, 96, 0.8)));
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 20px 8px var(--rail-fusion-color, light-dark(rgba(46, 204, 113, 0.6), rgba(39, 174, 96, 0.6)));
          }
          100% {
            opacity: 1;
            box-shadow: 0 0 0 0 transparent;
          }
        }

        /* Stage 1: In fusion zone (slow blink - user is passing through) */
        :host([fusion-zone="approaching"]) .handle::before {
          background: var(--rail-fusion-color, light-dark(#9b59b6, #a569bd));
          animation: fusion-pulse-slow 0.8s ease-in-out infinite;
        }

        :host([direction="vertical"][fusion-zone="approaching"]) .handle::before {
          width: 4px;
        }

        :host([direction="horizontal"][fusion-zone="approaching"]) .handle::before {
          height: 4px;
        }

        /* Stage 2: Slowing down (medium blink) */
        :host([fusion-zone="slowing"]) .handle::before {
          background: var(--rail-fusion-color, light-dark(#8e44ad, #9b59b6));
          animation: fusion-pulse-medium 0.4s ease-in-out infinite;
        }

        :host([direction="vertical"][fusion-zone="slowing"]) .handle::before {
          width: 5px;
        }

        :host([direction="horizontal"][fusion-zone="slowing"]) .handle::before {
          height: 5px;
        }

        /* Stage 3: Almost fusing (fast blink) */
        :host([fusion-zone="imminent"]) .handle::before {
          background: var(--rail-fusion-color, light-dark(#27ae60, #2ecc71));
          animation: fusion-pulse-fast 0.15s ease-in-out infinite;
        }

        :host([direction="vertical"][fusion-zone="imminent"]) .handle::before {
          width: 6px;
        }

        :host([direction="horizontal"][fusion-zone="imminent"]) .handle::before {
          height: 6px;
        }

        /* Stage 4: Fusion happening (flash effect) */
        :host([fusion-zone="fusing"]) .handle::before {
          background: var(--rail-fusion-color, light-dark(#2ecc71, #27ae60));
          animation: fusion-flash 0.3s ease-out forwards;
        }

        :host([direction="vertical"][fusion-zone="fusing"]) .handle::before {
          width: 8px;
        }

        :host([direction="horizontal"][fusion-zone="fusing"]) .handle::before {
          height: 8px;
        }

        /* Grip styles for each stage */
        :host([fusion-zone]) .grip {
          opacity: 1;
        }

        :host([fusion-zone="approaching"]) .grip {
          border-color: var(--rail-fusion-color, light-dark(#9b59b6, #a569bd));
          animation: fusion-pulse-slow 0.8s ease-in-out infinite;
        }

        :host([fusion-zone="slowing"]) .grip {
          border-color: var(--rail-fusion-color, light-dark(#8e44ad, #9b59b6));
          animation: fusion-pulse-medium 0.4s ease-in-out infinite;
        }

        :host([fusion-zone="imminent"]) .grip {
          border-color: var(--rail-fusion-color, light-dark(#27ae60, #2ecc71));
          box-shadow: 0 0 0 2px var(--rail-fusion-color, light-dark(rgba(39, 174, 96, 0.4), rgba(46, 204, 113, 0.4)));
          animation: fusion-pulse-fast 0.15s ease-in-out infinite;
        }

        :host([fusion-zone="fusing"]) .grip {
          border-color: var(--rail-fusion-color, light-dark(#2ecc71, #27ae60));
          animation: fusion-flash 0.3s ease-out forwards;
        }

        :host([fusion-zone="approaching"]) .grip .dot {
          background: var(--rail-fusion-color, light-dark(#9b59b6, #a569bd));
        }

        :host([fusion-zone="slowing"]) .grip .dot {
          background: var(--rail-fusion-color, light-dark(#8e44ad, #9b59b6));
        }

        :host([fusion-zone="imminent"]) .grip .dot,
        :host([fusion-zone="fusing"]) .grip .dot {
          background: var(--rail-fusion-color, light-dark(#2ecc71, #27ae60));
        }
      </style>

      <div class="handle">
        <div class="grip ${this._isCenterRail ? 'center' : 'non-center'}">${this.generateDots()}</div>
      </div>
    `;
  }

  /**
   * Generate dots for the grip based on adjacent cell count
   */
  private generateDots(): string {
    // Minimum 2 dots, maximum based on cell count
    const dotCount = Math.max(2, this._adjacentCellCount);
    return Array(dotCount).fill('<span class="dot"></span>').join('');
  }

  // ============ Mouse Events ============

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Only left click
    event.preventDefault();

    // Clean any orphan overlay first
    cleanOrphanOverlay();

    this._ctrlPressed = event.ctrlKey || event.metaKey;
    this.startDrag();

    // Store references that survive re-renders
    const ownerInstance = this;
    const gridService = this._gridService;
    const containerElement = this._containerElement;
    const direction = this._direction;
    const railId = this._railId;
    let alignedRailIds = this._alignedRailIds;
    let ctrlPressed = this._ctrlPressed;
    let listenersAttached = false;

    // Fusion state for this drag session
    let fusionCandidateId: string | null = null;
    let fusionDwellTimer: ReturnType<typeof setTimeout> | null = null;
    let inFusionZone = false;
    let fusionReadyToTrigger = false; // Only true after user stops moving in inner zone
    let lastCtrlPressed = ctrlPressed; // Track CTRL state changes
    let fusionDisabledUntilMove = false; // Disable fusion detection right after CTRL release

    // Movement tracking for "stopped" detection
    let lastMoveTime = 0;
    let lastPosition = 0;
    let stoppedInInnerZone = false;
    let stoppedStartTime: number | null = null;
    const STOPPED_THRESHOLD_MS = 100; // Consider "stopped" if no movement for 100ms
    const FUSION_AFTER_STOP_MS = 300; // Fuse after being stopped for 300ms

    const clearFusionState = () => {
      if (fusionDwellTimer) {
        clearTimeout(fusionDwellTimer);
        fusionDwellTimer = null;
      }
      fusionCandidateId = null;
      inFusionZone = false;
      fusionReadyToTrigger = false;
      stoppedInInnerZone = false;
      stoppedStartTime = null;
      ownerInstance.removeAttribute('fusion-zone');
      // Also clear fusion-zone from candidate rail handle
      clearFusionZoneOnAllHandles();
    };

    const clearFusionZoneOnAllHandles = () => {
      if (containerElement?.shadowRoot) {
        containerElement.shadowRoot.querySelectorAll('resizable-rail-handle[fusion-zone]').forEach(el => {
          el.removeAttribute('fusion-zone');
        });
      }
    };

    // Set fusion zone stage on handles: 'approaching', 'slowing', 'imminent', 'fusing'
    const setFusionStage = (stage: string, targetRailId?: string) => {
      ownerInstance.setAttribute('fusion-zone', stage);
      if (targetRailId && containerElement?.shadowRoot) {
        const handle = containerElement.shadowRoot.querySelector(`resizable-rail-handle[rail-id="${targetRailId}"]`);
        if (handle) {
          handle.setAttribute('fusion-zone', stage);
        }
      }
    };

    // Track position when CTRL was released to detect significant movement
    let positionAtCtrlRelease: number | null = null;
    const SIGNIFICANT_MOVE_THRESHOLD = 3; // 3% movement needed to re-enable fusion

    const onMouseMove = (e: MouseEvent) => {
      const newCtrlPressed = e.ctrlKey || e.metaKey;

      // Use captured references instead of this
      if (!gridService || !containerElement) return;

      const containerRect = containerElement.getBoundingClientRect();
      const containerSize = direction === 'vertical' ? containerRect.width : containerRect.height;

      let newPosition: number;
      if (direction === 'vertical') {
        const relativeX = e.clientX - containerRect.left;
        newPosition = (relativeX / containerRect.width) * 100;
      } else {
        const relativeY = e.clientY - containerRect.top;
        newPosition = (relativeY / containerRect.height) * 100;
      }

      // Detect CTRL release - recalculate aligned rails and disable fusion temporarily
      if (lastCtrlPressed && !newCtrlPressed) {
        // IMPORTANT: Recalculate aligned rails based on current position
        // After CTRL+drag, the rail may be at a new position with different neighbors
        alignedRailIds = gridService.getAdjacentAlignedRails(railId, 1).map(r => r.id);
        fusionDisabledUntilMove = true;
        positionAtCtrlRelease = newPosition;
        clearFusionState();
      }
      lastCtrlPressed = newCtrlPressed;
      ctrlPressed = newCtrlPressed;

      const now = performance.now();

      // Track if user is moving or stopped
      const positionChanged = Math.abs(newPosition - lastPosition) > 0.1;
      if (positionChanged) {
        lastMoveTime = now;
        lastPosition = newPosition;
        stoppedInInnerZone = false;
        stoppedStartTime = null;
      }
      const isStopped = (now - lastMoveTime) > STOPPED_THRESHOLD_MS;

      if (ctrlPressed) {
        // Solo mode: move only this rail, detaching from its aligned neighbors
        // Check if THIS rail can move independently (both endpoints have perpendicular rails)
        const canMoveSolo = gridService.canRailMoveIndependently(railId);
        if (!canMoveSolo) {
          // This rail cannot move solo - would create visual aberrations
          return;
        }
        gridService.moveRail(railId, newPosition, containerSize, ownerInstance._minCellSize);
        clearFusionState();
        fusionDisabledUntilMove = false;
        positionAtCtrlRelease = null;
      } else {
        // Check if the aligned GROUP can move together
        const canGroupMove = gridService.canAlignedGroupMove(railId);
        if (!canGroupMove) {
          // Group has gaps at its outer endpoints - cannot move
          return;
        }
        // Fused mode: move all aligned rails together
        gridService.moveRails(alignedRailIds, newPosition, containerSize, ownerInstance._minCellSize);

        // Skip fusion detection if we just released CTRL
        // Only re-enable after user has moved significantly from the release position
        if (fusionDisabledUntilMove) {
          if (positionAtCtrlRelease !== null) {
            const distanceFromRelease = Math.abs(newPosition - positionAtCtrlRelease);
            if (distanceFromRelease >= SIGNIFICANT_MOVE_THRESHOLD) {
              fusionDisabledUntilMove = false;
              positionAtCtrlRelease = null;
            }
          }
          return; // Don't check for fusion yet
        }

        // Check for fusion candidates in the outer zone
        // Only consider rails that are NOT already in our aligned group
        const allCandidates = gridService.getFusionCandidates(railId, FUSION_ZONE_OUTER);
        const candidates = allCandidates.filter(c => !alignedRailIds.includes(c.rail.id));

        if (candidates.length > 0) {
          const candidate = candidates[0]; // Take closest candidate
          const distance = candidate.distance;

          if (!inFusionZone || fusionCandidateId !== candidate.rail.id) {
            // Entering fusion zone with a new candidate
            clearFusionState();
            fusionCandidateId = candidate.rail.id;
            inFusionZone = true;
          }

          // Determine which zone we're in based on distance
          if (distance <= FUSION_ZONE_INNER) {
            // Inner zone - fastest blink
            // Only fuse if user STOPS moving here
            if (isStopped && !fusionReadyToTrigger) {
              if (!stoppedInInnerZone) {
                // Just stopped in inner zone
                stoppedInInnerZone = true;
                stoppedStartTime = now;
              } else if (stoppedStartTime && (now - stoppedStartTime) >= FUSION_AFTER_STOP_MS) {
                // User has been stopped in inner zone long enough - FUSION!
                fusionReadyToTrigger = true;
                setFusionStage('fusing', fusionCandidateId!);

                // Capture the candidate ID now (before the timeout)
                const candidateToFuseWith = fusionCandidateId;

                // Small delay for flash animation, then fuse
                setTimeout(() => {
                  if (candidateToFuseWith && gridService && fusionReadyToTrigger) {
                    // Re-verify the candidate is still valid and close enough
                    const currentCandidates = gridService.getFusionCandidates(railId, FUSION_ZONE_INNER * 2);
                    const stillValid = currentCandidates.some(c => c.rail.id === candidateToFuseWith);

                    if (stillValid) {
                      gridService.fuseRails(railId, candidateToFuseWith);
                      // Update aligned rails to include the newly fused rail
                      alignedRailIds = gridService.getAdjacentAlignedRails(railId, 1).map(r => r.id);
                    }
                  }
                  clearFusionState();
                }, 150);
              } else {
                // Stopped but waiting for fusion timer
                setFusionStage('imminent', fusionCandidateId!);
              }
            } else {
              // Still moving in inner zone - show fast blink but don't fuse
              setFusionStage('imminent', fusionCandidateId!);
            }
          } else if (distance <= FUSION_ZONE_MIDDLE) {
            // Middle zone - medium blink
            setFusionStage('slowing', fusionCandidateId!);
            stoppedInInnerZone = false;
            stoppedStartTime = null;
            fusionReadyToTrigger = false;
          } else {
            // Outer zone - slow blink
            setFusionStage('approaching', fusionCandidateId!);
            stoppedInInnerZone = false;
            stoppedStartTime = null;
            fusionReadyToTrigger = false;
          }
        } else {
          // Not in any fusion zone
          if (inFusionZone) {
            clearFusionState();
          }
        }
      }
    };

    const cleanup = () => {
      // Clear fusion timer if still running
      if (fusionDwellTimer) {
        clearTimeout(fusionDwellTimer);
        fusionDwellTimer = null;
      }
      if (globalOverlay) {
        globalOverlay.removeEventListener('mousemove', onMouseMove);
        globalOverlay.removeEventListener('mouseup', onMouseUp);
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyChange);
      document.removeEventListener('keyup', onKeyChange);
      globalDragCleanup = null;
    };

    const onMouseUp = () => {
      // Clean up fusion state - do NOT fuse on mouse up
      // Fusion only happens via dwell time in the inner zone
      clearFusionState();

      cleanup();
      // Remove overlay directly using global state
      if (globalOverlay) {
        globalOverlay.remove();
        globalOverlay = null;
        globalOverlayOwner = null;
        // Re-enable iframes
        const style = document.getElementById('rail-drag-iframe-disable');
        if (style) style.remove();
      }
    };

    const onKeyChange = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        ctrlPressed = e.type === 'keydown';
      }
    };

    // Store cleanup globally so it survives re-renders
    globalDragCleanup = cleanup;

    // Immediately attach to document as fallback
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyChange);
    document.addEventListener('keyup', onKeyChange);

    // Also attach to overlay for better coverage (after it's ready)
    requestAnimationFrame(() => {
      if (globalOverlay && !listenersAttached) {
        globalOverlay.addEventListener('mousemove', onMouseMove);
        globalOverlay.addEventListener('mouseup', onMouseUp);
        listenersAttached = true;
      }
    });
  }

  // ============ Touch Events ============

  private onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) return;
    event.preventDefault();

    this.startDrag();

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      this.onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      this.endDrag();
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  // ============ Drag Logic ============

  private startDrag(): void {
    this._isDragging = true;
    this.setAttribute('dragging', '');
    this.createOverlay();

    // Find aligned rails at drag start (rails at the same position that are adjacent)
    if (this._gridService) {
      this._alignedRailIds = this._gridService
        .getAdjacentAlignedRails(this._railId, 1)
        .map(r => r.id);
      console.log('[RailHandle] startDrag:', this._railId, 'aligned:', this._alignedRailIds);
    }
  }

  private onDragMove(clientX: number, clientY: number): void {
    if (!this._isDragging || !this._gridService || !this._containerElement) return;

    const containerRect = this._containerElement.getBoundingClientRect();
    const containerSize = this._direction === 'vertical' ? containerRect.width : containerRect.height;

    // Calculate new position as percentage
    let newPosition: number;
    if (this._direction === 'vertical') {
      const relativeX = clientX - containerRect.left;
      newPosition = (relativeX / containerRect.width) * 100;
    } else {
      const relativeY = clientY - containerRect.top;
      newPosition = (relativeY / containerRect.height) * 100;
    }

    // If Ctrl is pressed, move only this rail (detach behavior)
    // Otherwise, move all aligned rails together (fused behavior)
    if (this._ctrlPressed) {
      // Solo mode: move only this rail
      this._gridService.moveRail(this._railId, newPosition, containerSize, this._minCellSize);
    } else {
      // Fused mode: move all aligned rails together
      this._gridService.moveRails(this._alignedRailIds, newPosition, containerSize, this._minCellSize);
    }
  }

  private endDrag(): void {
    this._isDragging = false;
    this.removeAttribute('dragging');
    this.removeOverlay();
    this.clearAllHighlights();

    // Emit config change event
    this.dispatchEvent(new CustomEvent('rail-moved', {
      detail: { railId: this._railId },
      bubbles: true,
      composed: true,
    }));
  }

  // ============ Hover Events ============

  private onMouseEnter(): void {
    if (this._isDragging) return;

    // Start listening for Ctrl key changes
    this._boundOnKeyChange = this.onHoverKeyChange.bind(this);
    document.addEventListener('keydown', this._boundOnKeyChange);
    document.addEventListener('keyup', this._boundOnKeyChange);

    // Update highlight based on current Ctrl state
    this.updateHoverHighlight(false);
  }

  private onMouseLeave(): void {
    if (this._isDragging) return;

    this.cleanupKeyListeners();
    this.clearAllHighlights();
  }

  private onHoverKeyChange(e: KeyboardEvent): void {
    if (e.key === 'Control' || e.key === 'Meta') {
      this.updateHoverHighlight(e.type === 'keydown');
    }
  }

  private updateHoverHighlight(ctrlPressed: boolean): void {
    if (!this._gridService || !this._containerElement) return;

    // Clear previous highlights
    this.clearAllHighlights();

    const alignedRails = this._gridService.getAdjacentAlignedRails(this._railId, 1);
    const alignedIds = alignedRails.map(r => r.id);

    if (ctrlPressed) {
      // Solo mode: check if THIS rail can move independently
      const canMoveSolo = this._gridService.canRailMoveIndependently(this._railId);
      if (!canMoveSolo) {
        // This rail cannot move solo - show as disabled
        this.highlightRails([this._railId], 'solo-disabled', false, null);
      } else {
        // This rail can move solo - show solo highlight
        this.highlightRails([this._railId], 'solo', true, null);
      }
    } else {
      // Aligned mode: check if the GROUP can move together
      const canGroupMove = this._gridService.canAlignedGroupMove(this._railId);
      if (!canGroupMove) {
        // Group cannot move - show as disabled
        this.highlightRails(alignedIds, 'solo-disabled', false, null);
      } else {
        // Group can move - show aligned highlight
        const centerRailId = this.findCenterRail(alignedRails);
        this.highlightRails(alignedIds, 'aligned', false, centerRailId);
      }
    }
  }

  /**
   * Find the rail that is at the center of the aligned rails
   */
  private findCenterRail(rails: { id: string }[]): string | null {
    if (!this._containerElement || rails.length === 0) return rails[0]?.id || null;

    const handles = this._containerElement.shadowRoot?.querySelectorAll('resizable-rail-handle');
    if (!handles) return rails[0]?.id || null;

    // Get bounding rects of all aligned handles
    const railIds = new Set(rails.map(r => r.id));
    const alignedHandles: { id: string; rect: DOMRect }[] = [];

    handles.forEach(handle => {
      const h = handle as ResizableRailHandle;
      if (railIds.has(h.railId)) {
        alignedHandles.push({ id: h.railId, rect: handle.getBoundingClientRect() });
      }
    });

    if (alignedHandles.length === 0) return rails[0]?.id || null;

    // Calculate the total extent and find center
    if (this._direction === 'vertical') {
      // For vertical rails, find center in Y axis
      const minY = Math.min(...alignedHandles.map(h => h.rect.top));
      const maxY = Math.max(...alignedHandles.map(h => h.rect.bottom));
      const centerY = (minY + maxY) / 2;

      // Find handle closest to center
      let closest = alignedHandles[0];
      let minDist = Infinity;
      for (const h of alignedHandles) {
        const handleCenterY = (h.rect.top + h.rect.bottom) / 2;
        const dist = Math.abs(handleCenterY - centerY);
        if (dist < minDist) {
          minDist = dist;
          closest = h;
        }
      }
      return closest.id;
    } else {
      // For horizontal rails, find center in X axis
      const minX = Math.min(...alignedHandles.map(h => h.rect.left));
      const maxX = Math.max(...alignedHandles.map(h => h.rect.right));
      const centerX = (minX + maxX) / 2;

      // Find handle closest to center
      let closest = alignedHandles[0];
      let minDist = Infinity;
      for (const h of alignedHandles) {
        const handleCenterX = (h.rect.left + h.rect.right) / 2;
        const dist = Math.abs(handleCenterX - centerX);
        if (dist < minDist) {
          minDist = dist;
          closest = h;
        }
      }
      return closest.id;
    }
  }

  private highlightRails(railIds: string[], mode: 'aligned' | 'solo' | 'solo-disabled', showAllGrips: boolean, centerRailId: string | null): void {
    if (!this._containerElement) return;

    const handles = this._containerElement.shadowRoot?.querySelectorAll('resizable-rail-handle');
    handles?.forEach(handle => {
      const h = handle as ResizableRailHandle;
      if (railIds.includes(h.railId)) {
        h.setAttribute('highlighted', mode);
        if (showAllGrips || h.railId === centerRailId) {
          h.setAttribute('show-grip', '');
        }
      }
    });
  }

  private clearAllHighlights(): void {
    if (!this._containerElement) return;

    const handles = this._containerElement.shadowRoot?.querySelectorAll('resizable-rail-handle');
    handles?.forEach(handle => {
      handle.removeAttribute('highlighted');
      handle.removeAttribute('show-grip');
    });
  }

  private cleanupKeyListeners(): void {
    if (this._boundOnKeyChange) {
      document.removeEventListener('keydown', this._boundOnKeyChange);
      document.removeEventListener('keyup', this._boundOnKeyChange);
      this._boundOnKeyChange = null;
    }
  }

  // ============ Overlay ============

  private createOverlay(): void {
    if (globalOverlay) return;

    globalOverlay = document.createElement('div');
    globalOverlay.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483647 !important;
      cursor: ${this._direction === 'vertical' ? 'col-resize' : 'row-resize'};
      background: transparent;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      pointer-events: auto !important;
    `;
    globalOverlay.setAttribute('data-rail-overlay', 'true');
    globalOverlayOwner = this;
    document.documentElement.appendChild(globalOverlay);

    // Also disable pointer events on all iframes during drag
    this.disableIframes();
  }

  private removeOverlay(): void {
    if (globalOverlay && globalOverlayOwner === this) {
      globalOverlay.remove();
      globalOverlay = null;
      globalOverlayOwner = null;
      // Re-enable iframes
      this.enableIframes();
    }
  }

  private disableIframes(): void {
    // Add a style tag to disable ALL iframes globally
    const style = document.createElement('style');
    style.id = 'rail-drag-iframe-disable';
    style.textContent = 'iframe { pointer-events: none !important; }';
    document.head.appendChild(style);
  }

  private enableIframes(): void {
    // Remove the global style
    const style = document.getElementById('rail-drag-iframe-disable');
    if (style) {
      style.remove();
    }
  }
}

// Register the custom element
if (!customElements.get('resizable-rail-handle')) {
  customElements.define('resizable-rail-handle', ResizableRailHandle);
}
