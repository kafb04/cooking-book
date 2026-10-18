// Ordem das páginas, folhas 3D e navegação (setas, teclado, swipe, sumário).
import * as P from './pages.js';

const TOC_SIZE = 12;
const SPREAD = matchMedia('(min-width: 768px)');
const el = document.getElementById('book');
const arrows = document.querySelectorAll('[data-turn]');

let pages = [];        // elementos .page na ordem de leitura
let anchors = {};      // 'start' | 'toc' | id da receita -> índice da página
let leaves = [];
let turned = 0;        // nº de folhas já viradas pra esquerda
let spread = SPREAD.matches;
let settle;

const flipMs = () => parseFloat(getComputedStyle(el).getPropertyValue('--flip-ms')) || 850;
const turnedFor = page => (spread ? Math.ceil(page / 2) : page);
const maxTurned = () => (spread ? leaves.length : leaves.length - 1);

export function render(recipes, focus) {
  const tocCount = Math.max(1, Math.ceil(recipes.length / TOC_SIZE));
  let start = 2 + tocCount;
  if (start % 2 === 0) start++;  // receita sempre começa na página da esquerda
  anchors = { start: 0, toc: 2 };
  recipes.forEach((r, i) => { anchors[r.id] = start + 2 * i; });

  pages = [P.cover(), P.endpaper('Este livro pertence a')];
  for (let k = 0; k < tocCount; k++) {
    const chunk = recipes.slice(k * TOC_SIZE, (k + 1) * TOC_SIZE);
    pages.push(P.toc(chunk.map(r => ({ ...r, page: anchors[r.id] }))));
  }
  if (pages.length % 2 === 0) pages.push(P.notes());
  recipes.forEach(r => pages.push(...P.recipe(r)));
  pages.push(P.notes(), P.endpaper(''), P.back());
  pages.forEach((p, i) => { const n = p.querySelector('.page__num'); if (n) n.textContent = i; });

  const page = focus in anchors ? anchors[focus] : null;
  layout(page);
}

function leaf(front, back) {
  const l = document.createElement('div');
  l.className = 'leaf';
  for (const [side, page] of [['front', front], ['back', back]]) {
    const f = document.createElement('div');
    f.className = `leaf__face leaf__face--${side}`;
    f.append(page);
    l.append(f);
  }
  return l;
}

function layout(page) {
  const current = page ?? (spread ? Math.max(0, 2 * turned - 1) : turned);
  spread = SPREAD.matches;
  const pairs = [];
  for (let i = 0; i < pages.length; i += spread ? 2 : 1) {
    pairs.push(spread ? [pages[i], pages[i + 1]] : [pages[i], P.plain()]);
  }
  leaves = pairs.map(([f, b]) => leaf(f, b));
  el.replaceChildren(...leaves);
  turned = 0;
  show(turnedFor(current), false);
}

function show(target, animate = true) {
  const n = leaves.length;
  target = Math.max(0, Math.min(maxTurned(), target));
  const lo = Math.min(turned, target), hi = Math.max(turned, target);
  const steps = hi - lo;
  turned = target;

  // Mostra só as folhas envolvidas na virada (o resto fica display:none e nem carrega imagem)
  leaves.forEach((l, i) => l.classList.toggle('is-far', i < lo - 2 || i > hi + 1));
  el.offsetWidth; // força reflow pra folhas recém-mostradas animarem

  const gap = Math.min(90, 500 / Math.max(steps, 1));
  el.classList.toggle('is-instant', !animate);
  leaves.forEach((l, i) => {
    const isTurned = i < target;
    if (animate && l.classList.contains('is-turned') !== isTurned) {
      const k = isTurned ? i - lo : hi - 1 - i;
      l.style.transitionDelay = `${k * gap}ms`;
      l.style.zIndex = 2 * n + (isTurned ? i : n - i);
      l.classList.add('is-turning');
    }
    l.classList.toggle('is-turned', isTurned);
  });
  el.classList.toggle('is-closed-front', spread && turned === 0);
  el.classList.toggle('is-closed-back', spread && turned === n);
  el.style.setProperty('--done', turned / Math.max(1, maxTurned())); // espessura das pilhas de folhas
  if (!animate) {
    el.offsetWidth; // aplica a posição final sem transição antes de religá-la
    el.classList.remove('is-instant');
  }

  clearTimeout(settle);
  settle = setTimeout(() => {
    leaves.forEach((l, i) => {
      l.style.transitionDelay = '';
      l.style.zIndex = i < turned ? i + 1 : n - i;
      l.classList.remove('is-turning');
      l.classList.toggle('is-far', i < turned - 2 || i > turned + 1);
    });
  }, animate ? flipMs() + steps * gap : 0);

  // Só as faces visíveis recebem foco/clique
  leaves.forEach((l, i) => {
    l.children[0].inert = i !== turned;
    l.children[1].inert = !spread || i !== turned - 1;
  });
  arrows[0].disabled = turned === 0;
  arrows[1].disabled = turned === maxTurned();
}

export const go = key => key in anchors && show(turnedFor(anchors[key]));
const turn = d => show(turned + d);

arrows.forEach(b => b.addEventListener('click', () => turn(+b.dataset.turn)));
SPREAD.addEventListener('change', () => layout());

el.addEventListener('click', e => {
  const t = e.target.closest('[data-goto]');
  if (!t || e.target.closest('[data-edit]')) return;
  e.preventDefault();
  go(t.dataset.goto);
});

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || e.target.matches('input, textarea')) return;
  if (e.key === 'ArrowRight') turn(1);
  if (e.key === 'ArrowLeft') turn(-1);
});

let touch = null;
el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touch = [e.clientX, e.clientY]; });
el.addEventListener('pointerup', e => {
  if (!touch) return;
  const dx = e.clientX - touch[0], dy = e.clientY - touch[1];
  touch = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) turn(dx < 0 ? 1 : -1);
});
