import { drawStroke, pickStrokes, strokeColours, type Stroke, type StrokeColours } from './strokes';

/**
 * One animated source canvas, blitted into every card back, so all backs show the identical
 * frame. Drawing per card instead would drift them out of step and cost 100x the geometry.
 */

const WIDTH = 144;
const HEIGHT = 192;
/** supersample: thin drifting lines alias badly at 1:1 and read as flicker */
const SS = 2;
/** redraw every 2nd frame — a time threshold beats against the refresh rate */
const EVERY = 2;
const ZOOM = 1.5;

/** keep in step with --card-back in app.css */
const BASE = '#414f60';
const INK = ['rgba(158, 200, 172, .55)', 'rgba(220, 176, 138, .48)'] as const;
/** Card backs draw the same brush strokes as the backdrop, only smaller and fewer. */
const WAVE_COUNT = 3;
const WAVE_PALETTE = ['158, 200, 172', '236, 206, 158', '120, 158, 190'] as const;

interface Target {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** the card element, so a card being animated can be skipped */
  card: HTMLElement;
}

export class CardArt {
  private readonly source = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  /** this session's cast, drawn from the shared pool */
  private readonly waves: Stroke[] = pickStrokes({
    count: WAVE_COUNT,
    palette: WAVE_PALETTE,
    alpha: [0.26, 0.36],
    weight: 2,          // a card is small, so a stroke needs proportionally more body
    speed: 8,          // livelier than the backdrop: less area, so motion reads less
    spread: [0.2, 0.8],   // one band each, so three strokes cover the back instead of bunching
  });
  private readonly waveColours: StrokeColours[] = this.waves.map(strokeColours);
  private targets: Target[] = [];
  private frames = 0;
  private running = false;
  private readonly latticeOffset = Math.random() * 1000;

  constructor() {
    this.source.width = WIDTH * SS;
    this.source.height = HEIGHT * SS;
    this.ctx = this.source.getContext('2d')!;
    this.ctx.scale(SS, SS);      // so every drawing coordinate below stays in logical units
  }

  /** Builds the canvas for one card back and starts animating it. */
  attach(host: HTMLElement, card: HTMLElement): () => void {
    const canvas = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    const box = host.getBoundingClientRect();

    canvas.width = Math.round((box.width || WIDTH / 2) * ratio);
    canvas.height = Math.round((box.height || HEIGHT / 2) * ratio);
    host.appendChild(canvas);

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const target: Target = { canvas, ctx, card };
    this.targets.push(target);

    // Paint once up front: rAF never runs while the tab is backgrounded, and a card that only
    // gets its art from the loop would sit there blank.
    this.frame(0);
    ctx.drawImage(this.source, 0, 0, canvas.width, canvas.height);

    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.tick);
    }

    return () => {
      const at = this.targets.indexOf(target);
      if (at !== -1) this.targets.splice(at, 1);
    };
  }

  private readonly tick = (t: number): void => {
    if (this.targets.length === 0) {
      this.running = false;
      return;
    }

    if (++this.frames % EVERY === 0) {
      this.frame(t);
      for (const target of this.targets) {
        // Skip cards that are turning or leaving. Repainting a canvas inside an element the
        // compositor is animating forces it to re-rasterise every frame, which made the flip
        // stutter — and the drifting pattern is invisible mid-turn anyway.
        const cls = target.card.className;
        if (cls.includes('show') || cls.includes('leaving')) continue;

        target.ctx.drawImage(this.source, 0, 0, target.canvas.width, target.canvas.height);
      }
    }

    requestAnimationFrame(this.tick);
  };

  private frame(t: number): void {
    const ctx = this.ctx;

    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    this.waves.forEach((wave, i) => drawStroke(this.ctx, wave, this.waveColours[i]!, WIDTH, HEIGHT, t));

    // Lattice last, so the net reads across the waves rather than being covered by them. It is
    // static: only the waves move under it, which reads as depth rather than as two things
    // sliding past each other. The offset is randomised per session, not animated.
    this.lattice(11 * ZOOM, this.latticeOffset);
  }

  /** Diagonal lattice in both directions, drifting by `shift`, clipped to the card. */
  private lattice(step: number, shift: number): void {
    const ctx = this.ctx;
    const span = WIDTH + HEIGHT;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, HEIGHT);
    ctx.clip();
    ctx.lineWidth = 1.5;

    for (let dir = 0; dir < 2; dir++) {
      ctx.strokeStyle = INK[dir]!;
      ctx.beginPath();
      for (let d = -span; d < span; d += step) {
        const off = d + ((dir ? -shift : shift) % step);
        ctx.moveTo(off, 0);
        ctx.lineTo(off + (dir ? -HEIGHT : HEIGHT), HEIGHT);
      }
      ctx.stroke();
    }

    ctx.restore();
  }
}
