// Bloco de escrita à mão: Pointer Events com pressão da caneta, borracha e exportação em PNG recortado.
const INK = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();

export function inkPad(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.lineCap = ctx.lineJoin = 'round';
  let tool = 'pen', penSeen = false, last = null;
  const pad = { dirty: false };

  const point = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
  };

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen') penSeen = true;
    else if (penSeen && e.pointerType === 'touch') return; // palma da mão apoiada na tela
    canvas.setPointerCapture(e.pointerId);
    last = point(e);
    pad.dirty = true;
  });

  canvas.addEventListener('pointermove', e => {
    if (!last || !canvas.hasPointerCapture(e.pointerId)) return;
    const erasing = tool === 'eraser' || (e.buttons & 32); // botão de borracha da caneta
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    ctx.strokeStyle = INK;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) {
      const p = point(ev);
      ctx.lineWidth = erasing ? 30 : ev.pointerType === 'pen' ? 1.5 + ev.pressure * 7 : 5;
      ctx.beginPath();
      ctx.moveTo(...last);
      ctx.lineTo(...p);
      ctx.stroke();
      last = p;
    }
  });

  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { last = null; });

  pad.setTool = t => { tool = t; };

  pad.clear = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pad.dirty = true;
  };

  pad.load = async url => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    penSeen = false;
    if (url) {
      const img = new Image();
      img.src = url;
      await img.decode().then(() => ctx.drawImage(img, 0, 0), () => {});
    }
    pad.dirty = false;
  };

  /** PNG cortado na última linha com tinta; null se o bloco estiver vazio. */
  pad.blob = () => {
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let lastRow = -1;
    for (let i = data.length - 1; i > 0; i -= 4) {
      if (data[i]) { lastRow = Math.floor(i / 4 / width); break; }
    }
    if (lastRow < 0) return Promise.resolve(null);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.min(height, lastRow + 24);
    out.getContext('2d').drawImage(canvas, 0, 0);
    return new Promise(res => out.toBlob(res, 'image/png'));
  };

  return pad;
}
