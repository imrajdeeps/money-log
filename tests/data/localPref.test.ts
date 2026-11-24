import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localPref } from '../../src/data/localPref.ts';

type G = typeof globalThis & { localStorage?: unknown };
const g = globalThis as G;
const stash = g.localStorage;
const withStore = (store: unknown, f: () => void) => { g.localStorage = store; try { f(); } finally { g.localStorage = stash; } };
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const clean = (v: unknown): string => (typeof v === 'string' ? v : '');

test('a saved choice is read back, and junk in the store is the fallback', () => {
  const store = memory();
  withStore(store, () => {
    const p = localPref('k', clean, 'dflt');
    assert.equal(p.load(), 'dflt');
    p.save('mine');
    assert.equal(p.load(), 'mine');
    store.setItem('k', '{broken');
    assert.equal(localPref('k', clean, 'dflt').load(), 'dflt', 'text that is not JSON');
  });
});

test('with storage blocked the choice still lasts until the page is closed', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  withStore(blocked, () => {
    const p = localPref('k', clean, 'dflt');
    assert.equal(p.load(), 'dflt');
    p.save('mine');
    assert.equal(p.load(), 'mine');
  });
});

test('with storage full the last choice is what is read, not the older stored one', () => {
  const m = memory();
  const full = { getItem: m.getItem, setItem: () => { throw new Error('quota'); } };
  m.setItem('k', JSON.stringify('old'));
  withStore(full, () => {
    const p = localPref('k', clean, 'dflt');
    assert.equal(p.load(), 'old');
    p.save('new');
    assert.equal(p.load(), 'new');
  });
});

test('listeners hear a change', () => {
  withStore(memory(), () => {
    const p = localPref('k', clean, '');
    let n = 0;
    const off = p.subscribe(() => { n++; });
    p.save('a');
    off();
    p.save('b');
    assert.equal(n, 1);
  });
});
