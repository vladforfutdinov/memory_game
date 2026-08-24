import { Backdrop } from './backdrop';
import { Board } from './board';
import { CardArt } from './card-art';
import { Game } from './game';

const GRIDS = [2, 4, 6, 8, 10];
const DEFAULT_GRID = 4;

const view = document.querySelector<HTMLElement>('#view')!;
const control = document.querySelector<HTMLElement>('#control')!;

new Backdrop(document.querySelector<HTMLCanvasElement>('.backdrop')!);
const art = new CardArt();

/** Chosen on the splash screen, read when the game screen opens. */
let grid = DEFAULT_GRID;
let reshuffle = true;
let board: Board | null = null;

function button(label: string, go: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.className = 'btn btn-lg';
  el.textContent = label;
  el.addEventListener('click', () => {
    location.hash = go;
  });
  return el;
}

function splash(): void {
  const label = document.createElement('label');
  label.className = 'form-label';
  label.htmlFor = 'grid';
  label.textContent = 'Select grid';

  const select = document.createElement('select');
  select.className = 'form-select';
  select.id = 'grid';
  for (const n of GRIDS) {
    const option = document.createElement('option');
    option.value = String(n);
    option.textContent = `${n} × ${n}`;
    option.selected = n === grid;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    grid = Number(select.value);
  });

  const gridRow = document.createElement('p');
  gridRow.append(label, select);

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.id = 'reshuffle';
  toggle.checked = reshuffle;
  toggle.addEventListener('change', () => {
    reshuffle = toggle.checked;
  });

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'form-check';
  toggleLabel.htmlFor = 'reshuffle';
  toggleLabel.append(toggle, document.createTextNode('Reshuffle seen cards'));

  const optionRow = document.createElement('p');
  optionRow.append(toggleLabel);

  view.replaceChildren(gridRow, document.createElement('br'), optionRow);
  control.replaceChildren(button('Start', '#/game'));
}

function game(): void {
  const board_ = document.createElement('div');
  const moves = document.createElement('p');

  // Sits over the (by then empty) board rather than under it, so the win reads in the space the
  // cards just left.
  const banner = document.createElement('div');
  banner.className = 'win-banner';

  const engine = new Game(grid, { reshuffle, onChange: () => paint() });
  board = new Board(board_, engine, art);
  board_.appendChild(banner);

  function paint(): void {
    board?.render();
    banner.textContent = engine.won ? `You WON in ${engine.steps} moves` : '';
    moves.textContent = engine.won ? '' : `${engine.steps} moves`;
  }

  paint();
  view.replaceChildren(board_, moves);
  control.replaceChildren(button('Reset', '#/splash'));
}

function route(): void {
  board?.destroy();
  board = null;

  if (location.hash === '#/game') game();
  else if (location.hash === '#/splash') splash();
  else location.hash = '#/splash';
}

window.addEventListener('hashchange', route);
route();
