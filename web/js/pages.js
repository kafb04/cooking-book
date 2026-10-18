// Monta cada página do livro a partir dos <template> do index.html. Dados do usuário só via textContent.
const tpl = id => document.getElementById(id).content.cloneNode(true);
const one = id => tpl(id).firstElementChild;

export const cover = () => one('tpl-cover');
export const back = () => one('tpl-back');
export const plain = () => one('tpl-plain');
export const notes = () => one('tpl-notes');

export function endpaper(text) {
  const p = one('tpl-endpaper');
  p.querySelector('.bookplate__text').textContent = text;
  return p;
}

export function toc(entries) {
  const p = one('tpl-toc');
  const list = p.querySelector('.toc');
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'toc__empty';
    li.textContent = 'Nenhuma receita ainda. Use “Nova receita” ou importe seus .docx.';
    list.append(li);
  }
  for (const e of entries) {
    const li = one('tpl-toc-item');
    const a = li.querySelector('a');
    a.dataset.goto = e.id;
    a.href = `#/receita/${e.id}`;
    a.querySelector('.toc__name').textContent = e.title || 'Sem nome';
    a.querySelector('.toc__tag').textContent = e.category || '';
    a.querySelector('.toc__num').textContent = e.page;
    list.append(li);
  }
  return p;
}

const lines = text => (text || '').split('\n').map(l => l.trim()).filter(Boolean);

function fillText(el, field, text) {
  if (field === 'ingredients') {
    el.replaceChildren(...lines(text).map(l => {
      const li = document.createElement('li');
      li.textContent = l.replace(/^[-•*·▪●]\s*/, '');
      li.classList.toggle('is-sub', l.endsWith(':') || /^ingredientes?\b/i.test(l));
      return li;
    }));
  } else if (field === 'steps' || field === 'notes') {
    el.replaceChildren(...lines(text).map(l => Object.assign(document.createElement('p'), { textContent: l })));
  } else {
    el.textContent = text || '';
  }
}

/** Uma receita = duas páginas (foto + ingredientes | como fazer + observações). */
export function recipe(r) {
  const [a, b] = tpl('tpl-recipe').children;
  for (const page of [a, b]) {
    page.dataset.recipe = r.id;
    page.querySelectorAll('[data-field]').forEach(el => fillText(el, el.dataset.field, r[el.dataset.field]));
    page.querySelectorAll('[data-media]').forEach(img => {
      const name = r[img.dataset.media];
      if (name) img.src = `/media/${name}`; else img.removeAttribute('src');
    });
    page.querySelectorAll('[data-edit]').forEach(el => { el.dataset.edit = r.id; });
  }
  a.querySelector('.photo').classList.toggle('is-empty', !r.photo);
  b.querySelector('.note').classList.toggle('is-empty', !r.notes && !r.ink_notes);
  return [a, b];
}
