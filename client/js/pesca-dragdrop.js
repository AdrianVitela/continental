(function () {
  'use strict';
  let dragId       = null;
  let dragFromSlot = null;
  let ghost        = null;
  let _startX = 0, _startY = 0, _moved = false;
  const DRAG_THRESHOLD = 6;

  window._pescaDragStart = function (e, cardEl, cardId, fromSlot) {
    e.stopPropagation();
    _startX = (e.touches ? e.touches[0] : e).clientX;
    _startY = (e.touches ? e.touches[0] : e).clientY;
    _moved  = false;
    dragId       = cardId;
    dragFromSlot = (fromSlot !== undefined && fromSlot !== null) ? fromSlot : null;

    if (e.type === 'mousedown') {
      document.addEventListener('mousemove', _onMove);
      document.addEventListener('mouseup',   _onUp);
    } else {
      document.addEventListener('touchmove', _onTMove, { passive: false });
      document.addEventListener('touchend',  _onTEnd);
    }

    function _startGhost() {
      if (ghost) return;
      cardEl.classList.add('dragging');
      ghost = cardEl.cloneNode(true);
      ghost.classList.remove('dragging','selected');
      ghost.style.cssText = [
        'position:fixed','z-index:9000','pointer-events:none',
        'opacity:.88','transform:rotate(5deg) scale(1.1)',
        'box-shadow:0 10px 28px rgba(0,0,0,.55)','transition:none'
      ].join(';');
      document.body.appendChild(ghost);
    }

    function _onMove(e) {
      const dx = e.clientX - _startX, dy = e.clientY - _startY;
      if (!_moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      _moved = true; _startGhost();
      _posGhost(e.clientX, e.clientY); _hl(e.clientX, e.clientY);
    }
    function _onTMove(e) {
      const t = e.touches[0];
      const dx = t.clientX - _startX, dy = t.clientY - _startY;
      if (!_moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      e.preventDefault(); _moved = true; _startGhost();
      _posGhost(t.clientX, t.clientY); _hl(t.clientX, t.clientY);
    }
    function _onUp(e)   { _drop(e.clientX, e.clientY); _cleanup(); }
    function _onTEnd(e) { const t = e.changedTouches[0]; _drop(t.clientX, t.clientY); _cleanup(); }

    function _cleanup() {
      document.querySelectorAll('.p-card.dragging').forEach(c => c.classList.remove('dragging'));
      document.querySelectorAll('.building-slot').forEach(s => s.classList.remove('drag-over'));
      document.getElementById('my-hand')?.classList.remove('drag-over');
      if (ghost) { ghost.remove(); ghost = null; }
      document.removeEventListener('mousemove', _onMove);
      document.removeEventListener('mouseup',   _onUp);
      document.removeEventListener('touchmove', _onTMove);
      document.removeEventListener('touchend',  _onTEnd);
      dragId = null; dragFromSlot = null; _moved = false;
    }
  };

  function _posGhost(x, y) {
    if (!ghost) return;
    const cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')) || 52;
    const ch = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ch')) || 72;
    ghost.style.left = (x - cw/2) + 'px';
    ghost.style.top  = (y - ch/2) + 'px';
  }

  function _hl(x, y) {
    document.querySelectorAll('.building-slot').forEach(s => s.classList.remove('drag-over'));
    document.getElementById('my-hand')?.classList.remove('drag-over');
    if (!ghost) return;
    ghost.style.display = 'none';
    const under = document.elementFromPoint(x, y);
    ghost.style.display = '';
    if (!under) return;
    const slot = under.closest('.building-slot');
    if (slot) { slot.classList.add('drag-over'); return; }
    if (dragFromSlot !== null) {
      const hand = document.getElementById('my-hand');
      const area = document.querySelector('.player-section');
      if (hand && (hand === under || hand.contains(under))) hand.classList.add('drag-over');
      else if (area && area.contains(under) && !under.closest('.building-slot')) hand.classList.add('drag-over');
    }
  }

  function _drop(x, y) {
    if (dragId === null || !_moved) return;
    if (ghost) ghost.style.display = 'none';
    const under = document.elementFromPoint(x, y);
    if (ghost) ghost.style.display = '';
    if (!under) return;
    const slot = under.closest('.building-slot');
    if (slot) {
      const idx = parseInt(slot.dataset.slot);
      if (dragFromSlot !== null) {
        if (dragFromSlot !== idx && typeof pescaMoveSlotToSlot === 'function') pescaMoveSlotToSlot(dragId, dragFromSlot, idx);
      } else {
        if (typeof clickCardDropOnSlot === 'function') clickCardDropOnSlot(dragId, idx);
      }
      return;
    }
    if (dragFromSlot !== null) {
      const hand = document.getElementById('my-hand');
      const area = document.querySelector('.player-section');
      const inHand = hand && (hand === under || hand.contains(under));
      const inArea = area && area.contains(under) && !under.closest('.building-slot');
      if (inHand || inArea) {
        if (typeof pescaReturnToHand === 'function') pescaReturnToHand(dragId, dragFromSlot);
      }
    }
  }
})();
