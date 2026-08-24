// Runs the real Game controller against a stub $scope/angular. Cards are a flat list that owns
// its own coordinates, so these assertions are about the model only — no DOM, no browser.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

function loadGame() {
  let Game, utils;
  const memGame = {
    config() {},
    controller(name, fn) { if (name === "Game") Game = fn; },
    filter() {}, factory(_, fn) { utils = fn(); }, directive() {},
  };
  const angular = {
    module: () => memGame,
    forEach: (o, f) => o.forEach(f),
    isArray: Array.isArray,
  };
  const src = readFileSync("src/script/app.js", "utf8").replace(/^﻿/, "");
  const utilsSrc = readFileSync("src/script/utils.js", "utf8").replace(/^﻿+/, "");
  new Function("angular", "memGame", src + utilsSrc)(angular, memGame);
  return { Game, utils };
}

function newGame(grid = 4, timeout = (fn) => fn()) {
  const { Game, utils } = loadGame();
  const scope = {};
  Game(scope, { grid }, { path() {} }, timeout, utils);
  return scope;
}

const occupied = (scope) => scope.cards.map((c) => `${c.row}:${c.col}`);
const values = (scope) => scope.cards.map((c) => c.v).sort();

test("a grid deals every pair once, each card on its own square", () => {
  const scope = newGame(4);
  expect(scope.cards.length).toBe(16);
  expect(new Set(occupied(scope)).size).toBe(16);          // no two cards share a square
  expect(new Set(scope.cards.map((c) => c.id)).size).toBe(16);

  const counts = {};
  scope.cards.forEach((c) => (counts[c.v] = (counts[c.v] || 0) + 1));
  expect(Object.values(counts).every((n) => n === 2)).toBe(true);
});

test("shuffleSeen only moves cards onto free squares, and never loses one", () => {
  const scope = newGame(4);
  scope.cards.splice(0, 3);                                 // free three squares
  scope.cards.forEach((c) => (c.seen = true));

  const before = values(scope);
  for (let n = 0; n < 200; n++) {
    scope.shuffleSeen();
    expect(values(scope)).toEqual(before);                  // conserved
    expect(new Set(occupied(scope)).size).toBe(scope.cards.length);  // never stacked
    scope.cards.forEach((c) => {
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeLessThan(scope.grid);
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(scope.grid);
    });
  }
});

test("shuffleSeen is a no-op with a full board", () => {
  const scope = newGame(4);
  scope.cards.forEach((c) => (c.seen = true));
  const before = JSON.stringify(scope.cards);
  scope.shuffleSeen();
  expect(JSON.stringify(scope.cards)).toBe(before);
});

test("every seen card moves; untouched cards stay put", () => {
  const scope = newGame(4);
  scope.cards.splice(0, 3);                                 // free three squares
  scope.cards.forEach((c, i) => (c.seen = i % 2 === 0));    // half the board touched

  const before = new Map(scope.cards.map((c) => [c.id, `${c.row}:${c.col}`]));
  scope.shuffleSeen();

  scope.cards.forEach((c) => {
    const now = `${c.row}:${c.col}`;
    if (c.seen) expect(now).not.toBe(before.get(c.id));
    else expect(now).toBe(before.get(c.id));
  });
  expect(new Set(occupied(scope)).size).toBe(scope.cards.length);
});

test("one free square is enough to walk every seen card along", () => {
  const scope = newGame(4);
  scope.cards.splice(0, 1);                                 // exactly one gap
  scope.cards.forEach((c) => (c.seen = true));              // all fifteen touched

  const before = new Map(scope.cards.map((c) => [c.id, `${c.row}:${c.col}`]));
  scope.shuffleSeen();

  expect(scope.cards.every((c) => `${c.row}:${c.col}` !== before.get(c.id))).toBe(true);
  expect(new Set(occupied(scope)).size).toBe(15);           // still no two cards on a square
});

test("the stagger keeps the run bounded however many cards move", () => {
  const scope = newGame(6);
  scope.cards.splice(0, 2);
  scope.cards.forEach((c) => (c.seen = true));              // 34 cards moving
  scope.shuffleSeen();

  const delays = scope.cards.map((c) => c.delay);
  expect(Math.max(...delays)).toBeLessThanOrEqual(700);     // RUN
  expect(new Set(delays).size).toBeGreaterThan(1);          // genuinely staggered
});

test("open cards never move", () => {
  const scope = newGame(4);
  scope.cards.splice(0, 2);
  scope.cards.forEach((c) => (c.seen = true));
  scope.current = scope.cards[0];
  scope.second = scope.cards[1];
  const pinned = [scope.current, scope.second].map((c) => `${c.row}:${c.col}`);

  for (let n = 0; n < 100; n++) scope.shuffleSeen();
  expect([scope.current, scope.second].map((c) => `${c.row}:${c.col}`)).toEqual(pinned);
});

test("a match reveals the pair, then removes both cards", () => {
  const pending = [];
  const scope = newGame(4, (fn, delay) => pending.push({ fn, delay }));

  const a = scope.cards[0];
  const b = scope.cards.find((c) => c !== a && c.v === a.v);
  scope.rotate(a);
  scope.rotate(b);

  expect(scope.isTimeout).toBe(true);
  expect(scope.cards).toContain(a);                          // still shown
  expect(scope.isOpen(b)).toBe(true);

  pending.shift().fn();                                      // reveal elapses
  expect(a.leaving).toBe(true);
  expect(b.leaving).toBe(true);

  pending.shift().fn();                                      // vanish elapses
  expect(scope.cards).not.toContain(a);
  expect(scope.cards).not.toContain(b);
  expect(scope.current).toBe(null);
  expect(scope.cards.length).toBe(14);
});

test("the board stays locked until the last card has landed", () => {
  const pending = [];
  const scope = newGame(4, (fn, delay) => pending.push({ fn, delay }));
  scope.cards.splice(0, 2);
  scope.cards.forEach((c) => (c.seen = true));

  const a = scope.cards[0];
  const b = scope.cards.find((c) => c !== a && c.v !== a.v);
  scope.rotate(a);
  scope.rotate(b);                                           // mismatch
  expect(scope.isTimeout).toBe(true);

  pending.shift().fn();                                      // penalty elapses, flights begin
  expect(scope.isTimeout).toBe(true);                        // still locked while cards move

  pending.shift().fn();                                      // last card lands
  expect(scope.isTimeout).toBe(false);
});

test("a won board reports the win", () => {
  const scope = newGame(4);
  expect(scope.checkWin()).toBe(false);
  scope.cards.length = 0;
  expect(scope.checkWin()).toBe(true);
});
