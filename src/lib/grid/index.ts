/**
 * Grid Layout Module
 *
 * A cell-based grid layout system where:
 * - Cells are bounded by rails (vertical and horizontal lines)
 * - Rails can be dragged to resize all attached cells
 * - Cells can be split to create new rails
 * - Cells can be removed (neighbors extend to fill space)
 */

// Models
export * from './grid.model';

// Service
export * from './grid.service';

// Components
export { ResizableGrid } from './resizable-grid.component';
export { ResizableGridCell } from './resizable-grid-cell.component';
export { ResizableRailHandle } from './resizable-rail-handle.component';
