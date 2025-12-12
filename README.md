<p align="center">
  <a href="https://www.softwarity.io/">
    <img src="https://www.softwarity.io/img/softwarity.svg" alt="Softwarity" height="60">
  </a>
</p>

# @softwarity/resizable

<p align="center">
  <a href="https://www.npmjs.com/package/@softwarity/resizable">
    <img src="https://img.shields.io/npm/v/@softwarity/resizable?color=blue&label=npm" alt="npm version">
  </a>
  <a href="https://github.com/softwarity/resizable/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="license">
  </a>
  <a href="https://github.com/softwarity/resizable/actions/workflows/main.yml">
    <img src="https://github.com/softwarity/resizable/actions/workflows/main.yml/badge.svg" alt="build status">
  </a>
</p>

Native Web Components for creating resizable panel layouts. Works with any framework (Angular, React, Vue) or vanilla JavaScript.

**[Live Demo](https://softwarity.github.io/resizable/)** | **[Release Notes](RELEASE_NOTES.md)**

## Features

- **Native Web Components** - No framework dependencies, works everywhere
- **Nested Layouts** - Create complex layouts with horizontal and vertical splits
- **Glued Handles** - Handles at intersections move together automatically
- **Ctrl+Drag** - Hold Ctrl to resize independently without affecting glued handles
- **iFrame Support** - Overlay prevents losing mouse events when dragging over iframes
- **Dark Mode** - Uses CSS `light-dark()` for automatic theme adaptation
- **Save/Load** - Persist and restore layout configurations
- **Touch Support** - Full support for mobile devices

## Installation

```bash
npm install @softwarity/resizable
```

**No peer dependencies required!** This library uses native Web Components.

## Basic Usage

```html
<script type="module">
  import '@softwarity/resizable';
</script>

<resizable-split direction="horizontal" style="height: 400px;">
  <resizable-panel flex="1">Left Panel</resizable-panel>
  <resizable-panel flex="2">Right Panel</resizable-panel>
</resizable-split>
```

## Nested Layouts

Create complex layouts by nesting splits:

```html
<resizable-split direction="vertical" style="height: 600px;">
  <resizable-panel flex="1">
    <resizable-split direction="horizontal">
      <resizable-panel flex="1">Panel A</resizable-panel>
      <resizable-panel flex="1">Panel B</resizable-panel>
      <resizable-panel flex="1">Panel C</resizable-panel>
    </resizable-split>
  </resizable-panel>
  <resizable-panel flex="1">
    <resizable-split direction="horizontal">
      <resizable-panel flex="1">Panel D</resizable-panel>
      <resizable-panel flex="1">Panel E</resizable-panel>
      <resizable-panel flex="1">Panel F</resizable-panel>
    </resizable-split>
  </resizable-panel>
</resizable-split>
```

When panels are aligned (like A-D, B-E, C-F above), their handles will **glue together** and move in sync!

## Angular Integration

```typescript
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import '@softwarity/resizable';

@Component({
  selector: 'my-component',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <resizable-split direction="horizontal" style="height: 400px;">
      <resizable-panel flex="1">Left</resizable-panel>
      <resizable-panel flex="2">Right</resizable-panel>
    </resizable-split>
  `
})
export class MyComponent {}
```

## API Reference

### `<resizable-split>`

Container for resizable panels.

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `direction` | `'horizontal' \| 'vertical'` | `'horizontal'` | Direction of the split |
| `min-panel-size` | `number` | `50` | Minimum panel size in pixels |

**Events:**
| Event | Detail | Description |
|-------|--------|-------------|
| `config-change` | `SplitConfig` | Fired when layout changes |

### `<resizable-panel>`

A resizable panel within a split container.

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `flex` | `number` | `1` | Initial flex ratio |
| `min` | `string` | - | Minimum size (e.g., "100px", "20%") |
| `max` | `string` | - | Maximum size (e.g., "500px", "80%") |
| `panel-id` | `string` | auto-generated | Unique ID for save/load |

**Events:**
| Event | Detail | Description |
|-------|--------|-------------|
| `size-change` | `{ size: number, panelId: string }` | Fired when panel is resized |

## Save/Load Configuration

```typescript
import { ResizableLayoutRegistry } from '@softwarity/resizable';

// Save current layout
const config = ResizableLayoutRegistry.getLayoutConfig();
localStorage.setItem('my-layout', JSON.stringify(config));

// Restore layout
const saved = localStorage.getItem('my-layout');
if (saved) {
  ResizableLayoutRegistry.applyLayoutConfig(JSON.parse(saved));
}

// Reset to initial state
ResizableLayoutRegistry.resetLayout();
```

## Theming

The component uses CSS custom properties with `light-dark()` for theme support:

```css
resizable-handle {
  --handle-color: light-dark(#cccccc, #555555);
  --handle-hover-color: light-dark(#888888, #888888);
  --handle-active-color: light-dark(#666666, #aaaaaa);
  --handle-glued-color: light-dark(#4a90d9, #5ba0e9);
}
```

### Framework Dark Mode Integration

For **Tailwind CSS**:
```css
html.dark { color-scheme: dark; }
html:not(.dark) { color-scheme: light; }
```

For **Bootstrap 5.3+**:
```css
[data-bs-theme="dark"] { color-scheme: dark; }
[data-bs-theme="light"] { color-scheme: light; }
```

## Browser Support

Works in all modern browsers that support:
- Custom Elements v1
- Shadow DOM v1
- CSS `light-dark()` (Chrome 123+, Firefox 120+, Safari 17.5+)

## License

MIT
