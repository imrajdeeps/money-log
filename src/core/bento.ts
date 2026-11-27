// How the Overview's tiles share a wide screen (version 2.0.1). The grid has 12 columns; each tile asks for a width (and two rows if it
// is tall). Placed one after another, a tile that does not fit what is left of a row used to leave a hole there (a 3-wide tile beside
// the 8-wide "This month" tile left one empty column). Here the tiles are placed the way the browser places them, and:
//   - a gap is filled by the next tile that fits it (as the browser's "dense" packing does), and
//   - a tile takes the rest of its row when no other tile could fill it, so a row never ends in a hole.
// The result is the order and the width for each tile; the browser then places them in that order without reordering. Pure.

export const COLUMNS = 12;

export interface TileSize { id: string; span: number; tall?: boolean }
export interface PlacedTile { id: string; span: number }

/** The cells taken so far: rows of 12 flags. */
class Cells {
  private readonly rows: boolean[][] = [];
  taken(r: number, c: number): boolean { return this.rows[r]?.[c] ?? false; }
  take(r: number, c: number, w: number, h: number): void {
    for (let y = r; y < r + h; y++) {
      this.rows[y] ??= new Array<boolean>(COLUMNS).fill(false);
      for (let x = c; x < c + w; x++) this.rows[y]![x] = true;
    }
  }
  /** How many free cells there are from (r, c) to the right, before the next taken one or the edge. */
  run(r: number, c: number): number {
    let n = 0;
    while (c + n < COLUMNS && !this.taken(r, c + n)) n++;
    return n;
  }
}

/** Whether a tile of width w fits at (r, c): the row has the room, and a tall tile also finds the row below free there. */
function fits(cells: Cells, r: number, c: number, w: number, tall: boolean): boolean {
  if (cells.run(r, c) < w) return false;
  return !tall || cells.run(r + 1, c) >= w;
}

interface InRun { at: number; tall: boolean } // a tile placed in the current run of free cells: where it is in the result
type Sized = TileSize & { tall: boolean };

/**
 * The columns nothing can fill go to the tiles of this run, evenly, the rightmost first. Tiles left of a tall tile do not move (the
 * tall tile's second row would shift with them); if the last tile itself is tall, it takes them alone, when the row below has room.
 */
function spread(out: PlacedTile[], run: readonly InRun[], extra: number, cells: Cells, r: number, c: number): void {
  const lastTall = run.map((s) => s.tall).lastIndexOf(true);
  const movable = run.slice(lastTall + 1).map((s) => s.at);
  if (movable.length === 0) {
    if (cells.run(r + 1, c) >= extra) { out[run.at(-1)!.at]!.span += extra; cells.take(r, c, extra, 2); }
    return;
  }
  const each = Math.floor(extra / movable.length);
  let more = extra - each * movable.length;
  for (const at of [...movable].reverse()) {
    out[at]!.span += each + (more > 0 ? 1 : 0);
    if (more > 0) more--;
  }
  cells.take(r, c, extra, 1);
}

/** The next free cell from (r, c), reading row by row. */
function nextFree(cells: Cells, r: number, c: number): [number, number] {
  let y = r;
  let x = c;
  for (;;) {
    if (x >= COLUMNS) { x = 0; y++; }
    if (!cells.taken(y, x)) return [y, x];
    x++;
  }
}

/** Order and widths that fill every row (see the top of the file). Tiles keep their order wherever they fit. */
export function packTiles(tiles: readonly TileSize[]): PlacedTile[] {
  const left: Sized[] = tiles.map((t) => ({ id: t.id, tall: !!t.tall, span: Math.min(COLUMNS, Math.max(1, Math.round(t.span))) }));
  const cells = new Cells();
  const out: PlacedTile[] = [];
  let run: InRun[] = [];
  let r = 0;
  let c = 0;
  while (left.length > 0) {
    const [fr, fc] = nextFree(cells, r, c);
    if (fr !== r || fc !== c) run = []; // the next free cell is not right after the last tile: a new stretch of free cells starts here
    r = fr;
    c = fc;
    const room = cells.run(r, c);
    let i = left.findIndex((t) => fits(cells, r, c, t.span, t.tall));
    const w = i === -1 ? room : left[i]!.span; // nothing fits this gap: the next tile shrinks into it
    if (i === -1) i = 0;
    const tile = left.splice(i, 1)[0]!;
    cells.take(r, c, w, tile.tall ? 2 : 1);
    out.push({ id: tile.id, span: w });
    run.push({ at: out.length - 1, tall: tile.tall });
    c += w;
    const rest = room - w;
    if (rest > 0 && !left.some((t) => fits(cells, r, c, t.span, t.tall))) {
      spread(out, run, rest, cells, r, c);
      c += rest;
    }
  }
  return out;
}
