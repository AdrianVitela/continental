// dragdrop.js - Arrastrar y soltar: reordenar mano, fondo→mano, mano→fondo, mano→bajada, mano→building slots

'use strict';

const DragDrop = (() => {
  let dragId = null;
  let dragSource = null; // 'hand' o 'fondo'
  let ghost = null;
  let draggingFromSlot = false; // Nueva bandera para saber si la carta viene de un slot

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
      }
    }
  }

  // Limpia todos los indicadores visuales
  function cleanDropZones() {
    document.getElementById('discard-zone')?.querySelectorAll('.insert-ghost').forEach(g => g.remove());
    document.getElementById('discard-zone')?.classList.remove('drag-over');
    document.getElementById('discard-zone')?.classList.remove('drop-target-sobrantes');
    document.querySelectorAll('.bajada-pile').forEach(p => p.classList.remove('drop-target'));
    document.querySelectorAll('.building-slot').forEach(s => s.classList.remove('drop-target'));
    
    const fw = document.getElementById('fondo-wrap');
    if (fw) { 
      fw.style.outline = ''; 
      fw.style.borderRadius = ''; 
    }
    
    draggingFromSlot = false; // Resetear bandera
  }

  // Inicia arrastre desde la MANO del jugador
  function startHandDrag(e, el, cid, callbacks) {
    if (e.type === 'touchstart') e.preventDefault();
    
    dragId = cid;
    dragSource = 'hand';
    
    // Verificar si la carta viene de un slot
    draggingFromSlot = el?.dataset.slot !== undefined;
    
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
    // Verificar si la carta viene de un slot (tiene dataset.slot)
    const draggedEl = document.querySelector(`.card[data-id="${cid}"]`);
    const fromSlot = draggedEl?.dataset.slot;
    
    // Si viene de un slot, manejar diferentes casos
    if (fromSlot !== undefined) {
      // Verificar si se soltó en un building slot (para mover entre slots)
      const destSlot = document.elementFromPoint(pt.x, pt.y)?.closest('.building-slot');
      
      if (destSlot) {
        // Se soltó en otro slot - mover de un slot a otro
        const destSlotIndex = destSlot.dataset.slotIndex;
        const destSlotType = destSlot.dataset.slotType;
        if (cbs.onMoveBetweenSlots) {
          cbs.onMoveBetweenSlots(cid, parseInt(fromSlot), parseInt(destSlotIndex), destSlotType);
        }
        dragId = null;
        return;
      } else {
        // Verificar si se soltó en la zona de sobrantes (discard-zone)
        const hz = document.getElementById('discard-zone');
        if (hz) {
          const hr = hz.getBoundingClientRect();
          if (pt.x >= hr.left && pt.x <= hr.right && pt.y >= hr.top && pt.y <= hr.bottom) {
            // Se soltó en sobrantes - sacar la carta del slot
            if (cbs.onRemoveFromSlot) {
              cbs.onRemoveFromSlot(cid, parseInt(fromSlot));
              dragId = null;
              return;
            }
          }
        }
        
        // Se soltó fuera de cualquier zona válida - sacar la carta igualmente
        if (cbs.onRemoveFromSlot) {
          cbs.onRemoveFromSlot(cid, parseInt(fromSlot));
          dragId = null;
          return;
        }
      }
    }
    
    // 1. Soltó en un BUILDING SLOT (para construir jugada) - solo si NO viene de un slot
    const buildingSlot = document.elementFromPoint(pt.x, pt.y)?.closest('.building-slot');
    if (buildingSlot && fromSlot === undefined) {
      const slotIndex = buildingSlot.dataset.slotIndex;
      const slotType = buildingSlot.dataset.slotType;
      if (cbs.onBuildingDrop) {
        cbs.onBuildingDrop(cid, slotIndex, slotType);
      }
      dragId = null;
      return;
    }

    // 2. Soltó en una pila de bajada (para acomodar carta en jugada de otro)
    const pile = document.elementFromPoint(pt.x, pt.y)?.closest('.bajada-pile');
    if (pile) {
      cbs.onAcomodar?.(cid, parseInt(pile.dataset.pi), parseInt(pile.dataset.ji));
      dragId = null;
      return;
    }

    // 3. Soltó en la zona del fondo (para pagar)
    const fw = document.getElementById('fondo-wrap');
    if (fw) {
      const r = fw.getBoundingClientRect();
      if (pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom && cbs.isPayable?.()) {
        cbs.onPagar?.(cid);
        dragId = null;
        return;
      }
    }

    // 4. Soltó dentro de la mano (para reordenar) - solo si NO viene de un slot
    const hz = document.getElementById('discard-zone');
    if (hz && fromSlot === undefined) {
      const hr = hz.getBoundingClientRect();
      if (pt.x >= hr.left && pt.x <= hr.right && pt.y >= hr.top && pt.y <= hr.bottom) {
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
    }
    
    // Si no soltó en ninguna zona válida, no hacer nada
    dragId = null;
  }

  // Inicia arrastre desde el FONDO
  function startFondoDrag(e, cardEl, callbacks) {
    if (e.type === 'touchstart') e.preventDefault();
    
    dragSource = 'fondo';
    draggingFromSlot = false; // Las cartas del fondo no vienen de slots
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