# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A memory (card-matching) game: **TypeScript, no framework**, bundled by Bun and served as static files. The whole app is five modules in `src/ts`, plus hand-written CSS. There is no runtime dependency.

## Commands

```sh
bun run dev        # dev server with HMR on :8080
bun run build      # production bundle into dist/
bun test           # game rules, no DOM and no browser needed
bun run typecheck  # tsc --noEmit, strict
```

**There is no separate build step in development and no static-file server dependency.** `src/index.html` points straight at `./ts/main.ts`; Bun takes the HTML as its entry point, bundles the TypeScript on demand and serves it. `bun run build` does the same thing ahead of time into `dist/` (gitignored, content-hashed filenames).

`src/style/app.css` is hand-written and linked from the HTML; Bun picks it up as an asset — there is no CSS build step either.

## Architecture

- **`game.ts`** — rules and state. No DOM at all, which is what makes it directly testable. Timers are injected (`options.timer`), so tests drive the reveal/vanish/relocate sequences by hand instead of waiting.
- **`board.ts`** — renders the card list into elements and keeps them in sync.
- **`card-art.ts`** — the animated canvas pattern on the card backs.
- **`backdrop.ts`** — the full-page animated background.
- **`main.ts`** — hash router (`#/splash`, `#/game`), the two screens, and wiring.

`Game` owns the state and calls `onChange` whenever something the view draws has changed; `main.ts` re-renders on that.

### The card model — read this before touching the board

**Cards are a flat list that owns its own position.** A `Card` carries `{id, value, row, col, seen, spin, delay, leaving}`. The grid is not a data structure; it is only the range `row`/`col` may take, because the matrix is just a screen layout.

The view keys elements by `card.id`, so **an element belongs to a card, not to a square**. Moving a card is an assignment to `row`/`col`; `board.ts` writes `--row`/`--col` and CSS animates the transform. There is no measuring, no FLIP, and nothing gets rebuilt when a card moves.

This is load-bearing, not stylistic. The previous design bound elements to cells, which let a matched pair's cell be emptied and refilled in one pass — the arriving card then inherited the vanished open card's element and flew face-up. Keying elements to cards removes that whole class of bug by construction.

- `current` / `second` are **card references**, so `isOpen(card)` is identity — a card cannot read as open because of where it sits.
- **Match** — the pair stays face-up for `reveal` (700ms), gets `leaving` (the `vanish` animation), and after `leave` (400ms) is filtered out of `cards`; then `shuffleSeen()` runs.
- **Mismatch** — after `penalty` (1s) the pair closes and `shuffleSeen()` runs.
- `locked` covers each whole sequence, so clicks are ignored until cards have landed.
- On a mismatch the reshuffle runs **before** the pair is closed, so the two cards just turned are excluded from it. Early in a game that often means nothing moves at all — that is correct, not a bug.

Reshuffling is optional — a checkbox on the splash screen, passed as `new Game(grid, {reshuffle})`. With it off the game is ordinary memory: `shuffleSeen()` reports done and moves nothing.

`shuffleSeen(done)` is the penalty mechanic: **every** seen, unopened card moves, one after another. They relocate in sequence, and a card that leaves puts its own square back into the free list for the next one — which is why a single gap is enough to walk the whole set along. The staggered `delay` is therefore part of the mechanic, not decoration: it keeps the vacancy ahead of the card taking it. The step shrinks as the mover count grows so a run still fits inside `TIMING.run`.

### Styles

`src/style/app.css` is plain modern CSS: custom properties, native nesting, no preprocessor, no vendor prefixes (bar `-webkit-user-select` for Safari < 17).

Values duplicated across the boundary are commented on both sides: `TIMING.leave` ↔ `--leave-duration`, `TIMING.move` ↔ `--move-duration`, `card-art.ts`'s `BASE` ↔ `--card-back`. Card size and gap live only in CSS — the TypeScript never deals in pixels.

Two traps that cost real time, both recorded in `docs/HISTORY.md`:

- **Never transition `all` on the card faces.** It animates `z-index` and `visibility`, which are discrete and therefore switch at the *end* of the curve.
- **The vanish animation must not set `transform`.** It would drop the card's positional translate and the card would shrink from the top-left corner. It animates `--vanish-scale` / `--vanish-tilt` (registered with `@property`) instead.

### Debugging note

A Chrome tab whose window is not focused reports `document.hidden`: rAF is frozen, timers are throttled hard, and style recalculation stops. Measurements taken there are worthless — verify anything time- or animation-dependent in a focused window.

## Conventions

- Strict TypeScript, including `noUncheckedIndexedAccess`; keep `bun run typecheck` clean.
- Rules go in `game.ts` and get a test; DOM work stays in the view modules.
- Design decisions and their reasoning belong in `docs/HISTORY.md`, not in code comments.
