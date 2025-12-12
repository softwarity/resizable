/**
 * Grid Layout Service
 *
 * Manages the grid state: rails, cells, and their relationships.
 * Handles rail dragging, cell splitting, and constraint calculation.
 */

import {
  Rail,
  Cell,
  GridConfig,
  RailAttachments,
  RailConstraints,
  generateId,
} from './grid.model';

export class GridService {
  private rails: Map<string, Rail> = new Map();
  private cells: Map<string, Cell> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor(config?: GridConfig) {
    if (config) {
      this.loadConfig(config);
    }
  }

  // ============ Configuration ============

  /**
   * Load a grid configuration
   */
  loadConfig(config: GridConfig): void {
    this.rails.clear();
    this.cells.clear();

    config.rails.forEach(rail => this.rails.set(rail.id, { ...rail }));
    config.cells.forEach(cell => this.cells.set(cell.id, { ...cell }));

    this.notifyListeners();
  }

  /**
   * Get current configuration for saving
   */
  getConfig(): GridConfig {
    return {
      rails: Array.from(this.rails.values()),
      cells: Array.from(this.cells.values()),
    };
  }

  /**
   * Subscribe to changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  // ============ Getters ============

  getRail(id: string): Rail | undefined {
    return this.rails.get(id);
  }

  getCell(id: string): Cell | undefined {
    return this.cells.get(id);
  }

  getAllRails(): Rail[] {
    return Array.from(this.rails.values());
  }

  getAllCells(): Cell[] {
    return Array.from(this.cells.values());
  }

  /**
   * Get all non-fixed rails (the ones that can be dragged)
   */
  getDraggableRails(): Rail[] {
    return this.getAllRails().filter(r => !r.fixed);
  }

  /**
   * Get cells attached to a rail
   */
  getRailAttachments(railId: string): RailAttachments | null {
    const rail = this.rails.get(railId);
    if (!rail) return null;

    const cellsBefore: Cell[] = [];
    const cellsAfter: Cell[] = [];

    this.cells.forEach(cell => {
      if (rail.direction === 'vertical') {
        // Vertical rail: cells use it as left or right edge
        if (cell.rightRail === railId) cellsBefore.push(cell);
        if (cell.leftRail === railId) cellsAfter.push(cell);
      } else {
        // Horizontal rail: cells use it as top or bottom edge
        if (cell.bottomRail === railId) cellsBefore.push(cell);
        if (cell.topRail === railId) cellsAfter.push(cell);
      }
    });

    return { rail, cellsBefore, cellsAfter };
  }

  /**
   * Get the bounds of a cell in percentages
   */
  getCellBounds(cellId: string): { left: number; right: number; top: number; bottom: number } | null {
    const cell = this.cells.get(cellId);
    if (!cell) return null;

    const leftRail = this.rails.get(cell.leftRail);
    const rightRail = this.rails.get(cell.rightRail);
    const topRail = this.rails.get(cell.topRail);
    const bottomRail = this.rails.get(cell.bottomRail);

    if (!leftRail || !rightRail || !topRail || !bottomRail) return null;

    return {
      left: leftRail.position,
      right: rightRail.position,
      top: topRail.position,
      bottom: bottomRail.position,
    };
  }

  // ============ Rail Movement ============

  /**
   * Calculate constraints for a rail's movement
   */
  getRailConstraints(railId: string, containerSize: number, minCellSize: number = 50): RailConstraints {
    const rail = this.rails.get(railId);
    if (!rail || rail.fixed) {
      const pos = rail?.position ?? 0;
      return { min: pos, max: pos };
    }

    const minPercent = (minCellSize / containerSize) * 100;
    let min = 0;
    let max = 100;

    // Find constraints from attached cells
    this.cells.forEach(cell => {
      const bounds = this.getCellBounds(cell.id);
      if (!bounds) return;

      if (rail.direction === 'vertical') {
        // This rail is a vertical line (X position)
        if (cell.rightRail === railId) {
          // Cell is to the left of this rail - rail can't go past cell's left + minSize
          min = Math.max(min, bounds.left + minPercent);
        }
        if (cell.leftRail === railId) {
          // Cell is to the right of this rail - rail can't go past cell's right - minSize
          max = Math.min(max, bounds.right - minPercent);
        }
      } else {
        // This rail is a horizontal line (Y position)
        if (cell.bottomRail === railId) {
          // Cell is above this rail
          min = Math.max(min, bounds.top + minPercent);
        }
        if (cell.topRail === railId) {
          // Cell is below this rail
          max = Math.min(max, bounds.bottom - minPercent);
        }
      }
    });

    return { min, max };
  }

  /**
   * Move a single rail to a new position (clamped to constraints)
   * This is used for "solo" mode (Ctrl+drag) - moves only this rail without pushing others
   */
  moveRail(railId: string, newPosition: number, containerSize: number, minCellSize: number = 50): boolean {
    const rail = this.rails.get(railId);
    if (!rail || rail.fixed) return false;

    // Solo mode always uses constraints (no push behavior)
    // This allows individual rail movement even when cells are collapsed
    const constraints = this.getRailConstraints(railId, containerSize, minCellSize);
    const clampedPosition = Math.max(constraints.min, Math.min(constraints.max, newPosition));

    if (rail.position !== clampedPosition) {
      rail.position = clampedPosition;
      this.notifyListeners();
      return true;
    }
    return false;
  }

  // ============ Cell Operations ============

  /**
   * Split a cell horizontally (creates a new horizontal rail)
   * Returns the ID of the new cell (bottom half)
   */
  splitCellHorizontal(cellId: string, splitPercent: number = 50): string | null {
    const cell = this.cells.get(cellId);
    if (!cell) return null;

    const bounds = this.getCellBounds(cellId);
    if (!bounds) return null;

    // Calculate new rail position
    const newRailPosition = bounds.top + (bounds.bottom - bounds.top) * (splitPercent / 100);

    // Create new horizontal rail - bounded by the cell's left and right rails
    // This ensures the rail only affects this cell, not adjacent cells
    const newRailId = generateId('h-');
    const newRail: Rail = {
      id: newRailId,
      direction: 'horizontal',
      position: newRailPosition,
      fixed: false,
      startBound: cell.leftRail,  // Left boundary
      endBound: cell.rightRail,   // Right boundary
    };
    this.rails.set(newRailId, newRail);

    // Create new cell (bottom half)
    const newCellId = generateId('cell-');
    const newCell: Cell = {
      id: newCellId,
      leftRail: cell.leftRail,
      rightRail: cell.rightRail,
      topRail: newRailId,
      bottomRail: cell.bottomRail,
    };
    this.cells.set(newCellId, newCell);

    // Update original cell (now top half)
    cell.bottomRail = newRailId;

    this.notifyListeners();
    return newCellId;
  }

  /**
   * Split a cell vertically (creates a new vertical rail)
   * Returns the ID of the new cell (right half)
   */
  splitCellVertical(cellId: string, splitPercent: number = 50): string | null {
    const cell = this.cells.get(cellId);
    if (!cell) return null;

    const bounds = this.getCellBounds(cellId);
    if (!bounds) return null;

    // Calculate new rail position
    const newRailPosition = bounds.left + (bounds.right - bounds.left) * (splitPercent / 100);

    // Create new vertical rail - bounded by the cell's top and bottom rails
    // This ensures the rail only affects this cell, not adjacent cells
    const newRailId = generateId('v-');
    const newRail: Rail = {
      id: newRailId,
      direction: 'vertical',
      position: newRailPosition,
      fixed: false,
      startBound: cell.topRail,    // Top boundary
      endBound: cell.bottomRail,   // Bottom boundary
    };
    this.rails.set(newRailId, newRail);

    // Create new cell (right half)
    const newCellId = generateId('cell-');
    const newCell: Cell = {
      id: newCellId,
      leftRail: newRailId,
      rightRail: cell.rightRail,
      topRail: cell.topRail,
      bottomRail: cell.bottomRail,
    };
    this.cells.set(newCellId, newCell);

    // Update original cell (now left half)
    cell.rightRail = newRailId;

    this.notifyListeners();
    return newCellId;
  }

  /**
   * Remove a cell and extend neighbors to fill the space
   * Returns true if successful
   */
  removeCell(cellId: string): boolean {
    const cell = this.cells.get(cellId);
    if (!cell) return false;

    // Find a neighbor to extend
    // Priority: right, left, bottom, top
    const bounds = this.getCellBounds(cellId);
    if (!bounds) return false;

    let extendedNeighbor = false;

    // Try to find a cell to the right
    this.cells.forEach(other => {
      if (extendedNeighbor || other.id === cellId) return;
      const otherBounds = this.getCellBounds(other.id);
      if (!otherBounds) return;

      // Check if 'other' is directly to the right
      if (other.leftRail === cell.rightRail &&
          otherBounds.top === bounds.top &&
          otherBounds.bottom === bounds.bottom) {
        other.leftRail = cell.leftRail;
        extendedNeighbor = true;
      }
    });

    if (!extendedNeighbor) {
      // Try left
      this.cells.forEach(other => {
        if (extendedNeighbor || other.id === cellId) return;
        const otherBounds = this.getCellBounds(other.id);
        if (!otherBounds) return;

        if (other.rightRail === cell.leftRail &&
            otherBounds.top === bounds.top &&
            otherBounds.bottom === bounds.bottom) {
          other.rightRail = cell.rightRail;
          extendedNeighbor = true;
        }
      });
    }

    if (!extendedNeighbor) {
      // Try bottom
      this.cells.forEach(other => {
        if (extendedNeighbor || other.id === cellId) return;
        const otherBounds = this.getCellBounds(other.id);
        if (!otherBounds) return;

        if (other.topRail === cell.bottomRail &&
            otherBounds.left === bounds.left &&
            otherBounds.right === bounds.right) {
          other.topRail = cell.topRail;
          extendedNeighbor = true;
        }
      });
    }

    if (!extendedNeighbor) {
      // Try top
      this.cells.forEach(other => {
        if (extendedNeighbor || other.id === cellId) return;
        const otherBounds = this.getCellBounds(other.id);
        if (!otherBounds) return;

        if (other.bottomRail === cell.topRail &&
            otherBounds.left === bounds.left &&
            otherBounds.right === bounds.right) {
          other.bottomRail = cell.bottomRail;
          extendedNeighbor = true;
        }
      });
    }

    if (!extendedNeighbor) {
      // Can't remove this cell - it's the only one or no valid neighbor
      return false;
    }

    // Remove the cell
    this.cells.delete(cellId);

    // Clean up orphaned rails
    this.cleanupOrphanedRails();

    this.notifyListeners();
    return true;
  }

  /**
   * Remove rails that are no longer attached to any cells
   */
  private cleanupOrphanedRails(): void {
    const usedRails = new Set<string>();

    this.cells.forEach(cell => {
      usedRails.add(cell.leftRail);
      usedRails.add(cell.rightRail);
      usedRails.add(cell.topRail);
      usedRails.add(cell.bottomRail);
    });

    this.rails.forEach((rail, id) => {
      if (!usedRails.has(id) && !rail.fixed) {
        this.rails.delete(id);
      }
    });
  }

  /**
   * Get rails that are aligned (same position) and adjacent (share a bound)
   * This is used to find rails that CAN be moved together
   */
  getAlignedRails(railId: string, tolerance: number = 1): Rail[] {
    const sourceRail = this.rails.get(railId);
    if (!sourceRail) return [];

    const aligned: Rail[] = [sourceRail];

    this.rails.forEach(rail => {
      if (rail.id === railId) return;
      if (rail.direction !== sourceRail.direction) return;
      if (Math.abs(rail.position - sourceRail.position) <= tolerance) {
        aligned.push(rail);
      }
    });

    return aligned;
  }

  /**
   * Get the visual bounds of a rail segment in percentages
   */
  getRailBounds(railId: string): { start: number; end: number } | null {
    const rail = this.rails.get(railId);
    if (!rail) return null;

    let start = 0;
    let end = 100;

    if (rail.startBound) {
      const startRail = this.rails.get(rail.startBound);
      if (startRail) start = startRail.position;
    }

    if (rail.endBound) {
      const endRail = this.rails.get(rail.endBound);
      if (endRail) end = endRail.position;
    }

    return { start, end };
  }

  /**
   * Find all rails that form a continuous aligned line with the given rail.
   * Uses transitive search: if A is adjacent to B and B is adjacent to C,
   * then A, B, C are all part of the same group.
   *
   * Two rails are considered aligned if:
   * 1. Same direction (both vertical or both horizontal)
   * 2. Same position (within tolerance)
   * 3. Adjacent in the perpendicular axis (one ends where other starts)
   */
  getAdjacentAlignedRails(railId: string, tolerance: number = 1): Rail[] {
    const sourceRail = this.rails.get(railId);
    if (!sourceRail) return [];

    // Find all rails at the same position with same direction
    const alignedRails: Rail[] = [];
    this.rails.forEach(rail => {
      if (rail.direction !== sourceRail.direction) return;
      if (Math.abs(rail.position - sourceRail.position) > tolerance) return;
      alignedRails.push(rail);
    });

    if (alignedRails.length <= 1) return alignedRails;

    // Build adjacency graph
    const isAdjacent = (r1: Rail, r2: Rail): boolean => {
      // First check: do they share a bound? (most reliable)
      if (r1.endBound && r1.endBound === r2.startBound) return true;
      if (r1.startBound && r1.startBound === r2.endBound) return true;
      if (r2.endBound && r2.endBound === r1.startBound) return true;
      if (r2.startBound && r2.startBound === r1.endBound) return true;

      // Fallback: check numeric bounds
      const bounds1 = this.getRailBounds(r1.id);
      const bounds2 = this.getRailBounds(r2.id);
      if (!bounds1 || !bounds2) return false;

      // Check if rails touch (one ends where the other starts)
      return (
        Math.abs(bounds1.end - bounds2.start) < tolerance ||
        Math.abs(bounds1.start - bounds2.end) < tolerance
      );
    };

    // BFS to find all connected rails starting from sourceRail
    const visited = new Set<string>();
    const queue: Rail[] = [sourceRail];
    const connected: Rail[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      connected.push(current);

      // Find all adjacent rails not yet visited
      for (const rail of alignedRails) {
        if (!visited.has(rail.id) && isAdjacent(current, rail)) {
          queue.push(rail);
        }
      }
    }

    return connected;
  }

  /**
   * Swap the positions of two cells (exchange their rail references)
   */
  swapCells(cellId1: string, cellId2: string): boolean {
    const cell1 = this.cells.get(cellId1);
    const cell2 = this.cells.get(cellId2);
    if (!cell1 || !cell2) return false;

    // Swap rail references
    const temp = {
      leftRail: cell1.leftRail,
      rightRail: cell1.rightRail,
      topRail: cell1.topRail,
      bottomRail: cell1.bottomRail,
    };

    cell1.leftRail = cell2.leftRail;
    cell1.rightRail = cell2.rightRail;
    cell1.topRail = cell2.topRail;
    cell1.bottomRail = cell2.bottomRail;

    cell2.leftRail = temp.leftRail;
    cell2.rightRail = temp.rightRail;
    cell2.topRail = temp.topRail;
    cell2.bottomRail = temp.bottomRail;

    this.notifyListeners();
    return true;
  }

  /**
   * Move multiple rails together (for synchronized movement)
   * When minCellSize is 0, rails can be pushed to expand collapsed cells
   */
  moveRails(railIds: string[], newPosition: number, containerSize: number, minCellSize: number = 50): boolean {
    if (minCellSize > 0) {
      // Standard behavior with minimum cell size constraint
      let minConstraint = 0;
      let maxConstraint = 100;

      for (const railId of railIds) {
        const constraints = this.getRailConstraints(railId, containerSize, minCellSize);
        minConstraint = Math.max(minConstraint, constraints.min);
        maxConstraint = Math.min(maxConstraint, constraints.max);
      }

      const clampedPosition = Math.max(minConstraint, Math.min(maxConstraint, newPosition));

      let moved = false;
      for (const railId of railIds) {
        const rail = this.rails.get(railId);
        if (rail && !rail.fixed && rail.position !== clampedPosition) {
          rail.position = clampedPosition;
          moved = true;
        }
      }

      if (moved) {
        this.notifyListeners();
      }

      return moved;
    }

    // When minCellSize is 0: push stacked rails to allow expanding collapsed cells
    return this.moveRailsWithPush(railIds, newPosition, containerSize);
  }

  /**
   * Move rails and push any stacked rails in the direction of movement.
   * This allows expanding cells that were collapsed to 0 size.
   */
  private moveRailsWithPush(railIds: string[], newPosition: number, containerSize: number): boolean {
    // Get the current position of the rails (they should all be at the same position)
    const firstRail = this.rails.get(railIds[0]);
    if (!firstRail) return false;

    const currentPosition = firstRail.position;
    const movingRight = newPosition > currentPosition; // or down for horizontal rails
    const direction = firstRail.direction;

    // Calculate constraints from all rails being moved
    // Even with minCellSize=0, we still need to respect cell boundaries
    let minConstraint = 0;
    let maxConstraint = 100;

    for (const railId of railIds) {
      // Use minCellSize=0 to allow collapsing cells fully
      const constraints = this.getRailConstraints(railId, containerSize, 0);
      minConstraint = Math.max(minConstraint, constraints.min);
      maxConstraint = Math.min(maxConstraint, constraints.max);
    }

    // Clamp to valid range respecting constraints
    newPosition = Math.max(minConstraint, Math.min(maxConstraint, newPosition));

    // Find all rails that need to be pushed (currently disabled - returns empty)
    const stackedRails = this.findStackedRailsInPath(railIds, currentPosition, newPosition, direction);

    // Sort rails by position in the direction of movement
    // When moving right/down, process from the rail closest to newPosition first
    stackedRails.sort((a, b) => {
      const posA = this.rails.get(a)?.position ?? 0;
      const posB = this.rails.get(b)?.position ?? 0;
      return movingRight ? posB - posA : posA - posB;
    });

    // Move all rails, pushing any that are in the way
    let moved = false;

    // First, move any stacked rails that are in the path
    for (const railId of stackedRails) {
      if (railIds.includes(railId)) continue; // Skip the rails we're directly moving

      const rail = this.rails.get(railId);
      if (!rail || rail.fixed) continue;

      // This rail is stacked, move it to make room
      if (rail.position !== newPosition) {
        rail.position = newPosition;
        moved = true;
      }
    }

    // Then move the primary rails
    for (const railId of railIds) {
      const rail = this.rails.get(railId);
      if (rail && !rail.fixed && rail.position !== newPosition) {
        rail.position = newPosition;
        moved = true;
      }
    }

    if (moved) {
      this.notifyListeners();
    }

    return moved;
  }

  /**
   * Find rails that are stacked with the moving rails (same position, same aligned group).
   * Only returns rails that are PART OF the same aligned group - not independent rails
   * that happen to be at the same position.
   *
   * NOTE: This function now returns EMPTY - we no longer automatically push other rails.
   * The push behavior was causing unwanted "fusion" when a rail approached another.
   * If we need push behavior, it should be explicitly requested via a different mechanism.
   */
  private findStackedRailsInPath(
    _movingRailIds: string[],
    _currentPos: number,
    _targetPos: number,
    _direction: 'vertical' | 'horizontal'
  ): string[] {
    // DISABLED: Do not automatically push other rails.
    // When user drags rail A toward rail B, rail B should NOT be pushed.
    // This was causing unwanted fusion behavior.
    return [];
  }

  /**
   * Count total cells attached to a rail (before + after)
   */
  getRailCellCount(railId: string): number {
    const attachments = this.getRailAttachments(railId);
    if (!attachments) return 0;
    return attachments.cellsBefore.length + attachments.cellsAfter.length;
  }

  /**
   * Get cells that have zero or near-zero size (collapsed)
   */
  getCollapsedCells(tolerance: number = 0.5): Cell[] {
    const collapsed: Cell[] = [];

    this.cells.forEach(cell => {
      const bounds = this.getCellBounds(cell.id);
      if (!bounds) return;

      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;

      if (width <= tolerance || height <= tolerance) {
        collapsed.push(cell);
      }
    });

    return collapsed;
  }

  /**
   * Check if a rail can be moved independently without creating visual aberrations.
   *
   * A rail segment can move independently if at EACH of its endpoints,
   * there are perpendicular rails going in BOTH directions (left+right or up+down).
   *
   * @param railId The rail to check
   * @returns true if the rail can be moved without creating aberrations
   */
  canRailMoveIndependently(railId: string): boolean {
    const rail = this.rails.get(railId);
    if (!rail || rail.fixed) return false;

    // Check start endpoint
    if (!this.canRailMoveAtEndpoint(rail, 'start')) {
      return false;
    }

    // Check end endpoint
    if (!this.canRailMoveAtEndpoint(rail, 'end')) {
      return false;
    }

    return true;
  }

  /**
   * Check if a group of aligned rails can move together without creating visual aberrations.
   *
   * A group can move if at its OUTER endpoints (the start of the first rail and
   * the end of the last rail), there are perpendicular rails going in BOTH directions.
   *
   * @param railId Any rail in the group
   * @returns true if the group can move
   */
  canAlignedGroupMove(railId: string): boolean {
    const rail = this.rails.get(railId);
    if (!rail || rail.fixed) return false;

    // Get all rails in the aligned group
    const alignedRails = this.getAdjacentAlignedRails(railId, 1);
    if (alignedRails.length === 0) return false;

    // Find the outer endpoints of the group
    // Sort rails by their bounds to find first and last
    const railsWithBounds: { rail: Rail; start: number; end: number }[] = [];
    for (const r of alignedRails) {
      const bounds = this.getRailBounds(r.id);
      if (bounds) {
        railsWithBounds.push({ rail: r, start: bounds.start, end: bounds.end });
      }
    }

    if (railsWithBounds.length === 0) return false;

    // Sort by start position
    railsWithBounds.sort((a, b) => a.start - b.start);

    // The first rail (smallest start) defines the group's start endpoint
    const firstRail = railsWithBounds[0].rail;
    // The last rail (largest end) defines the group's end endpoint
    const lastRail = railsWithBounds.reduce((max, curr) => curr.end > max.end ? curr : max, railsWithBounds[0]).rail;

    // Check if the group's start endpoint allows movement
    if (!this.canRailMoveAtEndpoint(firstRail, 'start')) {
      return false;
    }

    // Check if the group's end endpoint allows movement
    if (!this.canRailMoveAtEndpoint(lastRail, 'end')) {
      return false;
    }

    return true;
  }

  /**
   * Check if perpendicular rails at a given endpoint allow this rail to move.
   *
   * At the endpoint, there must be perpendicular rails departing in BOTH directions.
   *
   * The endpoint is defined by the rail's startBound or endBound.
   * We get the actual position of that bound rail and look for perpendicular rails
   * that START, END, or PASS THROUGH our rail's position.
   */
  private canRailMoveAtEndpoint(rail: Rail, endpoint: 'start' | 'end'): boolean {
    const boundRailId = endpoint === 'start' ? rail.startBound : rail.endBound;

    // If no bound, we're at a fixed edge (0% or 100%) - OK
    if (!boundRailId) return true;

    const boundRail = this.rails.get(boundRailId);
    if (!boundRail) return true;

    // If bound rail is fixed, it spans the full extent - OK
    if (boundRail.fixed) return true;

    // The endpoint is at position boundRail.position on the perpendicular axis
    // We need perpendicular rails at that position that depart from rail.position
    const endpointPosition = boundRail.position;  // Where the endpoint is (on perp axis)
    const ourPosition = rail.position;            // Our position (on our axis)
    const tolerance = 0.5;

    let hasRailGoingNegative = false;
    let hasRailGoingPositive = false;

    this.rails.forEach(r => {
      // Must be same direction as boundRail (perpendicular to our rail)
      if (r.direction !== boundRail.direction) return;

      // Must be at the same perpendicular position as the endpoint
      if (Math.abs(r.position - endpointPosition) > tolerance) return;

      // Get bounds of this perpendicular rail
      const rBounds = this.getRailBounds(r.id);
      if (!rBounds) return;

      // Check if this rail starts, ends, or passes through our position
      const startsAtOurPosition = Math.abs(rBounds.start - ourPosition) <= tolerance;
      const endsAtOurPosition = Math.abs(rBounds.end - ourPosition) <= tolerance;
      const passesThroughOurPosition = rBounds.start < ourPosition - tolerance && rBounds.end > ourPosition + tolerance;

      if (startsAtOurPosition) {
        // Rail starts at our position -> goes in positive direction
        hasRailGoingPositive = true;
      }
      if (endsAtOurPosition) {
        // Rail ends at our position -> goes in negative direction
        hasRailGoingNegative = true;
      }
      if (passesThroughOurPosition) {
        // Rail passes through our position -> goes in BOTH directions
        hasRailGoingNegative = true;
        hasRailGoingPositive = true;
      }
    });

    return hasRailGoingNegative && hasRailGoingPositive;
  }

  /**
   * Check if a single rail can be moved in "solo mode" (CTRL+drag).
   * In solo mode, only THIS rail moves, not its aligned neighbors.
   *
   * A rail can ONLY move solo if it spans the FULL extent (0% to 100%)
   * by itself. If it's part of a group of aligned rails, moving it solo
   * would create a visual "hole" because there's no rail on the other side.
   *
   * Example: In a 2x2 grid with aligned horizontal rails at 50%:
   * - Each rail covers only 50% (0-50% or 50-100%)
   * - Moving one solo would leave a gap where the other rail isn't
   * - So solo mode is NOT allowed
   *
   * But if a rail spans the full width/height (like after splitting one segment):
   * - That rail covers 0-100% by itself
   * - Moving it solo is fine because there's no gap
   *
   * @param railId The rail to check
   * @returns true if the rail can be moved in solo mode
   */
  canRailMoveSolo(railId: string): boolean {
    const rail = this.rails.get(railId);
    if (!rail || rail.fixed) return false;

    const bounds = this.getRailBounds(railId);
    if (!bounds) return false;

    // A rail can move solo ONLY if it spans the full extent by itself
    const tolerance = 0.5;
    return bounds.start <= tolerance && bounds.end >= 100 - tolerance;
  }

  /**
   * Check if a set of rails cover the full extent (0% to 100%) in the perpendicular axis.
   * The rails must form a continuous line with no gaps.
   */
  private doRailsCoverFullExtent(rails: Rail[]): boolean {
    if (rails.length === 0) return false;

    // Get bounds for each rail and collect all segments
    const segments: { start: number; end: number }[] = [];
    for (const rail of rails) {
      const bounds = this.getRailBounds(rail.id);
      if (!bounds) return false;
      segments.push({ start: bounds.start, end: bounds.end });
    }

    // Sort segments by start position
    segments.sort((a, b) => a.start - b.start);

    // Check if segments cover 0% to 100% with no gaps
    // First segment must start at 0 (with tolerance)
    const tolerance = 0.5; // 0.5% tolerance
    if (segments[0].start > tolerance) {
      return false; // Doesn't start at 0%
    }

    // Walk through segments and check for gaps
    let currentEnd = segments[0].end;
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      // Check if there's a gap between current end and next start
      if (seg.start > currentEnd + tolerance) {
        return false; // Gap detected
      }
      currentEnd = Math.max(currentEnd, seg.end);
    }

    // Last segment must end at 100% (with tolerance)
    if (currentEnd < 100 - tolerance) {
      return false; // Doesn't end at 100%
    }

    return true;
  }

  /**
   * Find rails that could be fused with the given rail (same direction, could form continuous line)
   * Returns rails that are within the fusion zone
   * @param railId The rail being dragged
   * @param fusionZonePercent The size of the fusion zone in percentage (e.g., 2 = 2%)
   * @returns Array of { rail, distance } sorted by distance
   */
  getFusionCandidates(railId: string, fusionZonePercent: number = 2): { rail: Rail; distance: number }[] {
    const sourceRail = this.rails.get(railId);
    if (!sourceRail || sourceRail.fixed) return [];

    const candidates: { rail: Rail; distance: number }[] = [];
    const sourceBounds = this.getRailBounds(railId);
    if (!sourceBounds) return [];

    this.rails.forEach(rail => {
      // Skip same rail, different direction, or fixed rails
      if (rail.id === railId || rail.direction !== sourceRail.direction || rail.fixed) return;

      // Calculate distance between positions first
      const distance = Math.abs(rail.position - sourceRail.position);

      // Skip if outside fusion zone
      // NOTE: We allow distance=0 (perfectly aligned) because the rail might not yet
      // be in our aligned group - fusion will snap them together
      if (distance > fusionZonePercent) return;

      // Check if rails could form a continuous line (adjacent in the perpendicular axis)
      // This means their segments touch or share a boundary
      const targetBounds = this.getRailBounds(rail.id);
      if (!targetBounds) return;

      // Check adjacency: segments touch at their boundaries
      const tolerance = 1; // 1% tolerance for adjacency
      const isAdjacent =
        // One rail's end touches another's start (allowing for some tolerance)
        Math.abs(sourceBounds.end - targetBounds.start) < tolerance ||
        Math.abs(sourceBounds.start - targetBounds.end) < tolerance ||
        // Or they share a boundary rail
        sourceRail.startBound === rail.endBound ||
        sourceRail.endBound === rail.startBound ||
        // Or they overlap in the perpendicular axis
        (sourceBounds.start < targetBounds.end && sourceBounds.end > targetBounds.start);

      if (!isAdjacent) return;

      candidates.push({ rail, distance });
    });

    // Sort by distance (closest first)
    return candidates.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Fuse a rail with another (set them to the same position)
   * @param sourceRailId The rail being dragged
   * @param targetRailId The rail to fuse with
   * @returns true if fusion happened
   */
  fuseRails(sourceRailId: string, targetRailId: string): boolean {
    const sourceRail = this.rails.get(sourceRailId);
    const targetRail = this.rails.get(targetRailId);

    if (!sourceRail || !targetRail) return false;
    if (sourceRail.direction !== targetRail.direction) return false;
    if (sourceRail.fixed) return false;

    // Move source to target's position
    if (sourceRail.position !== targetRail.position) {
      sourceRail.position = targetRail.position;
      this.notifyListeners();
      return true;
    }
    return false;
  }
}

// Singleton instance for global access
let gridServiceInstance: GridService | null = null;

export function getGridService(): GridService {
  if (!gridServiceInstance) {
    gridServiceInstance = new GridService();
  }
  return gridServiceInstance;
}

export function resetGridService(): void {
  gridServiceInstance = null;
}
