# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A memory (card-matching) game prototype built on **AngularJS 1.x** as a static site. All app code lives in `src/`; there is no build step for JS and no framework tooling — vendor libs are committed as minified files in `src/vendor/`.

The repo root also contains a Bun scaffold (`index.ts`, `tsconfig.json`, `package.json`) that is unrelated to the game and unused by it — `index.ts` is just a hello-world stub. Do not assume the game runs through Bun.

## Commands

Serve the static site (`http-server`, no caching, opens a browser):

```sh
bun run dev
```

Then open `http://localhost:8080` — the router redirects `/` to `#/splash`.

`src/style/app.css` is hand-written and loaded directly — there is no CSS build step, so edit it and reload.

Run the game-logic check (`shuffle.test.js` loads the real controller against a stub
`$scope`/`angular` — no browser, no karma):

```sh
bun test
```

There is no lint config or CI.

## Architecture

Everything is wired through the single module `myApp` (`src/script/app.js`), which uses `ngRoute`:

- `/splash` → `partial/splash.html` + `Splash` controller — grid-size picker only.
- `/game` → `partial/game.html` + `Game` controller — the board.
- Anything else redirects to `/splash`.

`src/index.html` renders `ng-view` for the routed partial plus a permanently-included `partial/control.html` (Start/Reset button), which lives outside the route and is driven by the `Control` controller checking `$location.$$path`.

**Cross-route state is `$rootScope.grid`.** `Splash` sets it (default 4); `Game.init()` reads it and bounces back to `/` if it is missing. This is the only channel between the two screens — there is no service holding game state.

`src/script/utils.js` holds the pieces the controllers depend on but that are easy to miss: the `range` filter (populates the splash `<select>` with even sizes 2–10, so grids are always even and pairs always divide evenly) and the `utils` factory (`mixRow` shuffles the flat pair list; `floatArray` flattens nested arrays).

`src/script/directive.js` holds all DOM-touching code: `cardFlight`, plus `cardArt` + `cardBack` for the animated card back. It attaches to `.table` and, having no isolate scope, publishes `flyMoves(moves)` onto the Game scope for `shuffleSeen()` to call.

It animates relocation with FLIP: measure each card's rect before the model changes, then after the digest re-renders, translate the card at its *new* cell back to its old coordinates and transition it to zero, each flight offset by `STAGGER` so cards fly one after another. A card also spins a full `SPIN` turn in flight, alternating direction by index; the turn is a full 360° on purpose, so clearing the inline transform on landing lands on the same visual state the animation ended at. Two traps are already paid for here — the transition must be started by forcing a reflow rather than `requestAnimationFrame` (rAF stalls in a backgrounded tab and the card teleports), and `transitionend` must be filtered to `e.target === card && e.propertyName === 'transform'` because the `.front`/`.back` flip transitions bubble their own events up and would end the flight instantly.

**Card backs** (`.front`, the cover — `.back` is the number side) are canvas-drawn. `cardArt` keeps a single 144×192 source canvas, draws one geometric frame into it per rAF tick, then `drawImage`s that frame into every registered card canvas — so all backs animate in lockstep by construction. Per-card drawing would drift them apart and multiply the geometry cost by the card count. `cardBack` is the per-card directive: it appends a canvas sized to the cell (times `devicePixelRatio`), registers it, and unregisters on `$destroy` — cards are destroyed whenever a pair is removed, so skipping that leaks blits into detached canvases. `register()` also paints one frame immediately, because rAF never runs while the tab is backgrounded and the card would otherwise be blank.

### Game board model

**Cards are a flat list that owns its own position.** `$scope.cards` holds `{id, v, row, col, seen, spin, delay, leaving}`; the grid is not a data structure at all, just the range `row`/`col` are allowed to take. The view is `ng-repeat ... track by card.id` over that list, so **a DOM element belongs to a card, not to a square** — moving a card is an assignment to `row`/`col`, and the element it is bound to is never rebuilt.

That is the whole reason the board is laid out with absolute positioning rather than a table: relocating a card is a transform change that CSS animates on its own. There is no measuring, no FLIP, and no directive coordinating flights. The earlier design bound elements to cells, which meant a matched pair's cell could be emptied and refilled inside one digest — `ng-if` then reused the vanished open card's element and the arriving card flew face-up. That entire class of bug is gone by construction.

`createGrid(n)` deals `1..n*n/2` twice, shuffles both the values and the list of squares, and pairs them up.

- `current` / `second` are **card objects**, not coordinates, so `isOpen(card)` is identity — a card cannot be "open" because of where it happens to sit.
- `rotate(card)` ignores clicks while `isTimeout` holds, on a leaving card, and on the already-open card.
- **Match** — the pair stays face-up for `REVEAL` (700ms), then both get `leaving: true` (the `vanish` animation), then after `LEAVE` (400ms) they are spliced out of `cards` and `shuffleSeen()` fills the gaps.
- **Mismatch** — after `PENALTY` (1s) the pair flips back and `shuffleSeen()` runs.

`shuffleSeen(done)` is the penalty mechanic: **every** seen, unopened card moves, one after another. They are relocated in sequence, and a card that leaves puts its own square back into the free list for whoever comes next — which is why a single gap is enough to walk the whole set along, however crowded the board is. The staggered `delay` is therefore load-bearing rather than decorative: it keeps the vacancy ahead of the card taking it. `step` shrinks as the number of movers grows so the whole run still fits inside `RUN` (700ms). `spin` accumulates a whole turn per move, so the card rotates in transit and still rests at its original angle. `done` fires once the last card has had time to land, and the board stays locked until then.

Win is "no cards left".

Positions reach the DOM through `cardPos`, which writes `--row`, `--col`, `--spin` and `--delay` as custom properties; the CSS turns those into a transform. Card size and gap live only in CSS, so the JS never needs to know pixel geometry.

### Styles

`src/style/app.css` is plain modern CSS — custom properties, native nesting, no preprocessor and no vendor-prefix mixin. The card flip is a pure-CSS 3D rotation on `.front`/`.back` toggled by the `show` class from `isOpen`, so animation changes belong in the CSS, not in the controller.

Values that exist on both sides are commented as such: `--leave-duration` pairs with `LEAVE` in `app.js`, `--card-back` with `BASE` in `cardArt`.

**Never transition `all` on the card faces.** It animates `z-index` and `visibility`, which are discrete and therefore switch at the *end* of the curve — a card reusing a vanished open card's element then kept the face above the cover and flew showing its number.

Which face a card shows is driven by the **`faced` class**, set by the `cardFace` directive half a flip (250ms) after the card opens and cleared the same delay after it closes. `.back` is `visibility: hidden` without it. Do not go back to expressing this as a delayed CSS transition — the transition then runs on elements that had nothing to do with a flip, which is how relocating cards kept arriving with a number showing. (`backface-visibility` cannot do this job either: it stops holding the moment an ancestor transform flattens the 3D context, which is exactly what a flight does.)

**`cardFace` also watches `cell`.** When a pair matches, its cell goes `card → null → another card` inside a single digest, so `ng-if` never observes it empty and reuses that very element for the card flying in — inheriting the vanished card's open face. Changing card resets the class.

`transform-style: preserve-3d` belongs on the **flip container** (`.cell > span`), not on the faces — the faces have no 3D children, so declaring it there does nothing.

The board is `user-select: none`. The card values sit in the DOM regardless of whether a card is face-up, so a double-click selects them all and the selection highlight paints them straight through the covers.

Card movement and removal animate the **outer** span — never `.front`/`.back`, whose `transform` already carries the flip. `.flying` only lifts a card in flight above the ones it passes over; its motion is set inline by `cardFlight`. `.leaving` runs the `vanish` keyframes on a matched pair.

**Animations do not advance in a backgrounded tab** — Chrome pauses transitions, rAF, and clamps timers there. Verify visual changes with the tab actually visible, or you will measure a card that never moves.

An empty cell renders as `<span class="empty">` with **no content** — an `&nbsp;` inside it stretches rows containing a hole from 96px to 148px.

`src/style/normalize.css` and `src/vendor/*` are third-party — leave them alone.

## Conventions

- ES5 only in `src/script/*` (`var`, function expressions, no modules) — it must run under the committed AngularJS 1.x without transpilation. The CSS has no such constraint and targets current browsers.
- New scripts must be added manually as a `<script>` tag in `src/index.html`; there is no bundler.
- Design decisions and their reasoning go in `docs/HISTORY.md`, not in code comments.
