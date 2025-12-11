# Release Notes

## 3.0.5

---

## 3.0.4

### Features
- **Native table support** - Added support for native table syntax (`<table mat-table>`)
- **Row height adaptation** - Toolbar automatically adapts to any row height configured via `mat.table-overrides()`

### Theming
- **SCSS tokens renamed** - Added `-color` suffix for consistency:
  - `container-background-color`
  - `filled-background-color`
  - `tonal-background-color`

---

## 3.0.3

### Breaking Changes
- **Directive Pattern** - Changed from `<row-actions>` component to `<span rowActions>` directive
  - Before: `<row-actions><button>...</button></row-actions>`
  - After: `<span rowActions><button>...</button></span>`

### Features
- **Variants** - New `filled` and `tonal` variants for the toolbar background
  - Default: `surface-container`
  - Filled: `primary-container`
  - Tonal: `secondary-container`

### Theming
- **CSS Custom Properties** - Toolbar colors now use CSS variables with fallback to Material 3 tokens:
  - `--row-actions-background`
  - `--row-actions-filled-background`
  - `--row-actions-tonal-background`
- **SCSS Overrides** - The `overrides()` mixin now sets these CSS variables for each variant

---

## 3.0.2

### Improvements
- **Preview image** - Updated preview image for improved visual representation
- **License badge** - Updated license badge to use a more descriptive format

---

## 3.0.1

### Angular 21 Support
- **Requires Angular 21+** - Updated all peer dependencies to Angular 21
- **Zoneless ready** - Compatible with `provideZonelessChangeDetection()`

### Theming
- **SCSS Mixin** - New `overrides()` mixin for toolbar customization following Angular Material's theming pattern
- **Usage**:
  ```scss
  @use '@softwarity/row-actions/row-actions-theme' as row-actions;
  @include row-actions.overrides((
    container-background-color: var(--mat-sys-secondary)
  ));
  ```

### Improvements
- **Material 3 styling** - Pill-shaped border radius on toolbar edges
- **Native CSS animations** - Replaced `@angular/animations` with native CSS animations (`clip-path`)
- **Better hover detection** - Fixed issue where toolbar wouldn't appear when moving slowly from row interlines

### Bug Fixes
- **Mouse detection** - Changed from `mouseenter` to `mousemove` listener for more reliable hover detection

---

## 3.0.0

### Breaking Changes
- **Removed `color` input** - The `color` input (`primary`, `accent`, `warn`) has been removed in favor of Material 3 theming via SCSS mixin
- **Theming required** - Must call `@include row-actions.overrides()` in your styles

### Material 3 Support
- **M3 Design Tokens** - Uses Material 3 toolbar tokens via `mat.toolbar-overrides()`
- **Improved vertical alignment** - Toolbar now uses center positioning for better alignment with table rows

---

## 2.0.4

### Breaking Changes
- **Requires Angular 17+** - Uses Angular signals (`input()`) and `@if` control flow syntax

### Improvements
- **Improved animation** - Replaced `scaleX` animation with `clip-path` for smoother reveal effect without content distortion

### Code Quality
- Migrated to Angular signals (`input()`)
- Added `DestroyRef` for proper cleanup
- Improved typing throughout

### Testing
- **Unit tests** - Comprehensive test suite with 21 tests covering:
  - Row-actions display on hover
  - Position detection (left/right)
  - Vertical and horizontal alignment
  - Mouse interactions
  - Multiple rows behavior
  - Content projection
- **CI/CD** - Tests integrated in GitHub Actions workflow with coverage reports
- **Coverage** - 94%+ statement coverage

---

## 2.0.3

### New Features
- **Live Demo** - Interactive demo page deployed on GitHub Pages at [softwarity.github.io/row-actions](https://softwarity.github.io/row-actions/)
- Demo includes real-time configuration options (color, disabled state)
- Dynamic code preview with syntax highlighting

### Improvements
- Updated to Angular 18
- Standalone component ready for modern Angular applications

---

## 2.0.1

### Improvements
- Added compatibility with Angular 17+

---

## 1.18.4

### Improvements
- Added compatibility with Angular 17

---

## 1.18.3

### New Features
- Added `disabled` input to hide the component completely

---

## Previous Versions

For older releases, see the [commit history](https://github.com/softwarity/row-actions/commits/main).
