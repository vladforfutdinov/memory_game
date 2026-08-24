import type { Card, Game } from './game';
import type { CardArt } from './card-art';

/**
 * Renders the card list. An element belongs to a card, not to a square, so a card that relocates
 * keeps its element and CSS animates the move — there is nothing to measure and nothing to
 * rebuild. Only cards that leave the game lose their element.
 */
export class Board {
  private readonly elements = new Map<number, HTMLElement>();
  private readonly detachers = new Map<number, () => void>();

  constructor(
    private readonly root: HTMLElement,
    private readonly game: Game,
    private readonly art: CardArt,
  ) {
    this.root.classList.add('board');
    this.root.style.setProperty('--grid', String(game.grid));

    this.root.addEventListener('click', (event) => {
      const el = (event.target as HTMLElement).closest<HTMLElement>('.card');
      if (!el) return;

      const card = this.game.cards.find((c) => c.id === Number(el.dataset.id));
      if (card) this.game.flip(card);
    });

    this.render();
  }

  render(): void {
    const live = new Set<number>();

    for (const card of this.game.cards) {
      live.add(card.id);
      this.paint(card, this.elements.get(card.id) ?? this.build(card));
    }

    for (const [id, el] of this.elements) {
      if (live.has(id)) continue;
      this.detachers.get(id)?.();
      this.detachers.delete(id);
      this.elements.delete(id);
      el.remove();
    }
  }

  destroy(): void {
    for (const detach of this.detachers.values()) detach();
    this.detachers.clear();
    this.elements.clear();
    this.root.replaceChildren();
  }

  private build(card: Card): HTMLElement {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = String(card.id);

    const front = document.createElement('div');
    front.className = 'front';

    const back = document.createElement('div');
    back.className = 'back';
    back.textContent = String(card.value);

    el.append(front, back);
    this.root.appendChild(el);

    this.elements.set(card.id, el);
    this.detachers.set(card.id, this.art.attach(front, el));

    // `moves` lands a frame later, so a new card appears in place instead of sliding in from 0,0.
    this.place(card, el);
    requestAnimationFrame(() => el.classList.add('moves'));

    return el;
  }

  private paint(card: Card, el: HTMLElement): void {
    this.place(card, el);
    el.classList.toggle('show', this.game.isOpen(card));
    el.classList.toggle('leaving', card.leaving);
  }

  private place(card: Card, el: HTMLElement): void {
    el.style.setProperty('--row', String(card.row));
    el.style.setProperty('--col', String(card.col));
    el.style.setProperty('--spin', `${card.spin}deg`);
    el.style.setProperty('--delay', `${card.delay}ms`);
  }
}
