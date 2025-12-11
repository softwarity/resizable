import { ChangeDetectionStrategy, Component, computed, input, signal, OnInit, OnDestroy, booleanAttribute, numberAttribute } from '@angular/core';

/**
 * M3 Expressive Loading Indicator
 *
 * 20 points (10 pointes alternant outer/inner)
 * Animation entre 2 formes:
 * - Soft burst prononcé (pointes visibles)
 * - Soft burst arrondi (presque cercle avec ondulations)
 */
@Component({
  selector: 'app-loading-indicator',
  template: `
    <div class="loading-container" [class.with-container]="withContainer()">
      <svg class="loader" [style.transform]="rotationTransform()" [style.width.px]="diameter()" [style.height.px]="diameter()" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <path [attr.d]="currentPath()" fill="currentColor" />
      </svg>
    </div>
  `,
  styles: `
    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      width: 100%;
    }

    .loading-container.with-container {
      .loader {
        background: var(--loading-indicator-background-color, var(--mat-sys-primary-container));
        border-radius: 50%;
        box-sizing: content-box;
        padding: 2px;
      }
    }

    .loader {
      color: var(--loading-indicator-shape-color, var(--mat-sys-on-secondary-container));
    }
  `
})
export class LoadingIndicatorComponent implements OnInit, OnDestroy {
  readonly diameter = input(48, { transform: numberAttribute });
  readonly withContainer = input(false, { transform: booleanAttribute });

  private readonly cx = 50;
  private readonly cy = 50;
  private readonly numPoints = 20; // 10 pointes = 20 points total

  // Shapes: each defines radius for all 20 points + curve factor
  private readonly shapes = [
    // Shape 1: Wavy circle (creux prononcés)
    { radii: this.createWavyRadii(42, 28), curve: 0.35 },
    // Shape 2: Soft burst arrondi
    { radii: this.createWavyRadii(40, 34), curve: 0.45 },
    // Shape 3: Pentagon arrondi (5 sommets)
    { radii: this.createPentagonRadii(40), curve: 0.25 },
    // Shape 4: Pill/Ovale vertical (buffer avec bouts arrondis)
    { radii: this.createPillRadii(42, 36), curve: 0.7 },
    // Shape 5: Sunny (8 ondulations douces, presque un cercle)
    { radii: this.createSunnyRadii(42, 34), curve: 0.5 },
    // Shape 6: 4-side cookie (8 sommets: 4 convexes + 4 concaves)
    { radii: this.createCookieRadii(43, 34), curve: 0.45 },
    // Shape 7: Ovale horizontal (ellipse aplatie)
    { radii: this.createOvalRadii(46, 30), curve: 0.45 },
  ];

  // Helper: create wavy radii (alternating outer/inner)
  private createWavyRadii(outer: number, inner: number): number[] {
    return Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? outer : inner));
  }

  // Helper: create pill/oval radii (stretched vertically)
  // Top/bottom = longer radius, left/right = shorter radius
  private createPillRadii(verticalRadius: number, horizontalRadius: number): number[] {
    return Array.from({ length: 20 }, (_, i) => {
      // Angle for this point (0 = top, 5 = right, 10 = bottom, 15 = left)
      const angle = (i * 2 * Math.PI) / 20;
      // Ellipse formula: r = a*b / sqrt((b*cos)^2 + (a*sin)^2)
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const a = verticalRadius;
      const b = horizontalRadius;
      return (a * b) / Math.sqrt(b * b * cosA * cosA + a * a * sinA * sinA);
    });
  }

  // Helper: create oval radii (stretched horizontally)
  // Left/right = longer radius, top/bottom = shorter radius
  private createOvalRadii(horizontalRadius: number, verticalRadius: number): number[] {
    return Array.from({ length: 20 }, (_, i) => {
      // Angle for this point (0 = top, 5 = right, 10 = bottom, 15 = left)
      const angle = (i * 2 * Math.PI) / 20;
      // Ellipse formula: r = a*b / sqrt((b*cos)^2 + (a*sin)^2)
      // Ici a = horizontal (gauche/droite), b = vertical (haut/bas)
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const a = horizontalRadius;
      const b = verticalRadius;
      return (a * b) / Math.sqrt(b * b * cosA * cosA + a * a * sinA * sinA);
    });
  }

  // Helper: create 4-side cookie radii (8 sommets: 4 convexes + 4 concaves)
  // Convexes aux diagonales (45°, 135°, 225°, 315°) - pointes vers l'extérieur
  // Concaves aux axes (0°, 90°, 180°, 270°) - creux vers l'intérieur (plats)
  private createCookieRadii(convexRadius: number, concaveRadius: number): number[] {
    return Array.from({ length: 20 }, (_, i) => {
      const angleDeg = i * 18;
      const angleRad = (angleDeg * Math.PI) / 180;

      // cos(4 * angle) donne 4 oscillations:
      // = 1 à 0°, 90°, 180°, 270° (axes - concaves)
      // = -1 à 45°, 135°, 225°, 315° (diagonales - convexes)
      const wave = Math.cos(4 * angleRad);

      // Utiliser une puissance pour "aplatir" les côtés concaves
      // wave va de -1 à 1, on le transforme en 0 à 1
      const normalized = (1 - wave) / 2; // 0 aux concaves, 1 aux convexes

      // Appliquer une puissance pour rendre les transitions plus nettes
      // Les valeurs proches de 0 et 1 restent, le milieu est aplati
      const t = Math.pow(normalized, 0.5); // racine carrée pour adoucir

      return concaveRadius + (convexRadius - concaveRadius) * t;
    });
  }

  // Helper: create sunny radii (8 ondulations douces)
  // Utilise cos pour que les pointes soient aux angles 0°, 45°, 90°, etc.
  // cos(8 * angle) = 1 aux multiples de 45° (pointes)
  // cos(8 * angle) = -1 aux 22.5°, 67.5°, etc. (creux)
  private createSunnyRadii(tipRadius: number, valleyRadius: number): number[] {
    return Array.from({ length: 20 }, (_, i) => {
      // Chaque point est à i * 18° (360° / 20 = 18°)
      const angleDeg = i * 18;
      const angleRad = (angleDeg * Math.PI) / 180;

      // cos(8 * angle) donne 8 pics aux positions 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
      // Les creux sont à 22.5°, 67.5°, etc.
      const wave = Math.cos(8 * angleRad);

      // wave va de -1 à 1, on le transforme en 0 à 1
      const t = (wave + 1) / 2;

      return valleyRadius + (tipRadius - valleyRadius) * t;
    });
  }

  // Helper: create pentagon radii (5 corners, points between on flat edges)
  private createPentagonRadii(cornerRadius: number): number[] {
    // 20 points, 5 corners = every 4th point is a corner (indices 0, 4, 8, 12, 16)
    // Points between corners must lie on the straight line between corners
    const radii: number[] = [];
    const pointsPerSide = 4; // 4 points per pentagon side

    for (let i = 0; i < 20; i++) {
      const posInGroup = i % pointsPerSide;

      if (posInGroup === 0) {
        // Corner point
        radii.push(cornerRadius);
      } else {
        // Edge point - calculate radius so point lies on line between corners
        // Pentagon corner angles: 0, 72°, 144°, 216°, 288° (every 72°)
        // Our points are at: 0°, 18°, 36°, 54°, 72°, ...
        const cornerIndex = Math.floor(i / pointsPerSide);
        const nextCornerIndex = (cornerIndex + 1) % 5;

        // Angles of the two corners (in our 20-point system)
        const cornerAngle1 = (cornerIndex * pointsPerSide * 2 * Math.PI) / 20 - Math.PI / 2;
        const cornerAngle2 = (nextCornerIndex * pointsPerSide * 2 * Math.PI) / 20 - Math.PI / 2;

        // Current point angle
        const pointAngle = (i * 2 * Math.PI) / 20 - Math.PI / 2;

        // Corner positions
        const c1x = cornerRadius * Math.cos(cornerAngle1);
        const c1y = cornerRadius * Math.sin(cornerAngle1);
        const c2x = cornerRadius * Math.cos(cornerAngle2);
        const c2y = cornerRadius * Math.sin(cornerAngle2);

        // Find where ray from origin at pointAngle intersects line c1-c2
        // Line: P = c1 + t*(c2-c1)
        // Ray: P = s * (cos(pointAngle), sin(pointAngle))
        const dx = c2x - c1x;
        const dy = c2y - c1y;
        const rx = Math.cos(pointAngle);
        const ry = Math.sin(pointAngle);

        // Solve: c1 + t*(c2-c1) = s * ray
        // c1x + t*dx = s*rx
        // c1y + t*dy = s*ry
        // s = (c1x + t*dx) / rx = (c1y + t*dy) / ry
        // c1x*ry + t*dx*ry = c1y*rx + t*dy*rx
        // t*(dx*ry - dy*rx) = c1y*rx - c1x*ry
        const denom = dx * ry - dy * rx;
        if (Math.abs(denom) > 0.0001) {
          const t = (c1y * rx - c1x * ry) / denom;
          const intersectX = c1x + t * dx;
          const intersectY = c1y + t * dy;
          const r = Math.sqrt(intersectX * intersectX + intersectY * intersectY);
          radii.push(r);
        } else {
          radii.push(cornerRadius);
        }
      }
    }
    return radii;
  }

  private animationFrame: number | null = null;
  private startTime = 0;

  // Animation timing: 7 formes en 9 secondes
  // Une phase = rotation rapide + transformation
  private readonly totalCycleDuration = 9000; // 9 secondes pour toutes les formes
  private readonly phaseDuration = this.totalCycleDuration / 7; // ~857ms par phase

  // Proportions: 60% rotation rapide, 40% morphing
  private readonly fastRotationDuration = this.phaseDuration * 0.6; // ~514ms rotation
  private readonly slowPhaseDuration = this.phaseDuration * 0.4; // ~343ms morphing

  // Rotation: chaque phase = 180° (demi-tour)
  // Fast = 60% de 180° = 108°, Slow = 40% de 180° = 72°
  private readonly fastRotationDegrees = 108; // rotation pendant phase rapide
  private readonly slowRotationDegrees = 72; // rotation pendant transformation

  protected readonly rotation = signal(0);
  protected readonly shapeProgress = signal(0);
  protected readonly currentShapeIndex = signal(0);

  protected readonly rotationTransform = computed(() => `rotate(${this.rotation()}deg)`);

  protected readonly currentPath = computed(() => {
    const progress = this.shapeProgress();
    const currentIndex = this.currentShapeIndex();
    const nextIndex = (currentIndex + 1) % this.shapes.length;

    // Ease the transition
    const ease = this.easeInOutCubic(progress);

    const shape1 = this.shapes[currentIndex];
    const shape2 = this.shapes[nextIndex];

    // Interpolate radii for each point
    const radii = shape1.radii.map((r: number, i: number) => r + (shape2.radii[i] - r) * ease);
    const curve = shape1.curve + (shape2.curve - shape1.curve) * ease;

    return this.generatePath(radii, curve);
  });

  ngOnInit(): void {
    this.startTime = performance.now();
    this.animate();
  }

  ngOnDestroy(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  private animate = (): void => {
    const elapsed = performance.now() - this.startTime;
    const totalPhases = this.shapes.length;
    const fullCycleDuration = this.phaseDuration * totalPhases;

    // Position dans le cycle complet
    const cycleTime = elapsed % fullCycleDuration;

    // Quelle phase sommes-nous?
    const phaseIndex = Math.floor(cycleTime / this.phaseDuration);
    const phaseTime = cycleTime % this.phaseDuration;

    // Calculer la rotation totale
    const completedPhasesRotation = phaseIndex * (this.fastRotationDegrees + this.slowRotationDegrees);
    const completedCyclesRotation = Math.floor(elapsed / fullCycleDuration) * totalPhases * (this.fastRotationDegrees + this.slowRotationDegrees);

    let currentPhaseRotation: number;
    let shapeProgress: number;

    if (phaseTime < this.fastRotationDuration) {
      // Phase rapide: rotation rapide, pas de transformation
      const fastProgress = phaseTime / this.fastRotationDuration;
      currentPhaseRotation = this.easeInOutCubic(fastProgress) * this.fastRotationDegrees;
      shapeProgress = 0;
    } else {
      // Phase lente: rotation lente + transformation
      const slowTime = phaseTime - this.fastRotationDuration;
      const slowProgress = slowTime / this.slowPhaseDuration;
      currentPhaseRotation = this.fastRotationDegrees + this.easeInOutCubic(slowProgress) * this.slowRotationDegrees;
      shapeProgress = slowProgress;
    }

    this.rotation.set(completedCyclesRotation + completedPhasesRotation + currentPhaseRotation);
    this.currentShapeIndex.set(phaseIndex % totalPhases);
    this.shapeProgress.set(shapeProgress);

    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private generatePath(radii: number[], curveFactor: number): string {
    const points: { x: number; y: number; angle: number; r: number }[] = [];

    // Generate 20 points with individual radii
    for (let i = 0; i < this.numPoints; i++) {
      const angle = (i * 2 * Math.PI) / this.numPoints - Math.PI / 2; // Start from top
      const r = radii[i];

      points.push({
        x: this.cx + r * Math.cos(angle),
        y: this.cy + r * Math.sin(angle),
        angle,
        r,
      });
    }

    // Build path with cubic bezier curves
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

    for (let i = 0; i < this.numPoints; i++) {
      const p0 = points[i];
      const p1 = points[(i + 1) % this.numPoints];

      // Tangent directions (perpendicular to radius)
      const tangent0 = p0.angle + Math.PI / 2;
      const tangent1 = p1.angle + Math.PI / 2;

      // Control point distance
      const segmentAngle = (2 * Math.PI) / this.numPoints;
      const cpDist0 = p0.r * segmentAngle * curveFactor;
      const cpDist1 = p1.r * segmentAngle * curveFactor;

      const cp1 = {
        x: p0.x + cpDist0 * Math.cos(tangent0),
        y: p0.y + cpDist0 * Math.sin(tangent0),
      };

      const cp2 = {
        x: p1.x - cpDist1 * Math.cos(tangent1),
        y: p1.y - cpDist1 * Math.sin(tangent1),
      };

      d += ` C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)} ${cp2.x.toFixed(1)} ${cp2.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }

    d += ' Z';
    return d;
  }
}
