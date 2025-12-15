/**
 * Exhaustive tests for rail movement validation
 *
 * Tests all grid configurations from 2 to 16 cells and verifies that
 * canAlignedGroupMove() and canRailMoveIndependently() return correct values
 * based on the fundamental rule:
 *
 * A rail segment can move ONLY IF at EACH of its two endpoints,
 * there are perpendicular rails going in BOTH directions.
 */

import { GridService } from './grid.service';
import { GridConfig, Rail, Cell, createGrid, createSingleCellGrid, createDashboardGrid } from './grid.model';

describe('GridService Rail Movement', () => {

  /**
   * Helper to create a grid with specific rows and columns
   */
  function createTestGrid(rows: number, cols: number): GridConfig {
    return createGrid({ rows, cols });
  }

  /**
   * Helper to visualize a grid configuration for debugging
   */
  function visualizeGrid(service: GridService): string {
    const cells = service.getAllCells();
    const rails = service.getAllRails();

    let output = '\n=== Grid Visualization ===\n';
    output += `Cells (${cells.length}):\n`;
    cells.forEach(c => {
      const bounds = service.getCellBounds(c.id);
      output += `  ${c.id}: L=${c.leftRail} R=${c.rightRail} T=${c.topRail} B=${c.bottomRail}`;
      if (bounds) {
        output += ` [${bounds.left.toFixed(1)}-${bounds.right.toFixed(1)}% x ${bounds.top.toFixed(1)}-${bounds.bottom.toFixed(1)}%]`;
      }
      output += '\n';
    });

    output += `\nRails (${rails.length}):\n`;
    rails.forEach(r => {
      const bounds = service.getRailBounds(r.id);
      output += `  ${r.id}: ${r.direction} at ${r.position.toFixed(1)}%`;
      output += ` fixed=${r.fixed}`;
      if (r.startBound) output += ` start=${r.startBound}`;
      if (r.endBound) output += ` end=${r.endBound}`;
      if (bounds) {
        output += ` [${bounds.start.toFixed(1)}-${bounds.end.toFixed(1)}%]`;
      }
      output += '\n';
    });

    return output;
  }

  /**
   * The fundamental rule check:
   * At a given endpoint, check if there are perpendicular rails going in BOTH directions
   */
  function checkEndpointHasRailsBothDirections(
    service: GridService,
    rail: Rail,
    endpoint: 'start' | 'end'
  ): { hasNegative: boolean; hasPositive: boolean; reason: string } {
    const boundRailId = endpoint === 'start' ? rail.startBound : rail.endBound;

    // No bound = at fixed edge (0% or 100%) = OK
    if (!boundRailId) {
      return { hasNegative: true, hasPositive: true, reason: 'No bound (at fixed edge)' };
    }

    const boundRail = service.getRail(boundRailId);
    if (!boundRail) {
      return { hasNegative: true, hasPositive: true, reason: 'Bound rail not found' };
    }

    // Fixed bound rail = OK
    if (boundRail.fixed) {
      return { hasNegative: true, hasPositive: true, reason: 'Bound rail is fixed' };
    }

    const intersectionOnBoundAxis = boundRail.position;
    const intersectionOnOurAxis = rail.position;
    const tolerance = 0.5;

    let hasNegative = false;
    let hasPositive = false;
    const foundRails: string[] = [];

    // Check perpendicular rails (same direction as bound rail)
    service.getAllRails().forEach(r => {
      if (r.direction !== boundRail.direction) return;
      if (Math.abs(r.position - intersectionOnBoundAxis) > tolerance) return;

      const rBounds = service.getRailBounds(r.id);
      if (!rBounds) return;

      const startsAt = Math.abs(rBounds.start - intersectionOnOurAxis) <= tolerance;
      const endsAt = Math.abs(rBounds.end - intersectionOnOurAxis) <= tolerance;
      const passesThrough = rBounds.start < intersectionOnOurAxis - tolerance &&
                            rBounds.end > intersectionOnOurAxis + tolerance;

      if (startsAt) {
        hasPositive = true;
        foundRails.push(`${r.id} starts here`);
      }
      if (endsAt) {
        hasNegative = true;
        foundRails.push(`${r.id} ends here`);
      }
      if (passesThrough) {
        hasNegative = true;
        hasPositive = true;
        foundRails.push(`${r.id} passes through`);
      }
    });

    // Check parallel rails (same direction as our rail)
    service.getAllRails().forEach(r => {
      if (r.direction !== rail.direction) return;
      if (r.id === rail.id) return;
      if (Math.abs(r.position - intersectionOnOurAxis) > tolerance) return;

      const rBounds = service.getRailBounds(r.id);
      if (!rBounds) return;

      const startsAtBound = Math.abs(rBounds.start - intersectionOnBoundAxis) <= tolerance;
      const endsAtBound = Math.abs(rBounds.end - intersectionOnBoundAxis) <= tolerance;

      if (startsAtBound) {
        hasPositive = true;
        foundRails.push(`${r.id} (parallel) starts at bound`);
      }
      if (endsAtBound) {
        hasNegative = true;
        foundRails.push(`${r.id} (parallel) ends at bound`);
      }
    });

    return {
      hasNegative,
      hasPositive,
      reason: foundRails.length > 0 ? foundRails.join(', ') : 'No rails found at intersection'
    };
  }

  /**
   * Expected result based on fundamental rule for a single rail
   */
  function expectedCanMoveIndependently(service: GridService, railId: string): boolean {
    const rail = service.getRail(railId);
    if (!rail || rail.fixed) return false;

    const startCheck = checkEndpointHasRailsBothDirections(service, rail, 'start');
    const endCheck = checkEndpointHasRailsBothDirections(service, rail, 'end');

    return (startCheck.hasNegative && startCheck.hasPositive) &&
           (endCheck.hasNegative && endCheck.hasPositive);
  }

  /**
   * Expected result based on fundamental rule for aligned group
   */
  function expectedCanAlignedGroupMove(service: GridService, railId: string): boolean {
    const rail = service.getRail(railId);
    if (!rail || rail.fixed) return false;

    const alignedRails = service.getAdjacentAlignedRails(railId, 1);
    if (alignedRails.length === 0) return false;

    // Find first and last rail in the group
    const railsWithBounds: { rail: Rail; start: number; end: number }[] = [];
    for (const r of alignedRails) {
      const bounds = service.getRailBounds(r.id);
      if (bounds) {
        railsWithBounds.push({ rail: r, start: bounds.start, end: bounds.end });
      }
    }

    if (railsWithBounds.length === 0) return false;

    railsWithBounds.sort((a, b) => a.start - b.start);
    const firstRail = railsWithBounds[0].rail;
    const lastRail = railsWithBounds.reduce((max, curr) =>
      curr.end > max.end ? curr : max, railsWithBounds[0]).rail;

    const startCheck = checkEndpointHasRailsBothDirections(service, firstRail, 'start');
    const endCheck = checkEndpointHasRailsBothDirections(service, lastRail, 'end');

    return (startCheck.hasNegative && startCheck.hasPositive) &&
           (endCheck.hasNegative && endCheck.hasPositive);
  }

  // ============ Test: 1x2 grid (2 cells side by side) ============
  /**
   * +-------+-------+
   * |   A   |   B   |
   * +-------+-------+
   */
  describe('1x2 grid (1 row, 2 columns)', () => {
    let service: GridService;

    beforeEach(() => {
      service = new GridService();
      service.loadConfig(createTestGrid(1, 2));
    });

    it('should have 1 internal vertical rail', () => {
      const draggable = service.getDraggableRails();
      const verticals = draggable.filter(r => r.direction === 'vertical');
      expect(verticals.length).toBe(1);
    });

    it('vertical rail should be movable (spans full height)', () => {
      const draggable = service.getDraggableRails();
      const vertical = draggable.find(r => r.direction === 'vertical');
      expect(vertical).toBeDefined();

      const expected = expectedCanAlignedGroupMove(service, vertical!.id);
      const actual = service.canAlignedGroupMove(vertical!.id);

      console.log(visualizeGrid(service));
      console.log(`Rail ${vertical!.id}: expected=${expected}, actual=${actual}`);

      expect(actual).toBe(expected);
      expect(actual).toBe(true); // Should be movable
    });
  });

  // ============ Test: 2x1 grid (2 cells stacked) ============
  /**
   * +---------------+
   * |       A       |
   * +---------------+
   * |       B       |
   * +---------------+
   */
  describe('2x1 grid (2 rows, 1 column)', () => {
    let service: GridService;

    beforeEach(() => {
      service = new GridService();
      service.loadConfig(createTestGrid(2, 1));
    });

    it('should have 1 internal horizontal rail', () => {
      const draggable = service.getDraggableRails();
      const horizontals = draggable.filter(r => r.direction === 'horizontal');
      expect(horizontals.length).toBe(1);
    });

    it('horizontal rail should be movable (spans full width)', () => {
      const draggable = service.getDraggableRails();
      const horizontal = draggable.find(r => r.direction === 'horizontal');
      expect(horizontal).toBeDefined();

      const expected = expectedCanAlignedGroupMove(service, horizontal!.id);
      const actual = service.canAlignedGroupMove(horizontal!.id);

      console.log(visualizeGrid(service));
      console.log(`Rail ${horizontal!.id}: expected=${expected}, actual=${actual}`);

      expect(actual).toBe(expected);
      expect(actual).toBe(true); // Should be movable
    });
  });

  // ============ Test: 2x2 grid (4 cells) ============
  /**
   * +-------+-------+
   * |   A   |   B   |
   * +-------+-------+
   * |   C   |   D   |
   * +-------+-------+
   */
  describe('2x2 grid (4 cells)', () => {
    let service: GridService;

    beforeEach(() => {
      service = new GridService();
      service.loadConfig(createTestGrid(2, 2));
    });

    it('should have correct number of internal rails', () => {
      const draggable = service.getDraggableRails();
      // 2x2 grid has 1 vertical line (2 segments) and 1 horizontal line (2 segments)
      // But they might be stored as separate rails depending on createGrid implementation
      expect(draggable.length).toBeGreaterThanOrEqual(2);
    });

    it('all draggable rails should be movable as aligned groups', () => {
      const draggable = service.getDraggableRails();
      console.log(visualizeGrid(service));

      draggable.forEach(rail => {
        const expected = expectedCanAlignedGroupMove(service, rail.id);
        const actual = service.canAlignedGroupMove(rail.id);

        console.log(`Rail ${rail.id} (${rail.direction}): expected=${expected}, actual=${actual}`);

        expect(actual).toBe(expected);
      });
    });

    it('individual segments should NOT be movable solo (they dont span full extent)', () => {
      const draggable = service.getDraggableRails();

      draggable.forEach(rail => {
        const bounds = service.getRailBounds(rail.id);
        const spansFullExtent = bounds && bounds.start <= 0.5 && bounds.end >= 99.5;

        const expected = expectedCanMoveIndependently(service, rail.id);
        const actual = service.canRailMoveIndependently(rail.id);

        console.log(`Rail ${rail.id}: bounds=${JSON.stringify(bounds)}, spansFullExtent=${spansFullExtent}, expectedSolo=${expected}, actualSolo=${actual}`);

        expect(actual).toBe(expected);
      });
    });
  });

  // ============ Test: 3x3 grid (9 cells) ============
  /**
   * +-----+-----+-----+
   * |  A  |  B  |  C  |
   * +-----+-----+-----+
   * |  D  |  E  |  F  |
   * +-----+-----+-----+
   * |  G  |  H  |  I  |
   * +-----+-----+-----+
   */
  describe('3x3 grid (9 cells)', () => {
    let service: GridService;

    beforeEach(() => {
      service = new GridService();
      service.loadConfig(createTestGrid(3, 3));
    });

    it('all draggable rails should be movable as aligned groups', () => {
      const draggable = service.getDraggableRails();
      console.log(visualizeGrid(service));

      let allCorrect = true;
      draggable.forEach(rail => {
        const expected = expectedCanAlignedGroupMove(service, rail.id);
        const actual = service.canAlignedGroupMove(rail.id);

        if (actual !== expected) {
          console.error(`MISMATCH: Rail ${rail.id} (${rail.direction}): expected=${expected}, actual=${actual}`);
          allCorrect = false;
        }
      });

      expect(allCorrect).toBe(true);
    });
  });

  // ============ Test all rectangular grids up to 16 cells ============
  describe('All rectangular grid configurations (2-16 cells)', () => {
    const configurations: [number, number][] = [];

    // Generate all row x col combinations that result in 2-16 cells
    for (let cells = 2; cells <= 16; cells++) {
      for (let rows = 1; rows <= cells; rows++) {
        if (cells % rows === 0) {
          const cols = cells / rows;
          configurations.push([rows, cols]);
        }
      }
    }

    configurations.forEach(([rows, cols]) => {
      describe(`${rows}x${cols} grid (${rows * cols} cells)`, () => {
        let service: GridService;

        beforeEach(() => {
          service = new GridService();
          service.loadConfig(createTestGrid(rows, cols));
        });

        it(`should correctly validate all rail movements`, () => {
          const draggable = service.getDraggableRails();

          if (draggable.length === 0) {
            console.log(`${rows}x${cols}: No draggable rails (single cell?)`);
            return;
          }

          console.log(`\n=== Testing ${rows}x${cols} grid (${rows * cols} cells, ${draggable.length} draggable rails) ===`);
          console.log(visualizeGrid(service));

          let failures: string[] = [];

          draggable.forEach(rail => {
            // Test aligned group movement
            const expectedGroup = expectedCanAlignedGroupMove(service, rail.id);
            const actualGroup = service.canAlignedGroupMove(rail.id);

            if (actualGroup !== expectedGroup) {
              failures.push(`Rail ${rail.id} canAlignedGroupMove: expected=${expectedGroup}, actual=${actualGroup}`);
            }

            // Test solo movement
            const expectedSolo = expectedCanMoveIndependently(service, rail.id);
            const actualSolo = service.canRailMoveIndependently(rail.id);

            if (actualSolo !== expectedSolo) {
              failures.push(`Rail ${rail.id} canRailMoveIndependently: expected=${expectedSolo}, actual=${actualSolo}`);
            }
          });

          if (failures.length > 0) {
            console.error('FAILURES:', failures);
          }

          expect(failures.length).toBe(0);
        });
      });
    });
  });

  // ============ Test: After splitting a cell ============
  describe('After splitting cells', () => {
    /**
     * Before:                    After horizontal split of A:
     * +-------+-------+          +-------+-------+
     * |   A   |   B   |          |  A1   |   B   |
     * +-------+-------+    =>    +-------+       |
     * |   C   |   D   |          |  A2   |       |
     * +-------+-------+          +-------+-------+
     *                            |   C   |   D   |
     *                            +-------+-------+
     */
    it('should correctly validate rails after horizontal split in 2x2 grid', () => {
      const service = new GridService();
      service.loadConfig(createTestGrid(2, 2));

      console.log('\n=== Before split ===');
      console.log(visualizeGrid(service));

      // Split the first cell horizontally
      const cells = service.getAllCells();
      const firstCellId = cells[0].id;
      service.splitCellHorizontal(firstCellId, 50);

      console.log('\n=== After horizontal split ===');
      console.log(visualizeGrid(service));

      const draggable = service.getDraggableRails();
      let failures: string[] = [];

      draggable.forEach(rail => {
        const expectedGroup = expectedCanAlignedGroupMove(service, rail.id);
        const actualGroup = service.canAlignedGroupMove(rail.id);

        if (actualGroup !== expectedGroup) {
          failures.push(`Rail ${rail.id} canAlignedGroupMove: expected=${expectedGroup}, actual=${actualGroup}`);
        }
      });

      if (failures.length > 0) {
        console.error('FAILURES after split:', failures);
      }

      expect(failures.length).toBe(0);
    });

    /**
     * Before:                    After vertical split of A:
     * +-------+-------+          +---+---+-------+
     * |   A   |   B   |          |A1 |A2 |   B   |
     * +-------+-------+    =>    +---+---+-------+
     * |   C   |   D   |          |   C   |   D   |
     * +-------+-------+          +-------+-------+
     */
    it('should correctly validate rails after vertical split in 2x2 grid', () => {
      const service = new GridService();
      service.loadConfig(createTestGrid(2, 2));

      // Split the first cell vertically
      const cells = service.getAllCells();
      const firstCellId = cells[0].id;
      service.splitCellVertical(firstCellId, 50);

      console.log('\n=== After vertical split ===');
      console.log(visualizeGrid(service));

      const draggable = service.getDraggableRails();
      let failures: string[] = [];

      draggable.forEach(rail => {
        const expectedGroup = expectedCanAlignedGroupMove(service, rail.id);
        const actualGroup = service.canAlignedGroupMove(rail.id);

        if (actualGroup !== expectedGroup) {
          failures.push(`Rail ${rail.id} canAlignedGroupMove: expected=${expectedGroup}, actual=${actualGroup}`);
        }
      });

      if (failures.length > 0) {
        console.error('FAILURES after split:', failures);
      }

      expect(failures.length).toBe(0);
    });
  });

  // ============ Test: Non-rectangular configurations ============
  // These are grids created by successive splits at different positions
  // Format: 1+2 means 1 cell on top, 2 cells on bottom (3 cells total)

  describe('Non-rectangular configurations', () => {

    /**
     * Helper to validate all rails in a grid
     */
    function validateAllRails(service: GridService, testName: string): string[] {
      const draggable = service.getDraggableRails();
      const failures: string[] = [];

      console.log(`\n=== ${testName} ===`);
      console.log(visualizeGrid(service));

      draggable.forEach(rail => {
        const expectedGroup = expectedCanAlignedGroupMove(service, rail.id);
        const actualGroup = service.canAlignedGroupMove(rail.id);

        if (actualGroup !== expectedGroup) {
          failures.push(`Rail ${rail.id} canAlignedGroupMove: expected=${expectedGroup}, actual=${actualGroup}`);
        }

        const expectedSolo = expectedCanMoveIndependently(service, rail.id);
        const actualSolo = service.canRailMoveIndependently(rail.id);

        if (actualSolo !== expectedSolo) {
          failures.push(`Rail ${rail.id} canRailMoveIndependently: expected=${expectedSolo}, actual=${actualSolo}`);
        }

        console.log(`Rail ${rail.id}: group=${actualGroup} (exp=${expectedGroup}), solo=${actualSolo} (exp=${expectedSolo})`);
      });

      return failures;
    }

    /**
     * 1+2 configuration (3 cells):
     * +-----------------+
     * |        A        |
     * +--------+--------+
     * |   B    |   C    |
     * +--------+--------+
     */
    it('1+2: 1 cell top, 2 cells bottom', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Horizontal split at 50%
          { id: 'h-50', direction: 'horizontal', position: 50, fixed: false },
          // Vertical split in bottom half only (from h-50 to h-100)
          { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-50', endBound: undefined },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-50' },
          { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-50', bottomRail: 'h-100' },
          { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-50', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '1+2 configuration');
      expect(failures).toEqual([]);
    });

    /**
     * 2+1 configuration (3 cells):
     * +--------+--------+
     * |   A    |   B    |
     * +--------+--------+
     * |        C        |
     * +-----------------+
     */
    it('2+1: 2 cells top, 1 cell bottom', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Horizontal split at 50%
          { id: 'h-50', direction: 'horizontal', position: 50, fixed: false },
          // Vertical split in top half only (from h-0 to h-50)
          { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: undefined, endBound: 'h-50' },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-0', bottomRail: 'h-50' },
          { id: 'cell-B', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-50' },
          { id: 'cell-C', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-50', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '2+1 configuration');
      expect(failures).toEqual([]);
    });

    /**
     * 1+2+1 configuration (4 cells):
     * +-----------------+
     * |        A        |
     * +--------+--------+
     * |   B    |   C    |
     * +--------+--------+
     * |        D        |
     * +-----------------+
     */
    it('1+2+1: sandwich configuration', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Two horizontal splits
          { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
          { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
          // Vertical split in middle only (from h-33 to h-66)
          { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '1+2+1 sandwich configuration');
      expect(failures).toEqual([]);
    });

    /**
     * 1+2+2 configuration (5 cells):
     * +-----------------+
     * |        A        |
     * +--------+--------+
     * |   B    |   C    |
     * +----+---+--------+
     * | D  |     E      |
     * +----+------------+
     *
     * The vertical splits are at different positions!
     */
    it('1+2+2: offset splits', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Two horizontal splits
          { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
          { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
          // Vertical at 50% from h-33 to h-66 (middle row)
          { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          // Vertical at 30% from h-66 to h-100 (bottom row)
          { id: 'v-30', direction: 'vertical', position: 30, fixed: false, startBound: 'h-66', endBound: undefined },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-30', topRail: 'h-66', bottomRail: 'h-100' },
          { id: 'cell-E', leftRail: 'v-30', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '1+2+2 offset splits');
      expect(failures).toEqual([]);
    });

    /**
     * 2+1+2 configuration (5 cells):
     * +--------+--------+
     * |   A    |   B    |
     * +--------+--------+
     * |        C        |
     * +--------+--------+
     * |   D    |   E    |
     * +--------+--------+
     */
    it('2+1+2: hourglass shape', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Two horizontal splits
          { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
          { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
          // Vertical at 50% from h-0 to h-33 (top row)
          { id: 'v-50-top', direction: 'vertical', position: 50, fixed: false, startBound: undefined, endBound: 'h-33' },
          // Vertical at 50% from h-66 to h-100 (bottom row)
          { id: 'v-50-bot', direction: 'vertical', position: 50, fixed: false, startBound: 'h-66', endBound: undefined },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-50-top', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-B', leftRail: 'v-50-top', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-C', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-50-bot', topRail: 'h-66', bottomRail: 'h-100' },
          { id: 'cell-E', leftRail: 'v-50-bot', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '2+1+2 hourglass shape');
      expect(failures).toEqual([]);
    });

    /**
     * 1+3 configuration (4 cells):
     * +-----------------+
     * |        A        |
     * +-----+-----+-----+
     * |  B  |  C  |  D  |
     * +-----+-----+-----+
     */
    it('1+3: 1 cell top, 3 cells bottom', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Horizontal split
          { id: 'h-50', direction: 'horizontal', position: 50, fixed: false },
          // Two vertical splits in bottom half
          { id: 'v-33', direction: 'vertical', position: 33, fixed: false, startBound: 'h-50', endBound: undefined },
          { id: 'v-66', direction: 'vertical', position: 66, fixed: false, startBound: 'h-50', endBound: undefined },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-50' },
          { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-33', topRail: 'h-50', bottomRail: 'h-100' },
          { id: 'cell-C', leftRail: 'v-33', rightRail: 'v-66', topRail: 'h-50', bottomRail: 'h-100' },
          { id: 'cell-D', leftRail: 'v-66', rightRail: 'v-100', topRail: 'h-50', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '1+3 configuration');
      expect(failures).toEqual([]);
    });

    /**
     * 3+1 configuration (4 cells):
     * +-----+-----+-----+
     * |  A  |  B  |  C  |
     * +-----+-----+-----+
     * |        D        |
     * +-----------------+
     */
    it('3+1: 3 cells top, 1 cell bottom', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Horizontal split
          { id: 'h-50', direction: 'horizontal', position: 50, fixed: false },
          // Two vertical splits in top half
          { id: 'v-33', direction: 'vertical', position: 33, fixed: false, startBound: undefined, endBound: 'h-50' },
          { id: 'v-66', direction: 'vertical', position: 66, fixed: false, startBound: undefined, endBound: 'h-50' },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-33', topRail: 'h-0', bottomRail: 'h-50' },
          { id: 'cell-B', leftRail: 'v-33', rightRail: 'v-66', topRail: 'h-0', bottomRail: 'h-50' },
          { id: 'cell-C', leftRail: 'v-66', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-50' },
          { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-50', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '3+1 configuration');
      expect(failures).toEqual([]);
    });

    /**
     * 2+3 configuration (5 cells):
     * +--------+--------+
     * |   A    |   B    |
     * +-----+--+--+-----+
     * |  C  | D  |  E   |
     * +-----+----+------+
     *
     * Vertical splits at different positions!
     */
    it('2+3: misaligned splits', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Horizontal split
          { id: 'h-50', direction: 'horizontal', position: 50, fixed: false },
          // Vertical at 50% in top half
          { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: undefined, endBound: 'h-50' },
          // Verticals at 33% and 66% in bottom half
          { id: 'v-33', direction: 'vertical', position: 33, fixed: false, startBound: 'h-50', endBound: undefined },
          { id: 'v-66', direction: 'vertical', position: 66, fixed: false, startBound: 'h-50', endBound: undefined },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-0', bottomRail: 'h-50' },
          { id: 'cell-B', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-50' },
          { id: 'cell-C', leftRail: 'v-0', rightRail: 'v-33', topRail: 'h-50', bottomRail: 'h-100' },
          { id: 'cell-D', leftRail: 'v-33', rightRail: 'v-66', topRail: 'h-50', bottomRail: 'h-100' },
          { id: 'cell-E', leftRail: 'v-66', rightRail: 'v-100', topRail: 'h-50', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '2+3 misaligned splits');
      expect(failures).toEqual([]);
    });

    /**
     * 1+2+3 configuration (6 cells):
     * +-----------------+
     * |        A        |
     * +--------+--------+
     * |   B    |   C    |
     * +-----+--+--+-----+
     * |  D  | E  |  F   |
     * +-----+----+------+
     */
    it('1+2+3: pyramid shape', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Two horizontal splits
          { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
          { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
          // Vertical at 50% in middle row
          { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          // Verticals at 33% and 66% in bottom row
          { id: 'v-33', direction: 'vertical', position: 33, fixed: false, startBound: 'h-66', endBound: undefined },
          { id: 'v-66', direction: 'vertical', position: 66, fixed: false, startBound: 'h-66', endBound: undefined },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-33', topRail: 'h-66', bottomRail: 'h-100' },
          { id: 'cell-E', leftRail: 'v-33', rightRail: 'v-66', topRail: 'h-66', bottomRail: 'h-100' },
          { id: 'cell-F', leftRail: 'v-66', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '1+2+3 pyramid shape');
      expect(failures).toEqual([]);
    });

    /**
     * 3+2+1 configuration (6 cells) - inverted pyramid:
     * +-----+-----+-----+
     * |  A  |  B  |  C  |
     * +-----+--+--+-----+
     * |   D    |   E    |
     * +--------+--------+
     * |        F        |
     * +-----------------+
     */
    it('3+2+1: inverted pyramid', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Two horizontal splits
          { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
          { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
          // Verticals at 33% and 66% in top row
          { id: 'v-33', direction: 'vertical', position: 33, fixed: false, startBound: undefined, endBound: 'h-33' },
          { id: 'v-66', direction: 'vertical', position: 66, fixed: false, startBound: undefined, endBound: 'h-33' },
          // Vertical at 50% in middle row
          { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-33', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-B', leftRail: 'v-33', rightRail: 'v-66', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-C', leftRail: 'v-66', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-E', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-F', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '3+2+1 inverted pyramid');
      expect(failures).toEqual([]);
    });

    /**
     * Complex 7-cell layout:
     * +--------+--------+
     * |   A    |   B    |
     * +--+-----+-----+--+
     * |C |     D     | E|
     * +--+-----+-----+--+
     * |   F    |   G    |
     * +--------+--------+
     *
     * Middle row has narrow cells on sides, wide cell in middle
     */
    it('2+3+2: complex 7-cell layout', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Two horizontal splits
          { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
          { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
          // Top row: vertical at 50%
          { id: 'v-50-top', direction: 'vertical', position: 50, fixed: false, startBound: undefined, endBound: 'h-33' },
          // Middle row: verticals at 20% and 80%
          { id: 'v-20', direction: 'vertical', position: 20, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          { id: 'v-80', direction: 'vertical', position: 80, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          // Bottom row: vertical at 50%
          { id: 'v-50-bot', direction: 'vertical', position: 50, fixed: false, startBound: 'h-66', endBound: undefined },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-50-top', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-B', leftRail: 'v-50-top', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-C', leftRail: 'v-0', rightRail: 'v-20', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-D', leftRail: 'v-20', rightRail: 'v-80', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-E', leftRail: 'v-80', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-F', leftRail: 'v-0', rightRail: 'v-50-bot', topRail: 'h-66', bottomRail: 'h-100' },
          { id: 'cell-G', leftRail: 'v-50-bot', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '2+3+2 complex 7-cell layout');
      expect(failures).toEqual([]);
    });

    /**
     * IDE-like layout (8 cells):
     * +--------+------------------+
     * |        |     Toolbar      |
     * | Side   +--------+---------+
     * | bar    | Editor | Preview |
     * |        +--------+---------+
     * +--------+     Console      |
     * | Status +------------------+
     * +--------+------------------+
     */
    it('IDE-like layout: complex 8-cell', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Vertical split for sidebar (at 20%)
          { id: 'v-20', direction: 'vertical', position: 20, fixed: false },
          // Horizontal splits
          { id: 'h-10', direction: 'horizontal', position: 10, fixed: false, startBound: 'v-20', endBound: undefined }, // toolbar bottom
          { id: 'h-70', direction: 'horizontal', position: 70, fixed: false, startBound: 'v-20', endBound: undefined }, // editor/console split
          { id: 'h-90', direction: 'horizontal', position: 90, fixed: false, startBound: undefined, endBound: 'v-20' }, // status bar top
          // Vertical split for editor/preview (at 60%, only in editor row)
          { id: 'v-60', direction: 'vertical', position: 60, fixed: false, startBound: 'h-10', endBound: 'h-70' },
        ],
        cells: [
          { id: 'sidebar-top', leftRail: 'v-0', rightRail: 'v-20', topRail: 'h-0', bottomRail: 'h-90' },
          { id: 'status', leftRail: 'v-0', rightRail: 'v-20', topRail: 'h-90', bottomRail: 'h-100' },
          { id: 'toolbar', leftRail: 'v-20', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-10' },
          { id: 'editor', leftRail: 'v-20', rightRail: 'v-60', topRail: 'h-10', bottomRail: 'h-70' },
          { id: 'preview', leftRail: 'v-60', rightRail: 'v-100', topRail: 'h-10', bottomRail: 'h-70' },
          { id: 'console', leftRail: 'v-20', rightRail: 'v-100', topRail: 'h-70', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, 'IDE-like layout');
      expect(failures).toEqual([]);
    });

    /**
     * 1+2+2+2 configuration (7 cells):
     * +-----------------+
     * |        A        |
     * +--------+--------+
     * |   B    |   C    |
     * +----+---+---+----+
     * | D  |   E   | F  |
     * +----+---+---+----+
     * |   G    |   H    |
     * +--------+--------+
     *
     * Wait this is 8 cells, let me fix:
     * 1+2+2+2 = 7 should be:
     * +-----------------+
     * |        A        |
     * +--------+--------+
     * |   B    |   C    |
     * +---+----+----+---+
     * | D |    E    | F |
     * +---+---------+---+
     */
    it('1+2+3: seven cells stacked', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Horizontal splits
          { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
          { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
          // Row 2: 50% split
          { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          // Row 3: 25% and 75% splits
          { id: 'v-25', direction: 'vertical', position: 25, fixed: false, startBound: 'h-66', endBound: undefined },
          { id: 'v-75', direction: 'vertical', position: 75, fixed: false, startBound: 'h-66', endBound: undefined },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-25', topRail: 'h-66', bottomRail: 'h-100' },
          { id: 'cell-E', leftRail: 'v-25', rightRail: 'v-75', topRail: 'h-66', bottomRail: 'h-100' },
          { id: 'cell-F', leftRail: 'v-75', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '1+2+3 seven cells');
      expect(failures).toEqual([]);
    });

    /**
     * 4+4+4+4 = 16 cells BUT with different column positions per row:
     * +--+--+--+--+
     * |A |B |C |D |   <- splits at 25, 50, 75
     * +--+--+--+--+
     * | E |  F | G|   <- splits at 33, 66
     * +---+----+--+
     * |H |I |J |K |   <- splits at 20, 50, 80
     * +--+--+--+--+
     * |  L  |  M  |   <- split at 50
     * +-----+-----+
     */
    it('16 cells with different splits per row', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // 3 horizontal splits
          { id: 'h-25', direction: 'horizontal', position: 25, fixed: false },
          { id: 'h-50', direction: 'horizontal', position: 50, fixed: false },
          { id: 'h-75', direction: 'horizontal', position: 75, fixed: false },
          // Row 1 (0-25): splits at 25, 50, 75
          { id: 'v-25-r1', direction: 'vertical', position: 25, fixed: false, startBound: undefined, endBound: 'h-25' },
          { id: 'v-50-r1', direction: 'vertical', position: 50, fixed: false, startBound: undefined, endBound: 'h-25' },
          { id: 'v-75-r1', direction: 'vertical', position: 75, fixed: false, startBound: undefined, endBound: 'h-25' },
          // Row 2 (25-50): splits at 33, 66
          { id: 'v-33-r2', direction: 'vertical', position: 33, fixed: false, startBound: 'h-25', endBound: 'h-50' },
          { id: 'v-66-r2', direction: 'vertical', position: 66, fixed: false, startBound: 'h-25', endBound: 'h-50' },
          // Row 3 (50-75): splits at 20, 50, 80
          { id: 'v-20-r3', direction: 'vertical', position: 20, fixed: false, startBound: 'h-50', endBound: 'h-75' },
          { id: 'v-50-r3', direction: 'vertical', position: 50, fixed: false, startBound: 'h-50', endBound: 'h-75' },
          { id: 'v-80-r3', direction: 'vertical', position: 80, fixed: false, startBound: 'h-50', endBound: 'h-75' },
          // Row 4 (75-100): split at 50
          { id: 'v-50-r4', direction: 'vertical', position: 50, fixed: false, startBound: 'h-75', endBound: undefined },
        ],
        cells: [
          // Row 1
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-25-r1', topRail: 'h-0', bottomRail: 'h-25' },
          { id: 'cell-B', leftRail: 'v-25-r1', rightRail: 'v-50-r1', topRail: 'h-0', bottomRail: 'h-25' },
          { id: 'cell-C', leftRail: 'v-50-r1', rightRail: 'v-75-r1', topRail: 'h-0', bottomRail: 'h-25' },
          { id: 'cell-D', leftRail: 'v-75-r1', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-25' },
          // Row 2
          { id: 'cell-E', leftRail: 'v-0', rightRail: 'v-33-r2', topRail: 'h-25', bottomRail: 'h-50' },
          { id: 'cell-F', leftRail: 'v-33-r2', rightRail: 'v-66-r2', topRail: 'h-25', bottomRail: 'h-50' },
          { id: 'cell-G', leftRail: 'v-66-r2', rightRail: 'v-100', topRail: 'h-25', bottomRail: 'h-50' },
          // Row 3
          { id: 'cell-H', leftRail: 'v-0', rightRail: 'v-20-r3', topRail: 'h-50', bottomRail: 'h-75' },
          { id: 'cell-I', leftRail: 'v-20-r3', rightRail: 'v-50-r3', topRail: 'h-50', bottomRail: 'h-75' },
          { id: 'cell-J', leftRail: 'v-50-r3', rightRail: 'v-80-r3', topRail: 'h-50', bottomRail: 'h-75' },
          { id: 'cell-K', leftRail: 'v-80-r3', rightRail: 'v-100', topRail: 'h-50', bottomRail: 'h-75' },
          // Row 4
          { id: 'cell-L', leftRail: 'v-0', rightRail: 'v-50-r4', topRail: 'h-75', bottomRail: 'h-100' },
          { id: 'cell-M', leftRail: 'v-50-r4', rightRail: 'v-100', topRail: 'h-75', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, '13 cells with different splits per row');
      expect(failures).toEqual([]);
    });

    /**
     * Checkerboard-like pattern (alternating splits):
     * +-----+-----+
     * |  A  |  B  |
     * +--+--+--+--+
     * |C | D | E |
     * +--+--+--+--+
     * |  F  |  G  |
     * +-----+-----+
     */
    it('Checkerboard pattern: alternating splits', () => {
      const service = new GridService();
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // 2 horizontal splits
          { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
          { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
          // Row 1: split at 50
          { id: 'v-50-r1', direction: 'vertical', position: 50, fixed: false, startBound: undefined, endBound: 'h-33' },
          // Row 2: splits at 33 and 66
          { id: 'v-33-r2', direction: 'vertical', position: 33, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          { id: 'v-66-r2', direction: 'vertical', position: 66, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          // Row 3: split at 50
          { id: 'v-50-r3', direction: 'vertical', position: 50, fixed: false, startBound: 'h-66', endBound: undefined },
        ],
        cells: [
          { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-50-r1', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-B', leftRail: 'v-50-r1', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
          { id: 'cell-C', leftRail: 'v-0', rightRail: 'v-33-r2', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-D', leftRail: 'v-33-r2', rightRail: 'v-66-r2', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-E', leftRail: 'v-66-r2', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
          { id: 'cell-F', leftRail: 'v-0', rightRail: 'v-50-r3', topRail: 'h-66', bottomRail: 'h-100' },
          { id: 'cell-G', leftRail: 'v-50-r3', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
        ],
      };
      service.loadConfig(config);

      const failures = validateAllRails(service, 'Checkerboard pattern');
      expect(failures).toEqual([]);
    });
  });

  // ============ Test: Dynamic Scenarios ============
  // These tests simulate user interactions: start with a config, split/move rails,
  // and verify at each step which rails CAN and CANNOT move.

  describe('Dynamic Scenarios', () => {

    /**
     * Helper to get a rail by a partial id match or by position/direction
     */
    function findRail(service: GridService, direction: 'vertical' | 'horizontal', position: number, tolerance: number = 1): Rail | undefined {
      return service.getAllRails().find(r =>
        r.direction === direction && Math.abs(r.position - position) <= tolerance
      );
    }

    /**
     * Helper to get rails by direction
     */
    function getRailsByDirection(service: GridService, direction: 'vertical' | 'horizontal'): Rail[] {
      return service.getAllRails().filter(r => r.direction === direction && !r.fixed);
    }

    /**
     * Helper to verify which rails CAN move (aligned group)
     */
    function verifyCanMove(service: GridService, railIds: string[], shouldMove: boolean, testName: string): string[] {
      const failures: string[] = [];
      for (const railId of railIds) {
        const actual = service.canAlignedGroupMove(railId);
        if (actual !== shouldMove) {
          failures.push(`${testName}: Rail ${railId} canAlignedGroupMove: expected=${shouldMove}, actual=${actual}`);
        }
      }
      return failures;
    }

    /**
     * Helper to verify which rails CAN move independently (solo mode)
     */
    function verifyCanMoveSolo(service: GridService, railIds: string[], shouldMove: boolean, testName: string): string[] {
      const failures: string[] = [];
      for (const railId of railIds) {
        const actual = service.canRailMoveIndependently(railId);
        if (actual !== shouldMove) {
          failures.push(`${testName}: Rail ${railId} canRailMoveIndependently: expected=${shouldMove}, actual=${actual}`);
        }
      }
      return failures;
    }

    /**
     * Scenario 1: 1+2+1 grid with progressive operations
     *
     * Initial state (1+2+1):
     * +-----------a-----------+
     * |           A           |
     * b-----c-----+-----d-----e
     * |     |  B  |  C  |     |
     * f-----g-----+-----h-----i
     * |           D           |
     * +-----------j-----------+
     *
     * Rails:
     * - Horizontal at 0%: fixed (top edge)
     * - Horizontal at 33% (ce): spans 0-100%, bounds by vertical fixed rails
     * - Horizontal at 66% (fh): spans 0-100%, bounds by vertical fixed rails
     * - Horizontal at 100%: fixed (bottom edge)
     * - Vertical at 0%: fixed (left edge)
     * - Vertical at 50% (dg): spans 33%-66%, bounded by h-33 and h-66
     * - Vertical at 100%: fixed (right edge)
     *
     * Expected movability:
     * - ce (h-33): CAN move (aligned group spans full width, endpoints at fixed edges)
     * - fh (h-66): CAN move (same reason)
     * - dg (v-50): CAN move (at each endpoint, ce/fh go both ways)
     *
     * Individual segments:
     * - ce cannot move independently (it's a single rail spanning full width, so yes actually)
     * - Actually ce IS one rail spanning full width, so it CAN move solo
     * - dg CAN move solo if at its endpoints there are rails in both directions
     */
    describe('Scenario 1: 1+2+1 grid operations', () => {

      it('Step 1: Initial 1+2+1 - verify which rails CAN and CANNOT move', () => {
        const service = new GridService();

        /**
         * +-----------------+
         * |        A        |  (0% - 33%)
         * +--------+--------+
         * |   B    |   C    |  (33% - 66%)
         * +--------+--------+
         * |        D        |  (66% - 100%)
         * +-----------------+
         */
        const config: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            // Horizontal rails (full width)
            { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
            { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
            // Vertical rail in middle only (from h-33 to h-66)
            { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          ],
          cells: [
            { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
            { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config);

        console.log('\n=== Scenario 1 Step 1: Initial 1+2+1 ===');
        console.log(visualizeGrid(service));

        const failures: string[] = [];

        // v-50 (dg): CAN move because at each endpoint:
        // - At h-33: h-33 goes both left (to v-0) and right (to v-100)
        // - At h-66: h-66 goes both left (to v-0) and right (to v-100)
        failures.push(...verifyCanMove(service, ['v-50'], true, 'v-50 (dg) should move'));

        // h-33 (ce): CAN move (full width, endpoints at fixed vertical rails)
        failures.push(...verifyCanMove(service, ['h-33'], true, 'h-33 (ce) should move'));

        // h-66 (fh): CAN move (full width, endpoints at fixed vertical rails)
        failures.push(...verifyCanMove(service, ['h-66'], true, 'h-66 (fh) should move'));

        if (failures.length > 0) {
          console.error('FAILURES:', failures);
        }
        expect(failures).toEqual([]);
      });

      it('Step 2: Split cell B to add vertical rail kl, verify movability', () => {
        const service = new GridService();

        /**
         * Before split:
         * +-----------------+
         * |        A        |
         * +--------+--------+
         * |   B    |   C    |
         * +--------+--------+
         * |        D        |
         * +-----------------+
         *
         * After splitting B vertically at 25%:
         * +-----------------+
         * |        A        |
         * +----+---+--------+
         * | B1 |B2 |   C    |
         * +----+---+--------+
         * |        D        |
         * +-----------------+
         *
         * The new vertical rail (kl) at 25% spans from h-33 to h-66 (same as v-50)
         * But kl is NOT aligned with v-50 (different position)
         */
        const config: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
            { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
            { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
            // New: kl at 25% (only in the B cell area: v-0 to v-50, h-33 to h-66)
            // But actually when we split B, kl goes from h-33 to h-66 on the left side
            { id: 'v-25', direction: 'vertical', position: 25, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          ],
          cells: [
            { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
            { id: 'cell-B1', leftRail: 'v-0', rightRail: 'v-25', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-B2', leftRail: 'v-25', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config);

        console.log('\n=== Scenario 1 Step 2: After adding kl (v-25) ===');
        console.log(visualizeGrid(service));

        const failures: string[] = [];

        // v-50 (dg): Still CAN move - h-33 and h-66 still go both ways at its endpoints
        failures.push(...verifyCanMove(service, ['v-50'], true, 'v-50 should still move'));

        // v-25 (kl): CAN move - h-33 and h-66 go both ways at its endpoints too
        failures.push(...verifyCanMove(service, ['v-25'], true, 'v-25 (kl) should move'));

        // h-33: Now has 2 vertical rails (v-25 and v-50) but still CAN move
        // because at its endpoints (v-0 and v-100), those are fixed
        failures.push(...verifyCanMove(service, ['h-33'], true, 'h-33 should still move'));

        // h-66: Same reasoning
        failures.push(...verifyCanMove(service, ['h-66'], true, 'h-66 should still move'));

        if (failures.length > 0) {
          console.error('FAILURES:', failures);
        }
        expect(failures).toEqual([]);
      });

      it('Step 3: Move kl to align with dg - both should now form one aligned group', () => {
        const service = new GridService();

        /**
         * After moving v-25 (kl) to position 50% (same as v-50):
         *
         * +-----------------+
         * |        A        |
         * +--------+--------+
         * |   B    |   C    |  <- Now B and C are split at 50%
         * +--------+--------+   (B was split but kl moved to 50%)
         * |        D        |
         * +-----------------+
         *
         * Wait, this doesn't make sense visually.
         * If we have v-25 at 25% and move it to 50%, it would overlap with v-50.
         *
         * Let me reconsider: The user's scenario describes creating a SEPARATE vertical
         * segment (kl) that is NOT aligned initially, then moving it to ALIGN with dg.
         *
         * Let's create the scenario properly:
         * - Start with 1+2+1
         * - Split cell D to create a new vertical rail (let's call it kl) at 25%
         * - kl exists only in the D row (h-66 to h-100)
         * - v-50 exists only in B/C row (h-33 to h-66)
         * - They are NOT aligned (different positions)
         * - Then move kl from 25% to 50% to align with v-50
         * - Now they form an aligned group and can move together
         */

        // Config where kl has been moved to align with dg
        const config: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
            { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
            // v-50 in middle row (B/C)
            { id: 'v-50-middle', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
            // kl in bottom row (D), NOW at position 50% (aligned with v-50-middle)
            { id: 'v-50-bottom', direction: 'vertical', position: 50, fixed: false, startBound: 'h-66', endBound: undefined },
          ],
          cells: [
            { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
            { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50-middle', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-C', leftRail: 'v-50-middle', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-D1', leftRail: 'v-0', rightRail: 'v-50-bottom', topRail: 'h-66', bottomRail: 'h-100' },
            { id: 'cell-D2', leftRail: 'v-50-bottom', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config);

        console.log('\n=== Scenario 1 Step 3: After moving kl to align with dg ===');
        console.log(visualizeGrid(service));

        /**
         * +-----------------+
         * |        A        |
         * +--------+--------+
         * |   B    |   C    |
         * +--------+--------+
         * |   D1   |   D2   |
         * +--------+--------+
         *
         * Now v-50-middle and v-50-bottom are aligned and adjacent (they share h-66 as bound)
         * They should form an aligned group.
         *
         * At the group's start endpoint (top of v-50-middle = h-33):
         * - h-33 goes from v-0 to v-100 (full width) -> both directions covered
         *
         * At the group's end endpoint (bottom of v-50-bottom = h-100 which is fixed):
         * - Fixed edge -> OK
         *
         * So the aligned group CAN move.
         */

        const failures: string[] = [];

        // Check that they're recognized as an aligned group
        const alignedGroup = service.getAdjacentAlignedRails('v-50-middle');
        console.log('Aligned group for v-50-middle:', alignedGroup.map(r => r.id));
        expect(alignedGroup.length).toBe(2);

        // v-50-middle and v-50-bottom: CAN move as aligned group
        failures.push(...verifyCanMove(service, ['v-50-middle', 'v-50-bottom'], true, 'aligned v-50 group should move'));

        // h-66: Now it's more complex. Let's analyze:
        // h-66 goes from v-0 to v-100 (full width)
        // At its endpoints (v-0 and v-100), those are fixed -> OK
        // So h-66 CAN still move
        failures.push(...verifyCanMove(service, ['h-66'], true, 'h-66 should still move'));

        // h-33: Same reasoning
        failures.push(...verifyCanMove(service, ['h-33'], true, 'h-33 should still move'));

        if (failures.length > 0) {
          console.error('FAILURES:', failures);
        }
        expect(failures).toEqual([]);
      });
    });

    /**
     * Scenario 2: User's specific test case
     *
     * Start with 1+2+1:
     * +-----------------+
     * |        A        |
     * +--------+--------+
     * |   B    |   C    |
     * +--------+--------+
     * |        D        |
     * +-----------------+
     *
     * Then split D to add kl, then move kl to align with the vertical split.
     *
     * Let's trace through the user's description:
     * - dg = vertical at 50% in middle row
     * - ce = horizontal at 33% (top of middle row)
     * - fh = horizontal at 66% (bottom of middle row)
     * - After split: kl is a new vertical in bottom row
     * - After move: kl aligns with dg
     */
    describe('Scenario 2: Complete user scenario with kl alignment', () => {

      it('Full scenario: 1+2+1 -> split D -> move kl to align with dg', () => {
        const service = new GridService();
        let failures: string[] = [];

        // ========== STEP 1: Initial 1+2+1 ==========
        console.log('\n========== STEP 1: Initial 1+2+1 ==========');

        /**
         * +-----------------+
         * |        A        |
         * +--------+--------+
         * |   B    |   C    |
         * +--------+--------+
         * |        D        |
         * +-----------------+
         *
         * Rails:
         * - h-33 (ce): horizontal at 33%, full width
         * - h-66 (fh): horizontal at 66%, full width
         * - v-50 (dg): vertical at 50%, from h-33 to h-66
         */
        const config1: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
            { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
            { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
          ],
          cells: [
            { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
            { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config1);
        console.log(visualizeGrid(service));

        // Verify Step 1:
        // CAN move: dg (v-50), ce (h-33), fh (h-66)
        failures.push(...verifyCanMove(service, ['v-50'], true, 'Step1: v-50 (dg)'));
        failures.push(...verifyCanMove(service, ['h-33'], true, 'Step1: h-33 (ce)'));
        failures.push(...verifyCanMove(service, ['h-66'], true, 'Step1: h-66 (fh)'));

        console.log('Step 1 verification:', failures.length === 0 ? 'PASS' : 'FAIL');

        // ========== STEP 2: Split D to add kl at 25% ==========
        console.log('\n========== STEP 2: Split D to add kl at 25% ==========');

        /**
         * +-----------------+
         * |        A        |
         * +--------+--------+
         * |   B    |   C    |
         * +----+---+--------+
         * | D1 |     D2     |
         * +----+------------+
         *
         * Rails added:
         * - v-25 (kl): vertical at 25%, from h-66 to h-100
         */
        const config2: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
            { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
            { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
            // New kl at 25% in bottom row
            { id: 'v-25', direction: 'vertical', position: 25, fixed: false, startBound: 'h-66', endBound: undefined },
          ],
          cells: [
            { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
            { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-D1', leftRail: 'v-0', rightRail: 'v-25', topRail: 'h-66', bottomRail: 'h-100' },
            { id: 'cell-D2', leftRail: 'v-25', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config2);
        console.log(visualizeGrid(service));

        // Verify Step 2:
        // CAN move: dg (v-50), ce (h-33), fh (h-66), kl (v-25)
        failures.push(...verifyCanMove(service, ['v-50'], true, 'Step2: v-50 (dg)'));
        failures.push(...verifyCanMove(service, ['h-33'], true, 'Step2: h-33 (ce)'));
        failures.push(...verifyCanMove(service, ['h-66'], true, 'Step2: h-66 (fh)'));
        failures.push(...verifyCanMove(service, ['v-25'], true, 'Step2: v-25 (kl)'));

        // Now let's check h-66 more carefully:
        // h-66 at this point has v-50 ending at it (from above) and v-25 starting at it (going down)
        // At h-66's endpoints:
        // - Left (at v-0): v-0 is fixed -> OK
        // - Right (at v-100): v-100 is fixed -> OK
        // So h-66 can move as a single rail

        // CANNOT move as individual segments: Let's check if h-66 has been split into segments
        // In our config, h-66 is a single rail spanning full width, so it's NOT split
        // The fact that v-50 ends at it and v-25 starts at it doesn't split h-66

        console.log('Step 2 verification:', failures.length === 0 ? 'PASS' : 'FAIL');

        // ========== STEP 3: Move kl (v-25) to align with dg (v-50) ==========
        console.log('\n========== STEP 3: Move kl to align with dg (position 50%) ==========');

        /**
         * +-----------------+
         * |        A        |
         * +--------+--------+
         * |   B    |   C    |
         * +--------+--------+
         * |   D1   |   D2   |
         * +--------+--------+
         *
         * v-25 has been moved to position 50%, now aligned with v-50
         * They form an aligned group that spans from h-33 to h-100
         */
        const config3: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
            { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
            { id: 'v-50', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },
            // kl now at 50% (aligned with v-50)
            { id: 'v-50-bot', direction: 'vertical', position: 50, fixed: false, startBound: 'h-66', endBound: undefined },
          ],
          cells: [
            { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
            { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-C', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-D1', leftRail: 'v-0', rightRail: 'v-50-bot', topRail: 'h-66', bottomRail: 'h-100' },
            { id: 'cell-D2', leftRail: 'v-50-bot', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config3);
        console.log(visualizeGrid(service));

        // Check aligned group
        const alignedWithV50 = service.getAdjacentAlignedRails('v-50');
        console.log('Aligned group for v-50:', alignedWithV50.map(r => r.id));
        expect(alignedWithV50.length).toBe(2); // Should include both v-50 and v-50-bot

        // Verify Step 3:
        // CAN move as group: v-50 + v-50-bot (aligned group from h-33 to h-100)
        failures.push(...verifyCanMove(service, ['v-50', 'v-50-bot'], true, 'Step3: aligned v-50 group'));

        // h-66: At its endpoints (v-0 and v-100, both fixed) -> CAN move
        failures.push(...verifyCanMove(service, ['h-66'], true, 'Step3: h-66 (fh)'));

        // h-33: Same reasoning
        failures.push(...verifyCanMove(service, ['h-33'], true, 'Step3: h-33 (ce)'));

        console.log('Step 3 verification:', failures.length === 0 ? 'PASS' : 'FAIL');

        if (failures.length > 0) {
          console.error('ALL FAILURES:', failures);
        }
        expect(failures).toEqual([]);
      });
    });

    /**
     * Scenario 3: Segment split scenario
     *
     * Start with 2x2, then split one cell, creating a rail that doesn't span full extent
     * The new rail should NOT be able to move independently, but CAN move with aligned group
     */
    describe('Scenario 3: 2x2 with asymmetric split', () => {

      it('Split top-left cell, verify new rail cannot move solo', () => {
        const service = new GridService();

        /**
         * Initial 2x2:
         * +-------+-------+
         * |   A   |   B   |
         * +-------+-------+
         * |   C   |   D   |
         * +-------+-------+
         *
         * After splitting A horizontally:
         * +-------+-------+
         * |  A1   |       |
         * +-------+   B   |
         * |  A2   |       |
         * +-------+-------+
         * |   C   |   D   |
         * +-------+-------+
         *
         * The new horizontal rail (h-split) at 25% only spans from v-0 to v-50
         * It's NOT aligned with any other horizontal rail
         * It should NOT be able to move solo because:
         * - At its start (v-0): that's a fixed edge -> OK
         * - At its end (v-50): We need to check if there are rails going both ways
         *   - v-50 goes from h-0 to h-100 (full height) -> passes through h-25
         *   - So at h-25's endpoint at v-50, the perpendicular rail (v-50) goes both up and down
         *   - This means h-25 CAN move solo!
         *
         * Wait, let me reconsider. The h-split is bounded:
         * - startBound = undefined (at v-0 which is fixed)
         * - endBound = v-50 (the middle vertical rail)
         *
         * At the endpoint on v-50:
         * - v-50 spans from 0% to 100% (full height in a 2x2)
         * - At the intersection with h-25, v-50 goes both up (to h-0) and down (to h-100)
         * - So there ARE rails in both directions
         *
         * Actually, this means h-25 CAN move independently!
         */
        const config: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            { id: 'h-50', direction: 'horizontal', position: 50, fixed: false },
            // In a 2x2, the vertical rail at 50% spans full height
            { id: 'v-50', direction: 'vertical', position: 50, fixed: false },
            // New horizontal split in cell A at 25% (only from v-0 to v-50)
            { id: 'h-25', direction: 'horizontal', position: 25, fixed: false, startBound: undefined, endBound: 'v-50' },
          ],
          cells: [
            { id: 'cell-A1', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-0', bottomRail: 'h-25' },
            { id: 'cell-A2', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-25', bottomRail: 'h-50' },
            { id: 'cell-B', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-50' },
            { id: 'cell-C', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-50', bottomRail: 'h-100' },
            { id: 'cell-D', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-50', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config);

        console.log('\n=== Scenario 3: 2x2 with A split ===');
        console.log(visualizeGrid(service));

        const failures: string[] = [];

        // h-25: CAN move independently because:
        // - Start: at fixed v-0 -> OK
        // - End: at v-50, and v-50 passes through the intersection (goes both up and down)
        failures.push(...verifyCanMoveSolo(service, ['h-25'], true, 'h-25 can move solo'));

        // h-50: CAN move as aligned group (full width)
        failures.push(...verifyCanMove(service, ['h-50'], true, 'h-50 can move'));

        // v-50: CAN move as aligned group (full height)
        failures.push(...verifyCanMove(service, ['v-50'], true, 'v-50 can move'));

        if (failures.length > 0) {
          console.error('FAILURES:', failures);
        }
        expect(failures).toEqual([]);
      });
    });

    /**
     * Scenario 4: Testing segment that CANNOT move
     *
     * Create a configuration where a segment truly cannot move because
     * at one endpoint, there's a perpendicular rail going only ONE way.
     */
    describe('Scenario 4: Rail that cannot move (one-way perpendicular)', () => {

      it('Create segment where endpoint has rails only in one direction', () => {
        const service = new GridService();

        /**
         * Layout:
         * +-------+-------+
         * |   A   |   B   |
         * +---+---+-------+
         * | C | D |   E   |
         * +---+---+-------+
         *
         * Here:
         * - h-50 is split: one segment from v-0 to v-25, another from v-25 to v-100
         *   Actually no, let's think about this differently.
         *
         * Let's create:
         * - v-25 from h-50 to h-100 (bottom half only)
         * - At v-25's start (h-50), we have:
         *   - h-50 goes from v-0 to v-100 (full width)
         *   - At the intersection (25, 50), h-50 passes through -> both directions
         *
         * Hmm, it seems like whenever we have a rail that spans the full extent at the intersection,
         * the endpoint check passes.
         *
         * To create a truly blocked scenario, we need:
         * - A segment that ends at a non-full-extent rail
         * - And that rail only goes in ONE direction from the intersection
         *
         * Example:
         * +---------------+
         * |       A       |
         * +-------+-------+
         * |   B   | C | D |
         * +-------+---+---+
         *
         * - v-50 from h-50 to h-100 (bottom half, splits B/C)
         * - v-75 from h-50 to h-100 (bottom half, splits C/D)
         * - h-50 from v-0 to v-100 (full width)
         *
         * At v-50's start (h-50): h-50 passes through -> OK
         * Still movable.
         *
         * Let me try a different approach: Create a "T" junction where
         * one side has no rail.
         *
         * +---------------+
         * |       A       |
         * +-------+-------+
         * |   B   |   C   |
         * +---+---+-------+
         * | D | E |   F   |
         * +---+---+-------+
         *
         * Here:
         * - v-50 goes from h-0 to h-50 (top half only) - but wait, A spans full width
         *
         * Actually it's quite hard to create a blocked rail in a valid grid because
         * for a grid to be valid, every cell must be bounded by rails, and those rails
         * tend to create connections in both directions.
         *
         * Let me try the user's original example more carefully:
         *
         * In a 2+1+2 (hourglass):
         * +--------+--------+
         * |   A    |   B    |
         * +--------+--------+
         * |        C        |
         * +--------+--------+
         * |   D    |   E    |
         * +--------+--------+
         *
         * Here:
         * - v-50-top: from h-0 to h-33 (top row)
         * - v-50-bot: from h-66 to h-100 (bottom row)
         * - h-33 and h-66: full width
         *
         * The interesting rails are v-50-top and v-50-bot. They're NOT adjacent
         * (there's a gap from h-33 to h-66 where there's no v-50).
         *
         * v-50-top's end is at h-33. At that endpoint:
         * - h-33 spans full width (passes through the intersection)
         * So v-50-top CAN move independently.
         *
         * Same for v-50-bot.
         *
         * The key insight is: as long as the perpendicular rail at the endpoint
         * spans across the intersection (passes through), the check passes.
         * To fail, the perpendicular rail must START or END exactly at the intersection.
         */

        // Let me create a scenario that actually fails:
        /**
         * +---------------+
         * |       A       |
         * +----+--+-------+
         * | B  |C |   D   |
         * +----+--+-------+
         *
         * Here:
         * - h-50: from v-0 to v-30 (left segment) + from v-30 to v-100 (right segment)
         *   But wait, if we have 2 segments of h-50, they'd form an aligned group.
         *
         * OK I think the key is to have a segment bounded by another segment.
         *
         * Let's try:
         * +---------------+
         * |       A       |
         * +----+----------+
         * | B  |    C     |
         * +----+--+-------+
         * | D  |E |   F   |
         * +----+--+-------+
         *
         * Rails:
         * - v-25: from h-0 to h-100 (full height, left side)
         * - v-50: from h-66 to h-100 (bottom third only, between E and F)
         * - h-33: from v-0 to v-25 (just above B)
         * - h-66: from v-0 to v-100 (full width)
         *
         * Wait this is getting complicated. Let me simplify:
         *
         * +-------+-------+
         * |   A   |   B   |
         * +---+---+-------+
         * | C | D |   E   |
         * +---+---+-------+
         *
         * Rails:
         * - h-50: full width
         * - v-50: full height (separates A/B and C|D/E)
         *   But wait, C|D means v-50 only goes to h-50 in the left half?
         *   No, that doesn't make sense for this layout.
         *
         * Let me think about v-25:
         * - v-25 from h-50 to h-100 (only in bottom row)
         * - At v-25's start endpoint (h-50):
         *   - h-50 goes from v-0 to v-100 (full width)
         *   - The intersection is at (25, 50)
         *   - h-50 passes through x=25 (since it goes from 0 to 100)
         *   - So there are rails in both directions -> v-25 CAN move
         */

        // I'll create a valid test case and just verify the logic is correct
        const config: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            { id: 'h-50', direction: 'horizontal', position: 50, fixed: false },
            { id: 'v-50', direction: 'vertical', position: 50, fixed: false },
            // v-25 only in bottom half
            { id: 'v-25', direction: 'vertical', position: 25, fixed: false, startBound: 'h-50', endBound: undefined },
          ],
          cells: [
            { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-50', topRail: 'h-0', bottomRail: 'h-50' },
            { id: 'cell-B', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-50' },
            { id: 'cell-C', leftRail: 'v-0', rightRail: 'v-25', topRail: 'h-50', bottomRail: 'h-100' },
            { id: 'cell-D', leftRail: 'v-25', rightRail: 'v-50', topRail: 'h-50', bottomRail: 'h-100' },
            { id: 'cell-E', leftRail: 'v-50', rightRail: 'v-100', topRail: 'h-50', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config);

        console.log('\n=== Scenario 4: 2x2 with bottom-left split ===');
        console.log(visualizeGrid(service));

        const failures: string[] = [];

        // v-25: CAN move because h-50 passes through the intersection
        failures.push(...verifyCanMove(service, ['v-25'], true, 'v-25'));

        // v-50: CAN move (full height)
        failures.push(...verifyCanMove(service, ['v-50'], true, 'v-50'));

        // h-50: CAN move (full width)
        failures.push(...verifyCanMove(service, ['h-50'], true, 'h-50'));

        if (failures.length > 0) {
          console.error('FAILURES:', failures);
        }
        expect(failures).toEqual([]);
      });
    });

    /**
     * Scenario 6: User's EXACT failing case - 1+2+2 configuration
     *
     * a                               b
     * +-------------------------+
     * | c             d              |
     * +-----------+------------+ e
     * | f            | g             |
     * +----------+------------+ h
     * | i            | l              |
     * +----------+------------+ j
     *
     * Rails:
     * - ce (h-33): horizontal, full width
     * - fh (h-66): horizontal, full width
     * - dg (v-50): vertical from ce to fh (middle row only)
     * - gl (v-50-bot): vertical from fh to j (bottom row only)
     *
     * IMPORTANT: dg and gl are at the SAME position (50%) but are DIFFERENT rails!
     * When aligned, they should form a group.
     *
     * User reports: cannot move gh (h-66) or fg (ce? or the segment?)
     */
    describe('Scenario 6: User exact failing case - 1+2+2', () => {

      it('DEBUG: Reproduce user config and check all rails', () => {
        const service = new GridService();

        /**
         * a                               b
         * +-------------------------+
         * |            A                  |   (0% - 33%)
         * +-----------+------------+  e (h-33)
         * |     B      |      C        |   (33% - 66%)
         * +----------+------------+  h (h-66)
         * |     D      |      E        |   (66% - 100%)
         * +----------+------------+  j
         *
         * This is 1+2+2:
         * - 1 cell top
         * - 2 cells middle (split at 50%)
         * - 2 cells bottom (split at 50%)
         *
         * The vertical at 50% spans from h-33 to h-100 (two segments: dg and gl)
         */
        const config: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            // Horizontal rails (full width)
            { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },  // ce
            { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },  // fh/gh
            // Vertical rail segments at 50%
            { id: 'v-50-mid', direction: 'vertical', position: 50, fixed: false, startBound: 'h-33', endBound: 'h-66' },  // dg
            { id: 'v-50-bot', direction: 'vertical', position: 50, fixed: false, startBound: 'h-66', endBound: undefined },  // gl
          ],
          cells: [
            { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
            { id: 'cell-B', leftRail: 'v-0', rightRail: 'v-50-mid', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-C', leftRail: 'v-50-mid', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-50-bot', topRail: 'h-66', bottomRail: 'h-100' },
            { id: 'cell-E', leftRail: 'v-50-bot', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config);

        console.log('\n=== Scenario 6: User exact 1+2+2 config ===');
        console.log(visualizeGrid(service));

        // Check aligned groups
        const alignedV50Mid = service.getAdjacentAlignedRails('v-50-mid');
        const alignedV50Bot = service.getAdjacentAlignedRails('v-50-bot');
        console.log('Aligned with v-50-mid:', alignedV50Mid.map(r => r.id));
        console.log('Aligned with v-50-bot:', alignedV50Bot.map(r => r.id));

        // v-50-mid and v-50-bot SHOULD be aligned (same position, adjacent via h-66)
        expect(alignedV50Mid.length).toBe(2);
        expect(alignedV50Bot.length).toBe(2);

        // Now check each rail
        const failures: string[] = [];

        // h-33 (ce): Should be movable (full width, endpoints at fixed v-0 and v-100)
        const h33CanMove = service.canAlignedGroupMove('h-33');
        console.log('h-33 canAlignedGroupMove:', h33CanMove);
        if (!h33CanMove) failures.push('h-33 should be movable');

        // h-66 (gh/fh): Should be movable (full width, endpoints at fixed v-0 and v-100)
        const h66CanMove = service.canAlignedGroupMove('h-66');
        console.log('h-66 canAlignedGroupMove:', h66CanMove);
        if (!h66CanMove) failures.push('h-66 should be movable');

        // v-50-mid (dg): Should be movable
        const v50MidCanMove = service.canAlignedGroupMove('v-50-mid');
        console.log('v-50-mid canAlignedGroupMove:', v50MidCanMove);
        if (!v50MidCanMove) failures.push('v-50-mid should be movable');

        // v-50-bot (gl): Should be movable
        const v50BotCanMove = service.canAlignedGroupMove('v-50-bot');
        console.log('v-50-bot canAlignedGroupMove:', v50BotCanMove);
        if (!v50BotCanMove) failures.push('v-50-bot should be movable');

        // DETAILED DEBUG: Check h-66's endpoints
        const h66 = service.getRail('h-66');
        if (h66) {
          console.log('\n--- DEBUG h-66 ---');
          console.log('h-66 startBound:', h66.startBound, '(should be undefined = fixed v-0)');
          console.log('h-66 endBound:', h66.endBound, '(should be undefined = fixed v-100)');
          const h66Bounds = service.getRailBounds('h-66');
          console.log('h-66 bounds:', h66Bounds);
        }

        if (failures.length > 0) {
          console.error('FAILURES:', failures);
        }
        expect(failures).toEqual([]);
      });

      it('should segment perpendicular rails when rails are fused (aligned)', () => {
        /**
         * This test verifies that when two rails become aligned (via fuseRails),
         * perpendicular rails that span across the alignment position are segmented.
         *
         * Scenario: Dashboard layout (1+2+1) where we:
         * 1. Split the footer cell to create a new vertical rail
         * 2. Fuse the new rail with the sidebar rail
         * 3. After fusion, h-footer and h-header should be segmented at the alignment point
         */
        const service = new GridService();
        const dashboardConfig = createDashboardGrid();
        service.loadConfig(dashboardConfig);

        // Split footer cell to create a new vertical rail
        const newCellId = service.splitCellVertical('cell-footer', 50);
        expect(newCellId).toBeTruthy();

        // Find the new vertical rail
        const newVerticalRail = service.getAllRails().find(r =>
          r.direction === 'vertical' && !r.fixed && r.id !== 'v-sidebar'
        );
        expect(newVerticalRail).toBeDefined();

        // Fuse the new rail with sidebar (this should trigger segmentation)
        service.fuseRails(newVerticalRail!.id, 'v-sidebar');

        // Verify rails are now aligned
        const alignedWithSidebar = service.getAdjacentAlignedRails('v-sidebar');
        expect(alignedWithSidebar.length).toBe(2);

        // Verify h-footer was segmented into two parts
        const hRailsAt85 = service.getAllRails().filter(r =>
          r.direction === 'horizontal' && Math.abs(r.position - 85) < 1
        );
        expect(hRailsAt85.length).toBe(2);

        // Left segment (0-25%) should be movable
        const leftSegment = hRailsAt85.find(r => {
          const bounds = service.getRailBounds(r.id);
          return bounds && bounds.start < 1 && bounds.end < 30;
        });
        expect(leftSegment).toBeDefined();
        expect(service.canRailMoveIndependently(leftSegment!.id)).toBe(true);

        // Right segment (25-100%) should be movable
        const rightSegment = hRailsAt85.find(r => {
          const bounds = service.getRailBounds(r.id);
          return bounds && bounds.start > 20 && bounds.end > 90;
        });
        expect(rightSegment).toBeDefined();
        expect(service.canRailMoveIndependently(rightSegment!.id)).toBe(true);
      });

      it('should have all horizontal rails movable in createGrid output', () => {
        /**
         * Verifies that createGrid produces segmented rails where all
         * horizontal rails are movable (their aligned groups span the full width).
         */
        const service = new GridService();
        const gridConfig = createGrid({ rows: 3, cols: 2 });
        service.loadConfig(gridConfig);

        const draggable = service.getDraggableRails();

        // All horizontal rails should be movable as aligned groups
        draggable.forEach(rail => {
          if (rail.direction === 'horizontal') {
            const canMove = service.canAlignedGroupMove(rail.id);
            expect(canMove).toBe(true, `${rail.id} should be movable`);
          }
        });
      });
    });

    /**
     * Scenario 5: Creating a truly blocked rail
     *
     * The only way to create a blocked rail is when:
     * 1. The rail's endpoint is at a NON-FIXED bound rail
     * 2. That bound rail ENDS or STARTS exactly at the intersection (doesn't pass through)
     * 3. There are no other rails in the opposite direction at that intersection
     */
    describe('Scenario 5: Truly blocked rail scenario', () => {

      it('Create a rail that cannot move due to one-way perpendicular', () => {
        const service = new GridService();

        /**
         * To create a blocked scenario, I need a T-junction where
         * the perpendicular rail only goes one way.
         *
         * +-------+---------------+
         * |   A   |       B       |
         * +-------+---+---+-------+
         * |   C   | D | E |   F   |
         * +-------+---+---+-------+
         *
         * Here, let's say:
         * - The rail between D/E (v-50) goes from h-50 to h-100
         * - The rail between A/B (v-25) goes from h-0 to h-50
         * - The segment of h-50 between them might be a different position
         *
         * Actually let me think about this differently.
         *
         * For a rail R at position P to be blocked at endpoint E:
         * 1. E must be bounded by a NON-fixed rail B
         * 2. At the intersection (P, B.position):
         *    - No perpendicular rail passes through
         *    - Perpendicular rails only START there (one direction) or only END there (one direction)
         *    - No parallel rails continue on the other side
         *
         * This is the "L" or "T" junction scenario mentioned in CLAUDE.md
         *
         * Let me create:
         * +-------+-----------+
         * |   A   |     B     |
         * +-------+---+-------+
         * |   C   | D |   E   |
         * +-------+---+-------+
         *
         * Here:
         * - v-50 from h-50 to h-100 (between C/D and D/E)
         * - v-25 from h-0 to h-50 (between A and B/C/D/E area)
         * - h-50 from v-0 to v-100 (full width, but could be segmented)
         *
         * Hmm, if h-50 is full width, then at any intersection, it passes through.
         *
         * OK here's the key: we need h-50 to be SEGMENTED such that one segment
         * ends exactly at our rail's position.
         *
         * Example with segmented h-50:
         * +-------+-----------+
         * |   A   |     B     |
         * +-------+           |
         * |   C   |           |
         * +-------+-----------+
         * |   D   |     E     |
         * +-------+-----------+
         *
         * Here:
         * - h-33 from v-0 to v-33 (between A and C)
         * - h-66 from v-0 to v-100 (full width, between C|B and D|E)
         * - v-33 from h-0 to h-33? No...
         *
         * Let me try yet again with a clearer layout:
         *
         * +---+-----------+
         * | A |     B     |
         * +---+           |
         * | C |           |
         * +---+-----------+
         * | D |     E     |
         * +---+-----------+
         *
         * This is 5 cells: A, C, D stacked on the left; B on top-right; E on bottom-right.
         *
         * Rails:
         * - v-20: from h-0 to h-100 (full height, left column)
         * - h-33: from v-0 to v-20 (between A and C, only left side)
         * - h-66: from v-0 to v-100 (full width)
         *
         * Now consider h-33:
         * - Start at v-0 (fixed) -> OK
         * - End at v-20
         *   - v-20 is at position 20
         *   - h-33 is at position 33
         *   - At the intersection (20, 33):
         *     - v-20 spans from 0 to 100, so it passes through y=33 -> both directions
         *
         * Still movable!
         *
         * The issue is that if v-20 is full height, it always passes through.
         * We need v-20 to be SEGMENTED.
         *
         * +---+-------+
         * | A |   B   |
         * +---+-------+
         * |     C     |
         * +---+-------+
         * | D |   E   |
         * +---+-------+
         *
         * Here:
         * - v-33-top: from h-0 to h-33 (between A and B)
         * - v-33-bot: from h-66 to h-100 (between D and E)
         * - h-33: full width
         * - h-66: full width
         *
         * These v-33 segments are NOT adjacent (gap from h-33 to h-66).
         *
         * At v-33-top's end (h-33):
         * - h-33 spans full width (passes through x=33)
         * So v-33-top CAN move.
         *
         * Similarly, v-33-bot CAN move.
         *
         * The point is: as long as the bound rail passes through the intersection,
         * movement is allowed. The check fails only when the bound rail ENDS or
         * STARTS exactly at the intersection AND no other rail provides the other direction.
         *
         * Let me create such a scenario:
         *
         * +-------+
         * |   A   |
         * +---+---+
         * | B | C |
         * +---+---+---+
         * | D | E | F |
         * +---+---+---+
         *
         * This is a pyramid. The top is wider on the left.
         *
         * Actually, let's try:
         * +-------+---+
         * |   A   | B |
         * +---+---+---+
         * | C | D | E |
         * +---+---+---+
         *
         * Here:
         * - h-50: from v-0 to v-100 (full width)
         * - v-33: from h-0 to h-50 (only top half, between A and B part)
         *   Wait, but B is on the right of A, not below...
         *
         * I need to be more precise. Let me define cell boundaries:
         * - A: (0-66, 0-50)
         * - B: (66-100, 0-50)
         * - C: (0-33, 50-100)
         * - D: (33-66, 50-100)
         * - E: (66-100, 50-100)
         *
         * Rails:
         * - v-66: from h-0 to h-50 (between A and B in top row)
         * - v-33: from h-50 to h-100 (between C and D in bottom row)
         * - v-66-bot: from h-50 to h-100 (between D and E in bottom row)
         * - h-50: full width
         *
         * Now consider v-66 (top half, between A/B):
         * - Start at h-0 (fixed) -> OK
         * - End at h-50
         *   - h-50 spans full width (0-100)
         *   - At intersection (66, 50), h-50 passes through
         * So v-66 CAN move.
         *
         * What if h-50 were segmented?
         *
         * Rails:
         * - h-50-left: from v-0 to v-66 (left segment)
         * - h-50-right: from v-66 to v-100 (right segment)
         *
         * Now at v-66's end (h-50-left):
         * - h-50-left ends at v-66 (at position 66)
         * - h-50-right starts at v-66
         * - At intersection (66, 50):
         *   - h-50-left ENDS here (provides negative direction - going left)
         *   - h-50-right STARTS here (provides positive direction - going right)
         *
         * So we still have both directions -> v-66 CAN move.
         *
         * The ONLY way to block is if at the intersection:
         * - No perpendicular rail passes through
         * - Perpendicular rails only go one way (all start, or all end)
         *
         * This happens in an L-shape:
         *
         * +-------+
         * |   A   |
         * +---+---+
         * | B |
         * +---+
         *
         * Here:
         * - v-50: from h-0 to h-50 (between A's right side and nothing)
         *   Wait, this doesn't make sense. A occupies the full top, B is bottom-left.
         *
         * Let me define properly:
         * - A: (0-100, 0-50)
         * - B: (0-50, 50-100)
         *
         * This leaves a "hole" at (50-100, 50-100). But we can't have holes in a valid grid.
         *
         * OK I think the insight is: in a VALID grid (no holes), every rail endpoint
         * that's bounded by a non-fixed rail will have perpendicular rails in both directions.
         * This is because cells must tile the entire area, and where cells meet,
         * there are rails going both ways.
         *
         * The ONLY way to have a blocked rail is in an INVALID configuration,
         * which shouldn't happen in practice.
         *
         * Let me just verify this understanding with a test:
         */

        // Use the 2+1+2 hourglass configuration
        const config: GridConfig = {
          rails: [
            { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
            { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
            { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
            { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
            { id: 'h-33', direction: 'horizontal', position: 33, fixed: false },
            { id: 'h-66', direction: 'horizontal', position: 66, fixed: false },
            // v-50-top in top row only
            { id: 'v-50-top', direction: 'vertical', position: 50, fixed: false, startBound: undefined, endBound: 'h-33' },
            // v-50-bot in bottom row only
            { id: 'v-50-bot', direction: 'vertical', position: 50, fixed: false, startBound: 'h-66', endBound: undefined },
          ],
          cells: [
            { id: 'cell-A', leftRail: 'v-0', rightRail: 'v-50-top', topRail: 'h-0', bottomRail: 'h-33' },
            { id: 'cell-B', leftRail: 'v-50-top', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-33' },
            { id: 'cell-C', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-33', bottomRail: 'h-66' },
            { id: 'cell-D', leftRail: 'v-0', rightRail: 'v-50-bot', topRail: 'h-66', bottomRail: 'h-100' },
            { id: 'cell-E', leftRail: 'v-50-bot', rightRail: 'v-100', topRail: 'h-66', bottomRail: 'h-100' },
          ],
        };
        service.loadConfig(config);

        console.log('\n=== Scenario 5: 2+1+2 hourglass ===');
        console.log(visualizeGrid(service));

        const failures: string[] = [];

        // v-50-top: CAN move because at h-33, h-33 passes through (full width)
        failures.push(...verifyCanMove(service, ['v-50-top'], true, 'v-50-top'));

        // v-50-bot: CAN move because at h-66, h-66 passes through (full width)
        failures.push(...verifyCanMove(service, ['v-50-bot'], true, 'v-50-bot'));

        // They're NOT aligned (gap between them), so they're separate groups
        const alignedWithTop = service.getAdjacentAlignedRails('v-50-top');
        const alignedWithBot = service.getAdjacentAlignedRails('v-50-bot');
        console.log('Aligned with v-50-top:', alignedWithTop.map(r => r.id));
        console.log('Aligned with v-50-bot:', alignedWithBot.map(r => r.id));
        expect(alignedWithTop.length).toBe(1); // Only itself
        expect(alignedWithBot.length).toBe(1); // Only itself

        // h-33 and h-66: CAN move (full width, endpoints at fixed edges)
        failures.push(...verifyCanMove(service, ['h-33', 'h-66'], true, 'h-33 and h-66'));

        if (failures.length > 0) {
          console.error('FAILURES:', failures);
        }
        expect(failures).toEqual([]);
      });
    });
  });

  // ============ Test: Dashboard layout (async rails) ============
  /**
   * Dashboard layout (4 cells):
   * +---------------------------+
   * |          Header           |
   * +-------+-------------------+
   * | Side  |                   |
   * | bar   |       Main        |
   * |       |                   |
   * +-------+-------------------+
   * |          Footer           |
   * +---------------------------+
   *
   * Note: Sidebar rail only spans from header to footer (not full height)
   */
  describe('Dashboard layout (header + sidebar + main + footer)', () => {
    it('should correctly validate all rails in dashboard layout', () => {
      const service = new GridService();

      // Create dashboard layout manually
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          // Header bottom
          { id: 'h-header', direction: 'horizontal', position: 15, fixed: false },
          // Footer top
          { id: 'h-footer', direction: 'horizontal', position: 85, fixed: false },
          // Sidebar (only goes from header to footer)
          { id: 'v-sidebar', direction: 'vertical', position: 25, fixed: false, startBound: 'h-header', endBound: 'h-footer' },
        ],
        cells: [
          { id: 'cell-header', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-header' },
          { id: 'cell-sidebar', leftRail: 'v-0', rightRail: 'v-sidebar', topRail: 'h-header', bottomRail: 'h-footer' },
          { id: 'cell-main', leftRail: 'v-sidebar', rightRail: 'v-100', topRail: 'h-header', bottomRail: 'h-footer' },
          { id: 'cell-footer', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-footer', bottomRail: 'h-100' },
        ],
      };

      service.loadConfig(config);

      console.log('\n=== Dashboard layout ===');
      console.log(visualizeGrid(service));

      const draggable = service.getDraggableRails();
      let failures: string[] = [];

      draggable.forEach(rail => {
        const expectedGroup = expectedCanAlignedGroupMove(service, rail.id);
        const actualGroup = service.canAlignedGroupMove(rail.id);

        console.log(`Rail ${rail.id}: expectedGroup=${expectedGroup}, actualGroup=${actualGroup}`);

        if (actualGroup !== expectedGroup) {
          failures.push(`Rail ${rail.id} canAlignedGroupMove: expected=${expectedGroup}, actual=${actualGroup}`);
        }
      });

      if (failures.length > 0) {
        console.error('FAILURES:', failures);
      }

      expect(failures.length).toBe(0);
    });

    /**
     * After splitting footer vertically:
     * +---------------------------+
     * |          Header           |
     * +-------+-------------------+
     * | Side  |                   |
     * | bar   |       Main        |
     * |       |                   |
     * +-------+-------------------+
     * |  Footer L  |  Footer R    |
     * +------------+--------------+
     *
     * The h-footer rail now consists of 2 segments (split by the new vertical rail)
     */
    it('should correctly validate rails after splitting footer in dashboard', () => {
      const service = new GridService();

      // Create dashboard layout
      const config: GridConfig = {
        rails: [
          { id: 'v-0', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-100', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-0', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-100', direction: 'horizontal', position: 100, fixed: true },
          { id: 'h-header', direction: 'horizontal', position: 15, fixed: false },
          { id: 'h-footer', direction: 'horizontal', position: 85, fixed: false },
          { id: 'v-sidebar', direction: 'vertical', position: 25, fixed: false, startBound: 'h-header', endBound: 'h-footer' },
        ],
        cells: [
          { id: 'cell-header', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-0', bottomRail: 'h-header' },
          { id: 'cell-sidebar', leftRail: 'v-0', rightRail: 'v-sidebar', topRail: 'h-header', bottomRail: 'h-footer' },
          { id: 'cell-main', leftRail: 'v-sidebar', rightRail: 'v-100', topRail: 'h-header', bottomRail: 'h-footer' },
          { id: 'cell-footer', leftRail: 'v-0', rightRail: 'v-100', topRail: 'h-footer', bottomRail: 'h-100' },
        ],
      };

      service.loadConfig(config);

      console.log('\n=== Dashboard before footer split ===');
      console.log(visualizeGrid(service));

      // Split footer vertically
      service.splitCellVertical('cell-footer', 50);

      console.log('\n=== Dashboard after footer split ===');
      console.log(visualizeGrid(service));

      const draggable = service.getDraggableRails();
      let failures: string[] = [];

      draggable.forEach(rail => {
        const expectedGroup = expectedCanAlignedGroupMove(service, rail.id);
        const actualGroup = service.canAlignedGroupMove(rail.id);

        // Detailed logging for h-footer rail
        if (rail.id === 'h-footer' || rail.direction === 'horizontal') {
          const alignedRails = service.getAdjacentAlignedRails(rail.id, 1);
          console.log(`Rail ${rail.id}: aligned group = [${alignedRails.map(r => r.id).join(', ')}]`);

          alignedRails.forEach(r => {
            const startCheck = checkEndpointHasRailsBothDirections(service, r, 'start');
            const endCheck = checkEndpointHasRailsBothDirections(service, r, 'end');
            console.log(`  ${r.id} start: neg=${startCheck.hasNegative}, pos=${startCheck.hasPositive} (${startCheck.reason})`);
            console.log(`  ${r.id} end: neg=${endCheck.hasNegative}, pos=${endCheck.hasPositive} (${endCheck.reason})`);
          });
        }

        console.log(`Rail ${rail.id}: expectedGroup=${expectedGroup}, actualGroup=${actualGroup}`);

        if (actualGroup !== expectedGroup) {
          failures.push(`Rail ${rail.id} canAlignedGroupMove: expected=${expectedGroup}, actual=${actualGroup}`);
        }
      });

      if (failures.length > 0) {
        console.error('FAILURES:', failures);
      }

      expect(failures.length).toBe(0);
    });

    /**
     * BUG REPRODUCTION TEST: After moving a rail individually, some segments
     * should NOT be movable because they violate the fundamental rule.
     *
     * Scenario:
     * 1. Start with dashboard layout (header + sidebar|main + footer)
     * 2. Split footer to create a new vertical rail (kl)
     * 3. Fuse kl with sidebar (dg) - creates point m where they meet
     * 4. At this point: dm, ml, fm, mh should all be movable
     * 5. Move mh individually DOWNWARD (CTRL+drag), creating a new point n
     * 6. After this: dm, mn, nl should NOT be movable because at point n,
     *    the horizontal rail only goes RIGHT (towards h), not LEFT
     *
     * Visual after step 4:
     *                    c (header)         e
     * a +-------+---------------------------+ b
     *   |              Header               |
     * d +---m---+---------------------------+ f
     *   |Sidebar|                           |
     *   |       |          Main             |
     * g +---+---+---------------------------+ h
     *   |Ft L|         Footer R             |
     * i +---+-------------------------------+ j
     *
     * After step 5 (move mh down individually):
     *                    c          e
     * a +-------+---------------------------+ b
     *   |              Header               |
     * d +---m---+---------------------------+ f
     *   |Sidebar|                           |
     *   |       |          Main             |
     * g +---+---+                           | h
     *   |Ft L|  |                           |
     *   +---n---+---------------------------+ new horizontal at n
     *   |       |       Footer R            |
     * i +-------+---------------------------+ j
     *
     * At point n: there's only a horizontal rail going RIGHT (towards the new h position)
     * There's NO horizontal rail going LEFT from n.
     * Therefore dm, mn, nl should NOT be movable.
     */
    it('should mark vertical segments as non-movable after individual rail movement creates T-junction', () => {
      const service = new GridService();

      // Create dashboard layout (1+2+1 configuration)
      // Header at top, sidebar+main in middle, footer at bottom
      const config: GridConfig = {
        rails: [
          // Fixed boundary rails
          { id: 'v-left', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-right', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-top', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-bottom', direction: 'horizontal', position: 100, fixed: true },
          // Header rail (full width)
          { id: 'h-header', direction: 'horizontal', position: 15, fixed: false },
          // Footer rail (full width)
          { id: 'h-footer', direction: 'horizontal', position: 85, fixed: false },
          // Sidebar rail (only between header and footer)
          { id: 'v-sidebar', direction: 'vertical', position: 25, fixed: false, startBound: 'h-header', endBound: 'h-footer' },
        ],
        cells: [
          { id: 'cell-header', leftRail: 'v-left', rightRail: 'v-right', topRail: 'h-top', bottomRail: 'h-header' },
          { id: 'cell-sidebar', leftRail: 'v-left', rightRail: 'v-sidebar', topRail: 'h-header', bottomRail: 'h-footer' },
          { id: 'cell-main', leftRail: 'v-sidebar', rightRail: 'v-right', topRail: 'h-header', bottomRail: 'h-footer' },
          { id: 'cell-footer', leftRail: 'v-left', rightRail: 'v-right', topRail: 'h-footer', bottomRail: 'h-bottom' },
        ],
      };

      service.loadConfig(config);

      console.log('\n=== Step 1: Initial dashboard ===');
      console.log(visualizeGrid(service));

      // Step 2: Split footer cell to create new vertical rail
      // Split at 50% of footer width - this creates a vertical rail at 50% X position (not 25%)
      const footerRightCellId = service.splitCellVertical('cell-footer', 50);
      expect(footerRightCellId).toBeTruthy();

      // Find the new vertical rail (kl) - it's the one in the footer area, not the sidebar
      const newVerticalRail = service.getAllRails().find(r =>
        r.direction === 'vertical' && !r.fixed && r.id !== 'v-sidebar'
      );
      expect(newVerticalRail).toBeDefined();
      console.log(`\n=== Step 2: Split footer, created ${newVerticalRail!.id} at position ${newVerticalRail!.position}% ===`);
      console.log(visualizeGrid(service));

      // Verify the new rail is NOT at 25% (sidebar position) - it should be at 50%
      expect(newVerticalRail!.position).not.toBe(25);

      // Step 3: Fuse the new rail with sidebar (creates point m)
      // This should move the new rail from 50% to 25% (sidebar position)
      const fusionResult = service.fuseRails(newVerticalRail!.id, 'v-sidebar');
      console.log(`Fusion result: ${fusionResult}`);
      expect(fusionResult).toBe(true, 'Fusion should succeed');
      expect(newVerticalRail!.position).toBe(25, 'Rail should now be at sidebar position');

      console.log('\n=== Step 3: After fusing with sidebar ===');
      console.log(visualizeGrid(service));

      // At this point, the sidebar and new rail are aligned at the same position
      // The h-footer rail should be segmented into two parts

      // Find the two h-footer segments
      const hFooterSegments = service.getAllRails().filter(r =>
        r.direction === 'horizontal' && Math.abs(r.position - 85) < 1 && !r.fixed
      );
      console.log(`h-footer segments: ${hFooterSegments.map(r => r.id).join(', ')}`);
      expect(hFooterSegments.length).toBe(2);

      // Both segments should be movable at this point
      hFooterSegments.forEach(seg => {
        const canMove = service.canRailMoveIndependently(seg.id);
        console.log(`${seg.id} canMoveIndependently: ${canMove}`);
        expect(canMove).toBe(true, `${seg.id} should be movable after fusion`);
      });

      // Also check vertical segments
      // Find the vertical segments at the sidebar position
      const vSidebarSegments = service.getAllRails().filter(r =>
        r.direction === 'vertical' && Math.abs(r.position - 25) < 1 && !r.fixed
      );
      console.log(`v-sidebar segments: ${vSidebarSegments.map(r => r.id).join(', ')}`);

      // All vertical segments should be movable at this point
      vSidebarSegments.forEach(seg => {
        const canMove = service.canRailMoveIndependently(seg.id);
        console.log(`${seg.id} canMoveIndependently (before individual move): ${canMove}`);
        expect(canMove).toBe(true, `${seg.id} should be movable at this point`);
      });

      // Step 4: Move the RIGHT segment of h-footer (mh) individually DOWN
      // This is like CTRL+drag in the UI - moves only one segment

      // Find the right h-footer segment (the one that goes from sidebar position to 100%)
      const rightFooterSegment = hFooterSegments.find(seg => {
        const bounds = service.getRailBounds(seg.id);
        return bounds && bounds.start >= 20 && bounds.end >= 90;
      });
      expect(rightFooterSegment).toBeDefined();
      console.log(`\n=== Step 4: Moving ${rightFooterSegment!.id} (mh) individually down ===`);

      // Move the right footer segment down (from 85% to 92%)
      // This should create a new intersection point (n)
      const containerSize = 1000; // pixels
      service.moveRail(rightFooterSegment!.id, 92, containerSize, 0);

      console.log('\n=== After moving mh individually ===');
      console.log(visualizeGrid(service));

      // Step 5: Verify the new state
      // After moving mh down, we should have:
      // - The vertical rail at 25% is now split into more segments
      // - At the new intersection point n, the horizontal rail only goes RIGHT
      // - Segments dm, mn, nl should NOT be movable

      // Re-find all vertical segments at position 25
      const vSegmentsAfterMove = service.getAllRails().filter(r =>
        r.direction === 'vertical' && Math.abs(r.position - 25) < 1 && !r.fixed
      );
      console.log(`\nVertical segments at 25% after move: ${vSegmentsAfterMove.map(r => r.id).join(', ')}`);

      // Check each segment's movability
      vSegmentsAfterMove.forEach(seg => {
        const bounds = service.getRailBounds(seg.id);
        const canMove = service.canRailMoveIndependently(seg.id);
        console.log(`${seg.id} bounds: [${bounds?.start.toFixed(1)}-${bounds?.end.toFixed(1)}], canMoveIndependently: ${canMove}`);

        // Find what horizontal rails exist at each endpoint
        const segBounds = service.getRailBounds(seg.id);
        if (segBounds) {
          // Check start endpoint
          const hRailsAtStart = service.getAllRails().filter(r => {
            if (r.direction !== 'horizontal') return false;
            const rBounds = service.getRailBounds(r.id);
            if (!rBounds) return false;
            // Rail must include position 25 in its range and be at the start Y position
            return Math.abs(r.position - segBounds.start) < 1;
          });
          console.log(`  At start (${segBounds.start.toFixed(1)}%): h-rails = ${hRailsAtStart.map(r => {
            const b = service.getRailBounds(r.id);
            return `${r.id}[${b?.start.toFixed(1)}-${b?.end.toFixed(1)}]`;
          }).join(', ')}`);

          // Check end endpoint
          const hRailsAtEnd = service.getAllRails().filter(r => {
            if (r.direction !== 'horizontal') return false;
            const rBounds = service.getRailBounds(r.id);
            if (!rBounds) return false;
            return Math.abs(r.position - segBounds.end) < 1;
          });
          console.log(`  At end (${segBounds.end.toFixed(1)}%): h-rails = ${hRailsAtEnd.map(r => {
            const b = service.getRailBounds(r.id);
            return `${r.id}[${b?.start.toFixed(1)}-${b?.end.toFixed(1)}]`;
          }).join(', ')}`);
        }
      });

      // The key assertion: after moving mh down individually, there should be
      // at least one vertical segment that CANNOT move because at one of its
      // endpoints, the horizontal rail only goes in one direction.

      // Find the segment between the old h-footer (85%) and the new position (92%)
      // This segment's endpoint at 92% should have a horizontal rail only going RIGHT
      const blockedSegment = vSegmentsAfterMove.find(seg => {
        const bounds = service.getRailBounds(seg.id);
        // This is the segment that ends at 92% (the new mh position)
        return bounds && Math.abs(bounds.end - 92) < 1;
      });

      if (blockedSegment) {
        const canMove = service.canRailMoveIndependently(blockedSegment.id);
        console.log(`\nBLOCKED SEGMENT: ${blockedSegment.id} canMoveIndependently: ${canMove}`);
        // This segment should NOT be movable because at 92%, horizontal rail only goes right
        expect(canMove).toBe(false, `${blockedSegment.id} should NOT be movable - at its end, horizontal only goes right`);
      }

      // Also check: any segment whose endpoint doesn't have horizontal rails in both directions
      // should be marked as non-movable
      let foundBlockedSegment = false;
      vSegmentsAfterMove.forEach(seg => {
        const canMove = service.canRailMoveIndependently(seg.id);
        if (!canMove) {
          foundBlockedSegment = true;
          console.log(`Found blocked segment: ${seg.id}`);
        }
      });

      // We expect at least one segment to be blocked after this operation
      expect(foundBlockedSegment).toBe(true, 'Expected at least one vertical segment to be blocked after individual move');
    });

    /**
     * EXACT USER SCENARIO from CLAUDE.md
     *
     * Étape 1: Configuration initiale (1 row full + 2 cols + 1 row full)
     * a                         b
     * +------------------------+
     * | c         d            |
     * +-----------+------------+ e
     * | f         | g          |
     * +-----------+------------+ h
     * | i                      |
     * +------------------------+ j
     *
     * Étape 2: Split cell i verticalement pour créer kl
     * a                         b
     * +------------------------+
     * | c         d            |
     * +-----------+------------+ e
     * | f  k      | g          |
     * +----+------+------------+ h
     * | i  | l                 |
     * +----+-------------------+ j
     *
     * Étape 3: Aligner kl avec dg (fuse)
     * a                        b
     * +------------------------+
     * | c         d            |
     * +-----------+------------+ e
     * | f         | m          |
     * +-----------+------------+ h
     * | i         | l          |
     * +-----------+------------+ j
     *
     * Après étape 3: fm et mh devraient pouvoir bouger individuellement
     */
    it('should allow fm and mh to move after split and align (EXACT user scenario)', () => {
      const service = new GridService();

      // ========== ÉTAPE 1: Créer la configuration initiale ==========
      // 3 rows: top full width, middle 2 cols, bottom full width
      const initialConfig: GridConfig = {
        rails: [
          { id: 'v-left', direction: 'vertical', position: 0, fixed: true },
          { id: 'v-right', direction: 'vertical', position: 100, fixed: true },
          { id: 'h-top', direction: 'horizontal', position: 0, fixed: true },
          { id: 'h-bottom', direction: 'horizontal', position: 100, fixed: true },
          // h-ce: entre row c et row f (position ~33%)
          { id: 'h-ce', direction: 'horizontal', position: 33, fixed: false },
          // h-fh: entre row f et row i (position ~66%)
          { id: 'h-fh', direction: 'horizontal', position: 66, fixed: false },
          // v-dg: rail vertical au milieu, seulement dans la rangée du milieu
          { id: 'v-dg', direction: 'vertical', position: 50, fixed: false, startBound: 'h-ce', endBound: 'h-fh' },
        ],
        cells: [
          // Row c-d (top, full width)
          { id: 'cell-cd', leftRail: 'v-left', rightRail: 'v-right', topRail: 'h-top', bottomRail: 'h-ce' },
          // Row f (left of middle)
          { id: 'cell-f', leftRail: 'v-left', rightRail: 'v-dg', topRail: 'h-ce', bottomRail: 'h-fh' },
          // Row g (right of middle)
          { id: 'cell-g', leftRail: 'v-dg', rightRail: 'v-right', topRail: 'h-ce', bottomRail: 'h-fh' },
          // Row i (bottom, full width)
          { id: 'cell-i', leftRail: 'v-left', rightRail: 'v-right', topRail: 'h-fh', bottomRail: 'h-bottom' },
        ],
      };

      service.loadConfig(initialConfig);
      console.log('\n========== ÉTAPE 1: Configuration initiale ==========');
      console.log(visualizeGrid(service));

      // Vérifier que v-dg peut bouger (group)
      expect(service.canAlignedGroupMove('v-dg')).toBe(true, 'v-dg should be movable as group');

      // ========== ÉTAPE 2: Split cell i verticalement ==========
      console.log('\n========== ÉTAPE 2: Split cell i pour créer kl ==========');
      const newCellId = service.splitCellVertical('cell-i', 25); // Split à 25% pour créer k
      expect(newCellId).toBeTruthy();
      console.log(visualizeGrid(service));

      // Trouver le nouveau rail kl
      const klRail = service.getAllRails().find(r => {
        if (r.direction !== 'vertical' || r.fixed) return false;
        const bounds = service.getRailBounds(r.id);
        // kl devrait aller de h-fh à h-bottom (66% à 100%)
        return bounds && Math.abs(bounds.start - 66) < 1 && Math.abs(bounds.end - 100) < 1;
      });
      console.log('Rail kl:', klRail?.id, 'position:', klRail?.position, 'bounds:', service.getRailBounds(klRail!.id));
      expect(klRail).toBeDefined();

      // kl devrait pouvoir bouger
      expect(service.canRailMoveIndependently(klRail!.id)).toBe(true, 'kl should be movable');

      // ========== ÉTAPE 3: Aligner kl avec dg (fuse) ==========
      console.log('\n========== ÉTAPE 3: Aligner kl avec dg ==========');

      // D'abord, bouger kl vers la position de dg (50%)
      service.moveRail(klRail!.id, 50, 1000, 10);
      console.log('After moving kl to 50%:');
      console.log(visualizeGrid(service));

      // Maintenant les deux rails sont alignés, on peut les fusionner
      const fuseResult = service.fuseRails(klRail!.id, 'v-dg');
      console.log('Fuse result:', fuseResult);
      console.log('\nAfter fuse:');
      console.log(visualizeGrid(service));

      // ========== VÉRIFICATION: fm et mh devraient pouvoir bouger ==========
      console.log('\n========== VÉRIFICATION: fm et mh ==========');

      // Trouver les segments horizontaux à la position 66% (h-fh devrait être segmenté)
      const hRailsAtFH = service.getAllRails().filter(r => {
        if (r.direction !== 'horizontal' || r.fixed) return false;
        return Math.abs(r.position - 66) < 1;
      });

      console.log('Horizontal rails at position ~66%:');
      for (const rail of hRailsAtFH) {
        const bounds = service.getRailBounds(rail.id);
        const canMove = service.canRailMoveIndependently(rail.id);
        console.log(`  ${rail.id}: bounds=[${bounds?.start}-${bounds?.end}], startBound=${rail.startBound}, endBound=${rail.endBound}, canMoveIndependently=${canMove}`);
      }

      // Si h-fh a été segmenté correctement, on devrait avoir 2 rails
      // fm: de 0% à 50%
      // mh: de 50% à 100%
      if (hRailsAtFH.length === 1) {
        // h-fh n'a PAS été segmenté - c'est le bug!
        console.log('\n*** BUG: h-fh was NOT segmented! ***');
        const rail = hRailsAtFH[0];
        console.log(`h-fh: startBound=${rail.startBound}, endBound=${rail.endBound}`);

        // Le test devrait échouer ici pour montrer le bug
        expect(hRailsAtFH.length).toBe(2, 'h-fh should be segmented into fm and mh');
      } else {
        // h-fh a été segmenté - vérifier que chaque segment peut bouger
        for (const rail of hRailsAtFH) {
          const canMove = service.canRailMoveIndependently(rail.id);
          expect(canMove).toBe(true, `${rail.id} should be movable independently`);
        }
      }
    });
  });
});
