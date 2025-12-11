# Resizable 

[![Build hhangular/resizable](https://github.com/hhangular/resizable/actions/workflows/main.yml/badge.svg)](https://github.com/hhangular/resizable/actions/workflows/main.yml)

[![Publish hhangular/resizable to NPM](https://github.com/hhangular/resizable/actions/workflows/tag.yml/badge.svg)](https://github.com/hhangular/resizable/actions/workflows/tag.yml)

[![npm version](https://badge.fury.io/js/@hhangular%2Fresizable.svg)](https://badge.fury.io/js/@hhangular%2Fresizable)

## Resize your panels component effortlessly

This library contains an angular **standalone** component `ResizableDirective` that allows you to resize easily panels.   

# Demo

![](screenshot.png "Click on bellow for see in action")

[stackblitz](https://stackblitz.com/edit/hhangular-resizable?file=src%2Fmain.ts)


## Directive

 - **resizable** is a `directive` to annotate an element that you want resize.   

 ```html
 <div style="display: flex; flex-direction: row">
  <div resizable [percent]="33">
    <!-- What you want here -->
  </div>
  <div resizable [percent]="67">
    <!-- What you want here -->
  </div>
 </div>
 ```

## Installation

For help getting started with a new Angular app, check out the [Angular CLI](https://cli.angular.io/).

For existing apps, follow these steps to begin using `@hhangular/resizable` in your Angular app.

## Install @hhangular/resizable

You can use either the npm or yarn command-line tool to install the `package`.    
Use whichever is appropriate for your project in the examples below.

### NPM

```bash
# @hhangular/resizable
npm install @hhangular/resizable --save 
```

### YARN

```bash
# @hhangular/resizable
yarn add @hhangular/resizable
```

### Peer dependence

No dependency

## Configuration

Just import the standalone component `ResizableDirective` and you can use the `directive`.   
You can do this in your `Components` or `AppModule` or in your `SharedModule` indifferently.

`Component.ts`
```typescript
@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [ResizableDirective],
  template: `
  ...
  `,
})
export class Component {
  ...
}
```

---

`AppModule.ts`
```typescript
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {CommonModule} from '@angular/common';
import {HttpClientModule} from '@angular/common/http';
import {AppComponent} from './app.component';
// ================= IMPORT =================
import {ResizableDirective} from '@hhangular/resizable';

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    CommonModule,
    HttpClientModule,
// ================= IMPORT =================
    ResizableDirective,
  ],
  bootstrap: [AppComponent],
  providers: []
})
export class AppModule {
}
```

--- 

`SharedModule.ts`
```typescript
import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
// ================= IMPORT =================
import {ResizableDirective} from '@hhangular/resizable';

@NgModule({
  imports: [
    CommonModule,
// ================= IMPORT =================
    ResizableDirective,
  ],
  exports: [
// ================= EXPORT =================
    ResizableDirective,
  ],
  declarations: [],
})
export class SharedModule {
}
```

# Use

The use of 'Directive': `resizable` is very simple.

## Use cases
You want to split your UI in different area resizable

---

In a component template just decorate a div (or other) as follows:

```html
 <div style="display: flex; flex-direction: column">
  <div style="display: flex; flex-direction: row">
    <div resizable [percent]="33">
      <!-- What you want here -->
    </div>
    <div resizable [percent]="67">
      <!-- What you want here -->
    </div>
  </div>
  <div style="display: flex; flex-direction: row">
    <div resizable [percent]="33">
      <!-- What you want here -->
    </div>
    <div resizable [percent]="33">
      <!-- What you want here -->
    </div>
    <div resizable [percent]="33">
      <!-- What you want here -->
    </div>
  </div>
</div>
```

The container flex direction set the resizable direction

## Inputs

```html
<div resizable [percent]="33" min="200px" max="50%">
```

| name | description | type | sample |
|---|---|---|---|
| percent | The initial percent size | number | 33 |
| min | The minimal size of panel in % or px | string | 200px or 20% |
| max | The maximum size of panel in % or px | string | 500px or 30% |


## Outputs

```html
<div resizable [percent]="33" (percentChange)="percentChangeHandler($event)">
```

| name | description | type | sample |
|---|---|---|---|
| percentChange | The percent size | number | 33.333 |

