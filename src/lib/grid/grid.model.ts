/**
 * Grid Layout Model
 *
 * A grid is defined by:
 * - Rails: vertical and horizontal lines at specific positions (%)
 * - Cells: rectangles bounded by 4 rails (left, right, top, bottom)
 *
 * Rails can be dragged to resize all cells attached to them.
 * Cells can be split to create new rails.
 */

/**
 * A rail is a line segment (vertical or horizontal) at a specific position.
 * Each rail has bounds defined by perpendicular rails.
 * Multiple cells can be attached to the same rail.
 */
export interface Rail {
  id: string;
  /** 'vertical' rails have an X position, 'horizontal' rails have a Y position */
  direction: 'vertical' | 'horizontal';
  /** Position in percentage (0-100) */
  position: number;
  /** Fixed rails (edges at 0% and 100%) cannot be moved */
  fixed: boolean;
  /**
   * For vertical rails: ID of the horizontal rail where this segment starts (top)
   * For horizontal rails: ID of the vertical rail where this segment starts (left)
   * If undefined, starts at 0%
   */
  startBound?: string;
  /**
   * For vertical rails: ID of the horizontal rail where this segment ends (bottom)
   * For horizontal rails: ID of the vertical rail where this segment ends (right)
   * If undefined, ends at 100%
   */
  endBound?: string;
}

/**
 * A cell is a rectangle bounded by 4 rails.
 */
export interface Cell {
  id: string;
  /** ID of the rail on the left edge */
  leftRail: string;
  /** ID of the rail on the right edge */
  rightRail: string;
  /** ID of the rail on the top edge */
  topRail: string;
  /** ID of the rail on the bottom edge */
  bottomRail: string;
  /** Minimum width in pixels */
  minWidth?: number;
  /** Minimum height in pixels */
  minHeight?: number;
}

/**
 * Complete grid configuration for save/load
 */
export interface GridConfig {
  rails: Rail[];
  cells: Cell[];
}

/**
 * Information about which cells are attached to a rail
 */
export interface RailAttachments {
  rail: Rail;
  /** Cells that have this rail as their left/top edge (will shrink when rail moves right/down) */
  cellsBefore: Cell[];
  /** Cells that have this rail as their right/bottom edge (will grow when rail moves right/down) */
  cellsAfter: Cell[];
}

/**
 * Constraints for rail movement
 */
export interface RailConstraints {
  /** Minimum position the rail can move to (%) */
  min: number;
  /** Maximum position the rail can move to (%) */
  max: number;
}

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = ''): string {
  return `${prefix}${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a simple 2x2 grid configuration
 * Each internal rail is segmented - separate rail for top/bottom and left/right
 */
export function createDefault2x2Grid(): GridConfig {
  const rails: Rail[] = [
    // Fixed boundary rails (edges)
    { id: 'v-left', direction: 'vertical', position: 0, fixed: true },
    { id: 'v-right', direction: 'vertical', position: 100, fixed: true },
    { id: 'h-top', direction: 'horizontal', position: 0, fixed: true },
    { id: 'h-bottom', direction: 'horizontal', position: 100, fixed: true },

    // Segmented vertical rails at 50% (one for top row, one for bottom row)
    { id: 'v-center-top', direction: 'vertical', position: 50, fixed: false, startBound: 'h-top', endBound: 'h-center-left' },
    { id: 'v-center-bottom', direction: 'vertical', position: 50, fixed: false, startBound: 'h-center-left', endBound: 'h-bottom' },

    // Segmented horizontal rails at 50% (one for left column, one for right column)
    { id: 'h-center-left', direction: 'horizontal', position: 50, fixed: false, startBound: 'v-left', endBound: 'v-center-top' },
    { id: 'h-center-right', direction: 'horizontal', position: 50, fixed: false, startBound: 'v-center-top', endBound: 'v-right' },
  ];

  const cells: Cell[] = [
    {
      id: 'cell-tl',
      leftRail: 'v-left',
      rightRail: 'v-center-top',
      topRail: 'h-top',
      bottomRail: 'h-center-left',
    },
    {
      id: 'cell-tr',
      leftRail: 'v-center-top',
      rightRail: 'v-right',
      topRail: 'h-top',
      bottomRail: 'h-center-right',
    },
    {
      id: 'cell-bl',
      leftRail: 'v-left',
      rightRail: 'v-center-bottom',
      topRail: 'h-center-left',
      bottomRail: 'h-bottom',
    },
    {
      id: 'cell-br',
      leftRail: 'v-center-bottom',
      rightRail: 'v-right',
      topRail: 'h-center-right',
      bottomRail: 'h-bottom',
    },
  ];

  return { rails, cells };
}

/**
 * Create a single cell grid (starting point for dynamic building)
 */
export function createSingleCellGrid(): GridConfig {
  const rails: Rail[] = [
    { id: 'v-left', direction: 'vertical', position: 0, fixed: true },
    { id: 'v-right', direction: 'vertical', position: 100, fixed: true },
    { id: 'h-top', direction: 'horizontal', position: 0, fixed: true },
    { id: 'h-bottom', direction: 'horizontal', position: 100, fixed: true },
  ];

  const cells: Cell[] = [
    {
      id: 'cell-main',
      leftRail: 'v-left',
      rightRail: 'v-right',
      topRail: 'h-top',
      bottomRail: 'h-bottom',
    },
  ];

  return { rails, cells };
}

/**
 * Options for creating a grid
 */
export interface CreateGridOptions {
  /** Number of rows */
  rows: number;
  /** Number of columns */
  cols: number;
  /** Row heights as percentages (must sum to 100). If not provided, rows are equal height. */
  rowHeights?: number[];
  /** Column widths as percentages (must sum to 100). If not provided, columns are equal width. */
  colWidths?: number[];
}

/**
 * Create a configurable grid with specified rows, columns, and proportions.
 * Each internal intersection creates independent rail segments.
 *
 * @example
 * // Create a 3x2 grid with equal sizing
 * createGrid({ rows: 3, cols: 2 })
 *
 * @example
 * // Create a 2x3 grid with custom proportions
 * createGrid({ rows: 2, cols: 3, rowHeights: [30, 70], colWidths: [20, 50, 30] })
 */
export function createGrid(options: CreateGridOptions): GridConfig {
  const { rows, cols } = options;

  // Calculate row heights (cumulative positions)
  const rowHeights = options.rowHeights || Array(rows).fill(100 / rows);
  const rowPositions: number[] = [0];
  let cumulative = 0;
  for (const height of rowHeights) {
    cumulative += height;
    rowPositions.push(cumulative);
  }

  // Calculate column widths (cumulative positions)
  const colWidths = options.colWidths || Array(cols).fill(100 / cols);
  const colPositions: number[] = [0];
  cumulative = 0;
  for (const width of colWidths) {
    cumulative += width;
    colPositions.push(cumulative);
  }

  const rails: Rail[] = [];
  const cells: Cell[] = [];

  // Create boundary rails (fixed)
  rails.push({ id: 'v-0', direction: 'vertical', position: 0, fixed: true });
  rails.push({ id: `v-${cols}`, direction: 'vertical', position: 100, fixed: true });
  rails.push({ id: 'h-0', direction: 'horizontal', position: 0, fixed: true });
  rails.push({ id: `h-${rows}`, direction: 'horizontal', position: 100, fixed: true });

  // Create internal horizontal rails (one segment per column)
  for (let row = 1; row < rows; row++) {
    const position = rowPositions[row];
    for (let col = 0; col < cols; col++) {
      const railId = `h-${row}-c${col}`;
      const startBound = col === 0 ? 'v-0' : `v-${col}-r${row - 1}`; // Left vertical rail
      const endBound = col === cols - 1 ? `v-${cols}` : `v-${col + 1}-r${row - 1}`; // Right vertical rail

      rails.push({
        id: railId,
        direction: 'horizontal',
        position,
        fixed: false,
        startBound,
        endBound,
      });
    }
  }

  // Create internal vertical rails (one segment per row)
  for (let col = 1; col < cols; col++) {
    const position = colPositions[col];
    for (let row = 0; row < rows; row++) {
      const railId = `v-${col}-r${row}`;
      // For vertical rail at column col, row row:
      // - startBound: the horizontal rail ABOVE this segment (row index = row, column index = col-1 for left part)
      // - endBound: the horizontal rail BELOW this segment (row index = row+1, column index = col-1 for left part)
      // But we need to reference the horizontal rail segment that STARTS at this vertical rail position
      // Actually the issue is: horizontal rails use col index for their position, not the vertical rail's col-1
      const startBound = row === 0 ? 'h-0' : `h-${row}-c${col - 1}`; // Top horizontal rail (left segment at this intersection)
      const endBound = row === rows - 1 ? `h-${rows}` : `h-${row + 1}-c${col - 1}`; // Bottom horizontal rail (left segment)

      rails.push({
        id: railId,
        direction: 'vertical',
        position,
        fixed: false,
        startBound,
        endBound,
      });
    }
  }

  // Create cells
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellId = `cell-${row}-${col}`;

      // Left rail
      const leftRail = col === 0 ? 'v-0' : `v-${col}-r${row}`;
      // Right rail
      const rightRail = col === cols - 1 ? `v-${cols}` : `v-${col + 1}-r${row}`;
      // Top rail
      const topRail = row === 0 ? 'h-0' : `h-${row}-c${col}`;
      // Bottom rail
      const bottomRail = row === rows - 1 ? `h-${rows}` : `h-${row + 1}-c${col}`;

      cells.push({
        id: cellId,
        leftRail,
        rightRail,
        topRail,
        bottomRail,
      });
    }
  }

  return { rails, cells };
}

/**
 * Create a dashboard layout with asynchronous/staggered rail segments.
 * This creates a layout with:
 * - Header spanning full width at top
 * - Sidebar on left (below header)
 * - Main content area (to the right of sidebar)
 * - Footer spanning full width at bottom
 *
 * The key feature is that the sidebar's right edge is NOT aligned with the main content's left edge,
 * demonstrating independent rail segments.
 */
export function createDashboardGrid(): GridConfig {
  const rails: Rail[] = [
    // Fixed boundary rails
    { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
    { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
    { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
    { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },

    // Horizontal rail for header bottom (spans full width)
    { id: 'h-header', direction: 'horizontal', position: 15, fixed: false },

    // Horizontal rail for footer top (spans full width)
    { id: 'h-footer', direction: 'horizontal', position: 85, fixed: false },

    // Vertical rail for sidebar - only goes from header to footer
    // This is the "async" part - it doesn't span the full height
    { id: 'v-sidebar', direction: 'vertical', position: 25, fixed: false, startBound: 'h-header', endBound: 'h-footer' },
  ];

  const cells: Cell[] = [
    // Header (top, full width)
    {
      id: 'cell-header',
      leftRail: 'v-0',
      rightRail: 'v-100',
      topRail: 'h-0',
      bottomRail: 'h-header',
    },
    // Sidebar (left, middle section)
    {
      id: 'cell-sidebar',
      leftRail: 'v-0',
      rightRail: 'v-sidebar',
      topRail: 'h-header',
      bottomRail: 'h-footer',
    },
    // Main content (right of sidebar, middle section)
    {
      id: 'cell-main',
      leftRail: 'v-sidebar',
      rightRail: 'v-100',
      topRail: 'h-header',
      bottomRail: 'h-footer',
    },
    // Footer (bottom, full width)
    {
      id: 'cell-footer',
      leftRail: 'v-0',
      rightRail: 'v-100',
      topRail: 'h-footer',
      bottomRail: 'h-100',
    },
  ];

  return { rails, cells };
}
