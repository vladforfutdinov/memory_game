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
const SPEED = 0.0004;
const ZOOM = 1.5;
/** extra scale for the centre medallion only, lattice unaffected */
const MEDAL = 1.5;

/** keep in step with --card-back in app.css */
const BASE = '#414f60';
const INK = ['rgba(158, 200, 172, .55)', 'rgba(220, 176, 138, .48)'] as const;
const MEDALLION = 'rgba(236, 206, 158, .8)';

interface Target {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** the card element, so a card being animated can be skipped */
  card: HTMLElement;
}

export class CardArt {
  private readonly source = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private targets: Target[] = [];
  private frames = 0;
  private running = false;

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
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const turn = t * SPEED;
    const pulse = (Math.sin(t * SPEED * 2) + 1) / 2;

    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Medallion first, lattice over it, so the net runs across the disc.
    const disc = 21 * ZOOM * MEDAL;

    ctx.fillStyle = BASE;
    ctx.beginPath();
    ctx.arc(cx, cy, disc, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 1.5 * MEDAL;
    for (let ring = 0; ring < 3; ring++) {
      ctx.strokeStyle = ring % 2 ? MEDALLION : INK[0];
      this.polygon(cx, cy, (16 - ring * 4 + pulse * 3) * ZOOM * MEDAL, 6, ring % 2 ? -turn : turn);
    }

    ctx.strokeStyle = MEDALLION;
    ctx.beginPath();
    ctx.arc(cx, cy, disc, 0, Math.PI * 2);
    ctx.stroke();

    this.lattice(11 * ZOOM, t * SPEED * 26);
  }

  private polygon(cx: number, cy: number, radius: number, sides: number, turn: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = turn + (i * 2 * Math.PI) / sides;
      const x = cx + radius * Math.cos(a);
      const y = cy + radius * Math.sin(a);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
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
