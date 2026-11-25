// Cognitive complexity of the functions in src/, by SonarSource's published rules (the rules SonarLint's S3776 applies, whose limit is 15).
// It reads the source with the parser that comes with Vite (rolldown/utils), so nothing is added to the project.
//   node tests/support/complexity.ts            lists every top-level function over the limit
//   node tests/support/complexity.ts --write    rewrites tests/app/complexity-baseline.json to match (what a cleanup commits)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'rolldown/utils';

export const LIMIT = 15;
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const BASELINE_FILE = join(ROOT, 'tests/app/complexity-baseline.json');

// What the parser hands back is a plain tree of objects, each with a `type`.
interface Node { type: string; [key: string]: unknown }
const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && typeof (v as Node).type === 'string';
const children = (n: Node): Node[] => Object.entries(n).filter(([k]) => k !== 'type').flatMap(([, v]) => (Array.isArray(v) ? v : [v]).filter(isNode));
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/** The cognitive complexity of one function: its own structures, plus those of the functions written inside it (one level deeper each). */
function score(fn: Node): number {
  let total = 0;
  // a run of the same logical operator counts once; each change of operator counts again
  const logical = (n: Node, parentOp: unknown, nest: number): void => {
    if (n.type !== 'LogicalExpression') { visit(n, nest); return; } // an operand is an ordinary expression: whatever it holds counts as usual
    if (n.operator !== parentOp) total += 1;
    for (const side of [n.left, n.right]) if (isNode(side)) logical(side, n.operator, nest);
  };
  function visit(n: Node, nest: number, elseIf = false): void {
    switch (n.type) {
      case 'IfStatement': {
        total += elseIf ? 1 : 1 + nest;
        for (const part of [n.test]) if (isNode(part)) visit(part, nest);
        if (isNode(n.consequent)) visit(n.consequent, nest + 1);
        const alt = n.alternate;
        if (isNode(alt)) {
          if (alt.type === 'IfStatement') visit(alt, nest, true);
          else { total += 1; visit(alt, nest + 1); }
        }
        return;
      }
      case 'ConditionalExpression':
        total += 1 + nest;
        if (isNode(n.test)) visit(n.test, nest);
        for (const part of [n.consequent, n.alternate]) if (isNode(part)) visit(part, nest + 1);
        return;
      case 'SwitchStatement':
        total += 1 + nest;
        if (isNode(n.discriminant)) visit(n.discriminant, nest);
        for (const c of children(n).filter((x) => x.type === 'SwitchCase')) for (const part of children(c)) visit(part, nest + 1);
        return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': case 'WhileStatement': case 'DoWhileStatement':
        total += 1 + nest;
        for (const c of children(n)) visit(c, c === n.body ? nest + 1 : nest);
        return;
      case 'CatchClause':
        total += 1 + nest;
        for (const c of children(n)) visit(c, nest + 1);
        return;
      case 'LogicalExpression':
        logical(n, null, nest);
        return;
      case 'BreakStatement': case 'ContinueStatement':
        if (n.label) total += 1; // only a jump to a label counts
        return;
      default:
        for (const c of children(n)) visit(c, FUNCTIONS.has(n.type) ? nest + 1 : nest);
    }
  }
  for (const c of children(fn)) visit(c, 0);
  return total;
}

export interface Scored { name: string; line: number; score: number }

const nameOf = (n: Node, parent: Node | null): string => {
  if (n.type === 'FunctionDeclaration' && isNode(n.id)) return String(n.id.name);
  if (parent?.type === 'VariableDeclarator' && isNode(parent.id)) return String(parent.id.name);
  if ((parent?.type === 'MethodDefinition' || parent?.type === 'Property') && isNode(parent.key)) return String(parent.key.name ?? parent.key.value);
  return '(anonymous)';
};

/** Every function that is not inside another function, with its complexity. Two with the same name get #2, #3 in order. */
export function scoreSource(filename: string, source: string): Scored[] {
  const { program } = parseSync(filename, source, { lang: filename.endsWith('x') ? 'tsx' : 'ts' });
  const line = (pos: number) => source.slice(0, pos).split('\n').length;
  const found: { fn: Node; parent: Node | null }[] = [];
  const find = (n: Node, parent: Node | null): void => {
    if (FUNCTIONS.has(n.type)) { found.push({ fn: n, parent }); return; } // what is inside it counts towards it
    for (const c of children(n)) find(c, n);
  };
  find(program as unknown as Node, null);
  const seen = new Map<string, number>();
  return found.map(({ fn, parent }) => {
    const base = nameOf(fn, parent);
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    return { name: k === 1 ? base : `${base}#${k}`, line: line(Number(fn.start)), score: score(fn) };
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !name.endsWith('.gen.ts') ? [p] : [];
  });
}

/** Every function in src/ over the limit, keyed "file::name". */
export function scanSrc(): Record<string, { score: number; line: number }> {
  const out: Record<string, { score: number; line: number }> = {};
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    for (const f of scoreSource(file, readFileSync(file, 'utf8'))) if (f.score > LIMIT) out[`${rel}::${f.name}`] = { score: f.score, line: f.line };
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const now = scanSrc();
  const rows = Object.entries(now).sort((a, b) => b[1].score - a[1].score);
  for (const [key, v] of rows) console.log(String(v.score).padStart(4), `${key}  (line ${v.line})`);
  console.log(`${rows.length} functions over ${LIMIT}`);
  if (process.argv.includes('--write')) {
    const sorted = Object.fromEntries(rows.map(([k, v]) => [k, v.score]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    writeFileSync(BASELINE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(`wrote ${BASELINE_FILE}`);
  }
}
