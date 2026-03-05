// dragdrop.js - Arrastrar y soltar: reordenar mano, fondo→mano, mano→fondo, mano→bajada, mano→building slots

'use strict';

const DragDrop = (() => {
  let dragId = null;
  let dragSource = null; // 'hand' o 'fondo'
  let ghost = null;
  let draggingFromSlot = false;
  let originalSlotIndex = null; // Guardar el slot original

  // Obtiene coordenadas del evento (mouse o touch)
  function getPoint(e) {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  // Crea el fantasma que sigue al cursor durante el arrastre
  function mkGhost(el, pt) {
    const rect = el.getBoundingClientRect();
    const g = el.cloneNode(true);
    g.id = 'drag-ghost';
    g.removeAttribute('data-id');
    g.style.width = rect.width + 'px';
    g.style.height = rect.height + 'px';
    g.style.left = (pt.x - rect.width / 2) + 'px';
    g.style.top = (pt.y - rect.height / 2) + 'px';
    document.body.appendChild(g);
    return { g, rect };
  }

  // Mueve el fantasma siguiendo el cursor
  function moveGhost(pt) {
    if (!ghost) return;
    ghost.g.style.left = (pt.x - ghost.rect.width / 2) + 'px';
    ghost.g.style.top = (pt.y - ghost.rect.height / 2) + 'px';
  }

  // Muestra un indicador visual de dónde se insertará la carta en la mano
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

  // Resalta las zonas donde se puede soltar la carta
  function highlightDropZones(mx, my, isPayable) {
    // Resaltar building slots (para construcción de jugadas)
    document.querySelectorAll('.building-slot').forEach(slot => {
      const r = slot.getBoundingClientRect();
      slot.classList.toggle('drop-target', 
        mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom
      );
    });
    
    // Resaltar bajadas de otros jugadores (para acomodar)
    document.querySelectorAll('.bajada-pile').forEach(p => {
      const r = p.getBoundingClientRect();
      p.classList.toggle('drop-target', 
        mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom
      );
    });
    
    // Resaltar fondo (para pagar)
    const fw = document.getElementById('fondo-wrap');
    if (fw && isPayable) {
      const r = fw.getBoundingClientRect();
      const over = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
      fw.style.outline = over ? '2px solid var(--red-hi)' : '';
      fw.style.borderRadius = over ? 'var(--r)' : '';
    }
    
    // Resaltar zona de sobrantes cuando se arrastra desde un slot
    if (draggingFromSlot) {
      const hz = document.getElementById('discard-zone');
      if (hz) {
        const hr = hz.getBoundingClientRect();
        const overDiscard = mx >= hr.left && mx <= hr.right && my >= hr.top && my <= hr.bottom;
        hz.classList.toggle('drop-target-sobrantes', overDiscard);
        
        // También mostrar mensaje visual
        if (overDiscard) {
          hz.setAttribute('data-hint', 'Suelta para quitar de la jugada');
        } else {
          hz.removeAttribute('data-hint');
        }
      }
    }
  }

  // Limpia todos los indicadores visuales
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
    
    draggingFromSlot = false;
    originalSlotIndex = null;
  }

  // Inicia arrastre desde la MANO del jugador
  function startHandDrag(e, el, cid, callbacks) {
    if (e.type === 'touchstart') e.preventDefault();
    
    dragId = cid;
    dragSource = 'hand';
    
    // Verificar si la carta viene de un slot y guardar el slot original
    draggingFromSlot = el?.dataset.slot !== undefined;
    originalSlotIndex = draggingFromSlot ? parseInt(el.dataset.slot) : null;
    
    // Ocultar temporalmente la carta original en el slot
    if (draggingFromSlot) {
      el.style.opacity = '0.2';
    }
    
    ghost = mkGhost(el, getPoint(e));
    el.classList.add('dragging');

    const onMove = ev => {
      ev.preventDefault();
      const pt = getPoint(ev);
      moveGhost(pt);
      showInsertGhost(pt.x, pt.y);
      highlightDropZones(pt.x, pt.y, callbacks.isPayable?.());
    };
    
    const onUp = ev => {
      const pt = getPoint(ev);
      ghost?.g.remove();
      ghost = null;
      
      // Restaurar opacidad de la carta original
      if (draggingFromSlot) {
        el.style.opacity = '';
      }
      
      // Limpiar zonas resaltadas
      cleanDropZones();
      
      el.classList.remove('dragging');
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

  // Maneja el fin del arrastre desde la mano
  function _endHandDrag(pt, cid, cbs) {
    // Verificar si la carta viene de un slot
    const fromSlot = originalSlotIndex;
    
    // Verificar en qué zona se soltó
    const destSlot = document.elementFromPoint(pt.x, pt.y)?.closest('.building-slot');
    const destPile = document.elementFromPoint(pt.x, pt.y)?.closest('.bajada-pile');
    const hz = document.getElementById('discard-zone');
    const fw = document.getElementById('fondo-wrap');
    
    // Verificar si está sobre discard-zone
    let overDiscard = false;
    if (hz) {
      const hr = hz.getBoundingClientRect();
      overDiscard = pt.x >= hr.left && pt.x <= hr.right && pt.y >= hr.top && pt.y <= hr.bottom;
    }
    
    // Verificar si está sobre fondo
    let overFondo = false;
    if (fw) {
      const fr = fw.getBoundingClientRect();
      overFondo = pt.x >= fr.left && pt.x <= fr.right && pt.y >= fr.top && pt.y <= fr.bottom;
    }
    
    // CASO 1: Viene de un slot
    if (fromSlot !== null) {
      // 1A: Soltó en otro slot → mover entre slots
      if (destSlot) {
        const destSlotIndex = destSlot.dataset.slotIndex;
        const destSlotType = destSlot.dataset.slotType;
        if (cbs.onMoveBetweenSlots) {
          cbs.onMoveBetweenSlots(cid, fromSlot, parseInt(destSlotIndex), destSlotType);
        }
        dragId = null;
        return;
      }
      
      // 1B: Soltó en discard-zone → quitar del slot (volver a sobrantes)
      if (overDiscard) {
        if (cbs.onRemoveFromSlot) {
          cbs.onRemoveFromSlot(cid, fromSlot);
        }
        dragId = null;
        return;
      }
      
      // 1C: Soltó en cualquier otro lugar → también quitar del slot
      // (asumimos que quiere sacarla de la jugada)
      if (cbs.onRemoveFromSlot) {
        cbs.onRemoveFromSlot(cid, fromSlot);
      }
      dragId = null;
      return;
    }
    
    // CASO 2: NO viene de un slot (viene de sobrantes)
    
    // 2A: Soltó en building slot → agregar a slot
    if (destSlot) {
      const slotIndex = destSlot.dataset.slotIndex;
      const slotType = destSlot.dataset.slotType;
      if (cbs.onBuildingDrop) {
        cbs.onBuildingDrop(cid, slotIndex, slotType);
      }
      dragId = null;
      return;
    }
    
    // 2B: Soltó en bajada de otro jugador
    if (destPile) {
      cbs.onAcomodar?.(cid, parseInt(destPile.dataset.pi), parseInt(destPile.dataset.ji));
      dragId = null;
      return;
    }
    
    // 2C: Soltó en fondo (para pagar)
    if (overFondo && cbs.isPayable?.()) {
      cbs.onPagar?.(cid);
      dragId = null;
      return;
    }
    
    // 2D: Soltó en discard-zone (reordenar)
    if (overDiscard) {
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
    
    // Si no soltó en ninguna zona válida, no hacer nada
    dragId = null;
  }

  // Inicia arrastre desde el FONDO
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
      ghost?.g.remove();
      ghost = null;
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

  // Maneja el fin del arrastre desde el fondo
  function _endFondoDrag(pt, cbs) {
    const hz = document.getElementById('discard-zone');
    if (!hz) return;
    
    const hr = hz.getBoundingClientRect();
    if (pt.x >= hr.left && pt.x <= hr.right && pt.y >= hr.top && pt.y <= hr.bottom) {
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