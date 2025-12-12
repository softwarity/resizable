/**
 * ResizableLayoutRegistry - Global service for managing resizable layout state
 *
 * This service handles:
 * - Registration of all ResizableSplit components
 * - Dynamic handle fusion based on physical proximity
 * - Unified handle groups that move together
 * - Ctrl+hover to show/manipulate individual handles
 */

import type { ResizableSplit } from './resizable-split.component';
import type { ResizableHandle } from './resizable-handle.component';
import type { ResizablePanel } from './resizable-panel.component';

export interface PanelConfig {
  id: string;
  size: number;
}

export interface LayoutConfig {
  [splitId: string]: {
    direction: 'horizontal' | 'vertical';
    panels: PanelConfig[];
  };
}

/**
 * A handle member within a fused group
 */
interface HandleMember {
  handle: ResizableHandle;
  split: ResizableSplit;
  splitId: string;
  handleIndex: number;
  // Range on perpendicular axis (for visual unified handle)
  rangeStart: number;
  rangeEnd: number;
  // Initial panel sizes when this handle joined
  initialSizes: number[];
  // Delta (in pixels) that was already applied when this handle joined
  // For source handle this is 0, for fused handles it's the delta at fusion time
  deltaAtFusion: number;
}

/**
 * A group of fused handles that move together.
 * Handles fuse when they are:
 * 1. Same direction (both horizontal or both vertical)
 * 2. Adjacent on the perpendicular axis
 * 3. At the same position (within threshold)
 */
export interface HandleGroup {
  id: string;
  direction: 'horizontal' | 'vertical';
  // Position on main axis (X for vertical handles, Y for horizontal)
  position: number;
  // All handles in this fused group
  members: HandleMember[];
  // The unified visual element (created when group has 2+ members)
  unifiedHandle: HTMLElement | null;
}

/**
 * State for snap/attraction detection during drag
 */
interface SnapCandidate {
  handle: ResizableHandle;
  split: ResizableSplit;
  splitId: string;
  handleIndex: number;
  position: number;
  rangeStart: number;
  rangeEnd: number;
  // Timer for dwell-time fusion
  snapTimer: number | null;
  enteredAt: number;
}

interface DragState {
  sourceSplitId: string;
  sourceHandleIndex: number;
  sourceDirection: 'horizontal' | 'vertical';
  sourceHandle: ResizableHandle;
  // Current fused group (starts with just the source)
  currentGroup: HandleGroup;
  // Nearby handles that could snap/fuse
  snapCandidates: Map<string, SnapCandidate>;
  // Initial positions for all affected splits
  initialPositions: Map<string, number[]>;
  // Starting position of drag
  startPosition: number;
}

const SNAP_THRESHOLD = 2; // pixels - distance to trigger fusion (must be very close)
const SNAP_DWELL_TIME = 0; // ms - no dwell time, fuse immediately when aligned
const FUSION_THRESHOLD = 2; // pixels - distance to consider handles as fused
const ADJACENCY_GAP = 20; // pixels - tolerance for adjacency (handles separated by perpendicular handle)

class LayoutRegistry {
  private splits = new Map<string, ResizableSplit>();
  private dragState: DragState | null = null;
  // Persistent handle groups (survive between drags)
  private handleGroups = new Map<string, HandleGroup>();

  /** Register a split component */
  registerSplit(splitId: string, split: ResizableSplit): void {
    this.splits.set(splitId, split);
  }

  /** Unregister a split component */
  unregisterSplit(splitId: string): void {
    this.splits.delete(splitId);
    // Remove any groups that reference this split
    this.handleGroups.forEach((group, groupId) => {
      group.members = group.members.filter(m => m.splitId !== splitId);
      if (group.members.length === 0) {
        this.removeUnifiedHandle(group);
        this.handleGroups.delete(groupId);
      }
    });
  }

  /** Get a split by ID */
  getSplit(splitId: string): ResizableSplit | undefined {
    return this.splits.get(splitId);
  }

  /** Get all registered splits */
  getAllSplits(): ResizableSplit[] {
    return Array.from(this.splits.values());
  }

  /**
   * Start a drag operation.
   * If handles are already aligned, they start as a fused group.
   * During drag, nearby handles may also fuse into the group.
   */
  startDrag(
    splitId: string,
    handleIndex: number,
    direction: 'horizontal' | 'vertical',
    handle: ResizableHandle,
    enableGlue: boolean = true
  ): void {
    console.log(`[Fusion] === START DRAG === splitId=${splitId}, handleIndex=${handleIndex}, direction=${direction}, enableGlue=${enableGlue}`);
    console.log(`[Fusion] Registered splits: ${Array.from(this.splits.keys()).join(', ')}`);
    const sourceSplit = this.splits.get(splitId);
    if (!sourceSplit) {
      console.log(`[Fusion] ERROR: Split ${splitId} not found!`);
      return;
    }

    const handleRect = handle.getBoundingClientRect();
    const handlePos = handle.getCenterPosition();

    // Determine position and range based on direction
    // For horizontal splits (vertical handles): position is X, range is Y
    // For vertical splits (horizontal handles): position is Y, range is X
    const position = direction === 'horizontal' ? handlePos.x : handlePos.y;
    const rangeStart = direction === 'horizontal' ? handleRect.top : handleRect.left;
    const rangeEnd = direction === 'horizontal' ? handleRect.bottom : handleRect.right;

    // Get initial panel sizes for the source split
    const sourceInitialSizes = this.getPanelSizes(sourceSplit);

    // Create initial group with the source handle
    const currentGroup: HandleGroup = {
      id: `group-${Date.now()}`,
      direction,
      position,
      members: [{
        handle,
        split: sourceSplit,
        splitId,
        handleIndex,
        rangeStart,
        rangeEnd,
        initialSizes: sourceInitialSizes,
        deltaAtFusion: 0, // Source handle starts at 0 delta
      }],
      unifiedHandle: null,
    };

    // Store initial panel sizes
    const initialPositions = new Map<string, number[]>();
    initialPositions.set(splitId, sourceInitialSizes);

    // If glue is enabled, find already-aligned handles and add them to the group immediately
    if (enableGlue) {
      this.findAlreadyAlignedHandles(currentGroup, splitId, handleIndex, direction, handleRect, position, initialPositions);
    }

    this.dragState = {
      sourceSplitId: splitId,
      sourceHandleIndex: handleIndex,
      sourceDirection: direction,
      sourceHandle: handle,
      currentGroup,
      snapCandidates: new Map(),
      initialPositions,
      startPosition: position,
    };

    // If glue is enabled, find all potential snap candidates
    if (enableGlue) {
      this.findSnapCandidates();
    }
  }

  /**
   * Find handles that are already aligned with the source and add them to the group.
   * This ensures that previously fused handles stay fused on the next drag.
   */
  private findAlreadyAlignedHandles(
    currentGroup: HandleGroup,
    sourceSplitId: string,
    sourceHandleIndex: number,
    direction: 'horizontal' | 'vertical',
    sourceRect: DOMRect,
    sourcePosition: number,
    initialPositions: Map<string, number[]>
  ): void {
    const ALIGNED_THRESHOLD = 3; // pixels - must be very close to be considered "already aligned"

    this.splits.forEach((split, splitId) => {
      // Same direction only
      if (split.direction !== direction) return;

      const handles = split.getHandles();

      handles.forEach((handle, handleIndex) => {
        // Skip the source handle
        if (splitId === sourceSplitId && handleIndex === sourceHandleIndex) return;

        const handleRect = handle.getBoundingClientRect();
        const handlePos = handle.getCenterPosition();

        // Check adjacency on perpendicular axis
        let isAdjacent = false;
        let otherPosition: number;
        let rangeStart: number, rangeEnd: number;

        if (direction === 'horizontal') {
          rangeStart = handleRect.top;
          rangeEnd = handleRect.bottom;
          otherPosition = handlePos.x;
          isAdjacent = rangeStart <= (sourceRect.bottom + ADJACENCY_GAP) && rangeEnd >= (sourceRect.top - ADJACENCY_GAP);
        } else {
          rangeStart = handleRect.left;
          rangeEnd = handleRect.right;
          otherPosition = handlePos.y;
          isAdjacent = rangeStart <= (sourceRect.right + ADJACENCY_GAP) && rangeEnd >= (sourceRect.left - ADJACENCY_GAP);
        }

        // Check if aligned (very close position)
        const isAligned = Math.abs(otherPosition - sourcePosition) <= ALIGNED_THRESHOLD;

        if (isAdjacent && isAligned) {
          console.log(`[Fusion] Found already-aligned handle: ${splitId}[${handleIndex}] at pos ${otherPosition.toFixed(0)} (source at ${sourcePosition.toFixed(0)})`);

          const handleInitialSizes = this.getPanelSizes(split);

          currentGroup.members.push({
            handle,
            split,
            splitId,
            handleIndex,
            rangeStart,
            rangeEnd,
            initialSizes: handleInitialSizes,
            deltaAtFusion: 0, // Already aligned, so delta is 0
          });

          // Store initial sizes
          if (!initialPositions.has(splitId)) {
            initialPositions.set(splitId, handleInitialSizes);
          }

          // Mark as glued visually
          handle.isGlued = true;
        }
      });
    });

    if (currentGroup.members.length > 1) {
      console.log(`[Fusion] Started with ${currentGroup.members.length} already-fused handles`);
    }
  }

  /**
   * Find all handles that could potentially snap/fuse with the current group.
   * These are same-direction handles that are adjacent on the perpendicular axis.
   */
  private findSnapCandidates(): void {
    if (!this.dragState) return;

    const { sourceDirection, sourceSplitId, sourceHandleIndex } = this.dragState;
    const sourceHandle = this.dragState.sourceHandle;
    const sourceRect = sourceHandle.getBoundingClientRect();

    console.log(`[Fusion] Finding snap candidates. Source: ${sourceSplitId}[${sourceHandleIndex}], direction: ${sourceDirection}`);
    console.log(`[Fusion] Source rect: top=${sourceRect.top.toFixed(0)}, bottom=${sourceRect.bottom.toFixed(0)}, left=${sourceRect.left.toFixed(0)}, right=${sourceRect.right.toFixed(0)}`);
    console.log(`[Fusion] Total splits: ${this.splits.size}`);

    this.splits.forEach((split, splitId) => {
      console.log(`[Fusion] Checking split ${splitId}, direction: ${split.direction}`);

      // Same direction only
      if (split.direction !== sourceDirection) {
        console.log(`[Fusion] Skipping ${splitId} - different direction`);
        return;
      }

      const handles = split.getHandles();
      console.log(`[Fusion] Split ${splitId} has ${handles.length} handles`);

      handles.forEach((handle, handleIndex) => {
        // Skip the source handle
        if (splitId === sourceSplitId && handleIndex === sourceHandleIndex) {
          console.log(`[Fusion] Skipping source handle`);
          return;
        }

        const handleRect = handle.getBoundingClientRect();
        const handlePos = handle.getCenterPosition();

        console.log(`[Fusion] Handle ${splitId}[${handleIndex}] rect: top=${handleRect.top.toFixed(0)}, bottom=${handleRect.bottom.toFixed(0)}, left=${handleRect.left.toFixed(0)}, right=${handleRect.right.toFixed(0)}`);

        // Check adjacency on perpendicular axis
        // Two handles are adjacent if their ranges overlap or touch
        let isAdjacent = false;
        let rangeStart: number, rangeEnd: number, position: number;

        if (sourceDirection === 'horizontal') {
          // Vertical handles - check Y overlap (with tolerance for perpendicular handle gap)
          rangeStart = handleRect.top;
          rangeEnd = handleRect.bottom;
          position = handlePos.x;
          // Adjacent if Y ranges touch, overlap, OR are within ADJACENCY_GAP
          isAdjacent = rangeStart <= (sourceRect.bottom + ADJACENCY_GAP) && rangeEnd >= (sourceRect.top - ADJACENCY_GAP);
          console.log(`[Fusion] Y adjacency check: ${rangeStart} <= ${sourceRect.bottom + ADJACENCY_GAP} && ${rangeEnd} >= ${sourceRect.top - ADJACENCY_GAP} = ${isAdjacent}`);
        } else {
          // Horizontal handles - check X overlap (with tolerance for perpendicular handle gap)
          rangeStart = handleRect.left;
          rangeEnd = handleRect.right;
          position = handlePos.y;
          // Adjacent if X ranges touch, overlap, OR are within ADJACENCY_GAP
          isAdjacent = rangeStart <= (sourceRect.right + ADJACENCY_GAP) && rangeEnd >= (sourceRect.left - ADJACENCY_GAP);
          console.log(`[Fusion] X adjacency check: ${rangeStart} <= ${sourceRect.right + ADJACENCY_GAP} && ${rangeEnd} >= ${sourceRect.left - ADJACENCY_GAP} = ${isAdjacent}`);
        }

        if (isAdjacent) {
          const candidateKey = `${splitId}-${handleIndex}`;
          console.log(`[Fusion] ✓ Added candidate: ${candidateKey} at position ${position.toFixed(0)}`);
          this.dragState!.snapCandidates.set(candidateKey, {
            handle,
            split,
            splitId,
            handleIndex,
            position,
            rangeStart,
            rangeEnd,
            snapTimer: null,
            enteredAt: 0,
          });
        }
      });
    });

    console.log(`[Fusion] Found ${this.dragState.snapCandidates.size} snap candidates`);
  }

  /**
   * Update drag position and check for snap/fusion.
   * Called during drag-move.
   */
  updateDragPosition(currentPosition: number): void {
    if (!this.dragState) return;

    const { currentGroup, snapCandidates } = this.dragState;
    const deltaFromStart = currentPosition - this.dragState.startPosition;

    // Update group position
    currentGroup.position = this.dragState.startPosition + deltaFromStart;

    // Check each snap candidate
    snapCandidates.forEach((candidate, key) => {
      // Calculate distance between candidate's original position and our current position
      const distance = Math.abs(candidate.position - currentGroup.position);
      console.log(`[Fusion] Distance to ${key}: ${distance.toFixed(0)}px (candidate pos: ${candidate.position.toFixed(0)}, group pos: ${currentGroup.position.toFixed(0)})`);

      if (distance <= FUSION_THRESHOLD) {
        // Close enough - fuse immediately
        this.fuseCandidate(candidate, key);
      } else if (distance <= SNAP_THRESHOLD) {
        // In snap zone - start dwell timer if not already
        if (candidate.snapTimer === null) {
          candidate.enteredAt = Date.now();
          candidate.snapTimer = window.setTimeout(() => {
            // Check if still in range
            const currentDistance = Math.abs(candidate.position - currentGroup.position);
            if (currentDistance <= SNAP_THRESHOLD) {
              this.fuseCandidate(candidate, key);
            }
            candidate.snapTimer = null;
          }, SNAP_DWELL_TIME);
        }
      } else {
        // Out of snap zone - cancel timer
        if (candidate.snapTimer !== null) {
          clearTimeout(candidate.snapTimer);
          candidate.snapTimer = null;
        }
      }
    });

    // Update unified handle visual if we have fused handles
    this.updateUnifiedHandle();
  }

  /**
   * Fuse a snap candidate into the current group.
   */
  private fuseCandidate(candidate: SnapCandidate, candidateKey: string): void {
    if (!this.dragState) return;

    const { currentGroup, initialPositions, snapCandidates } = this.dragState;

    // Check if already in group
    const alreadyInGroup = currentGroup.members.some(
      m => m.splitId === candidate.splitId && m.handleIndex === candidate.handleIndex
    );
    if (alreadyInGroup) return;

    // Calculate how much to snap the candidate to align with the group
    // candidate.position is the candidate's original position
    // currentGroup.position is where the source handle is now
    const snapDelta = currentGroup.position - candidate.position;

    console.log(`[Fusion] Snap: groupPos=${currentGroup.position.toFixed(1)}, candidatePos=${candidate.position.toFixed(1)}, snapDelta=${snapDelta.toFixed(1)}`);

    // First, snap the candidate handle to align with the group position
    // This ensures both handles are at the exact same position
    if (Math.abs(snapDelta) > 0.5) {
      const candidateCurrentSizes = this.getPanelSizes(candidate.split);
      console.log(`[Fusion] Before snap sizes=[${candidateCurrentSizes.map(s => s.toFixed(1)).join(', ')}]`);
      candidate.split.applyDragFromInitial(snapDelta, candidate.handleIndex, candidateCurrentSizes);
      const sizesAfter = this.getPanelSizes(candidate.split);
      console.log(`[Fusion] After snap sizes=[${sizesAfter.map(s => s.toFixed(1)).join(', ')}]`);
    }

    // Now get the sizes AFTER snapping
    const candidateInitialSizes = this.getPanelSizes(candidate.split);

    // Calculate delta at fusion time (how much the source has moved since drag start)
    const currentDelta = currentGroup.position - this.dragState!.startPosition;

    // Add to group
    currentGroup.members.push({
      handle: candidate.handle,
      split: candidate.split,
      splitId: candidate.splitId,
      handleIndex: candidate.handleIndex,
      rangeStart: candidate.rangeStart,
      rangeEnd: candidate.rangeEnd,
      initialSizes: candidateInitialSizes,
      deltaAtFusion: currentDelta, // Remember how much delta was already applied
    });

    // Store initial sizes for this split
    if (!initialPositions.has(candidate.splitId)) {
      initialPositions.set(candidate.splitId, candidateInitialSizes);
    }

    console.log(`[Fusion] ✓ FUSED ${candidateKey}, snapped by ${snapDelta.toFixed(0)}px, deltaAtFusion=${currentDelta.toFixed(0)}px`);

    // Mark handle as glued visually
    candidate.handle.isGlued = true;

    // Remove from candidates
    snapCandidates.delete(candidateKey);

    // Clear any timer
    if (candidate.snapTimer !== null) {
      clearTimeout(candidate.snapTimer);
    }

    // Sort members by range for proper unified handle rendering
    this.sortGroupMembers(currentGroup);
  }

  /**
   * Sort group members by their range position for continuous visual handle.
   */
  private sortGroupMembers(group: HandleGroup): void {
    group.members.sort((a, b) => a.rangeStart - b.rangeStart);
  }

  /**
   * Create or update the unified visual handle for fused groups.
   */
  private updateUnifiedHandle(): void {
    if (!this.dragState) return;

    const { currentGroup, sourceDirection } = this.dragState;

    // Need at least 2 members for unified handle
    if (currentGroup.members.length < 2) {
      this.removeUnifiedHandle(currentGroup);
      return;
    }

    // Calculate unified handle bounds
    let minRange = Infinity;
    let maxRange = -Infinity;
    let avgPosition = 0;

    currentGroup.members.forEach(member => {
      minRange = Math.min(minRange, member.rangeStart);
      maxRange = Math.max(maxRange, member.rangeEnd);
      const pos = member.handle.getCenterPosition();
      avgPosition += sourceDirection === 'horizontal' ? pos.x : pos.y;
    });
    avgPosition /= currentGroup.members.length;

    // Create or update unified handle element
    if (!currentGroup.unifiedHandle) {
      currentGroup.unifiedHandle = this.createUnifiedHandleElement(sourceDirection);
      document.body.appendChild(currentGroup.unifiedHandle);
    }

    // Position the unified handle
    const handle = currentGroup.unifiedHandle;
    if (sourceDirection === 'horizontal') {
      // Vertical bar spanning Y range
      handle.style.left = `${avgPosition - 4}px`;
      handle.style.top = `${minRange}px`;
      handle.style.width = '8px';
      handle.style.height = `${maxRange - minRange}px`;
    } else {
      // Horizontal bar spanning X range
      handle.style.left = `${minRange}px`;
      handle.style.top = `${avgPosition - 4}px`;
      handle.style.width = `${maxRange - minRange}px`;
      handle.style.height = '8px';
    }
  }

  /**
   * Create the unified handle DOM element.
   */
  private createUnifiedHandleElement(direction: 'horizontal' | 'vertical'): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'resizable-unified-handle';
    el.style.cssText = `
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      background: var(--handle-glued-color, #4a90d9);
      opacity: 0.6;
      border-radius: 4px;
      transition: opacity 0.15s ease;
    `;
    return el;
  }

  /**
   * Remove the unified handle element.
   */
  private removeUnifiedHandle(group: HandleGroup): void {
    if (group.unifiedHandle) {
      group.unifiedHandle.remove();
      group.unifiedHandle = null;
    }
  }

  /** Get panel sizes as percentages for a split */
  private getPanelSizes(split: ResizableSplit): number[] {
    const panels = split.getPanels();
    return panels.map(panel => panel.currentSize);
  }

  /**
   * Propagate drag to all handles in the fused group.
   * Each member uses its own initialSizes and deltaAtFusion to apply the delta correctly.
   */
  propagateDrag(sourceSplitId: string, deltaPixels: number): void {
    if (!this.dragState || this.dragState.sourceSplitId !== sourceSplitId) return;

    const { currentGroup, sourceDirection } = this.dragState;

    // Propagate to all members except the source (source is handled by its own split)
    currentGroup.members.forEach(member => {
      if (member.splitId === sourceSplitId && member.handleIndex === this.dragState!.sourceHandleIndex) {
        return; // Skip source - it's already being moved
      }

      if (member.split.direction === sourceDirection) {
        // Calculate delta relative to when this handle was fused
        // deltaPixels is from drag start, but this handle joined later
        const relativeDelta = deltaPixels - member.deltaAtFusion;

        // Use member's initialSizes to apply delta from its own starting point
        member.split.applyDragFromInitial(relativeDelta, member.handleIndex, member.initialSizes);
      }
    });
  }

  /** End drag operation */
  endDrag(): void {
    if (!this.dragState) return;

    const { currentGroup, snapCandidates } = this.dragState;

    // Clear all snap timers
    snapCandidates.forEach(candidate => {
      if (candidate.snapTimer !== null) {
        clearTimeout(candidate.snapTimer);
      }
    });

    // Remove glued visual state from all group members
    currentGroup.members.forEach(member => {
      member.handle.isGlued = false;
    });

    // Remove unified handle
    this.removeUnifiedHandle(currentGroup);

    this.dragState = null;
  }

  /** Get the full layout configuration for saving */
  getLayoutConfig(): LayoutConfig {
    const config: LayoutConfig = {};

    this.splits.forEach((split, splitId) => {
      config[splitId] = split.getConfig();
    });

    return config;
  }

  /** Apply a saved layout configuration */
  applyLayoutConfig(config: LayoutConfig): void {
    Object.entries(config).forEach(([splitId, splitConfig]) => {
      const split = this.splits.get(splitId);
      if (split) {
        split.applyConfig(splitConfig);
      }
    });
  }

  /** Reset all splits to their initial flex-based sizes */
  resetLayout(): void {
    const HANDLE_SIZE = 8; // Must match CSS --handle-size

    this.splits.forEach(split => {
      const panels = split.getPanels();
      const handles = split.getHandles();
      const totalFlex = panels.reduce((sum, p) => sum + (p.flex || 1), 0);

      // Calculate handle space percentage
      const containerRect = split.getBoundingClientRect();
      const containerSize = split.direction === 'horizontal' ? containerRect.width : containerRect.height;
      const totalHandleSpace = handles.length * HANDLE_SIZE;
      const handlePercentage = containerSize > 0 ? (totalHandleSpace / containerSize) * 100 : 0;
      const availablePercent = 100 - handlePercentage;

      panels.forEach(panel => {
        const flex = panel.flex || 1;
        const percent = (flex / totalFlex) * availablePercent;
        panel.setSize(percent);
      });
    });
  }

  /**
   * Check if a handle has any adjacent handles at similar position.
   * Returns the list of handles that could fuse.
   */
  getAdjacentHandles(handle: ResizableHandle, splitId: string, handleIndex: number): {
    handle: ResizableHandle;
    split: ResizableSplit;
    splitId: string;
    handleIndex: number;
  }[] {
    const handleRect = handle.getBoundingClientRect();
    const handlePos = handle.getCenterPosition();
    const handleDirection = handle.direction;
    const adjacentHandles: {
      handle: ResizableHandle;
      split: ResizableSplit;
      splitId: string;
      handleIndex: number;
    }[] = [];

    this.splits.forEach((split, otherSplitId) => {
      // Same direction only for fusion
      if (split.direction !== handleDirection) return;

      const handles = split.getHandles();
      handles.forEach((otherHandle, otherIndex) => {
        // Skip self
        if (otherSplitId === splitId && otherIndex === handleIndex) return;

        const otherRect = otherHandle.getBoundingClientRect();
        const otherPos = otherHandle.getCenterPosition();

        // Check adjacency and position
        let isAdjacent = false;
        let positionMatch = false;

        if (handleDirection === 'horizontal') {
          // Check Y overlap (adjacent)
          isAdjacent = otherRect.top <= handleRect.bottom && otherRect.bottom >= handleRect.top;
          // Check X position match
          positionMatch = Math.abs(otherPos.x - handlePos.x) < SNAP_THRESHOLD;
        } else {
          // Check X overlap (adjacent)
          isAdjacent = otherRect.left <= handleRect.right && otherRect.right >= handleRect.left;
          // Check Y position match
          positionMatch = Math.abs(otherPos.y - handlePos.y) < SNAP_THRESHOLD;
        }

        if (isAdjacent && positionMatch) {
          adjacentHandles.push({
            handle: otherHandle,
            split,
            splitId: otherSplitId,
            handleIndex: otherIndex,
          });
        }
      });
    });

    return adjacentHandles;
  }

  /**
   * Check if Ctrl is currently pressed (for showing individual handles).
   * This is tracked by the handles themselves.
   */
  isCtrlPressed(): boolean {
    return this._ctrlPressed;
  }

  private _ctrlPressed = false;

  /** Update Ctrl key state - called by handles on keydown/keyup */
  setCtrlPressed(pressed: boolean): void {
    this._ctrlPressed = pressed;
  }
}

// Singleton instance
export const ResizableLayoutRegistry = new LayoutRegistry();

// Also export the class for testing
export { LayoutRegistry };
