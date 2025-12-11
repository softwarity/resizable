import { AfterViewInit, ComponentRef, Directive, ElementRef, EventEmitter, Input, OnDestroy, Output, Renderer2, ViewContainerRef } from "@angular/core";
import { DragHandleComponent } from "./drag-handle.component";

@Directive({
    selector: '[resizable]',
    standalone: true
})
export class ResizableDirective implements AfterViewInit, OnDestroy {

    private horizontal: boolean | null = null;
    private resizables: HTMLBaseElement[] = [];
    private nextResizable: HTMLBaseElement | null = null
    private observer: MutationObserver;
    private init: boolean = false;

    constructor(
        private viewContainerRef: ViewContainerRef,
        private el: ElementRef,
        private renderer: Renderer2
    ) {
        this.el.nativeElement.style.overflow = 'hidden';
        this.el.nativeElement.style.whiteSpace = 'nowrap';
        this.el.nativeElement.style.textOverflow = 'clip';
        this.observer = new MutationObserver((mutations: MutationRecord[]) => {
            mutations.forEach((mutation: MutationRecord) => {
                if (mutation.attributeName === 'percent') {
                    const computedStyle = getComputedStyle(this.el.nativeElement);
                    const newFlexBasis = parseFloat(computedStyle.flexBasis);
                    this.percentChange.emit(newFlexBasis);
                }
            });
        });
        const config = { attributes: true, attributeFilter: ['percent'] };
        this.observer.observe(this.el.nativeElement, config);
    }

    ngAfterViewInit(): void {
        const parentElement: HTMLBaseElement = this.viewContainerRef.element.nativeElement.parentElement;
        this.horizontal = this.initParent(parentElement);
        const nodeListOf: NodeListOf<HTMLBaseElement> = parentElement.querySelectorAll<HTMLBaseElement>('[resizable]');
        this.resizables = [];
        nodeListOf.forEach((item: HTMLBaseElement, idx: number) => {
            if (item.parentElement === parentElement) {
                this.resizables.push(item);
            }
        });
        this.nextResizable = this.resizables.reduce((next: HTMLBaseElement | null, item: HTMLBaseElement, idx: number) => {
            next = item === this.el.nativeElement && idx !== this.resizables.length - 1 ? this.resizables[idx + 1] : next;
            return next;
        }, null);
        this.setMinMax();
        if (!!this.nextResizable) { // si ce n'est pas le dernier élément, on ajoute une poignée de redimensionnement
            const dragHandle: ComponentRef<DragHandleComponent> = this.viewContainerRef.createComponent(DragHandleComponent, { index: 0 });
            dragHandle.instance.direction = this.horizontal ? 'horizontal' : 'vertical';
            dragHandle.instance.before = this.el.nativeElement;
            dragHandle.instance.after = this.nextResizable;
            dragHandle.hostView.detectChanges();
        }
        this.init = true;
    }

    initParent(parentElement: HTMLBaseElement): boolean {
        const style = getComputedStyle(parentElement);
        parentElement.style.gap = '8px';
        parentElement.style.display = 'flex';
        if (!style.flexDirection) {
            parentElement.style.flexDirection = 'row';
        }
        return style.flexDirection === 'row';
    }

    private initAllResizables() {
        if (!this.nextResizable && this.init) { // Quand on arrive au dernier élément, on calcul les pourcentages initiaux
            const total = this.resizables.reduce((t: number, item: HTMLBaseElement) => {
                if (item.style.flexBasis) {
                    t += parseFloat(item.style.flexBasis) || 0;
                }
                return t;
            }, 0);
            if (total > 100) { // si le total est superieur à 100, on réduit les pourcentages
                const ratio = 100 / total;
                this.resizables.forEach((item: HTMLBaseElement) => {
                    const percent = parseFloat(item.style.flexBasis) * ratio;
                    this.renderer.setStyle(item, 'flexBasis', `${percent}%`);
                });
            } else if (!total) { // si le total est nul, on met tous les pourcentages à 100 / nombre d'éléments
                const percent = 100 / this.resizables.length;
                this.resizables.forEach((item: HTMLBaseElement) => {
                    this.renderer.setStyle(item, 'flexBasis', `${percent}%`);
                });
            }
        }
    }

    ngOnDestroy(): void {
        if (!!this.observer) {
            this.observer.disconnect();
        }
    }

    private setMinMax() {
        const item = this.el.nativeElement;
        if (this.horizontal) {
            this.renderer.setStyle(item, 'width', 'unset');
            this.renderer.setStyle(item, 'min-width', 'unset');
            if (this.min !== null) {
                this.renderer.setStyle(item, 'min-width', this.min);
            }
            this.renderer.setStyle(item, 'max-width', 'unset');
            if (this.max !== null) {
                this.renderer.setStyle(item, 'max-width', this.max);
            }
        } else {
            this.renderer.setStyle(item, 'height', 'unset');
            this.renderer.setStyle(item, 'min-height', 'unset');
            if (this.min !== null) {
                this.renderer.setStyle(item, 'min-height', this.min);
            }
            this.renderer.setStyle(item, 'max-height', 'unset');
            if (this.max !== null) {
                this.renderer.setStyle(item, 'max-height', this.max);
            }
        }
    }

    @Input()
    set percent(percent: number | null) {
        this.renderer.setStyle(this.el.nativeElement, 'flexBasis', `${percent}%`);
        this.initAllResizables();
    };

    @Input()
    min: string | null = null;

    @Input()
    max: string | null = null;

    @Output()
    percentChange: EventEmitter<number> = new EventEmitter<number>();
}
