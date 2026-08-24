'use strict';

memGame.directive('cardFlight', function ($timeout) {
    var DURATION = 450,
        STAGGER  = 160,
        SPIN     = 360;   // a full turn, so the cleared transform on landing matches the animated one

    return {
        link: function (scope, element) {
            // Rows are re-queried per batch, not per lookup: a shuffle asks for up to 2 cells per
            // move and the row list is the same for all of them.
            var cardAt = function (rows, coord) {
                var row = rows[coord[0]],
                    cell = row && row.querySelectorAll('.cell')[coord[1]];
                return cell && cell.querySelector('span:not(.empty)');
            };

            // Called with the planned moves BEFORE the model changes, so source positions can be
            // measured while the cards are still drawn in their old cells. `done` fires once every
            // card has actually landed — never on an estimated duration, or the board unlocks while
            // a card is still in the air and a click flips it open mid-flight.
            scope.flyMoves = function (moves, done) {
                var rows = element[0].querySelectorAll('.row'),
                    flights = [];

                angular.forEach(moves, function (move) {
                    var card = cardAt(rows, move.from);
                    if (card) flights.push({to: move.to, from: card.getBoundingClientRect()});
                });

                if (!flights.length) {
                    if (done) done();
                    return;
                }

                var pending = flights.length,
                    finish  = function () {
                        if (--pending === 0 && done) $timeout(done);
                    };

                $timeout(function () {
                    var landedRows = element[0].querySelectorAll('.row');

                    angular.forEach(flights, function (flight, n) {
                        var card = cardAt(landedRows, flight.to);
                        if (!card) { finish(); return; }

                        var now = card.getBoundingClientRect(),
                            dx  = flight.from.left - now.left,
                            dy  = flight.from.top - now.top,
                            landed = false;

                        // The .front/.back flip transitions bubble their transitionend up to the
                        // card, so only this element's own transform ends the flight.
                        var land = function (e) {
                            if (e && (e.target !== card || e.propertyName !== 'transform')) return;
                            if (landed) return;
                            landed = true;

                            card.removeEventListener('transitionend', land);
                            card.classList.remove('flying');
                            card.style.transition = '';
                            card.style.transform = '';
                            finish();
                        };

                        // A card can inherit the DOM element of a vanished open card: when a pair
                        // matches, the cell goes card -> null -> another card inside one digest, so
                        // ng-if never tears it down. `show` is gone but both faces are still
                        // rotated open and would spend the whole flight turning back — the card
                        // flies face-up. Snapping the faces to their closed state without a
                        // transition is the only way to land them before the flight starts.
                        card.classList.add('instant');
                        void card.offsetHeight;
                        card.classList.remove('instant');

                        card.classList.add('flying');
                        card.style.transition = 'none';
                        card.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) rotate(0deg)';

                        // Reflow pins that offset as the transition's starting point. rAF is the usual
                        // trick, but it stalls while the tab is backgrounded and the card jumps instead.
                        void card.offsetHeight;

                        card.style.transition = 'transform ' + DURATION + 'ms ease-in-out ' + (n * STAGGER) + 'ms';
                        card.style.transform = 'translate(0, 0) rotate(' + (n % 2 ? -SPIN : SPIN) + 'deg)';

                        card.addEventListener('transitionend', land);
                        $timeout(land, DURATION + n * STAGGER + 200, false);
                    });
                }, 0, false);
            };
        }
    };
});

// One animated source canvas, blitted into every card back, so all backs show the identical
// frame. Drawing per card instead would drift them out of step and cost 100x the geometry.
memGame.factory('cardArt', function ($window) {
    var WIDTH  = 144,
        HEIGHT = 192,
        SS     = 2,       // supersample: thin drifting lines alias badly at 1:1 and read as flicker
        SPEED  = 0.0004,
        EVERY  = 2,       // redraw every 2nd frame: a time threshold beats against the refresh rate
                          // and the uneven cadence shows up as stutter on such slow drift
        ZOOM   = 1.5,     // scales the whole drawing
        MEDAL  = 1.5,     // extra scale for the centre medallion only, lattice unaffected
        BASE   = '#414f60',                     // deep slate: the backdrop is pale, so the cards go dark
        INK    = ['rgba(158, 200, 172, .55)',   // sage, kept lighter than the slate or it vanishes
                  'rgba(220, 176, 138, .48)'],  // warm sand — the two hues cross, so the net reads
        MARGIN = 'rgba(236, 206, 158, .8)';     // soft amber medallion

    var source = $window.document.createElement('canvas'),
        ctx    = source.getContext('2d'),
        targets = [],
        running = false;

    source.width = WIDTH * SS;
    source.height = HEIGHT * SS;
    ctx.scale(SS, SS);    // so every drawing coordinate below stays in logical units

    var polygon = function (cx, cy, radius, sides, turn) {
        ctx.beginPath();
        for (var i = 0; i < sides; i++) {
            var a = turn + i * 2 * Math.PI / sides,
                x = cx + radius * Math.cos(a),
                y = cy + radius * Math.sin(a);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    };

    // Diagonal lattice in both directions, drifting by `shift`, clipped to the card.
    var lattice = function (x, y, w, h, step, shift) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        var span = w + h;
        ctx.lineWidth = 1.5;
        for (var dir = 0; dir < 2; dir++) {
            ctx.strokeStyle = INK[dir];
            ctx.beginPath();
            for (var d = -span; d < span; d += step) {
                var off = d + (dir ? -shift : shift) % step;
                ctx.moveTo(x + off, y);
                ctx.lineTo(x + off + (dir ? -h : h), y + h);
            }
            ctx.stroke();
        }
        ctx.restore();
    };

    var frame = function (t) {
        var cx = WIDTH / 2,
            cy = HEIGHT / 2,
            turn = t * SPEED,
            pulse = (Math.sin(t * SPEED * 2) + 1) / 2;

        ctx.fillStyle = BASE;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Central medallion: the one part that still turns.
        var disc = 21 * ZOOM * MEDAL;

        ctx.fillStyle = BASE;
        ctx.beginPath();
        ctx.arc(cx, cy, disc, 0, 2 * Math.PI);
        ctx.fill();

        ctx.lineWidth = 1.5 * MEDAL;
        for (var ring = 0; ring < 3; ring++) {
            ctx.strokeStyle = ring % 2 ? MARGIN : INK[0];
            polygon(cx, cy, (16 - ring * 4 + pulse * 3) * ZOOM * MEDAL, 6, ring % 2 ? -turn : turn);
        }

        ctx.strokeStyle = MARGIN;
        ctx.beginPath();
        ctx.arc(cx, cy, disc, 0, 2 * Math.PI);
        ctx.stroke();

        lattice(0, 0, WIDTH, HEIGHT, 11 * ZOOM, t * SPEED * 26);
    };

    var frames = 0;

    var tick = function (t) {
        if (!targets.length) { running = false; return; }

        if (++frames % EVERY === 0) {
            frame(t);
            angular.forEach(targets, function (target) {
                // Skip cards that are turning or in flight. Repainting a canvas inside an element
                // the compositor is animating forces it to re-rasterise every frame, which is what
                // makes the flip stutter — and the drifting pattern is invisible mid-turn anyway.
                var cls = target.card && target.card.className;
                if (cls && (cls.indexOf('show') !== -1 || cls.indexOf('flying') !== -1 || cls.indexOf('leaving') !== -1)) return;

                target.ctx.drawImage(source, 0, 0, target.canvas.width, target.canvas.height);
            });
        }
        $window.requestAnimationFrame(tick);
    };

    return {
        register: function (canvas, card) {
            var target = {canvas: canvas, ctx: canvas.getContext('2d'), card: card};
            target.ctx.imageSmoothingEnabled = true;
            targets.push(target);

            // Paint once up front: rAF never runs while the tab is backgrounded, and a card
            // that only gets its art from the loop would sit there blank.
            target.ctx.imageSmoothingQuality = 'high';
            frame(0);
            target.ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

            if (!running) {
                running = true;
                $window.requestAnimationFrame(tick);
            }
            return target;
        },
        unregister: function (target) {
            var at = targets.indexOf(target);
            if (at !== -1) targets.splice(at, 1);
        }
    };
});

memGame.directive('cardBack', function (cardArt, $window) {
    return {
        link: function (scope, element) {
            var card   = element[0].parentNode,
                canvas = $window.document.createElement('canvas'),
                ratio  = $window.devicePixelRatio || 1,
                box    = element[0].getBoundingClientRect();

            canvas.width = Math.round(box.width * ratio);
            canvas.height = Math.round(box.height * ratio);
            element[0].appendChild(canvas);

            var target = cardArt.register(canvas, card);
            scope.$on('$destroy', function () { cardArt.unregister(target); });
        }
    };
});


// Full-page backdrop: a handful of large calligraphic strokes over a graded indigo field. Every
// stroke is its own path with its own length, curvature and taper, and they slowly morph — nothing
// is tiled or repeated, which is the whole point of the composition.
//
// A stroke is built as a polygon: walk the spine, offset perpendicular by a width profile that
// tapers to nothing at both ends. That taper is what makes it read as a loaded brush lifting off
// the paper rather than as a band with two parallel edges.
memGame.directive('backdrop', function ($window) {
    var EVERY  = 3,        // ~20fps: a full-screen blurred repaint is the heaviest work on the page,
                           // and at this drift speed nobody can tell it from 30
        GRAIN  = .035,
        STEPS  = 48,                            // samples along a stroke's spine
        SKY    = ['#0a1930', '#16365a'],

        // len/width/off are fractions of the viewport, so the composition holds at any size.
        // Each stroke has its own everything: no two share a rhythm.
        //
        // These are laid down as opaque ink, not as glow: some are darker than the ground and some
        // lighter, which is what gives depth without anything getting bright.
        STROKES = [
            {rgb: '38, 74, 116',  alpha: .96, ox: -0.28, oy: .30, len: 1.25, width: .105, angle: 0.070, curve: 0.07, freq: 0.80, drift: 0.000031, morph: 0.000019, phase: 0},
            {rgb: '20, 48, 82',   alpha: .98, ox: -0.02, oy: .74, len: 1.52, width: .130, angle: -0.051, curve: 0.09, freq: 0.59, drift: -0.000023, morph: 0.000027, phase: 2.2},
            {rgb: '62, 104, 148', alpha: .90, ox: 0.16,  oy: .12, len: 0.99, width: .058, angle: 0.122, curve: 0.05, freq: 1.12, drift: 0.000041, morph: 0.000015, phase: 4.1},
            {rgb: '12, 34, 60',   alpha: .98, ox: 0.30,  oy: .52, len: 1.68, width: .155, angle: -0.090, curve: 0.10, freq: 0.43, drift: 0.000017, morph: 0.000023, phase: 5.5},
            {rgb: '50, 92, 134',  alpha: .92, ox: 0.40,  oy: .88, len: 1.12, width: .072, angle: 0.096, curve: 0.07, freq: 0.94, drift: -0.000035, morph: 0.000031, phase: 1.3},
            {rgb: '26, 56, 92',   alpha: .95, ox: -0.14, oy: .58, len: 1.41, width: .092, angle: -0.109, curve: 0.08, freq: 0.66, drift: 0.000027, morph: 0.000021, phase: 3.7},
            {rgb: '58, 100, 142', alpha: .88, ox: 0.52,  oy: .40, len: 1.06, width: .048, angle: 0.147, curve: 0.10, freq: 1.01, drift: -0.000019, morph: 0.000033, phase: 0.8},
            {rgb: '16, 40, 68',   alpha: .97, ox: 0.12,  oy: .96, len: 1.76, width: .118, angle: -0.038, curve: 0.06, freq: 0.50, drift: 0.000023, morph: 0.000017, phase: 5.1},
            {rgb: '44, 84, 126',  alpha: .90, ox: 0.68,  oy: .66, len: 0.93, width: .062, angle: 0.186, curve: 0.11, freq: 0.88, drift: 0.000037, morph: 0.000029, phase: 2.6},
            {rgb: '70, 116, 160', alpha: .82, ox: -0.06, oy: .14, len: 0.83, width: .034, angle: 0.058, curve: 0.07, freq: 1.29, drift: -0.000043, morph: 0.000039, phase: 4.4},
            {rgb: '22, 50, 84',   alpha: .96, ox: 0.46,  oy: .06, len: 1.18, width: .086, angle: 0.166, curve: 0.09, freq: 0.73, drift: 0.000015, morph: 0.000025, phase: 1.9},
            {rgb: '54, 96, 138',  alpha: .86, ox: 0.22,  oy: .34, len: 0.74, width: .040, angle: -0.198, curve: 0.10, freq: 1.12, drift: -0.000029, morph: 0.000035, phase: 6.0}
        ];

    // The taper depends only on how far along the stroke a sample is, never on time or size, so the
    // whole profile is computed once instead of a pow and two sins per sample per stroke per frame.
    var TAPER = (function () {
        var out = [], i, u, s;
        for (i = 0; i <= STEPS; i++) {
            u = i / STEPS;
            s = Math.sin(Math.PI * u);
            out.push(Math.pow(s, .7) * (.72 + .28 * s) / 2);
        }
        return out;
    })();

    // Colour stops never change per stroke; only the gradient's geometry does. Build the strings once.
    angular.forEach(STROKES, function (st) {
        st.cEdge = 'rgba(' + st.rgb + ', 0)';
        st.cFull = 'rgba(' + st.rgb + ', ' + st.alpha + ')';
        st.cLate = 'rgba(' + st.rgb + ', ' + (st.alpha * .88).toFixed(3) + ')';
    });

    // One buffer, reused by every stroke of every frame: x/y of the two polygon edges. Building
    // fresh arrays here churned ~1300 short-lived objects a second for no reason.
    var SPINE = new Float64Array((STEPS + 1) * 4);

    var grainTile = function (doc) {
        var tile = doc.createElement('canvas'),
            tctx = tile.getContext('2d'),
            img, i;

        tile.width = tile.height = 64;
        img = tctx.createImageData(64, 64);
        for (i = 0; i < img.data.length; i += 4) {
            var v = 150 + Math.random() * 70;   // narrow spread: wide noise looks like dirt, not washi
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
        tctx.putImageData(img, 0, 0);
        return tctx.createPattern(tile, 'repeat');
    };

    return {
        link: function (scope, element) {
            var canvas = element[0],
                ctx    = canvas.getContext('2d'),
                grain  = grainTile($window.document),
                frames = 0,
                lastT  = 0,
                dirty  = true,
                sky    = null,
                W = 0, H = 0;

            // Deliberately ignores devicePixelRatio: every stroke is drawn through an 11px blur, so
            // a 2x backing store would double the fill cost for a difference nothing can show.
            var resize = function () {
                W = canvas.width = canvas.clientWidth;
                H = canvas.height = canvas.clientHeight;

                sky = ctx.createLinearGradient(0, 0, W * .35, H);
                sky.addColorStop(0, SKY[0]);
                sky.addColorStop(1, SKY[1]);
                dirty = false;
            };

            var brush = function (t, st) {
                var span = Math.max(W, H),
                    length = span * st.len,
                    maxW = span * st.width,
                    wobble = t * st.morph,
                    angle = st.angle + Math.sin(wobble) * .035,
                    cos = Math.cos(angle),
                    sin = Math.sin(angle),
                    x0 = W * st.ox + span * .04 * Math.sin(t * st.drift + st.phase),
                    y0 = H * st.oy + span * .03 * Math.cos(t * st.drift * 1.4 + st.phase),
                    curve = length * st.curve,
                    bend = Math.PI * st.freq,
                    n = STEPS + 1,
                    i, along, off, px, py, half, k;

                for (i = 0; i < n; i++) {
                    along = length * (i / STEPS);
                    // the spine bends, and the bend itself slowly changes shape
                    off = curve * Math.sin((i / STEPS) * bend + wobble + st.phase);
                    px = x0 + cos * along - sin * off;
                    py = y0 + sin * along + cos * off;
                    half = maxW * TAPER[i];

                    k = i * 4;
                    SPINE[k]     = px - sin * half;
                    SPINE[k + 1] = py + cos * half;
                    SPINE[k + 2] = px + sin * half;
                    SPINE[k + 3] = py - cos * half;
                }

                ctx.beginPath();
                ctx.moveTo(SPINE[0], SPINE[1]);
                for (i = 1; i < n; i++) ctx.lineTo(SPINE[i * 4], SPINE[i * 4 + 1]);
                for (i = n - 1; i >= 0; i--) ctx.lineTo(SPINE[i * 4 + 2], SPINE[i * 4 + 3]);
                ctx.closePath();

                var grad = ctx.createLinearGradient(x0, y0, x0 + cos * length, y0 + sin * length);
                grad.addColorStop(0, st.cEdge);
                grad.addColorStop(.28, st.cFull);
                grad.addColorStop(.82, st.cLate);
                grad.addColorStop(1, st.cEdge);
                ctx.fillStyle = grad;
                ctx.fill();
            };

            var frame = function (t) {
                if (dirty) resize();
                if (!W || !H) return;

                lastT = t;
                ctx.fillStyle = sky;
                ctx.fillRect(0, 0, W, H);

                // Ink diffusing into paper — enough to keep the edges soft, little enough that each
                // stroke still reads as a stroke. Painted rather than blended: 'screen' adds light,
                // so overlaps climbed in brightness however low the alpha went.
                ctx.filter = 'blur(11px)';
                for (var i = 0; i < STROKES.length; i++) brush(t, STROKES[i]);
                ctx.filter = 'none';

                ctx.globalCompositeOperation = 'overlay';
                ctx.globalAlpha = GRAIN;
                ctx.fillStyle = grain;
                ctx.fillRect(0, 0, W, H);
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';
            };

            var tick = function (t) {
                if (++frames % EVERY === 0) frame(t);
                $window.requestAnimationFrame(tick);
            };

            // Resizing only marks the canvas dirty: a drag fires this continuously, and reallocating
            // the backing store per event is what makes a resize stutter. Redraws at lastT, not 0,
            // so the animation does not jump back to its starting pose.
            $window.addEventListener('resize', function () {
                dirty = true;
                frame(lastT);
            });

            resize();
            frame(0);          // rAF never runs while the tab is backgrounded; do not start blank
            $window.requestAnimationFrame(tick);
        }
    };
});

