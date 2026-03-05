// dragdrop.js - Arrastrar y soltar: reordenar mano, fondo→mano, mano→fondo, mano→bajada, mano→building slots

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
    g.style.width = rect.width + 'px';
    g.style.height = rect.height + 'px';
    g.style.left = (pt.x - rect.width / 2) + 'px';
    g.style.top = (pt.y - rect.height / 2) + 'px';
    g.style.pointerEvents = 'none'; // FIX 4: el ghost no intercepta elementsFromPoint
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
      if (mx < r.left + r.width / 2) {
        before = c;
        break;
      }
    }

    const ig = document.createElement('div');
    ig.className = 'insert-ghost';

    if (before) hz.insertBefore(ig, before);
    else hz.appendChild(ig);
  }

  function highlightDropZones(mx, my, isPayable) {

    document.querySelectorAll('.building-slot').forEach(slot => {
      const r = slot.getBoundingClientRect();
      slot.classList.toggle(
        'drop-target',
        mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom
      );
    });

    document.querySelectorAll('.bajada-pile').forEach(p => {
      const r = p.getBoundingClientRect();
      p.classList.toggle(
        'drop-target',
        mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom
      );
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

        if (overDiscard) {
          hz.setAttribute('data-hint', 'Suelta para devolver a la mano');
        } else {
          hz.removeAttribute('data-hint');
        }
      }
    }
  }

  function cleanDropZones() {

    const hz = document.getElementById('discard-zone');

    if (hz) {
      hz.querySelectorAll('.insert-ghost').forEach(g => g.remove());
      hz.classList.remove('drag-over');
      hz.classList.remove('drop-target-sobrantes');
      hz.removeAttribute('data-hint');
    }

    document.querySelectorAll('.bajada-pile').forEach(p => p.classList.remove('drop-target'));
    document.querySelectorAll('.building-slot').forEach(s => s.classList.remove('drop-target'));

    const fw = document.getElementById('fondo-wrap');
    if (fw) {
      fw.style.outline = '';
      fw.style.borderRadius = '';
    }
  }

  function startHandDrag(e, el, cid, callbacks) {

    if (e.type === 'touchstart') e.preventDefault();

    dragId = cid;
    dragSource = 'hand';
    originalCardEl = el;

    draggingFromSlot = el?.hasAttribute('data-slot');
    originalSlotIndex = draggingFromSlot ? parseInt(el.dataset.slot) : null;

    ghost = mkGhost(el, getPoint(e));
    el.classList.add('dragging');

    // FIX 1: Ocultar la carta original del slot para que no bloquee el hit-test
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

      if (ghost) {
        ghost.g.remove();
        ghost = null;
      }

      cleanDropZones();
      el.classList.remove('dragging');

      // FIX 2: Restaurar visibilidad al soltar
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

    // Detección por coordenadas rectangulares (más fiable que elementsFromPoint
    // cuando hay elementos superpuestos como building-slot sobre discard-zone)
    function rectHit(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom;
    }

    const isOverDiscard = hz && rectHit(hz);

    // Para slots y bajadas sí usamos elementsFromPoint (no se superponen con discard-zone)
    const elementsUnderCursor = document.elementsFromPoint(pt.x, pt.y);

    const destSlot = elementsUnderCursor.find(
      el => el.classList?.contains('building-slot') || (el.closest && el.closest('.building-slot') !== null)
    );

    const buildingSlot = destSlot
      ? destSlot.classList?.contains('building-slot')
        ? destSlot
        : destSlot.closest('.building-slot')
      : null;

    const destPile = elementsUnderCursor.find(
      el => el.classList?.contains('bajada-pile') || (el.closest && el.closest('.bajada-pile') !== null)
    );

    const bajadaPile = destPile
      ? destPile.classList?.contains('bajada-pile')
        ? destPile
        : destPile.closest('.bajada-pile')
      : null;

    const fw = document.getElementById('fondo-wrap');
    const isOverFondo = fw && rectHit(fw);

    // ==========================
    // CASO 1: VIENE DE UN SLOT
    // ==========================

    if (draggingFromSlot && originalSlotIndex !== null) {

      // 1A: devolver a sobrantes PRIMERO — tiene prioridad sobre slots
      // (el discard-zone puede estar "debajo" del building-slot en el DOM)
      if (isOverDiscard) {
        if (cbs.onReturnToHand) {
          cbs.onReturnToHand(cid, originalSlotIndex);
        }
        dragId = null;
        draggingFromSlot = false;
        originalSlotIndex = null;
        return;
      }

      // 1B: mover entre slots (solo si es un slot DIFERENTE)
      if (buildingSlot) {
        const destSlotIndex = parseInt(buildingSlot.dataset.slotIndex);

        // Si es el mismo slot, no hacer nada
        if (destSlotIndex === originalSlotIndex) {
          dragId = null;
          draggingFromSlot = false;
          originalSlotIndex = null;
          return;
        }

        if (cbs.onMoveBetweenSlots) {
          cbs.onMoveBetweenSlots(
            cid,
            originalSlotIndex,
            destSlotIndex,
            buildingSlot.dataset.slotType
          );
        }

        dragId = null;
        draggingFromSlot = false;
        originalSlotIndex = null;
        return;
      }

      // Fallback — soltó en lugar inválido, no mover la carta
      dragId = null;
      draggingFromSlot = false;
      originalSlotIndex = null;
      return;
    }

    // ==========================
    // CASO 2: VIENE DE LA MANO
    // ==========================

    if (buildingSlot) {
      const slotIndex = buildingSlot.dataset.slotIndex;
      const slotType = buildingSlot.dataset.slotType;
      cbs.onBuildingDrop?.(cid, slotIndex, slotType);
      dragId = null;
      return;
    }

    if (bajadaPile) {
      cbs.onAcomodar?.(
        cid,
        parseInt(bajadaPile.dataset.pi),
        parseInt(bajadaPile.dataset.ji)
      );
      dragId = null;
      return;
    }

    if (isOverFondo && cbs.isPayable?.()) {
      cbs.onPagar?.(cid);
      dragId = null;
      return;
    }

    if (isOverDiscard) {

      const cards = [...hz.querySelectorAll('.card:not(.dragging)')];

      let insertIdx = cards.length;

      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (pt.x < r.left + r.width / 2) {
          insertIdx = i;
          break;
        }
      }

      cbs.onReorder?.(cid, insertIdx);
      dragId = null;
      return;
    }

    dragId = null;
    draggingFromSlot = false;
    originalSlotIndex = null;
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

      if (ghost) {
        ghost.g.remove();
        ghost = null;
      }

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

    if (
      pt.x >= hr.left &&
      pt.x <= hr.right &&
      pt.y >= hr.top &&
      pt.y <= hr.bottom
    ) {

      const cards = [...hz.querySelectorAll('.card')];

      let insertIdx = cards.length;

      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (pt.x < r.left + r.width / 2) {
          insertIdx = i;
          break;
        }
      }

      cbs.onTakeFondo?.(insertIdx);
    }

    dragSource = null;
  }

  return { startHandDrag, startFondoDrag };

})();

window.DragDrop = DragDrop;