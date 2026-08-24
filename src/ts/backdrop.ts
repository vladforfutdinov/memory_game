/**
 * Full-page backdrop: a handful of large calligraphic strokes over a graded indigo field. Every
 * stroke is its own path with its own length, curvature and taper, and they slowly morph —
 * nothing is tiled or repeated, which is the point of the composition.
 *
 * A stroke is built as a polygon: walk the spine, offset perpendicular by a width profile that
 * tapers to nothing at both ends. That taper is what makes it read as a loaded brush lifting off
 * the paper rather than as a band with two parallel edges.
 */

/** ~20fps: a full-screen blurred repaint is the heaviest work on the page */
const EVERY = 3;
const GRAIN = 0.035;
/** samples along a stroke's spine */
const STEPS = 48;
const SKY = ['#0a1930', '#16365a'] as const;

interface Stroke {
  rgb: string;
  alpha: number;
  ox: number;
  oy: number;
  len: number;
  width: number;
  angle: number;
  curve: number;
  freq: number;
  drift: number;
  morph: number;
  phase: number;
}

/**
 * len/width/offsets are fractions of the viewport, so the composition holds at any size, and no
 * two strokes share a rhythm. They are opaque ink rather than glow: some darker than the ground
 * and some lighter, which gives depth without anything getting bright.
 */
const STROKES: Stroke[] = [
  { rgb: '38, 74, 116',  alpha: .96, ox: -0.28, oy: .30, len: 1.25, width: .105, angle: 0.070, curve: 0.07, freq: 0.80, drift: 0.000031, morph: 0.000019, phase: 0 },
  { rgb: '20, 48, 82',   alpha: .98, ox: -0.02, oy: .74, len: 1.52, width: .130, angle: -0.051, curve: 0.09, freq: 0.59, drift: -0.000023, morph: 0.000027, phase: 2.2 },
  { rgb: '62, 104, 148', alpha: .90, ox: 0.16,  oy: .12, len: 0.99, width: .058, angle: 0.122, curve: 0.05, freq: 1.12, drift: 0.000041, morph: 0.000015, phase: 4.1 },
  { rgb: '12, 34, 60',   alpha: .98, ox: 0.30,  oy: .52, len: 1.68, width: .155, angle: -0.090, curve: 0.10, freq: 0.43, drift: 0.000017, morph: 0.000023, phase: 5.5 },
  { rgb: '50, 92, 134',  alpha: .92, ox: 0.40,  oy: .88, len: 1.12, width: .072, angle: 0.096, curve: 0.07, freq: 0.94, drift: -0.000035, morph: 0.000031, phase: 1.3 },
  { rgb: '26, 56, 92',   alpha: .95, ox: -0.14, oy: .58, len: 1.41, width: .092, angle: -0.109, curve: 0.08, freq: 0.66, drift: 0.000027, morph: 0.000021, phase: 3.7 },
  { rgb: '58, 100, 142', alpha: .88, ox: 0.52,  oy: .40, len: 1.06, width: .048, angle: 0.147, curve: 0.10, freq: 1.01, drift: -0.000019, morph: 0.000033, phase: 0.8 },
  { rgb: '16, 40, 68',   alpha: .97, ox: 0.12,  oy: .96, len: 1.76, width: .118, angle: -0.038, curve: 0.06, freq: 0.50, drift: 0.000023, morph: 0.000017, phase: 5.1 },
  { rgb: '44, 84, 126',  alpha: .90, ox: 0.68,  oy: .66, len: 0.93, width: .062, angle: 0.186, curve: 0.11, freq: 0.88, drift: 0.000037, morph: 0.000029, phase: 2.6 },
  { rgb: '70, 116, 160', alpha: .82, ox: -0.06, oy: .14, len: 0.83, width: .034, angle: 0.058, curve: 0.07, freq: 1.29, drift: -0.000043, morph: 0.000039, phase: 4.4 },
  { rgb: '22, 50, 84',   alpha: .96, ox: 0.46,  oy: .06, len: 1.18, width: .086, angle: 0.166, curve: 0.09, freq: 0.73, drift: 0.000015, morph: 0.000025, phase: 1.9 },
  { rgb: '54, 96, 138',  alpha: .86, ox: 0.22,  oy: .34, len: 0.74, width: .040, angle: -0.198, curve: 0.10, freq: 1.12, drift: -0.000029, morph: 0.000035, phase: 6.0 },
];

/**
 * The taper depends only on how far along the stroke a sample is, never on time or size, so the
 * whole profile is computed once instead of a pow and two sins per sample per stroke per frame.
 */
const TAPER: number[] = Array.from({ length: STEPS + 1 }, (_, i) => {
  const s = Math.sin((Math.PI * i) / STEPS);
  return (Math.pow(s, 0.7) * (0.72 + 0.28 * s)) / 2;
});

/** One buffer reused by every stroke of every frame: x/y of the two polygon edges. */
const SPINE = new Float64Array((STEPS + 1) * 4);

export class Backdrop {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly grain: CanvasPattern;
  private readonly colours: Array<{ edge: string; full: string; late: string }>;
  private frames = 0;
  private lastT = 0;
  private dirty = true;
  private sky: CanvasGradient | null = null;
  private width = 0;
  private height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.grain = this.makeGrain();

    // Colour stops never change per stroke; only the gradient's geometry does.
    this.colours = STROKES.map((s) => ({
      edge: `rgba(${s.rgb}, 0)`,
      full: `rgba(${s.rgb}, ${s.alpha})`,
      late: `rgba(${s.rgb}, ${(s.alpha * 0.88).toFixed(3)})`,
    }));

    // Resizing only marks the canvas dirty: a drag fires continuously, and reallocating the
    // backing store per event is what makes a resize stutter.
    window.addEventListener('resize', () => {
      this.dirty = true;
      this.frame(this.lastT);
    });

    this.resize();
    this.frame(0);      // rAF never runs while the tab is backgrounded; do not start blank
    requestAnimationFrame(this.tick);
  }

  private readonly tick = (t: number): void => {
    if (++this.frames % EVERY === 0) this.frame(t);
    requestAnimationFrame(this.tick);
  };

  /**
   * Deliberately ignores devicePixelRatio: every stroke is drawn through a blur, so a 2x backing
   * store would double the fill cost for a difference nothing can show.
   */
  private resize(): void {
    this.width = this.canvas.width = this.canvas.clientWidth;
    this.height = this.canvas.height = this.canvas.clientHeight;

    this.sky = this.ctx.createLinearGradient(0, 0, this.width * 0.35, this.height);
    this.sky.addColorStop(0, SKY[0]);
    this.sky.addColorStop(1, SKY[1]);
    this.dirty = false;
  }

  private frame(t: number): void {
    if (this.dirty) this.resize();
    if (!this.width || !this.height) return;

    const ctx = this.ctx;
    this.lastT = t;

    ctx.fillStyle = this.sky!;
    ctx.fillRect(0, 0, this.width, this.height);

    // Ink diffusing into paper — enough to keep the edges soft, little enough that each stroke
    // still reads as a stroke. Painted rather than blended: 'screen' adds light, so overlaps
    // climbed in brightness however low the alpha went.
    ctx.filter = 'blur(11px)';
    STROKES.forEach((stroke, i) => this.brush(t, stroke, this.colours[i]!));
    ctx.filter = 'none';

    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = GRAIN;
    ctx.fillStyle = this.grain;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private brush(t: number, st: Stroke, colour: { edge: string; full: string; late: string }): void {
    const ctx = this.ctx;
    const span = Math.max(this.width, this.height);
    const length = span * st.len;
    const maxW = span * st.width;
    const wobble = t * st.morph;
    const angle = st.angle + Math.sin(wobble) * 0.035;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x0 = this.width * st.ox + span * 0.04 * Math.sin(t * st.drift + st.phase);
    const y0 = this.height * st.oy + span * 0.03 * Math.cos(t * st.drift * 1.4 + st.phase);
    const curve = length * st.curve;
    const bend = Math.PI * st.freq;
    const n = STEPS + 1;

    for (let i = 0; i < n; i++) {
      const along = length * (i / STEPS);
      // the spine bends, and the bend itself slowly changes shape
      const off = curve * Math.sin((i / STEPS) * bend + wobble + st.phase);
      const px = x0 + cos * along - sin * off;
      const py = y0 + sin * along + cos * off;
      const half = maxW * TAPER[i]!;
      const k = i * 4;

      SPINE[k] = px - sin * half;
      SPINE[k + 1] = py + cos * half;
      SPINE[k + 2] = px + sin * half;
      SPINE[k + 3] = py - cos * half;
    }

    ctx.beginPath();
    ctx.moveTo(SPINE[0]!, SPINE[1]!);
    for (let i = 1; i < n; i++) ctx.lineTo(SPINE[i * 4]!, SPINE[i * 4 + 1]!);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(SPINE[i * 4 + 2]!, SPINE[i * 4 + 3]!);
    ctx.closePath();

    const grad = ctx.createLinearGradient(x0, y0, x0 + cos * length, y0 + sin * length);
    grad.addColorStop(0, colour.edge);
    grad.addColorStop(0.28, colour.full);
    grad.addColorStop(0.82, colour.late);
    grad.addColorStop(1, colour.edge);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  /** One noise tile, generated once and repeated: per-frame noise would sparkle. */
  private makeGrain(): CanvasPattern {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 64;

    const tctx = tile.getContext('2d')!;
    const img = tctx.createImageData(64, 64);
    for (let i = 0; i < img.data.length; i += 4) {
      // narrow spread: wide noise looks like dirt, not paper
      const v = 150 + Math.random() * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);

    return tctx.createPattern(tile, 'repeat')!;
  }
}
