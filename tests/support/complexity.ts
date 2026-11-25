// Cognitive complexity of the functions in src/, counted the way SonarLint counts it (rule S3776, limit 15), following SonarJS as it is today
// (its rule source, packages/analysis/src/jsts/rules/S3776/rule.ts and helpers/jsx.ts, read 2026-11-25):
//   - every function is scored on its own, nested ones too (a callback or a handler inside a component is its own function): what a
//     function holds counts for it, what a function inside it holds counts for that one, and nesting starts again at zero in each;
//   - if, else if, else, switch, for, while, do, catch, a conditional expression and a jump to a label add one; inside another such
//     structure they add one more for each level of nesting;
//   - a run of && counts once; || and ?? do not count; && directly inside JSX ({ok && <p/>}) does not count.
// It reads the source with the parser that comes with Vite (rolldown/utils), so nothing is added to the project.
// SonarLint's own panel stays the last word: the version of SonarJS inside the editor may be older or newer than the one read here.
//   node tests/support/complexity.ts            lists every function over the limit
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
const WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'ParenthesizedExpression']);
const unwrap = (n: Node): Node => (WRAPPERS.has(n.type) && isNode(n.expression) ? unwrap(n.expression) : n);

/** The logical expressions of a run, left to right (a && b || c gives the && node, the || node), looking through parentheses and `as`. */
function flatten(n: Node, seen: Set<Node>): Node[] {
  const u = unwrap(n);
  if (u.type !== 'LogicalExpression') return [];
  seen.add(u);
  return [...flatten(u.left as Node, seen), u, ...flatten(u.right as Node, seen)];
}

/** The nodes of a short-circuit written straight inside JSX: all with the root's operator and no conditional in between; otherwise null. */
function jsxRun(root: Node, n: Node): Node[] | null {
  const u = unwrap(n);
  if (u.type === 'ConditionalExpression' || (u.type === 'LogicalExpression' && u.operator !== root.operator)) return null;
  if (u.type !== 'LogicalExpression') return [];
  const left = jsxRun(root, u.left as Node);
  const right = jsxRun(root, u.right as Node);
  return left && right ? [...left, u, ...right] : null;
}

/** The complexity of one function by itself, and the functions written directly inside it (they are scored on their own). */
function ownScore(fn: Node): { score: number; inner: { node: Node; parent: Node }[] } {
  let score = 0;
  const inner: { node: Node; parent: Node }[] = [];
  const counted = new Set<Node>(); // logical expressions already counted as part of a run (or free, inside JSX)

  function logical(n: Node, parents: Node[]): void {
    if (counted.has(n)) return;
    let i = parents.length - 1;
    while (i >= 0 && unwrap(parents[i]!) === n) i--; // looking through `(…)` and `as` around it
    if (parents[i]?.type === 'JSXExpressionContainer') {
      const free = jsxRun(n, n);
      if (free) { for (const f of free) counted.add(f); return; }
    }
    let previous: Node | undefined;
    for (const current of flatten(n, counted)) {
      if (current.operator !== '||' && current.operator !== '??' && previous?.operator !== current.operator) score += 1;
      previous = current;
    }
  }

  function visit(n: Node, parents: Node[], nest: number): void {
    if (FUNCTIONS.has(n.type)) { inner.push({ node: n, parent: parents.at(-1)! }); return; }
    const here = [...parents, n];
    const to = (child: unknown, level: number): void => { if (isNode(child)) visit(child, here, level); };
    switch (n.type) {
      case 'IfStatement': {
        const parent = parents.at(-1);
        score += parent?.type === 'IfStatement' && parent.alternate === n ? 1 : 1 + nest; // else if adds one, without nesting
        to(n.test, nest);
        to(n.consequent, nest + 1);
        if (isNode(n.alternate) && n.alternate.type !== 'IfStatement') score += 1; // else
        to(n.alternate, isNode(n.alternate) && n.alternate.type === 'IfStatement' ? nest : nest + 1);
        return;
      }
      case 'ConditionalExpression':
        score += 1 + nest;
        to(n.test, nest);
        to(n.consequent, nest + 1);
        to(n.alternate, nest + 1);
        return;
      case 'SwitchStatement':
        score += 1 + nest;
        to(n.discriminant, nest);
        for (const c of (n.cases as Node[])) to(c, nest + 1);
        return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': case 'WhileStatement': case 'DoWhileStatement':
        score += 1 + nest;
        for (const c of children(n)) visit(c, here, c === n.body ? nest + 1 : nest);
        return;
      case 'CatchClause':
        score += 1 + nest;
        for (const c of children(n)) visit(c, here, c === n.body ? nest + 1 : nest);
        return;
      case 'BreakStatement': case 'ContinueStatement':
        if (n.label) score += 1; // only a jump to a label counts
        return;
      case 'LogicalExpression':
        logical(n, parents);
        break;
      default:
        break;
    }
    for (const c of children(n)) visit(c, here, nest);
  }

  for (const c of children(fn)) visit(c, [fn], 0);
  return { score, inner };
}

export interface Scored { name: string; line: number; score: number }

const nameOf = (n: Node, parent: Node | null): string => {
  if (n.type === 'FunctionDeclaration' && isNode(n.id)) return String(n.id.name);
  if (parent?.type === 'VariableDeclarator' && isNode(parent.id)) return String(parent.id.name);
  if ((parent?.type === 'MethodDefinition' || parent?.type === 'Property') && isNode(parent.key)) return String(parent.key.name ?? parent.key.value);
  return '(anonymous)';
};

/**
 * Every function in the file with its own complexity. One inside another is named after the way in, "Outer>inner"; two with the same name
 * get #2, #3 in the order they are met.
 */
export function scoreSource(filename: string, source: string): Scored[] {
  const { program } = parseSync(filename, source, { lang: filename.endsWith('x') ? 'tsx' : 'ts', preserveParens: false });
  const line = (pos: number) => source.slice(0, pos).split('\n').length;
  const out: Scored[] = [];
  const seen = new Map<string, number>();
  const add = (fn: Node, parent: Node | null, path: string): void => {
    const base = path ? `${path}>${nameOf(fn, parent)}` : nameOf(fn, parent);
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    const name = k === 1 ? base : `${base}#${k}`;
    const { score, inner } = ownScore(fn);
    out.push({ name, line: line(Number(fn.start)), score });
    for (const i of inner) add(i.node, i.parent, name);
  };
  const find = (n: Node, parent: Node | null): void => {
    if (FUNCTIONS.has(n.type)) { add(n, parent, ''); return; }
    for (const c of children(n)) find(c, n);
  };
  find(program as unknown as Node, null);
  return out;
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
