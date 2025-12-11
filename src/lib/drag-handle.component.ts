import { Component, HostBinding, HostListener, Input, ViewContainerRef } from "@angular/core";

@Component({
    selector: 'app-drag-handle',
    standalone: true,
    template: `
        <span></span>
      `,
    styles: [`
        :host {
            display: block;
            user-select: none;
            background: transparent;
            position: relative;
            z-index: 1;
            span {
                position: absolute;
                box-sizing: border-box;
                display: block;
                border: 1px solid #cccccc;
            }
        }
        :host[direction="horizontal"] {
            cursor: col-resize;
            width: 8px;
            span {
                border-width: 0 1px;
                top: 50%;
                margin-top: -10px;
                height: 20px;
                width: 4px;
            }
        }
        :host[direction="vertical"] {
            cursor: row-resize;
            height: 8px;
            span {
                border-width: 1px 0;
                left: 50%;
                margin-left: -10px;
                height: 4px;
                width: 20px;
            }
        }
        :host:hover {
            span {
                border-color: #888888;
            }
        }
    `],
})
export class DragHandleComponent {

    private dragging = false;
    private start!: number;
    private sizeContainer: number = 0;
    private beforePercent: number = 0;
    private afterPercent: number = 0;
    private maxPercent: number = 0;

    constructor(
        private viewContainerRef: ViewContainerRef,
    ) {
    }

    @Input()
    @HostBinding('attr.direction')
    direction: 'horizontal' | 'vertical' = 'horizontal';

    @Input()
    before: HTMLBaseElement | null = null;

    @Input()
    after: HTMLBaseElement | null = null;

    @HostListener('mousedown', ['$event'])
    onMousedown(event: MouseEvent) {
        if (event.button === 0) { // Main button
            this.dragging = true;
            const parentElement = this.viewContainerRef.element.nativeElement.parentElement;
            const parentStyle = getComputedStyle(parentElement);
            if (this.direction === 'horizontal') {
                this.start = event.clientX;
                this.sizeContainer = parseFloat(parentStyle.width);
            } else {
                this.start = event.clientY;
                this.sizeContainer = parseFloat(parentStyle.height);
            }
            const beforeStyle = getComputedStyle(this.before!);
            const afterStyle = getComputedStyle(this.after!);
            this.beforePercent = parseFloat(beforeStyle.flexBasis);
            this.afterPercent = parseFloat(afterStyle.flexBasis);
            this.maxPercent = this.beforePercent + this.afterPercent;

        }
    }
    @HostListener('document:leave', ['$event'])
    @HostListener('document:mouseup', ['$event'])
    onMouseup(event: MouseEvent) {
        this.dragging = false;
    }



    @HostListener('document:mousemove', ['$event'])
    onMousemove(event: MouseEvent) {
        if (this.dragging) {
            let beforeStyle = getComputedStyle(this.before!);
            let afterStyle = getComputedStyle(this.after!);
            const beforeDragPercent = parseFloat(beforeStyle.flexBasis);
            const afterDragPercent = parseFloat(afterStyle.flexBasis);
            const beforeBeforeDragPx = (this.direction === 'horizontal') ? beforeStyle.width : beforeStyle.height;
            const beforeAfterDragPx = (this.direction === 'horizontal') ? afterStyle.width : afterStyle.height;
            const offset = (this.direction === 'horizontal') ? this.start! - event.clientX : this.start! - event.clientY;
            const percent = (offset / this.sizeContainer) * 100;
            const beforePercent = Math.min(Math.max(this.beforePercent - percent, 0), this.maxPercent);
            const afterPercent = Math.min(Math.max(this.afterPercent + percent, 0), this.maxPercent);
            this.before!.style.flexBasis = `${beforePercent}%`;
            this.after!.style.flexBasis = `${afterPercent}%`;
            beforeStyle = getComputedStyle(this.before!);
            afterStyle = getComputedStyle(this.after!);
            const afterBeforeDragPx = (this.direction === 'horizontal') ? beforeStyle.width : beforeStyle.height;
            const afterAfterDragPx = (this.direction === 'horizontal') ? afterStyle.width : afterStyle.height;
            if (beforeBeforeDragPx === afterBeforeDragPx || beforeAfterDragPx === afterAfterDragPx) { // On est arrivé en limite
                this.before!.style.flexBasis = `${beforeDragPercent}%`;
                this.after!.style.flexBasis = `${afterDragPercent}%`;
            } else {
                this.before!.setAttribute('percent', `${beforePercent}`);
                this.after!.setAttribute('percent', `${afterPercent}`);
            }
        }
    }

}
