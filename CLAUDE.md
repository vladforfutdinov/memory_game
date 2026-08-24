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

`Game.createGrid(n)` builds a flat array of pairs `1..n*n/2` (each twice), shuffles it via `utils.mixRow`, then chops it into an `n × n` array-of-arrays in `$scope.array`.

**A cell is `null` (empty) or a card object `{v, seen, moving}`** — `v` is the face value, `seen` means the player has flipped it at least once, `moving` drives the relocation animation for one tick. State lives on the card rather than in a position-keyed set precisely because cards relocate; a `"i:j"` key would go stale the moment one moves.

Position is still expressed as the string `"i:j"`, but only for the currently open pair:

- `$scope.current` / `$scope.second` — keys of the first and second flipped cards.
- `$scope.temp` — face value of the first flipped card, for the match comparison.
- `$scope.isTimeout` — true during the 1s reveal after a mismatch; blocks further flips.

`rotate(i, j)` ignores empty cells, ignores clicks during the timeout, and ignores a re-click on `current` (that last check stops a double-click matching a card with itself). Both outcomes are timed sequences with `isTimeout` held true throughout, so the board is inert until they finish:

- **Match** — the pair stays face-up for `REVEAL` (700ms), then both cards get `leaving: true` (the `vanish` animation), then after `LEAVE` (400ms) both cells become `null` and `shuffleSeen()` runs into the cells they just freed. `LEAVE` must outlast `@leave-duration` in the Less or cards vanish mid-animation.
- **Mismatch** — after 1s the pair flips back and `shuffleSeen()` runs.

Both paths hold `isTimeout` until the resulting flights land. `shuffleSeen(done)` takes a completion callback and hands it to `flyMoves`, which calls it only after **every** card has reported landed. Do not go back to unlocking on a computed duration: the deferred render and reflow aren't in that number, so the board unlocked a few tens of ms early and a click in that window flipped a still-moving card open.

`shuffleSeen(done)` is the penalty mechanic: it moves a random count (1..min(#empty, #seen)) of seen, unopened cards into empty cells, so a wrong guess scrambles part of what the player had memorised. It reuses `utils.mixRow` to pick the source and target cells and is a silent no-op when the board has no holes yet or nothing has been seen. Cards are conserved — never dropped, never stacked — which is what `shuffle.test.js` pins down.

**It hands the planned moves to `$scope.flyMoves` *before* mutating `$scope.array`** — that ordering is load-bearing: the `cardFlight` directive has to measure where the cards currently are while they are still drawn in their old cells. (It survives the other order only because the DOM lags the model until the next digest, which is not something to rely on.)

Win is "no cards left": `$scope.left` is seeded by `createGrid` and decremented in `remove()`, and `checkWin()` is a comparison. It is bound twice in the template and so runs on every digest — do not turn it back into a grid scan.

`isOpen(i, j)` only reports the currently flipped pair now; permanently-visible matched cards no longer exist.

### Page backdrop

`backdrop` (on the canvas in `index.html`) paints the animated page background: drifting radial colour pools with wave bands over them, on a 240×150 canvas that CSS stretches to the viewport. Two things make it work:

- **`ctx.filter = 'blur(7px)'` in source pixels**, which is ~40px once stretched. Without it the wave edges survive the upscale and the whole thing looks pixelated.
- **The colour lives on `html`, and `body` is transparent.** A background on `body` paints after negative-z-index children and hides the canvas completely.

Measured at 0.07ms/frame for the full workload — there is no reason to reach for WebGL unless the look changes to a per-pixel shader gradient.

### Styles

`src/style/app.css` is plain modern CSS — custom properties, native nesting, no preprocessor and no vendor-prefix mixin. The card flip is a pure-CSS 3D rotation on `.front`/`.back` toggled by the `show` class from `isOpen`, so animation changes belong in the CSS, not in the controller.

Values that exist on both sides are commented as such: `--leave-duration` pairs with `LEAVE` in `app.js`, `--card-back` with `BASE` in `cardArt`.

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
