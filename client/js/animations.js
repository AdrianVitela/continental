// animations.js — All card movement animations using FLIP technique
'use strict';

// ═══════════════════════════════════════════════
// FLIP: First, Last, Invert, Play
// Cards animate from their real previous position
// to their new DOM position automatically.
// ═══════════════════════════════════════════════

const Anim = (() => {
  // Capture positions of elements before a DOM change
  function capturePositions(selector) {
    const map = new Map();
    document.querySelectorAll(selector).forEach(el => {
      const id = el.dataset.id || el.id;
      if (id) map.set(id, el.getBoundingClientRect());
    });
    return map;
  }

  // After DOM change, animate elements from old → new position
  function flipAnimate(selector, before, opts = {}) {
    const { duration = 380, easing = 'cubic-bezier(.22,1,.36,1)', onDone } = opts;
    document.querySelectorAll(selector).forEach(el => {
      const id = el.dataset.id || el.id;
      if (!id || !before.has(id)) return;
      const old  = before.get(id);
      const now  = el.getBoundingClientRect();
      const dx   = old.left - now.left;
      const dy   = old.top  - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.transition = 'none';
      el.style.transform  = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = `transform ${duration}ms ${easing}`;
          el.style.transform  = '';
          if (onDone) setTimeout(onDone, duration);
        });
      });
    });
  }

  // ── Specific animations ──────────────────────

  // Fly a card from source element to destination element
  function flyCard(cardEl, destEl, opts = {}) {
    return new Promise(resolve => {
      const { duration = 420, rotate = 8, scale = 1.1 } = opts;
      const src  = cardEl.getBoundingClientRect();
      const dst  = destEl.getBoundingClientRect();

      // Create a flying clone
      const ghost = cardEl.cloneNode(true);
      ghost.style.cssText = `
        position: fixed;
        width:  ${src.width}px;
        height: ${src.height}px;
        left:   ${src.left}px;
        top:    ${src.top}px;
        z-index: 9999;
        pointer-events: none;
        transition: none;
        border-radius: var(--r);
        box-shadow: 0 20px 50px rgba(0,0,0,.65);
      `;
      document.body.appendChild(ghost);

      // Start position (already set above)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const dx = dst.left + dst.width  / 2 - src.left - src.width  / 2;
          const dy = dst.top  + dst.height / 2 - src.top  - src.height / 2;
          ghost.style.transition = `all ${duration}ms cubic-bezier(.22,1,.36,1)`;
          ghost.style.transform  = `translate(${dx}px, ${dy}px) rotate(${rotate}deg) scale(${scale})`;
          ghost.style.opacity    = '0';
          setTimeout(() => { ghost.remove(); resolve(); }, duration);
        });
      });
    });
  }

  // Card materializes into hand (from mazo/fondo position)
  async function flyToHand(sourceEl, handZoneEl, insertIdx, cardEl) {
    if (!sourceEl || !handZoneEl) return;

    const src  = sourceEl.getBoundingClientRect();
    // Find approximate insertion point in hand
    const cards = [...handZoneEl.querySelectorAll('.card:not(.deal-placeholder)')];
    const refEl = cards[insertIdx] || handZoneEl;
    const dst   = refEl.getBoundingClientRect();

    const ghost = cardEl.cloneNode(true);
    const isFromMazo = sourceEl.classList.contains('mazo-wrap') || sourceEl.closest('.mazo-wrap');

    ghost.style.cssText = `
      position: fixed;
      width:  ${src.width || 62}px;
      height: ${src.height || 90}px;
      left:   ${src.left}px;
      top:    ${src.top}px;
      z-index: 9999;
      pointer-events: none;
      transition: none;
      border-radius: var(--r);
      box-shadow: 0 20px 50px rgba(0,0,0,.65), 0 0 0 2px rgba(200,160,69,.4);
      transform: rotate(${isFromMazo ? -5 : 3}deg) scale(.95);
    `;
    // Start as card back if from mazo
    if (isFromMazo) {
      ghost.innerHTML = '';
      ghost.style.background = 'linear-gradient(135deg, #1a3a80, #0d2050)';
      ghost.style.border = '1px solid rgba(255,255,255,.18)';
    }
    document.body.appendChild(ghost);

    await new Promise(r => setTimeout(r, 10));

    const dx = dst.left - src.left + (dst.width - (src.width || 62)) / 2;
    const dy = dst.top  - src.top  + (dst.height - (src.height || 90)) / 2;

    ghost.style.transition = `all 380ms cubic-bezier(.22,1,.36,1)`;
    ghost.style.transform  = `translate(${dx}px, ${dy}px) rotate(0deg) scale(1)`;

    // Midway flip if from mazo
    if (isFromMazo) {
      setTimeout(() => {
        ghost.style.transition = 'none';
        ghost.innerHTML = cardEl.innerHTML;
        ghost.style.background = '';
        ghost.style.border = '';
      }, 190);
    }

    await new Promise(r => setTimeout(r, 380));
    ghost.remove();
  }

  // Rival "throws" card to fondo from their position
  async function rivalPaysToFondo(oppEl, fondoEl, cardSmEl) {
    if (!oppEl || !fondoEl) return;
    const src = oppEl.getBoundingClientRect();
    const dst = fondoEl.getBoundingClientRect();

    const ghost = document.createElement('div');
    ghost.className = 'cback';
    ghost.style.cssText = `
      position: fixed; z-index: 9999; pointer-events: none;
      width: var(--cw); height: var(--ch);
      left: ${src.left + src.width/2 - 31}px;
      top:  ${src.top  + src.height/2 - 45}px;
      transition: none;
      transform: scale(.7) rotate(-10deg);
    `;
    document.body.appendChild(ghost);
    await new Promise(r => setTimeout(r, 10));

    const dx = dst.left - src.left + dst.width/2 - 31;
    const dy = dst.top  - src.top  + dst.height/2 - 45;
    ghost.style.transition = `all 420ms cubic-bezier(.22,1,.36,1)`;
    ghost.style.transform  = `translate(${dx}px, ${dy}px) rotate(15deg) scale(1)`;

    // Flip to face side midway
    setTimeout(() => {
      if (cardSmEl) {
        ghost.innerHTML = cardSmEl.innerHTML;
        ghost.style.background = '';
        ghost.className = 'card';
      }
    }, 210);

    await new Promise(r => setTimeout(r, 420));
    ghost.remove();
  }

  // Shuffle animation on mazo (before deal)
  function shuffleAnim(mazoEl) {
    return new Promise(resolve => {
      if (!mazoEl) { resolve(); return; }
      const layers = mazoEl.querySelectorAll('.cback');
      let delay = 0;
      for (let rep = 0; rep < 3; rep++) {
        for (const layer of layers) {
          setTimeout(() => {
            layer.style.transition = 'transform .12s ease-in-out';
            layer.style.transform  = `translateX(${(Math.random()-.5)*10}px) rotate(${(Math.random()-.5)*6}deg)`;
            setTimeout(() => { layer.style.transform = ''; }, 130);
          }, delay);
          delay += 60;
        }
      }
      setTimeout(resolve, delay + 150);
    });
  }

  // Deal animation: cards fly from mazo to each player's hand one by one
  async function dealAnim(mazoEl, handZoneEl, cards, startDelay = 0) {
    const src = mazoEl?.getBoundingClientRect();
    if (!src || !handZoneEl) return;
    for (let i = 0; i < cards.length; i++) {
      await new Promise(r => setTimeout(r, startDelay + i * 60));
      const ghost = document.createElement('div');
      ghost.className = 'cback';
      ghost.style.cssText = `
        position: fixed; z-index: 9999; pointer-events: none;
        width: ${src.width}px; height: ${src.height}px;
        left: ${src.left}px; top: ${src.top}px;
        transition: none;
        border-radius: var(--r);
        box-shadow: 0 8px 24px rgba(0,0,0,.5);
      `;
      document.body.appendChild(ghost);

      const dst = handZoneEl.getBoundingClientRect();
      await new Promise(r => setTimeout(r, 10));
      ghost.style.transition = 'all 300ms cubic-bezier(.22,1,.36,1)';
      ghost.style.left = `${dst.left + dst.width/2 - src.width/2}px`;
      ghost.style.top  = `${dst.top  + 5}px`;
      ghost.style.transform = `scale(.9) rotate(${(Math.random()-.5)*8}deg)`;
      ghost.style.opacity = '.5';
      setTimeout(() => ghost.remove(), 310);
    }
  }

  // Floating score numbers (+15, -0, etc.) after a round ends
  function floatScore(el, pts, isGain = false) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const num  = document.createElement('div');
    num.textContent = (pts > 0 ? '+' : '') + pts;
    num.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width/2}px;
      top:  ${rect.top}px;
      transform: translate(-50%, 0);
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.4rem; font-weight: 700;
      color: ${pts > 0 ? 'var(--red-hi)' : '#4de88a'};
      text-shadow: 0 2px 8px rgba(0,0,0,.5);
      pointer-events: none;
      z-index: 500;
      animation: floatUp .9s cubic-bezier(.22,1,.36,1) both;
    `;
    document.head.insertAdjacentHTML('beforeend', `
      <style>@keyframes floatUp {
        from { opacity:1; transform: translate(-50%,0); }
        to   { opacity:0; transform: translate(-50%,-50px); }
      }</style>`);
    document.body.appendChild(num);
    setTimeout(() => num.remove(), 950);
  }

  // Bajar: cards fan out then collapse to bajada zone
  async function bajarAnim(cardEls, destEl) {
    const rots = [-12, -6, 0, 6, 12, -10, -4, 2, 8, -8, -2, 4, 10];
    const dstRect = destEl?.getBoundingClientRect();
    const promises = [...cardEls].map((el, i) => new Promise(resolve => {
      const rect = el.getBoundingClientRect();
      const ghost = el.cloneNode(true);
      ghost.style.cssText = `
        position: fixed; z-index: ${9990 + i}; pointer-events: none;
        width: ${rect.width}px; height: ${rect.height}px;
        left: ${rect.left}px; top: ${rect.top}px;
        box-shadow: 0 12px 30px rgba(0,0,0,.5);
        border-radius: var(--r);
        transition: none;
      `;
      document.body.appendChild(ghost);
      const delay = i * 40;
      setTimeout(() => {
        ghost.style.transition = 'all 180ms cubic-bezier(.34,1.56,.64,1)';
        ghost.style.transform = `translateY(-20px) rotate(${rots[i % rots.length]}deg) scale(1.08)`;
        setTimeout(() => {
          if (dstRect) {
            ghost.style.transition = 'all 300ms cubic-bezier(.22,1,.36,1)';
            ghost.style.left = `${dstRect.left + dstRect.width/2 - rect.width/2}px`;
            ghost.style.top  = `${dstRect.top  + dstRect.height/2 - rect.height/2}px`;
            ghost.style.transform = 'scale(.7) rotate(0deg)';
            ghost.style.opacity = '0';
          } else {
            ghost.style.transition = 'all 280ms var(--eout)';
            ghost.style.transform = 'translateY(-60px) scale(.6)';
            ghost.style.opacity = '0';
          }
          setTimeout(() => { ghost.remove(); resolve(); }, 310);
        }, 200);
      }, delay);
    }));
    return Promise.all(promises);
  }

  return { capturePositions, flipAnimate, flyCard, flyToHand, rivalPaysToFondo, shuffleAnim, dealAnim, floatScore, bajarAnim };
})();

window.Anim = Anim;
