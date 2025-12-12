/*
 * Public API Surface of @softwarity/resizable
 *
 * Native Web Components for creating resizable panel layouts.
 * Works with any framework or vanilla JavaScript.
 */

// === Split-based layout (legacy) ===
// Components
export { ResizableSplit, SplitConfig } from './lib/resizable-split.component';
export { ResizablePanel } from './lib/resizable-panel.component';
export { ResizableHandle } from './lib/resizable-handle.component';

// Service for global layout management
export { ResizableLayoutRegistry, LayoutConfig, PanelConfig } from './lib/resizable-layout.service';

// Side effect: register custom elements when this module is imported
import './lib/resizable-split.component';
import './lib/resizable-panel.component';
import './lib/resizable-handle.component';

// === Grid-based layout (new) ===
// Models
export {
  Rail,
  Cell,
  GridConfig,
  RailAttachments,
  RailConstraints,
  CreateGridOptions,
  generateId,
  createDefault2x2Grid,
  createSingleCellGrid,
  createGrid,
  createDashboardGrid,
} from './lib/grid/grid.model';

// Service
export { GridService, getGridService, resetGridService } from './lib/grid/grid.service';

// Components
export { ResizableGrid } from './lib/grid/resizable-grid.component';
export { ResizableGridCell } from './lib/grid/resizable-grid-cell.component';
export { ResizableRailHandle } from './lib/grid/resizable-rail-handle.component';

// Side effect: register grid custom elements
import './lib/grid/resizable-grid.component';
