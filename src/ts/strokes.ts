/**
 * Shared brush strokes, used by both the page backdrop and the card backs.
 *
 * A stroke is a polygon: walk the spine, offset perpendicular by a width profile that tapers to
 * nothing at both ends. That taper is what makes it read as a loaded brush lifting off the paper
 * rather than as a band with two parallel edges.
 *
 * Everything here is in fractions of the surface it is drawn on, so the same shape works on a
 * 1400px backdrop and on a 144px card back.
 */

export interface StrokeShape {
  /**
   * Where the MIDDLE of the stroke sits, as a fraction of the surface. 0.5/0.5 centres the
   * stroke in the frame; anchoring by the start instead made a long stroke's placement depend
   * on its own length and angle.
   */
  ox: number;
  oy: number;
  /** length as a fraction of the surface's longer side */
  len: number;
  /** width as a fraction of the surface's shorter side */
  width: number;
  /** tilt in radians; these all sit near horizontal */
  angle: number;
  /** how far the spine bends, as a fraction of its length */
  curve: number;
  /** periods of bend along the spine — above ~1.5 it starts to read as a worm */
  freq: number;
  /** how fast the whole stroke drifts */
  drift: number;
  /** how fast its bend reshapes */
  morph: number;
}

export interface Stroke extends StrokeShape {
  rgb: string;
  alpha: number;
  phase: number;
}

export interface StrokeColours {
  edge: string;
  full: string;
  late: string;
}

/**
 * The pool both decors draw from. Deliberately more shapes than either uses at once, so a
 * session picks a different cast each time rather than jittering one fixed composition.
 */
export const SHAPES: StrokeShape[] = [
  { ox: 0.50, oy: 0.30, len: 1.25, width: 0.105, angle: 0.070, curve: 0.07, freq: 0.80, drift: 0.000031, morph: 0.000019 },
  { ox: 0.44, oy: 0.74, len: 1.52, width: 0.130, angle: -0.051, curve: 0.09, freq: 0.59, drift: -0.000023, morph: 0.000027 },
  { ox: 0.56, oy: 0.16, len: 0.99, width: 0.058, angle: 0.122, curve: 0.05, freq: 1.12, drift: 0.000041, morph: 0.000015 },
  { ox: 0.50, oy: 0.52, len: 1.68, width: 0.155, angle: -0.090, curve: 0.10, freq: 0.43, drift: 0.000017, morph: 0.000023 },
  { ox: 0.46, oy: 0.86, len: 1.12, width: 0.072, angle: 0.096, curve: 0.07, freq: 0.94, drift: -0.000035, morph: 0.000031 },
  { ox: 0.54, oy: 0.58, len: 1.41, width: 0.092, angle: -0.109, curve: 0.08, freq: 0.66, drift: 0.000027, morph: 0.000021 },
  { ox: 0.58, oy: 0.40, len: 1.06, width: 0.048, angle: 0.147, curve: 0.10, freq: 1.01, drift: -0.000019, morph: 0.000033 },
  { ox: 0.42, oy: 0.92, len: 1.76, width: 0.118, angle: -0.038, curve: 0.06, freq: 0.50, drift: 0.000023, morph: 0.000017 },
  { ox: 0.60, oy: 0.66, len: 0.93, width: 0.062, angle: 0.186, curve: 0.11, freq: 0.88, drift: 0.000037, morph: 0.000029 },
  { ox: 0.40, oy: 0.14, len: 0.83, width: 0.034, angle: 0.058, curve: 0.07, freq: 1.29, drift: -0.000043, morph: 0.000039 },
  { ox: 0.52, oy: 0.08, len: 1.18, width: 0.086, angle: 0.166, curve: 0.09, freq: 0.73, drift: 0.000015, morph: 0.000025 },
  { ox: 0.48, oy: 0.34, len: 0.74, width: 0.040, angle: -0.198, curve: 0.10, freq: 1.12, drift: -0.000029, morph: 0.000035 },
  { ox: 0.38, oy: 0.44, len: 1.34, width: 0.140, angle: 0.042, curve: 0.12, freq: 0.61, drift: 0.000033, morph: 0.000018 },
  { ox: 0.62, oy: 0.22, len: 1.46, width: 0.098, angle: -0.132, curve: 0.08, freq: 0.85, drift: -0.000021, morph: 0.000030 },
  { ox: 0.56, oy: 0.78, len: 1.22, width: 0.076, angle: 0.104, curve: 0.13, freq: 0.70, drift: 0.000045, morph: 0.000022 },
  { ox: 0.44, oy: 0.62, len: 1.60, width: 0.112, angle: -0.076, curve: 0.09, freq: 0.52, drift: 0.000019, morph: 0.000026 },
  { ox: 0.64, oy: 0.28, len: 0.88, width: 0.054, angle: 0.158, curve: 0.11, freq: 1.18, drift: -0.000039, morph: 0.000037 },
  { ox: 0.36, oy: 0.88, len: 1.38, width: 0.126, angle: 0.030, curve: 0.07, freq: 0.64, drift: 0.000025, morph: 0.000020 },
  { ox: 0.50, oy: 0.56, len: 1.02, width: 0.066, angle: -0.170, curve: 0.12, freq: 0.97, drift: 0.000035, morph: 0.000028 },
  { ox: 0.46, oy: 0.70, len: 1.54, width: 0.088, angle: 0.118, curve: 0.10, freq: 0.78, drift: -0.000027, morph: 0.000024 },
];

/** samples along a spine — enough for a viewport-wide stroke, cheap enough for a card */
const STEPS = 40;

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

export interface PickOptions {
  count: number;
  palette: readonly string[];
  /** alpha range; each stroke gets a value from it */
  alpha: [number, number];
  /** multiplies every width, for surfaces that want daintier or fatter strokes */
  weight?: number;
  /** multiplies drift and morph, for surfaces that want livelier or calmer motion */
  speed?: number;
  /**
   * Vertical range to spread the cast evenly across, as fractions of the surface. Each stroke
   * gets its own band, so a small cast cannot bunch up — which is what happens when the pool's
   * own positions are used and the picks happen to sit close together.
   */
  spread?: [number, number];
  random?: () => number;
}

/**
 * Deals a cast of strokes for this session: a random subset of the pool, each with a random
 * phase and small jitter. Without this every reload draws the identical composition, since the
 * shapes are otherwise fully determined.
 */
export function pickStrokes({
  count,
  palette,
  alpha,
  weight = 1,
  speed = 1,
  spread,
  random = Math.random,
}: PickOptions): Stroke[] {
  const pool = [...SHAPES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  const taken = pool.slice(0, Math.min(count, pool.length));

  return taken.map((shape, i) => {
    // Jitter stays inside the band, so the even spacing survives it.
    const oy = spread
      ? spread[0] + ((i + 0.5 + (random() - 0.5) * 0.5) / taken.length) * (spread[1] - spread[0])
      : shape.oy + (random() - 0.5) * 0.12;

    return {
      ...shape,
      width: shape.width * weight,
      drift: shape.drift * speed,
      morph: shape.morph * speed,
      angle: shape.angle + (random() - 0.5) * 0.08,
      curve: shape.curve * (0.8 + random() * 0.4),
      oy,
      rgb: palette[i % palette.length]!,
      alpha: alpha[0] + random() * (alpha[1] - alpha[0]),
      phase: random() * Math.PI * 2,
    };
  });
}

/** Colour stops never change per stroke; only the gradient's geometry does. Build them once. */
export function strokeColours(stroke: Stroke): StrokeColours {
  return {
    edge: `rgba(${stroke.rgb}, 0)`,
    full: `rgba(${stroke.rgb}, ${stroke.alpha})`,
    late: `rgba(${stroke.rgb}, ${(stroke.alpha * 0.88).toFixed(3)})`,
  };
}

/** Draws one stroke onto `ctx`, sized to a `width` x `height` surface, at time `t`. */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  st: Stroke,
  colour: StrokeColours,
  width: number,
  height: number,
  t: number,
): void {
  const span = Math.max(width, height);
  const length = span * st.len;
  const maxW = Math.min(width, height) * st.width;
  const wobble = t * st.morph;
  const angle = st.angle + Math.sin(wobble) * 0.035;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Back the spine up by half its length along its own direction, so `ox`/`oy` land on the
  // stroke's midpoint rather than on the end it happens to start from.
  const x0 = width * st.ox - (cos * length) / 2 + span * 0.04 * Math.sin(t * st.drift + st.phase);
  const y0 = height * st.oy - (sin * length) / 2 + span * 0.03 * Math.cos(t * st.drift * 1.4 + st.phase);
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
