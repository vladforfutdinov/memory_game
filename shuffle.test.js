// Runs the real Game controller against a stub $scope/angular, checking that shuffleSeen
// conserves cards and never lands one on an occupied cell.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const src = readFileSync("src/script/app.js", "utf8");

function loadGame() {
  let Game, utils;
  const memGame = {
    config() {},
    controller(name, fn) { if (name === "Game") Game = fn; },
    filter() {}, factory(_, fn) { utils = fn(); },
  };
  const angular = {
    module: () => memGame,
    forEach: (o, f) => o.forEach(f),
    isArray: Array.isArray,
  };
  const utilsSrc = readFileSync("src/script/utils.js", "utf8");
  new Function("angular", "memGame", src.replace(/^﻿/, "") + utilsSrc.replace(/^﻿+/, ""))(angular, memGame);
  return { Game, utils };
}

const flat = (a) => a.flat().filter(Boolean).map((c) => c.v).sort();

test("shuffleSeen conserves cards and only targets empty cells", () => {
  const { Game, utils } = loadGame();
  const scope = {};
  const timeout = (fn) => fn();
  Game(scope, { grid: 4 }, { path() {} }, timeout, utils);

  // free two cells, mark half the board as seen
  scope.array[0][0] = null;
  scope.array[3][3] = null;
  scope.array[1].forEach((c) => (c.seen = true));
  scope.array[2].forEach((c) => (c.seen = true));

  const before = flat(scope.array);
  for (let n = 0; n < 200; n++) {
    const cellsBefore = scope.array.flat().filter(Boolean).length;
    scope.shuffleSeen();
    expect(flat(scope.array)).toEqual(before);
    expect(scope.array.flat().filter(Boolean).length).toBe(cellsBefore);
  }
});

test("shuffleSeen is a no-op with no empty cells", () => {
  const { Game, utils } = loadGame();
  const scope = {};
  Game(scope, { grid: 4 }, { path() {} }, (fn) => fn(), utils);
  scope.array.flat().forEach((c) => (c.seen = true));
  const before = JSON.stringify(scope.array);
  scope.shuffleSeen();
  expect(JSON.stringify(scope.array)).toBe(before);
});

test("a match reveals the pair, then removes both cards", () => {
  const { Game, utils } = loadGame();
  const scope = {};
  const pending = [];
  const timeout = (fn, delay) => pending.push({ fn, delay });   // manual clock
  Game(scope, { grid: 4 }, { path() {} }, timeout, utils);

  // find a pair and flip both
  const at = {};
  let a, b;
  scope.array.forEach((row, i) => row.forEach((c, j) => {
    if (at[c.v] && !a) { a = at[c.v]; b = [i, j]; } else at[c.v] = [i, j];
  }));
  scope.rotate(a[0], a[1]);
  scope.rotate(b[0], b[1]);

  // both still on the board and open while the reveal timer is pending
  expect(scope.array[a[0]][a[1]]).toBeTruthy();
  expect(scope.isOpen(b[0], b[1])).toBe(true);
  expect(scope.isTimeout).toBe(true);

  pending.shift().fn();                                          // reveal elapses
  expect(scope.array[a[0]][a[1]].leaving).toBe(true);
  expect(scope.array[b[0]][b[1]].leaving).toBe(true);

  pending.shift().fn();                                          // vanish elapses
  expect(scope.array[a[0]][a[1]]).toBe(null);
  expect(scope.array[b[0]][b[1]]).toBe(null);
  expect(scope.current).toBe("");

  // with no cardFlight attached the reshuffle reports done immediately, so the board unlocks
  expect(scope.isTimeout).toBe(false);
});

test("the board stays locked until every flight reports landed", () => {
  const { Game, utils } = loadGame();
  const scope = {};
  const pending = [];
  Game(scope, { grid: 4 }, { path() {} }, (fn, delay) => pending.push({ fn, delay }), utils);

  let release;
  scope.flyMoves = (moves, done) => { release = done; };          // stand in for cardFlight

  scope.array[0][0] = null;
  scope.array.flat().forEach((c) => c && (c.seen = true));

  const at = {};
  let a, b;
  scope.array.forEach((row, i) => row.forEach((c, j) => {
    if (!c) return;
    if (at[c.v] && !a) { a = at[c.v]; b = [i, j]; } else at[c.v] = [i, j];
  }));
  scope.rotate(a[0], a[1]);
  scope.rotate(b[0], b[1]);
  pending.shift().fn();                                            // reveal
  pending.shift().fn();                                            // vanish -> reshuffle starts

  expect(typeof release).toBe("function");
  expect(scope.isTimeout).toBe(true);                              // still locked mid-flight

  release();
  expect(scope.isTimeout).toBe(false);
});

test("open cards never move", () => {
  const { Game, utils } = loadGame();
  const scope = {};
  Game(scope, { grid: 4 }, { path() {} }, (fn) => fn(), utils);
  scope.array[0][0] = null;
  scope.array.flat().forEach((c) => c && (c.seen = true));
  scope.current = "2:2";
  scope.second = "3:3";
  const open = [scope.array[2][2], scope.array[3][3]];
  for (let n = 0; n < 100; n++) scope.shuffleSeen();
  expect(scope.array[2][2]).toBe(open[0]);
  expect(scope.array[3][3]).toBe(open[1]);
});
