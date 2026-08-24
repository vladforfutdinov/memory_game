# History

Append-only log of notable changes and the reasoning behind them.

## 2026-08-23 — Matched pairs are removed; wrong guesses scramble the board

The board used to keep matched cards face-up forever (`$scope.done` held the matched
values). Matching now empties both cells instead, and every mismatch triggers
`Game.shuffleSeen()`, which relocates a random number of already-seen face-down cards
into those freed cells. The point is that a wrong guess costs you part of what you had
memorised, so remembering positions is no longer a one-way ratchet.

Cells changed from bare numbers to `null | {v, seen, moving}` so `seen` travels with the
card. A `"i:j"` key set was the obvious alternative and was rejected: keys stop
identifying a card the moment it relocates.

Relocation first shipped as a scale/fade pop in place, on the grounds that a real slide
would need the board re-laid out as absolutely positioned cards.

The empty-cell placeholder originally contained `&nbsp;`, which pushed rows containing a
hole to 148px against the normal 96px. Dropping the entity fixed the row heights.


## 2026-08-23 — Cards fly between cells; matched pairs are revealed before they go

The pop-in-place was replaced with actual movement, one card after another. No re-layout
was needed after all: FLIP does it inside the existing table — measure the card's rect
before the model changes, then after the digest translate the card sitting in its new
cell back to the old coordinates and transition it to zero. Flights are staggered by
160ms so the relocation reads card by card rather than as one blur. The DOM work lives
in `cardFlight` (`directive.js`), which is why `shuffleSeen()` announces its moves before
applying them.

Two failures cost most of the time here and are cheap to re-introduce:

- `requestAnimationFrame` was the original way of starting the transition. It never fired,
  because the tab under automation was backgrounded and Chrome stalls rAF there; the card
  jumped straight to its destination. Forcing a reflow with `offsetHeight` is synchronous
  and immune to it.
- `transitionend` on the card fired immediately, ending every flight before it started.
  The `.front`/`.back` flip transitions bubble their `transitionend` up to the card span,
  so the handler now checks `e.target` and `e.propertyName`.

Also worth remembering when verifying anything visual: a backgrounded tab pauses
transitions entirely, so measurements taken there show a card frozen at its start offset
and say nothing about whether the animation is correct.

A matched pair used to vanish the instant the second card was clicked, so the player never
saw what they had matched. It now stays face-up for 700ms, then plays a shrink/fade
(`.leaving` → `@keyframes vanish`) for 400ms before the cells are emptied. `isTimeout`
covers the whole sequence, so the board is inert until it completes. The JS `LEAVE`
constant and the Less `@leave-duration` have to be kept in step.


## 2026-08-23 — Flights spin

Relocating cards now rotate a full turn while they fly, alternating direction by index so
a group of them doesn't read as one rigid block. The turn is 360° rather than a partial
angle because the inline transform is cleared when the card lands: any other angle would
snap back at the end.


## 2026-08-23 — Canvas card backs

Card backs are drawn on canvas — nested counter-rotating hexagons, a pulsing inner
triangle, and orbiting dots — instead of the flat grey fill.

"The same for all cards" is enforced structurally rather than by trusting a shared clock:
one source canvas is drawn once per frame and blitted into each card's canvas, so every
back is literally the same pixels. The alternative, running the geometry per card, both
multiplies the drawing cost by the card count (up to 100 on a 10×10 board) and lets the
backs drift out of phase.

`register()` paints a frame synchronously as well as starting the rAF loop, because a
backgrounded tab never runs rAF and the cards would show as blank rectangles until the
tab was focused.


## 2026-08-23 — Reshuffle follows a vanishing pair too

A match creates the empty cells, so the reshuffle now runs immediately after the pair
finishes vanishing, not only after a mismatch. Previously the holes a match opened sat
unused until the player next guessed wrong.

`shuffleSeen()` returns the flight duration (`cardFlight.flyMoves` reports it, 0 when
nothing moves) and both outcomes keep `isTimeout` set until then, so cards can't be
clicked mid-flight.


## 2026-08-23 — Board unlocked before the cards had landed

Clicking quickly just as a reshuffle finished could flip a card open while it was still
sliding to its cell. The lock was released on an estimated flight duration
(`DURATION + (n-1) * STAGGER`), which omits the deferred render and the reflow that starts
the transition, so it expired slightly before the last card actually arrived.

`flyMoves` now takes a completion callback and counts landings, firing it only once every
card has reported in — including cards whose element went missing, which would otherwise
leave the counter short and the board locked forever. `land` also guards against running
twice, since both `transitionend` and the fallback timer can call it.


## 2026-08-23 — Flying cards showed their faces

Two independent causes, both making face-down cards read as open.

`transform-style: preserve-3d` was declared on `.front`/`.back`, which have no 3D children,
instead of on the flip container that does. The container therefore flattened its faces,
and once a flight put a transform on that container, `backface-visibility: hidden` no
longer hid the number face — so every relocating card appeared open while it moved.

Separately, a double-click anywhere on the board selects its text, and the card values are
in the DOM whether or not a card is face-up: the selection contained all sixteen digits and
the highlight painted them through the covers. The board is now `user-select: none`.

Worth remembering: the earlier suspicion here was a click-timing race, and the unlock was
rewritten to fire on real landings because of it. That change is right on its own merits,
but it was not this bug — "all of them look open" was the clue that ruled timing out, since
a race can only catch one card.

Neither fix was sufficient. What finally settled it was hiding the number face with
`visibility` (see below), which does not depend on the compositor at all.


## 2026-08-23 — Cards arriving in a vacated cell showed a number

The definitive form of the "flying cards look open" bug, from a repro worth keeping: touch
a few cards, match a pair, and click twice in the field before the pair disappears — the
relocating cards arrive showing their numbers.

`.back` is now `visibility: hidden` unless the card is open, so a face-down card cannot
paint its number whatever the 3D context is doing. The first attempt at this delayed the
visibility change by half a flip so the number would drop mid-turn, which reintroduced the
bug in a new form: the delay kept the number painted on the cell a matched pair had just
vacated, and cards fly into exactly those cells, so they arrived with a number showing.
Measured directly — flying cards carried no `.show` class yet computed `visibility: visible`
for 250ms. There is no delay now.


## 2026-08-24 — Review pass over the shuffle/flight code

- `shuffleSeen` called `flyMoves` *after* mutating the board, contradicting both its own
  comment and the directive's. It worked only because the DOM lags the model until the next
  digest, so the measured rects happened to still be the old ones. Restored to the
  documented order rather than leaving it resting on digest timing.
- Cells are collected as `[i, j]` pairs instead of `"i:j"` strings that were immediately
  parsed back into pairs. The string form remains only where it is genuinely a key
  (`current`/`second`).
- `checkWin()` scanned the whole grid and is bound twice in the template, so it ran twice
  per digest. It is now a comparison against a `left` counter maintained by `remove()`.
- `cardFlight` re-queried the row list on every cell lookup; it is queried once per batch.
- The card-back animation is throttled to ~30fps. It is ambient decoration and every frame
  costs one `drawImage` per card — up to 100 on a 10x10 board.


## 2026-08-24 — Animated page backdrop

A canvas backdrop behind the whole page: slow radial colour pools with wave bands drifting
over them, rendered small (240x150) and stretched to the viewport.

Findings worth keeping:

- Blobs initially all orbited the canvas centre, which averaged out to a flat wash. Each
  needs its own home position.
- The page still rendered flat afterwards because `body` had a background: element
  backgrounds paint after negative z-index children, so it covered the canvas entirely. The
  colour moved to `html`, with `body` transparent.
- A plain centre-to-transparent gradient reads as one undifferentiated haze once upscaled;
  a held mid stop gives each pool a core that survives.
- Each wave band is two sine terms of different wavelength drifting against each other. One
  sine alone reads as a rigid rolling ribbon.
- Upscaling a small canvas pixelates wherever the source has a hard edge — the wave
  boundaries. A source-space blur removes it far more cheaply than rendering at full size.

The whole frame benchmarks at 0.07ms, so this stays canvas 2D. WebGL would only be
warranted for a per-pixel warped mesh gradient, which is a different visual target.

Card backs were darkened to `#414f60` once the backdrop went pale, for ~40 points of
luminance separation between card and background.


## 2026-08-24 — The flip, and open cards in flight, settled properly

Two linked problems, chased in circles until the fix stopped depending on timing.

The flip stopped reading as a flip: `.back` became visible in the same instant the `show`
class landed, so the face swapped before the card had turned at all. `backface-visibility`
used to cover this and no longer does, since an ancestor transform flattens the 3D context.
Both faces now swap `visibility` half a flip late (0.25s), in BOTH directions — delaying only
the reveal left the closing turn looking like an instant re-render.

That symmetric delay is what previously let a relocating card show a number: the closing
pair's faces are mid-swap exactly when a reshuffle starts. Rather than tune the delays again,
cards in flight now carry a hard rule — `.flying .back { visibility: hidden !important }`.
Only face-down cards ever relocate, so this is true by construction and no longer depends on
which phase a transition happens to be in.

Worth keeping: a card arriving in a freed cell is a *new* DOM element (`ng-if` rebuilds it),
so its initial state applies without a transition. That was verified by tagging elements and
checking the tag was absent after a flight — not assumed.


## 2026-08-24 — Relocating cards arrived open: the element was being reused

The long-running "shuffled cards move while open" bug, finally traced. Every previous fix
treated it as a timing race between the flip's visibility transition and the start of a
flight, and each one only narrowed the window.

The real mechanism: when a pair matches, `remove()` nulls the cells and `shuffleSeen()` puts
a different card into them **within the same digest**. `ng-if` only ever sees truthy → truthy,
so it never tears the element down — the arriving card reuses the DOM node of the vanished
open card, complete with its revealed face. That is why the bug only showed with a
disappearing pair, and why a card arriving in a cell emptied any other way looked fine.

Measurement that settled it: cards in flight carried `faced=2` while the `!important` cover
rule was the only thing hiding their numbers.

Face visibility is now a state (`faced`, set and cleared by the `cardFace` directive around
the midpoint of the turn) rather than a delayed transition, and `cardFace` clears it whenever
the cell's card object changes. A reused element therefore cannot inherit an open face.


## 2026-08-24 — Flip stutter after the face-state change

Once the cover stayed visible for the first half of the turn (it used to vanish instantly),
the card's canvas was being repainted ~30 times a second *inside an element the compositor
was animating*, forcing a re-rasterise every frame.

`cardArt` now skips the blit for any card carrying `show`, `flying` or `leaving`. The
drifting pattern is not readable mid-turn anyway, and the card resumes animating the moment
it settles. Animating cards also get `will-change: transform`, but only via those classes —
never on all hundred cards at once.

The backdrop dropped to every 3rd frame (~20fps) in the same pass; a full-screen blurred
repaint is the heaviest work on the page and the drift is far too slow to show the
difference.

Note for future debugging: none of this is measurable in a backgrounded tab. rAF is frozen
there, so a canvas looks equally "frozen" whether the skip logic works or not.


## 2026-08-24 — The flip itself: `transition: all` was swallowing visibility

Symptoms: the first half of the opening turn was fine and then the face snapped in; the
closing turn did not exist at all — the card vanished and the second half played out already
covered.

Two causes, both about the turn in place, nothing to do with flights.

`transition: all` includes `visibility`. A transitioned visibility does not switch when the
class changes, it switches somewhere along the curve — so every face swap was desynced from
the rotation driving it. The transition now lists `transform`, `top` and `box-shadow`
explicitly.

And `backface-visibility` works perfectly well for a card turning in place; it only fails
under the transform `cardFlight` applies. Pinning the faces myself at the midpoint fought it.
Now `cardFace` adds `flipping` for the duration of the turn, where both faces are visible and
backface-visibility decides which is seen — that is what makes the rotation continuous — and
pins them only at rest (`faced`, or neither class). `faced` is dropped when a turn starts,
not when it ends: it outranks `flipping` in the cascade, and leaving it on hid the cover
exactly as the card passed edge-on, which is what made the card disappear.


## 2026-08-24 — Less dropped for plain CSS

`app.less` and `_utils.less` are gone; `src/style/app.css` is now hand-written and served
directly, so there is no build step between editing a style and reloading the page.

Everything the preprocessor was providing has a native equivalent now: variables became
custom properties, nesting is native, and the `.vendor()` mixin — which existed to emit
`-webkit-`/`-khtml-`/`-moz-` copies of `transform`, `transition` and `backface-visibility`
via a `_:` property hack — is unnecessary for current browsers. Only `-webkit-user-select`
was kept, for Safari before 17.

Dropped as dead while converting: `.btn-primary`, `.btn-secondary`, `.btn-sm`, `.text-*` and
the `::-ms-expand` reset. None are referenced by any template.


## 2026-08-24 — Open cards in flight: `transition: all` was animating z-index

The real cause, found from two user observations that narrowed it precisely: it happened only
with a vanishing pair, and only on diagonal flights.

When a pair matches, its cell goes `card -> null -> another card` inside one digest, so ng-if
never sees it empty and reuses the element of the vanished open card. `ng-class` correctly
drops `show` — but the faces transitioned `all`, and `all` includes `z-index`. A discrete
property does not switch when the class changes; it switches at the END of the curve. So the
face kept `z-index: 2` over the cover for half a second, and the card flew showing its number.

Caught directly — two cards in the same flight:

    classes="hide flying" back z=2 top=-2.75px   <- inherited an open card's element
    classes="hide flying" back z=0 top=0px       <- ordinary card

The flip transition now lists `transform`, `top` and `box-shadow`. Never `all` here: it also
sweeps in `visibility`, which caused a separate round of desynced face swaps earlier.

Everything else tried against this bug (visibility pinning, `faced`/`flipping` state classes,
an `!important` cover rule) was reverted; none of it was needed once the transition stopped
animating a discrete property.


## 2026-08-24 — Cards flying face-up: ng-if was reusing the vanished pair's elements

Fixed. The cause was structural, not a timing race, and every earlier attempt (delayed
visibility, `faced`/`flipping` state classes, an `!important` cover rule) treated a symptom.

When a pair matches, `remove()` nulls its cells and `shuffleSeen()` refills them **inside the
same digest**. `ng-if` therefore never observes the cells empty — the expression goes truthy →
truthy — and reuses the DOM element of the vanished, open card. The arriving card inherits it
with both faces still rotated open; they take 0.5s to turn back, which is exactly how long the
flight lasts, so the card travels face-up. That explains both reported patterns: it only ever
happened alongside a disappearing pair, and it looked random because it depended on whether a
card happened to be routed into one of the pair's cells.

The fix is one deferred tick: the reshuffle now runs in a `$timeout` after the removal, so the
cells actually render empty, ng-if tears the old elements down, and arriving cards get fresh
ones.

Two smaller changes made along the way are worth keeping:

- The face transition lists `transform`, `top` and `box-shadow` explicitly. `all` also
  animates `z-index` and `visibility`, both discrete, which switch at the END of the curve.
- `cardFlight` snaps a card shut without a transition (`instant`) before starting a flight —
  belt-and-braces if an element is ever reused again.

Debugging note that cost real time here: a Chrome tab whose window is not focused reports
`document.hidden`, freezes rAF and throttles timers hard. Measurements taken there are
worthless — at one point `current` was still set 2.5s after a click simply because the
`$timeout` had not run. Verify anything time-dependent in a focused window.


## 2026-08-24 — Cards became a flat list that owns its position

The board was a matrix of cells with cards living inside them, which made a card's identity
depend on where it sat. That is backwards: the matrix is only a screen layout, and it is
variable. Cards are now a flat list of objects carrying `row`/`col`, rendered with
`track by card.id` and positioned absolutely from `--row`/`--col` custom properties.

Consequences, all of them simplifications:

- Relocating a card is `card.row = r; card.col = c`. CSS transitions the transform; that IS
  the flight. The `cardFlight` directive — rect measuring, FLIP, staggered inline transforms,
  transitionend bookkeeping, landing callbacks — was deleted outright.
- `current`/`second` hold card objects, so "open" is identity rather than a coordinate string.
- Removing a matched pair splices two entries; no other element is touched.
- The deferred tick added a few hours earlier is gone: nothing can reuse another card's
  element now, because elements are keyed to cards.

This retires the entire family of bugs chased through the preceding sessions (cards flying
face-up, faces desyncing, elements inheriting state) rather than patching another instance of
it. Roughly 100 lines of directive and all the table/cell CSS went with it.


## 2026-08-24 — Vanishing no longer moves the card

`@keyframes vanish` set `transform` outright, which dropped the positional `translate` the card
carries — a matched card jumped to the top-left corner and shrank there.

Position and disappearance now share the transform without fighting over it: `--vanish-scale`
and `--vanish-tilt` are registered with `@property` (so they can be animated at all), the card's
transform composes them after its translate, and the keyframes touch only those two custom
properties plus opacity. The card shrinks where it stands.

Verification note: style recalculation is frozen in a backgrounded tab — even changing `--row`
inline left `getComputedStyle().transform` unchanged — so this was checked by reading the rule
and the registered property values, not by measuring the animation.


## 2026-08-24 — Every touched card moves, in sequence

The reshuffle used to relocate a random handful of seen cards, bounded by how many squares
happened to be free. Now all of them move.

The crowding problem — many touched cards, few gaps — is solved by moving them one at a time:
a card that leaves frees its own square for the next one, so the vacancy walks through the set
and one gap suffices. The stagger is part of the mechanic, not styling; without it two cards
would be mid-flight into the same square.

`step` scales down as the mover count rises so the run stays inside 700ms — a 6x6 board with
35 cards moving still finishes in that window rather than taking 35 x 160ms.

Verified on the worst case (6x6, a single gap, everything seen): 35 of 35 cards moved, 35
distinct squares afterwards, zero DOM elements rebuilt.
