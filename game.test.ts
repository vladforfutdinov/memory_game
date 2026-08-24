import { test, expect } from 'bun:test';
import { Game, TIMING, type Card } from './src/ts/game';

/** Collects timer callbacks so a test can advance the sequence by hand. */
function manual() {
  const pending: Array<{ fn: () => void; ms: number }> = [];
  return {
    pending,
    timer: (fn: () => void, ms: number) => { pending.push({ fn, ms }); },
    run: () => pending.shift()!.fn(),
  };
}

const squares = (game: Game) => game.cards.map((c) => `${c.row}:${c.col}`);
const values = (game: Game) => game.cards.map((c) => c.value).sort();
const at = (game: Game) => new Map(game.cards.map((c) => [c.id, `${c.row}:${c.col}`]));
const twin = (game: Game, card: Card) => game.cards.find((c) => c !== card && c.value === card.value)!;

test('a deal puts every pair on the board, one card per square', () => {
  const game = new Game(4);

  expect(game.cards.length).toBe(16);
  expect(new Set(squares(game)).size).toBe(16);
  expect(new Set(game.cards.map((c) => c.id)).size).toBe(16);

  const counts = new Map<number, number>();
  for (const card of game.cards) counts.set(card.value, (counts.get(card.value) ?? 0) + 1);
  expect([...counts.values()].every((n) => n === 2)).toBe(true);
});

test('shuffleSeen conserves cards and never stacks them', () => {
  const game = new Game(4);
  game.cards.splice(0, 3);
  for (const card of game.cards) card.seen = true;

  const before = values(game);
  for (let n = 0; n < 200; n++) {
    game.shuffleSeen();
    expect(values(game)).toEqual(before);
    expect(new Set(squares(game)).size).toBe(game.cards.length);
    for (const card of game.cards) {
      expect(card.row).toBeGreaterThanOrEqual(0);
      expect(card.row).toBeLessThan(game.grid);
      expect(card.col).toBeGreaterThanOrEqual(0);
      expect(card.col).toBeLessThan(game.grid);
    }
  }
});

test('every seen card moves; untouched cards stay put', () => {
  const game = new Game(4);
  game.cards.splice(0, 3);
  game.cards.forEach((card, i) => { card.seen = i % 2 === 0; });

  const before = at(game);
  game.shuffleSeen();

  for (const card of game.cards) {
    const now = `${card.row}:${card.col}`;
    if (card.seen) expect(now).not.toBe(before.get(card.id)!);
    else expect(now).toBe(before.get(card.id)!);
  }
});

test('one free square is enough to walk every seen card along', () => {
  const game = new Game(4);
  game.cards.splice(0, 1);                       // exactly one gap
  for (const card of game.cards) card.seen = true;

  const before = at(game);
  game.shuffleSeen();

  expect(game.cards.every((c) => `${c.row}:${c.col}` !== before.get(c.id))).toBe(true);
  expect(new Set(squares(game)).size).toBe(15);
});

test('a full board cannot reshuffle', () => {
  const game = new Game(4);
  for (const card of game.cards) card.seen = true;

  const before = at(game);
  game.shuffleSeen();
  for (const card of game.cards) expect(`${card.row}:${card.col}`).toBe(before.get(card.id)!);
});

test('the staggered run stays bounded however many cards move', () => {
  const game = new Game(6);
  game.cards.splice(0, 2);
  for (const card of game.cards) card.seen = true;

  game.shuffleSeen();
  const delays = game.cards.map((c) => c.delay);
  expect(Math.max(...delays)).toBeLessThanOrEqual(TIMING.run);
  expect(new Set(delays).size).toBeGreaterThan(1);
});

test('open cards never move', () => {
  const game = new Game(4);
  game.cards.splice(0, 2);
  for (const card of game.cards) card.seen = true;

  game.current = game.cards[0]!;
  game.second = game.cards[1]!;
  const pinned = [game.current, game.second].map((c) => `${c.row}:${c.col}`);

  for (let n = 0; n < 100; n++) game.shuffleSeen();
  expect([game.current, game.second].map((c) => `${c.row}:${c.col}`)).toEqual(pinned);
});

test('a match reveals the pair, then takes both cards off the board', () => {
  const clock = manual();
  const game = new Game(4, { timer: clock.timer });

  const a = game.cards[0]!;
  const b = twin(game, a);
  game.flip(a);
  game.flip(b);

  expect(game.locked).toBe(true);
  expect(game.cards).toContain(a);                 // still on show
  expect(game.isOpen(b)).toBe(true);

  clock.run();                                     // reveal elapses
  expect(a.leaving).toBe(true);
  expect(b.leaving).toBe(true);

  clock.run();                                     // vanish elapses
  expect(game.cards).not.toContain(a);
  expect(game.cards).not.toContain(b);
  expect(game.current).toBe(null);
  expect(game.cards.length).toBe(14);
});

test('the board stays locked until the last card has landed', () => {
  const clock = manual();
  const game = new Game(4, { timer: clock.timer });
  game.cards.splice(0, 2);
  for (const card of game.cards) card.seen = true;

  const a = game.cards[0]!;
  const b = game.cards.find((c) => c.value !== a.value)!;
  game.flip(a);
  game.flip(b);                                    // mismatch
  expect(game.locked).toBe(true);

  clock.run();                                     // penalty elapses, cards set off
  expect(game.locked).toBe(true);

  clock.run();                                     // last card lands
  expect(game.locked).toBe(false);
});

test('a click is ignored while a sequence is playing', () => {
  const clock = manual();
  const game = new Game(4, { timer: clock.timer });

  const a = game.cards[0]!;
  game.flip(a);
  game.flip(game.cards.find((c) => c.value !== a.value)!);   // mismatch locks the board

  const steps = game.steps;
  game.flip(game.cards[5]!);
  expect(game.steps).toBe(steps);
});

test('with reshuffle off, seen cards keep their squares', () => {
  const game = new Game(4, { reshuffle: false });
  game.cards.splice(0, 3);
  for (const card of game.cards) card.seen = true;

  const before = at(game);
  game.shuffleSeen();
  for (const card of game.cards) expect(`${card.row}:${card.col}`).toBe(before.get(card.id)!);
});

test('with reshuffle off, a turn still resolves and unlocks', () => {
  const clock = manual();
  const game = new Game(4, { reshuffle: false, timer: clock.timer });

  const a = game.cards[0]!;
  game.flip(a);
  game.flip(game.cards.find((c) => c.value !== a.value)!);   // mismatch
  expect(game.locked).toBe(true);

  clock.run();                                               // penalty elapses; nothing moves
  expect(game.locked).toBe(false);
  expect(clock.pending.length).toBe(0);                      // no flight timer was scheduled
});

test('clearing the board is a win', () => {
  const game = new Game(4);
  expect(game.won).toBe(false);
  game.cards.length = 0;
  expect(game.won).toBe(true);
});
