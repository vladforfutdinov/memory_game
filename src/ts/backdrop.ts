import { drawStroke, pickStrokes, strokeColours, type Stroke, type StrokeColours } from './strokes';

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
const SKY = ['#0a1930', '#16365a'] as const;

const STROKE_COUNT = 12;
/**
 * Opaque ink rather than glow: some strokes are darker than the ground and some lighter, which
 * gives depth without anything getting bright.
 */
const PALETTE = [
  '38, 74, 116',
  '20, 48, 82',
  '62, 104, 148',
  '12, 34, 60',
  '50, 92, 134',
  '26, 56, 92',
  '58, 100, 142',
  '16, 40, 68',
] as const;

export class Backdrop {
  /** this session's cast, drawn from the shared pool */
  private readonly strokes: Stroke[] = pickStrokes({
    count: STROKE_COUNT,
    palette: PALETTE,
    alpha: [0.82, 0.98],
  });

  private readonly ctx: CanvasRenderingContext2D;
  private readonly grain: CanvasPattern;
  private readonly colours: StrokeColours[];
  private frames = 0;
  private lastT = 0;
  private dirty = true;
  private sky: CanvasGradient | null = null;
  private width = 0;
  private height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.grain = this.makeGrain();

    this.colours = this.strokes.map(strokeColours);

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
    this.strokes.forEach((stroke, i) =>
      drawStroke(ctx, stroke, this.colours[i]!, this.width, this.height, t),
    );
    ctx.filter = 'none';

    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = GRAIN;
    ctx.fillStyle = this.grain;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
