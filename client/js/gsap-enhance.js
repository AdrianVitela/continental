// gsap-enhance.js - Capa decorativa con GSAP (mejora progresiva).
// Si GSAP no está cargado, esta capa no hace nada: el juego funciona igual.

(function () {
  'use strict';

  const hasGSAP = typeof window.gsap !== 'undefined';
  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!hasGSAP || reduced) {
    // Fallback: API opcional inerte (game.js usa Anim.confetti?.()).
    if (window.Anim && !window.Anim.confetti) {
      window.Anim.confetti = function () {};
    }
    return;
  }

  const gsap = window.gsap;

  // ─────────────────────────────────────────────
  // 1) CONFETE al ganar (instala Anim.confetti)
  // ─────────────────────────────────────────────
  function confetti(x, y, count = 80) {
    const cx = x ?? window.innerWidth / 2;
    const cy = y ?? window.innerHeight * 0.42;
    const colors = ['#c8a045', '#ffe066', '#fff4c2', '#e74c3c', '#2ecc71', '#3498db', '#ffffff'];

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9500;overflow:hidden';
    document.body.appendChild(wrap);

    const parts = [];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const size = 5 + Math.random() * 7;
      const color = colors[(Math.random() * colors.length) | 0];
      p.style.cssText = `
        position:absolute; width:${size}px; height:${size * (Math.random() > .5 ? 1 : 0.5)}px;
        left:0; top:0; border-radius:${Math.random() > .6 ? '50%' : '2px'};
        background:${color};
      `;
      wrap.appendChild(p);
      parts.push(p);
    }

    parts.forEach((p, i) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * 220;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist * 0.9 + 260;
      const dur = 1.3 + Math.random() * 0.8;
      const delay = Math.random() * 0.35;

      gsap.timeline({ delay })
        .fromTo(p, {
          x: cx - p.offsetWidth / 2,
          y: cy - p.offsetHeight / 2,
          scale: 0.4,
          opacity: 1,
          rotation: 0,
        }, {
          x: cx + tx,
          y: cy + ty,
          scale: 1,
          opacity: 0,
          rotation: (Math.random() > .5 ? 1 : -1) * (180 + Math.random() * 360),
          duration: dur,
          ease: 'power1.in',
        })
        .to(p, { opacity: 0, duration: 0.2 }, '-=0.1');
    });

    gsap.delayedCall(2.6, () => wrap.remove());
  }

  if (window.Anim) window.Anim.confetti = confetti;

  // ─────────────────────────────────────────────
  // 2) Moteado dorado ambiental (detrás de todo)
  // ─────────────────────────────────────────────
  (function ambientMotes() {
    if (!document.getElementById('main-table') && !document.querySelector('.hub-shell') && !document.querySelector('.admin-shell')) return;
    const layer = document.createElement('div');
    layer.id = 'ambient-motes';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:-1;overflow:hidden';
    document.body.appendChild(layer);

    const motes = [];
    for (let i = 0; i < 14; i++) {
      const m = document.createElement('div');
      const size = 2 + Math.random() * 3;
      m.style.cssText = `
        position:absolute; border-radius:50%;
        width:${size}px; height:${size}px;
        background:radial-gradient(circle, rgba(255,224,102,.9), rgba(200,160,69,.25));
        left:${Math.random() * 100}%; top:${Math.random() * 100}%;
        opacity:${0.12 + Math.random() * 0.25};
      `;
      layer.appendChild(m);
      motes.push({ el: m, dur: 5 + Math.random() * 5, drift: 20 + Math.random() * 50 });
    }

    motes.forEach(({ el, dur, drift }) => {
      gsap.to(el, {
        x: '+=random(-' + drift + ',' + drift + ')',
        y: '+=random(-30,30)',
        rotation: '+=random(-40,40)',
        duration: dur,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
    });
  })();

  // ─────────────────────────────────────────────
  // 3) Micro-interacción de botones (presión)
  // ─────────────────────────────────────────────
  const PRESSABLE = [
    '.btn', '.pc-btn', '.tab', '.chat-quick-btn',
    '.guide-primary-btn', '.guide-secondary-btn', '.eye-btn',
    '.resume-game-btn', '.music-toggle', '.mesa-swatch', '.chat-emoji-btn',
    '.btn-danger', '.btn-save', '.btn-ghost', '.btn-back', '.badge-select',
  ].join(',');

  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(PRESSABLE);
    if (!el || el.disabled) return;
    gsap.to(el, { scale: 0.95, duration: 0.09, ease: 'power1.out', overwrite: 'auto' });
  }, { passive: true });

  document.addEventListener('pointerup', (e) => {
    const el = e.target.closest(PRESSABLE);
    if (!el) return;
    gsap.to(el, { scale: 1, duration: 0.45, ease: 'elastic.out(1,0.45)', overwrite: 'auto' });
  }, { passive: true });

  document.addEventListener('pointercancel', (e) => {
    const el = e.target.closest(PRESSABLE);
    if (!el) return;
    gsap.to(el, { scale: 1, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
  }, { passive: true });

  // Reajuste si el puntero sale del botón sin soltar
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest(PRESSABLE);
    if (el && e.buttons === 0) gsap.to(el, { scale: 1, duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
  }, { passive: true });
})();
