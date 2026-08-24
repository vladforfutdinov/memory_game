/** Rules and state. No DOM here — the view reads this and renders it. */

export interface Card {
  readonly id: number;
  readonly value: number;
  row: number;
  col: number;
  /** the player has turned it over at least once, so it is fair game for the reshuffle */
  seen: boolean;
  /** accumulated whole turns, so a relocating card spins and still rests at its start angle */
  spin: number;
  /** how long this card waits before setting off, in ms */
  delay: number;
  leaving: boolean;
}

export const TIMING = {
  /** a matched pair stays face-up this long before it goes */
  reveal: 700,
  /** must outlast the .leaving animation in app.css */
  leave: 400,
  /** a mismatched pair stays face-up this long */
  penalty: 1000,
  /** must match --move-duration in app.css */
  move: 450,
  /** gap between one relocating card and the next */
  stagger: 160,
  /** ceiling on a whole staggered run, however many cards move */
  run: 700,
} as const;

export type Timer = (fn: () => void, ms: number) => void;

export interface GameOptions {
  /**
   * Whether a turn reshuffles the cards the player has already seen. Off makes it an ordinary
   * memory game: positions stay put once learned.
   */
  reshuffle?: boolean;
  /** called whenever anything the view draws has changed */
  onChange?: () => void;
  /** injectable so tests can drive time by hand */
  timer?: Timer;
  random?: () => number;
}

const defaultTimer: Timer = (fn, ms) => {
  setTimeout(fn, ms);
};

export class Game {
  readonly grid: number;
  cards: Card[] = [];
  current: Card | null = null;
  second: Card | null = null;
  steps = 0;
  /** true while a sequence is playing out; clicks are ignored */
  locked = false;

  private readonly reshuffle: boolean;
  private readonly onChange: () => void;
  private readonly timer: Timer;
  private readonly random: () => number;

  constructor(grid: number, options: GameOptions = {}) {
    this.grid = grid;
    this.reshuffle = options.reshuffle ?? true;
    this.onChange = options.onChange ?? (() => {});
    this.timer = options.timer ?? defaultTimer;
    this.random = options.random ?? Math.random;
    this.deal();
  }

  get won(): boolean {
    return this.cards.length === 0;
  }

  isOpen(card: Card): boolean {
    return card === this.current || card === this.second;
  }

  flip(card: Card): void {
    if (this.locked || card.leaving || card === this.current) return;

    card.seen = true;
    this.steps++;

    if (!this.current) {
      this.current = card;
      this.onChange();
      return;
    }

    this.second = card;
    this.locked = true;

    if (this.current.value === card.value) this.resolveMatch([this.current, card]);
    else this.resolveMismatch();

    this.onChange();
  }

  /**
   * Every seen card moves, one after another. Moving them in sequence is what makes a crowded
   * board work: a card that leaves frees its own square for whoever comes next, so a single gap
   * is enough to walk the whole set along. The staggered delays are load-bearing rather than
   * decorative — they keep the vacancy ahead of the card taking it.
   */
  shuffleSeen(done?: () => void): void {
    if (!this.reshuffle) {
      done?.();
      return;
    }

    const taken = new Set<string>();
    const movers: Card[] = [];

    for (const card of this.cards) {
      taken.add(`${card.row}:${card.col}`);
      if (card.seen && !card.leaving && !this.isOpen(card)) movers.push(card);
    }

    const free: Array<[number, number]> = [];
    for (let row = 0; row < this.grid; row++) {
      for (let col = 0; col < this.grid; col++) {
        if (!taken.has(`${row}:${col}`)) free.push([row, col]);
      }
    }

    if (movers.length === 0 || free.length === 0) {
      done?.();
      return;
    }

    this.shuffle(movers);

    // With many cards the stagger shrinks, so the run keeps its one-after-another reading
    // without dragging on.
    const step = movers.length > 1
      ? Math.min(TIMING.stagger, TIMING.run / (movers.length - 1))
      : TIMING.stagger;

    movers.forEach((card, n) => {
      const pick = Math.floor(this.random() * free.length);
      const [row, col] = free[pick]!;

      free[pick] = [card.row, card.col];   // the square it leaves is free for the next card
      card.row = row;
      card.col = col;
      card.spin += n % 2 ? -360 : 360;
      card.delay = Math.round(n * step);
    });

    this.onChange();

    // Stay locked until the last card has landed, so a click cannot catch one mid-flight.
    this.timer(() => done?.(), TIMING.move + Math.round((movers.length - 1) * step));
  }

  private resolveMatch(pair: [Card, Card]): void {
    this.timer(() => {
      for (const card of pair) card.leaving = true;
      this.onChange();

      this.timer(() => {
        this.cards = this.cards.filter((card) => !pair.includes(card));
        this.clearOpen();
        this.shuffleSeen(() => this.unlock());
        this.onChange();
      }, TIMING.leave);
    }, TIMING.reveal);
  }

  private resolveMismatch(): void {
    this.timer(() => {
      this.shuffleSeen(() => this.unlock());
      this.clearOpen();
      this.onChange();
    }, TIMING.penalty);
  }

  private unlock(): void {
    this.locked = false;
    this.onChange();
  }

  private clearOpen(): void {
    this.current = null;
    this.second = null;
  }

  private deal(): void {
    const values: number[] = [];
    for (let v = 1; v <= (this.grid * this.grid) / 2; v++) values.push(v, v);

    const squares: Array<[number, number]> = [];
    for (let row = 0; row < this.grid; row++) {
      for (let col = 0; col < this.grid; col++) squares.push([row, col]);
    }

    this.shuffle(values);
    this.shuffle(squares);

    this.cards = values.map((value, id) => {
      const [row, col] = squares[id]!;
      return { id, value, row, col, seen: false, spin: 0, delay: 0, leaving: false };
    });
  }

  /** Fisher-Yates, in place */
  private shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
  }
}
