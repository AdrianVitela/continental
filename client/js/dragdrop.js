// dragdrop.js - CON LOGS DE DIAGNÓSTICO
'use strict';

const DragDrop = (() => {
  let dragId = null;
  let dragSource = null;
  let ghost = null;
  let draggingFromSlot = false;
  let originalSlotIndex = null;
  let originalCardEl = null;

  function getPoint(e) {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function mkGhost(el, pt) {
    const rect = el.getBoundingClientRect();
    const g = el.cloneNode(true);
    g.id = 'drag-ghost';
    g.removeAttribute('data-id');
    g.style.cssText += ';position:fixed;z-index:9999;pointer-events:none;opacity:0.85;';
    g.style.width = rect.width + 'px';
    g.style.height = rect.height + 'px';
    g.style.left = (pt.x - rect.width / 2) + 'px';
    g.style.top = (pt.y - rect.height / 2) + 'px';
    document.body.appendChild(g);
    return { g, rect };
  }

  function moveGhost(pt) {
    if (!ghost) return;
    ghost.g.style.left = (pt.x - ghost.rect.width / 2) + 'px';
    ghost.g.style.top = (pt.y - ghost.rect.height / 2) + 'px';
  }

  function showInsertGhost(mx, my) {
    const hz = document.getElementById('discard-zone');
    if (!hz) return;
    hz.querySelectorAll('.insert-ghost').forEach(g => g.remove());
    const hr = hz.getBoundingClientRect();
    if (mx < hr.left || mx > hr.right || my < hr.top || my > hr.bottom) {
      hz.classList.remove('drag-over');
      return;
    }
    hz.classList.add('drag-over');
    const cards = [...hz.querySelectorAll('.card:not(.dragging)')];
    let before = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (mx < r.left + r.width / 2) { before = c; break; }
    }
    const ig = document.createElement('div');
    ig.className = 'insert-ghost';
    if (before) hz.insertBefore(ig, before);
    else hz.appendChild(ig);
  }

  function highlightDropZones(mx, my, isPayable) {
    document.querySelectorAll('.building-slot').forEach(slot => {
      const r = slot.getBoundingClientRect();
      slot.classList.toggle('drop-target', mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom);
    });
    document.querySelectorAll('.bajada-pile').forEach(p => {
      const r = p.getBoundingClientRect();
      p.classList.toggle('drop-target', mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom);
    });
    const fw = document.getElementById('fondo-wrap');
    if (fw && isPayable) {
      const r = fw.getBoundingClientRect();
      const over = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
      fw.style.outline = over ? '2px solid var(--red-hi)' : '';
      fw.style.borderRadius = over ? 'var(--r)' : '';
    }
    if (draggingFromSlot) {
      const hz = document.getElementById('discard-zone');
      if (hz) {
        const hr = hz.getBoundingClientRect();
        const overDiscard = mx >= hr.left && mx <= hr.right && my >= hr.top && my <= hr.bottom;
        hz.classList.toggle('drop-target-sobrantes', overDiscard);
        if (overDiscard) hz.setAttribute('data-hint', 'Suelta para devolver a la mano');
        else hz.removeAttribute('data-hint');
      }
    }
  }

  function cleanDropZones() {
    const hz = document.getElementById('discard-zone');
    if (hz) {
      hz.querySelectorAll('.insert-ghost').forEach(g => g.remove());
      hz.classList.remove('drag-over', 'drop-target-sobrantes');
      hz.removeAttribute('data-hint');
    }
    document.querySelectorAll('.bajada-pile').forEach(p => p.classList.remove('drop-target'));
    document.querySelectorAll('.building-slot').forEach(s => s.classList.remove('drop-target'));
    const fw = document.getElementById('fondo-wrap');
    if (fw) { fw.style.outline = ''; fw.style.borderRadius = ''; }
  }

  function startHandDrag(e, el, cid, callbacks) {
    if (e.type === 'touchstart') e.preventDefault();

    dragId = cid;
    dragSource = 'hand';
    originalCardEl = el;

    draggingFromSlot = el?.hasAttribute('data-slot');
    originalSlotIndex = draggingFromSlot ? parseInt(el.dataset.slot) : null;

    console.log('[DD] startHandDrag cid:', cid, 'draggingFromSlot:', draggingFromSlot, 'originalSlotIndex:', originalSlotIndex);

    ghost = mkGhost(el, getPoint(e));
    el.classList.add('dragging');
    if (draggingFromSlot) el.style.visibility = 'hidden';

    const onMove = ev => {
      ev.preventDefault();
      const pt = getPoint(ev);
      moveGhost(pt);
      showInsertGhost(pt.x, pt.y);
      highlightDropZones(pt.x, pt.y, callbacks.isPayable?.());
    };

    const onUp = ev => {
      const pt = getPoint(ev);
      if (ghost) { ghost.g.remove(); ghost = null; }
      cleanDropZones();
      el.classList.remove('dragging');
      el.style.visibility = '';
      _endHandDrag(pt, cid, callbacks);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function _endHandDrag(pt, cid, cbs) {
    const hz = document.getElementById('discard-zone');

    // Detección 100% por coordenadas — ignora el DOM stack
    function rectHit(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom;
    }

    const isOverDiscard = hz && rectHit(hz);

    // buildingSlot: buscar cuál slot (si alguno) contiene el punto
    let buildingSlot = null;
    document.querySelectorAll('.building-slot').forEach(slot => {
      if (rectHit(slot)) buildingSlot = slot;
    });

    // bajadaPile: buscar cuál pile contiene el punto
    let bajadaPile = null;
    document.querySelectorAll('.bajada-pile').forEach(p => {
      if (rectHit(p)) bajadaPile = p;
    });

    const fw = document.getElementById('fondo-wrap');
    const isOverFondo = fw && rectHit(fw);

    console.log('[DD] _endHandDrag cid:', cid, 'pt:', Math.round(pt.x), Math.round(pt.y));
    console.log('[DD] draggingFromSlot:', draggingFromSlot, 'originalSlotIndex:', originalSlotIndex);
    console.log('[DD] isOverDiscard:', isOverDiscard, '| buildingSlot:', buildingSlot?.dataset?.slotIndex, '| bajadaPile:', !!bajadaPile, '| isOverFondo:', isOverFondo);

    // ==========================
    // CASO 1: VIENE DE UN SLOT
    // ==========================
    if (draggingFromSlot && originalSlotIndex !== null) {

      // Prioridad 1: si está sobre el discard-zone → devolver a mano
      if (isOverDiscard) {
        console.log('[DD] → RETURN TO HAND');
        cbs.onReturnToHand?.(cid, originalSlotIndex);
        dragId = null; draggingFromSlot = false; originalSlotIndex = null;
        return;
      }

      // Prioridad 2: si está sobre un slot diferente → mover entre slots
      if (buildingSlot) {
        const destSlotIndex = parseInt(buildingSlot.dataset.slotIndex);
        if (destSlotIndex === originalSlotIndex) {
          console.log('[DD] → mismo slot, ignorar');
          dragId = null; draggingFromSlot = false; originalSlotIndex = null;
          return;
        }
        console.log('[DD] → MOVE BETWEEN SLOTS', originalSlotIndex, '->', destSlotIndex);
        cbs.onMoveBetweenSlots?.(cid, originalSlotIndex, destSlotIndex, buildingSlot.dataset.slotType);
        dragId = null; draggingFromSlot = false; originalSlotIndex = null;
        return;
      }

      // Fallback: lugar inválido, no hacer nada
      console.log('[DD] → FALLBACK slot drag, no move');
      dragId = null; draggingFromSlot = false; originalSlotIndex = null;
      return;
    }

    // ==========================
    // CASO 2: VIENE DE LA MANO
    // ==========================
    if (buildingSlot) {
      cbs.onBuildingDrop?.(cid, buildingSlot.dataset.slotIndex, buildingSlot.dataset.slotType);
      dragId = null; return;
    }
    if (bajadaPile) {
      cbs.onAcomodar?.(cid, parseInt(bajadaPile.dataset.pi), parseInt(bajadaPile.dataset.ji));
      dragId = null; return;
    }
    if (isOverFondo && cbs.isPayable?.()) {
      cbs.onPagar?.(cid);
      dragId = null; return;
    }
    if (isOverDiscard) {
      const cards = [...hz.querySelectorAll('.card:not(.dragging)')];
      let insertIdx = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (pt.x < r.left + r.width / 2) { insertIdx = i; break; }
      }
      cbs.onReorder?.(cid, insertIdx);
      dragId = null; return;
    }

    dragId = null; draggingFromSlot = false; originalSlotIndex = null;
  }

  function startFondoDrag(e, cardEl, callbacks) {
    if (e.type === 'touchstart') e.preventDefault();
    dragSource = 'fondo';
    draggingFromSlot = false;
    originalSlotIndex = null;
    ghost = mkGhost(cardEl, getPoint(e));
    cardEl.style.opacity = '.2';
    const onMove = ev => {
      ev.preventDefault();
      const pt = getPoint(ev);
      moveGhost(pt);
      showInsertGhost(pt.x, pt.y);
    };
    const onUp = ev => {
      const pt = getPoint(ev);
      if (ghost) { ghost.g.remove(); ghost = null; }
      cleanDropZones();
      cardEl.style.opacity = '';
      _endFondoDrag(pt, callbacks);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function _endFondoDrag(pt, cbs) {
    const hz = document.getElementById('discard-zone');
    if (!hz) return;
    const hr = hz.getBoundingClientRect();
    if (pt.x >= hr.left && pt.x <= hr.right && pt.y >= hr.top && pt.y <= hr.bottom) {
      const cards = [...hz.querySelectorAll('.card')];
      let insertIdx = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (pt.x < r.left + r.width / 2) { insertIdx = i; break; }
      }
      cbs.onTakeFondo?.(insertIdx);
    }
    dragSource = null;
  }

  return { startHandDrag, startFondoDrag };
})();

window.DragDrop = DragDrop;