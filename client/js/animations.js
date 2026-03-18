// animations.js - Control de movimientos de cartas con técnica FLIP

'use strict';

const Anim = (() => {
  // Obtener clase de skin del jugador local
  function getMySkin() {
    try {
      const u = JSON.parse(localStorage.getItem('usuario') || '{}');
      const skin = u.skin || 'clasico';
      return skin !== 'clasico' ? `skin-${skin}` : '';
    } catch { return ''; }
  }

  // Guarda las posiciones de elementos antes de un cambio en el DOM
  function capturePositions(selector) {
    const map = new Map();
    document.querySelectorAll(selector).forEach(el => {
      const id = el.dataset.id || el.id;
      if (id) map.set(id, el.getBoundingClientRect());
    });
    return map;
  }

  // Anima elementos desde su posición anterior a la nueva después de un cambio
  function flipAnimate(selector, before, opts = {}) {
    const { duration = 380, easing = 'cubic-bezier(.22,1,.36,1)', onDone } = opts;
    document.querySelectorAll(selector).forEach(el => {
      const id = el.dataset.id || el.id;
      if (!id || !before.has(id)) return;
      
      const old = before.get(id);
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = `transform ${duration}ms ${easing}`;
          el.style.transform = '';
          if (onDone) setTimeout(onDone, duration);
        });
      });
    });
  }

  // Crea un clon volador que va de un elemento origen a un destino
  function flyCard(cardEl, destEl, opts = {}) {
    return new Promise(resolve => {
      const { duration = 420, rotate = 8, scale = 1.1 } = opts;
      const src = cardEl.getBoundingClientRect();
      const dst = destEl.getBoundingClientRect();

      const ghost = cardEl.cloneNode(true);
      ghost.style.cssText = `
        position: fixed;
        width: ${src.width}px;
        height: ${src.height}px;
        left: ${src.left}px;
        top: ${src.top}px;
        z-index: 9999;
        pointer-events: none;
        transition: none;
        border-radius: var(--r);
        box-shadow: 0 20px 50px rgba(0,0,0,.65);
      `;
      document.body.appendChild(ghost);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const dx = dst.left + dst.width / 2 - src.left - src.width / 2;
          const dy = dst.top + dst.height / 2 - src.top - src.height / 2;
          
          ghost.style.transition = `all ${duration}ms cubic-bezier(.22,1,.36,1)`;
          ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg) scale(${scale})`;
          ghost.style.opacity = '0';
          
          setTimeout(() => { 
            ghost.remove(); 
            resolve(); 
          }, duration);
        });
      });
    });
  }

  // Anima una carta que va del mazo o fondo a una mano específica
  async function flyToHand(sourceEl, handZoneEl, insertIdx, cardEl) {
    if (!sourceEl || !handZoneEl) return;

    const src = sourceEl.getBoundingClientRect();
    const cards = [...handZoneEl.querySelectorAll('.card:not(.deal-placeholder)')];
    const refEl = cards[insertIdx] || handZoneEl;
    const dst = refEl.getBoundingClientRect();

    const ghost = cardEl.cloneNode(true);
    const isFromMazo = sourceEl.classList.contains('mazo-wrap') || sourceEl.closest('.mazo-wrap');

    ghost.style.cssText = `
      position: fixed;
      width: ${src.width || 62}px;
      height: ${src.height || 90}px;
      left: ${src.left}px;
      top: ${src.top}px;
      z-index: 9999;
      pointer-events: none;
      transition: none;
      border-radius: var(--r);
      box-shadow: 0 20px 50px rgba(0,0,0,.65), 0 0 0 2px rgba(200,160,69,.4);
      transform: rotate(${isFromMazo ? -5 : 3}deg) scale(.95);
    `;
    
    // Si viene del mazo, empieza mostrando el dorso
    if (isFromMazo) {
      ghost.innerHTML = '';
      ghost.style.background = 'linear-gradient(135deg, #1a3a80, #0d2050)';
      ghost.style.border = '1px solid rgba(255,255,255,.18)';
    }
    document.body.appendChild(ghost);

    await new Promise(r => setTimeout(r, 10));

    const dx = dst.left - src.left + (dst.width - (src.width || 62)) / 2;
    const dy = dst.top - src.top + (dst.height - (src.height || 90)) / 2;

    ghost.style.transition = `all 380ms cubic-bezier(.22,1,.36,1)`;
    ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(0deg) scale(1)`;

    // A mitad de camino, voltea la carta si viene del mazo
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

  // Un rival "lanza" una carta al fondo (animación de pago)
  async function rivalPaysToFondo(oppEl, fondoEl, cardSmEl) {
    if (!oppEl || !fondoEl) return;
    
    const src = oppEl.getBoundingClientRect();
    const dst = fondoEl.getBoundingClientRect();

    const ghost = document.createElement('div');
    ghost.className = `cback ${getMySkin()}`;
    ghost.style.cssText = `
      position: fixed; 
      z-index: 9999; 
      pointer-events: none;
      width: var(--cw); 
      height: var(--ch);
      left: ${src.left + src.width/2 - 31}px;
      top: ${src.top + src.height/2 - 45}px;
      transition: none;
      transform: scale(.7) rotate(-10deg);
    `;
    document.body.appendChild(ghost);
    
    await new Promise(r => setTimeout(r, 10));

    const dx = dst.left - src.left + dst.width/2 - 31;
    const dy = dst.top - src.top + dst.height/2 - 45;
    
    ghost.style.transition = `all 420ms cubic-bezier(.22,1,.36,1)`;
    ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(15deg) scale(1)`;

    // A mitad del recorrido, voltea para mostrar el frente
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

  // Efecto de barajeo en el mazo antes de repartir
  function shuffleAnim(mazoEl) {
    return new Promise(resolve => {
      if (!mazoEl) { 
        resolve(); 
        return; 
      }
      
      const layers = mazoEl.querySelectorAll('.cback');
      let delay = 0;
      
      for (let rep = 0; rep < 3; rep++) {
        for (const layer of layers) {
          setTimeout(() => {
            layer.style.transition = 'transform .12s ease-in-out';
            layer.style.transform = `translateX(${(Math.random()-.5)*10}px) rotate(${(Math.random()-.5)*6}deg)`;
            setTimeout(() => { 
              layer.style.transform = ''; 
            }, 130);
          }, delay);
          delay += 60;
        }
      }
      setTimeout(resolve, delay + 150);
    });
  }

  // Animación de repartir: las cartas vuelan del mazo a cada mano
  async function dealAnim(mazoEl, handZoneEl, cards, startDelay = 0) {
    const src = mazoEl?.getBoundingClientRect();
    if (!src || !handZoneEl) return;

    // Ocultar las cartas reales mientras animamos
    const cardEls = handZoneEl.querySelectorAll('.card');
    cardEls.forEach(el => { el.style.opacity = '0'; });

    const promises = [];

    for (let i = 0; i < cards.length; i++) {
      const p = new Promise(async resolve => {
        await new Promise(r => setTimeout(r, startDelay + i * 90));

        // Ghost card volando desde el mazo
        const ghost = document.createElement('div');
        ghost.className = `cback ${getMySkin()}`;
        ghost.style.cssText = `
          position: fixed;
          z-index: 9999;
          pointer-events: none;
          width: ${src.width}px;
          height: ${src.height}px;
          left: ${src.left}px;
          top: ${src.top}px;
          transition: none;
          border-radius: var(--r);
          box-shadow: 0 8px 28px rgba(0,0,0,.6);
          transform: scale(1.05);
        `;
        document.body.appendChild(ghost);

        // Destino: posición de la carta i en la mano
        const targetCard = handZoneEl.querySelectorAll('.card')[i];
        const dst = targetCard
          ? targetCard.getBoundingClientRect()
          : handZoneEl.getBoundingClientRect();

        await new Promise(r => setTimeout(r, 16));

        ghost.style.transition = 'all 320ms cubic-bezier(.22,1,.36,1)';
        ghost.style.left  = `${dst.left}px`;
        ghost.style.top   = `${dst.top}px`;
        ghost.style.width = `${dst.width}px`;
        ghost.style.height= `${dst.height}px`;
        ghost.style.transform = `scale(1) rotate(${(Math.random()-.5)*6}deg)`;

        await new Promise(r => setTimeout(r, 300));

        // Mostrar carta real y quitar ghost
        if (targetCard) {
          targetCard.style.transition = 'opacity 80ms ease';
          targetCard.style.opacity = '1';
        }
        ghost.remove();
        resolve();
      });
      promises.push(p);
    }

    await Promise.all(promises);
  }

  // Muestra números flotantes de puntuación (+15, -0, etc.) al finalizar ronda
  function floatScore(el, pts, isGain = false) {
    if (!el) return;
    
    const rect = el.getBoundingClientRect();
    const num = document.createElement('div');
    num.textContent = (pts > 0 ? '+' : '') + pts;
    num.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width/2}px;
      top: ${rect.top}px;
      transform: translate(-50%, 0);
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.4rem; 
      font-weight: 700;
      color: ${pts > 0 ? 'var(--red-hi)' : '#4de88a'};
      text-shadow: 0 2px 8px rgba(0,0,0,.5);
      pointer-events: none;
      z-index: 500;
      animation: floatUp .9s cubic-bezier(.22,1,.36,1) both;
    `;
    
    // Inyecta la animación si no existe
    if (!document.querySelector('#floatUpAnim')) {
      document.head.insertAdjacentHTML('beforeend', `
        <style id="floatUpAnim">
          @keyframes floatUp {
            from { opacity:1; transform: translate(-50%,0); }
            to { opacity:0; transform: translate(-50%,-50px); }
          }
        </style>
      `);
    }
    
    document.body.appendChild(num);
    setTimeout(() => num.remove(), 950);
  }

  // Animación de bajar: las cartas se abren en abanico y luego colapsan a la zona de bajada
  // Partículas doradas al aterrizar
  function spawnParticles(x, y, count = 12) {
    const colors = ['#c8a045', '#ffe066', '#fff4c2', '#f0c040', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const angle  = (Math.PI * 2 / count) * i + (Math.random() - .5) * .5;
      const speed  = 40 + Math.random() * 60;
      const size   = 4 + Math.random() * 5;
      const color  = colors[Math.floor(Math.random() * colors.length)];
      const dur    = 500 + Math.random() * 300;
      p.style.cssText = `
        position:fixed; z-index:10000; pointer-events:none;
        width:${size}px; height:${size}px;
        border-radius:${Math.random() > .5 ? '50%' : '2px'};
        background:${color};
        left:${x}px; top:${y}px;
        transform:translate(-50%,-50%);
        box-shadow: 0 0 4px ${color};
      `;
      document.body.appendChild(p);
      const tx = Math.cos(angle) * speed;
      const ty = Math.sin(angle) * speed;
      p.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 },
      ], { duration: dur, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      setTimeout(() => p.remove(), dur + 50);
    }
  }

  async function bajarAnim(cardEls, destEl) {
    const slots = destEl?.querySelectorAll('.building-slot-cards');

    // Agrupar cartas por slot — si no hay slots usar destEl como fallback
    const cardArray = [...cardEls];
    const slotCount = slots?.length || 1;
    const perSlot   = Math.ceil(cardArray.length / slotCount);

    const promises = cardArray.map((el, i) => new Promise(resolve => {
      const rect     = el.getBoundingClientRect();
      const slotIdx  = Math.floor(i / perSlot);
      const slotEl   = slots?.[slotIdx] || destEl;
      const dstRect  = slotEl?.getBoundingClientRect();

      // Ghost de la carta
      const ghost = el.cloneNode(true);
      ghost.style.cssText = `
        position:fixed; z-index:${9990 + i}; pointer-events:none;
        width:${rect.width}px; height:${rect.height}px;
        left:${rect.left}px; top:${rect.top}px;
        border-radius:var(--r);
        box-shadow:0 12px 30px rgba(0,0,0,.5);
        transition:none;
      `;
      document.body.appendChild(ghost);

      const delay = i * 55;

      setTimeout(() => {
        // Fase 1: ligero salto hacia arriba
        ghost.style.transition = 'all 150ms cubic-bezier(.34,1.56,.64,1)';
        ghost.style.transform  = `translateY(-18px) scale(1.1) rotate(${(Math.random()-.5)*8}deg)`;

        setTimeout(() => {
          if (!dstRect) { ghost.remove(); resolve(); return; }

          // Fase 2: volar al slot destino
          const tx = dstRect.left + (i % perSlot) * (rect.width * 0.6) - rect.left;
          const ty = dstRect.top  - rect.top;

          ghost.style.transition = 'all 340ms cubic-bezier(.22,1,.36,1)';
          ghost.style.transform  = `translate(${tx}px, ${ty}px) scale(.95) rotate(0deg)`;
          ghost.style.boxShadow  = '0 0 20px rgba(200,160,69,.6), 0 8px 24px rgba(0,0,0,.4)';

          setTimeout(() => {
            // Flash dorado al aterrizar
            ghost.style.transition = 'all 80ms ease';
            ghost.style.boxShadow  = '0 0 40px rgba(200,160,69,1), 0 0 80px rgba(255,220,100,.5)';
            ghost.style.transform  = `translate(${tx}px, ${ty}px) scale(1.05) rotate(0deg)`;

            // Partículas en el punto de aterrizaje
            const landX = dstRect.left + dstRect.width  / 2;
            const landY = dstRect.top  + dstRect.height / 2;
            spawnParticles(landX, landY, 10);

            setTimeout(() => {
              ghost.style.transition = 'opacity 120ms ease';
              ghost.style.opacity    = '0';
              setTimeout(() => { ghost.remove(); resolve(); }, 130);
            }, 100);
          }, 320);
        }, 160);
      }, delay);
    }));

    await Promise.all(promises);
  }

  return { 
    capturePositions, 
    flipAnimate, 
    flyCard, 
    flyToHand, 
    rivalPaysToFondo, 
    shuffleAnim, 
    dealAnim, 
    floatScore, 
    bajarAnim,
    spawnParticles
  };
})();

window.Anim = Anim;