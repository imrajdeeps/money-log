import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, packTiles } from '../../src/core/bento.ts';
import type { PlacedTile, TileSize } from '../../src/core/bento.ts';

// Plays the browser's placement (in order, no reordering) and returns each row's used columns, to check that no row ends in a hole.
function rows(tiles: readonly TileSize[], placed: readonly PlacedTile[]): number[] {
  const tall = new Map(tiles.map((t) => [t.id, !!t.tall]));
  const used: number[] = [];
  let r = 0;
  let c = 0;
  const grid: boolean[][] = [];
  const free = (y: number, x: number) => !(grid[y]?.[x] ?? false);
  for (const p of placed) {
    for (;;) {
      if (c + p.span > COLUMNS) { r++; c = 0; continue; }
      let ok = true;
      for (let x = c; x < c + p.span; x++) if (!free(r, x) || (tall.get(p.id) && !free(r + 1, x))) ok = false;
      if (ok) break;
      c++;
    }
    for (let y = r; y < r + (tall.get(p.id) ? 2 : 1); y++) {
      grid[y] ??= [];
      for (let x = c; x < c + p.span; x++) grid[y]![x] = true;
      used[y] = (used[y] ?? 0) + p.span;
    }
    c += p.span;
  }
  return used;
}

test('beside the tall This month tile, a 3-wide tile no longer leaves a hole (the owner\'s screenshot)', () => {
  const tiles: TileSize[] = [
    { id: 'month', span: 8, tall: true }, { id: 'net', span: 4 },
    { id: 'Spending', span: 3 }, { id: 'EMI', span: 3 }, { id: 'Family', span: 3 }, { id: 'Saving', span: 3 },
    { id: 'recent', span: 8, tall: true }, { id: 'due', span: 4 }, { id: 'cash', span: 3 }, { id: 'insights', span: 3 },
    { id: 'where', span: 6 }, { id: 'groups', span: 3 }, { id: 'goals', span: 3 }, { id: 'udhaar', span: 3 },
  ];
  const placed = packTiles(tiles);
  assert.deepEqual(placed.map((p) => p.id).sort(), tiles.map((t) => t.id).sort(), 'every tile is placed once');
  const used = rows(tiles, placed);
  assert.ok(used.slice(0, -1).every((n) => n === COLUMNS), `every row but the last is full: ${used.join(', ')}`);
  assert.equal(used.at(-1), COLUMNS, 'the last row is full too');
  // the slot under Net worth takes a 4-wide tile or a widened one, never a 3-wide tile with a hole
  assert.equal(placed[0]!.id, 'month');
  assert.equal(placed[1]!.span + 8, COLUMNS);
  assert.equal(placed[2]!.span + 8, COLUMNS);
});

test('tiles keep their order wherever they fit', () => {
  const tiles: TileSize[] = [{ id: 'a', span: 4 }, { id: 'b', span: 4 }, { id: 'c', span: 4 }, { id: 'd', span: 6 }, { id: 'e', span: 6 }];
  assert.deepEqual(packTiles(tiles), tiles.map(({ id, span }) => ({ id, span })));
});

test('a gap is filled by the next tile that fits it, and the last tile of a row takes what nothing else can fill', () => {
  const placed = packTiles([{ id: 'a', span: 8 }, { id: 'wide', span: 6 }, { id: 'small', span: 4 }, { id: 'b', span: 6 }]);
  assert.deepEqual(placed, [{ id: 'a', span: 8 }, { id: 'small', span: 4 }, { id: 'wide', span: 6 }, { id: 'b', span: 6 }]);
  assert.deepEqual(packTiles([{ id: 'a', span: 8 }, { id: 'b', span: 3 }]), [{ id: 'a', span: 8 }, { id: 'b', span: 4 }]);
  assert.deepEqual(packTiles([{ id: 'only', span: 3 }]), [{ id: 'only', span: 12 }]);
});

test('a tile too wide for any gap shrinks into it rather than leaving it empty', () => {
  const tiles: TileSize[] = [{ id: 'month', span: 8, tall: true }, { id: 'net', span: 4 }, { id: 'where', span: 6 }, { id: 'recent', span: 8 }];
  const placed = packTiles(tiles);
  assert.deepEqual(placed.slice(0, 3), [{ id: 'month', span: 8 }, { id: 'net', span: 4 }, { id: 'where', span: 4 }]);
  assert.equal(placed[3]!.span, COLUMNS);
});

test('a tall tile beside a tall tile spans the rows below correctly, and every row still fills', () => {
  const tiles: TileSize[] = [{ id: 'hero', span: 8, tall: true }, { id: 'x', span: 4 }, { id: 'tall', span: 4, tall: true }, { id: 'y', span: 4 }];
  const placed = packTiles(tiles);
  assert.deepEqual(placed.map((p) => p.id), ['hero', 'x', 'tall', 'y']);
  assert.deepEqual(rows(tiles, placed), [12, 12, 12]);
});

test('spare columns are shared, the rightmost first: three small tiles become 4, 4, 4, not 3, 3, 6', () => {
  const placed = packTiles([{ id: 'a', span: 3 }, { id: 'b', span: 3 }, { id: 'c', span: 3 }, { id: 'd', span: 6 }]);
  assert.deepEqual(placed, [{ id: 'a', span: 4 }, { id: 'b', span: 4 }, { id: 'c', span: 4 }, { id: 'd', span: 12 }]);
  const two = packTiles([{ id: 'a', span: 3 }, { id: 'b', span: 3 }, { id: 'c', span: 8 }]);
  assert.deepEqual(two.slice(0, 2), [{ id: 'a', span: 6 }, { id: 'b', span: 6 }]);
});

test('odd sizes are made whole and kept to the grid', () => {
  assert.deepEqual(packTiles([{ id: 'a', span: 20 }, { id: 'b', span: 0 }]), [{ id: 'a', span: 12 }, { id: 'b', span: 12 }]);
  assert.deepEqual(packTiles([]), []);
});
