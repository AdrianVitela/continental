(function () {
  'use strict';

  const BUBBLE_DURATION = 3800;
  let chatOpen    = false;
  let unreadCount = 0;

  window.toggleChat = function () {
    chatOpen = !chatOpen;
    document.getElementById('chat-panel').classList.toggle('open', chatOpen);
    if (chatOpen) {
      unreadCount = 0;
      const badge = document.getElementById('chat-badge');
      badge.classList.remove('show');
      badge.textContent = '';
      const msgs = document.getElementById('chat-messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
  };

  document.addEventListener('click', (e) => {
    const panel  = document.getElementById('chat-panel');
    const toggle = document.getElementById('chat-toggle');
    if (chatOpen && !panel.contains(e.target) &&
        e.target !== toggle && !toggle.contains(e.target)) {
      chatOpen = false;
      panel.classList.remove('open');
    }
  });

  /* Nombre propio: usar G.jugadores[myIdx] que es la fuente de verdad de pesca.js */
  function _getMiNombre() {
    if (typeof G !== 'undefined' && G && typeof myIdx !== 'undefined' && myIdx !== -1) {
      return G.jugadores[myIdx]?.nombre || '';
    }
    // Fallback: cookie
    const m = document.cookie.match(/(?:^|; )continental_nombre=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : 'Jugador';
  }

  /* ========== SISTEMA DE SONIDOS ========== */
  const AudioSystem = {
    sonidos: {},
    inicializado: false,
    init: function() {
      if (this.inicializado) return;
      [
        { nombre: 'golpe',       archivo: 'sounds/golpe.mp3',       volumen: 0.6  },
        { nombre: 'jaja',        archivo: 'sounds/jaja.mp3',        volumen: 0.5  },
        { nombre: 'cara_enojada',archivo: 'sounds/cara_enojada.mp3',volumen: 0.55 },
        { nombre: 'dame_carta',  archivo: 'sounds/dame_carta.mp3',  volumen: 0.6  },
        { nombre: 'castigate',   archivo: 'sounds/castigate.mp3',   volumen: 0.6  },
        { nombre: 'gane',        archivo: 'sounds/gane.mp3',        volumen: 0.55 },
      ].forEach(s => {
        try {
          const a = new Audio(); a.src = s.archivo; a.volume = s.volumen; a.load();
          this.sonidos[s.nombre] = a;
        } catch(e) { this.sonidos[s.nombre] = null; }
      });
      this.inicializado = true;
    },
    play: function(nombre, vol = 0.6) {
      if (!this.inicializado) this.init();
      const a = this.sonidos[nombre]; if (!a) return;
      try { const c = a.cloneNode(); c.volume = vol; c.play().catch(()=>{}); } catch(e){}
    },
    golpe:      function() { this.play('golpe', 0.65); },
    jaja:       function() { this.play('jaja', 0.5); },
    caraEnojada:function() { this.play('cara_enojada', 0.55); },
    dameCarta:  function() { this.play('dame_carta', 0.6); },
    castigate:  function() { this.play('castigate', 0.6); },
    gane:       function() { this.play('gane', 0.55); }
  };
  window.AudioSystem = AudioSystem;

  function triggerGolpe() {
    const t = document.getElementById('main-table');
    if (!t) return;
    t.classList.remove('table-bang'); void t.offsetWidth;
    t.classList.add('table-bang');
    setTimeout(() => t.classList.remove('table-bang'), 580);
  }

  function reproducirSonidoPorTexto(texto) {
    const tl = texto.toLowerCase();
    if (texto === '😂')                        { AudioSystem.jaja(); return; }
    if (texto === '🤬')                        { AudioSystem.caraEnojada(); return; }
    if (texto === '🔥')                        { AudioSystem.golpe(); triggerGolpe(); return; }
    if (texto === '¡Ya dame mi carta! 😩')     { AudioSystem.dameCarta(); return; }
    if (texto === '¡Ya gané, jaja! 🏆')        { AudioSystem.gane(); return; }
    if (texto === '¡Castígate! 😈')            { AudioSystem.castigate(); return; }
    if (texto === '¡No mames! 😤')             { AudioSystem.caraEnojada(); return; }
    if (tl.includes('paga')||tl.includes('golpe'))         { AudioSystem.golpe(); triggerGolpe(); return; }
    if (tl.includes('jaja')||tl.includes('😂'))            { AudioSystem.jaja(); return; }
    if (tl.includes('gane')||tl.includes('gané'))          { AudioSystem.gane(); return; }
    if (tl.includes('dame'))                               { AudioSystem.dameCarta(); return; }
    if (tl.includes('castigate')||tl.includes('castígate')){ AudioSystem.castigate(); return; }
    if (tl.includes('no mames'))                           { AudioSystem.caraEnojada(); return; }
  }

  /* ========== ENVÍO ========== */
  window.sendChatInput = function () {
    const input = document.getElementById('chat-input');
    const txt   = (input.value || '').trim();
    if (!txt) return;
    const nombre = _getMiNombre();
    reproducirSonidoPorTexto(txt);
    WS.send({ type: 'reaction', tipo: 'msg', texto: txt, nombre });
    mostrarReaccion({ tipo: 'msg', texto: txt, nombre }, false);
    input.value = '';
    chatOpen = false;
    document.getElementById('chat-panel').classList.remove('open');
  };

  window.sendReaction = function (tipo, texto) {
    if (typeof WS === 'undefined') return;
    const nombre = _getMiNombre();
    reproducirSonidoPorTexto(texto);
    WS.send({ type: 'reaction', tipo, texto, nombre });
    mostrarReaccion({ tipo, texto, nombre }, false);
    chatOpen = false;
    document.getElementById('chat-panel').classList.remove('open');
  };

  /* ========== RECEPCIÓN ========== */
  function _registerWS() {
    if (typeof WS !== 'undefined') {
      WS.on('reaction', function(data) {
        mostrarReaccion(data, true);
      });
    } else {
      setTimeout(_registerWS, 100);
    }
  }
  _registerWS();

  /* ========== MOSTRAR REACCIÓN ========== */
  function mostrarReaccion(data, reproducirSonido) {
    const { tipo, texto, nombre } = data;
    _appendChatMessage(nombre, texto);
    if (reproducirSonido) reproducirSonidoPorTexto(texto);
    if (tipo === 'emoji') _showFloatingEmoji(texto);
    _showSpeechBubble(nombre, texto);
  }

  function _showFloatingEmoji(emoji) {
    const el = document.createElement('div');
    el.className = 'reaction-float';
    el.textContent = emoji;
    el.style.left   = (15 + Math.random() * 65) + 'vw';
    el.style.bottom = '140px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  /* ========== BURBUJA DE DIÁLOGO ========== */
  function _showSpeechBubble(nombre, texto) {
    const anchor = _getBubbleAnchor(nombre);
    if (!anchor) return;

    let bubble = anchor.querySelector('.speech-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'speech-bubble';
      anchor.appendChild(bubble);
    }

    const esPaga = texto.includes('PAGA') || texto === '🔥';
    bubble.classList.toggle('paga', esPaga);
    bubble.textContent = texto;
    bubble.classList.remove('visible');
    void bubble.offsetWidth;
    bubble.classList.add('visible');
    clearTimeout(bubble._hideT);
    bubble._hideT = setTimeout(() => bubble.classList.remove('visible'), BUBBLE_DURATION);
  }

  /*
    Regla clara:
    - Si el nombre coincide con el jugador propio → #my-bubble-anchor
    - Si no → buscar .rival-card cuyo .r-name contenga ese nombre,
               y usar (o crear) un .bubble-anchor dentro de ella
  */
  function _getBubbleAnchor(nombre) {
    // ── Jugador propio ──
    const miNombre = _getMiNombre();
    if (nombre === miNombre) {
      return document.getElementById('my-bubble-anchor');
    }

    // ── Rival: buscar por .r-name que contenga el nombre ──
    // pesca.js renderiza: <span class="r-dot..."></span> + texto del nombre
    // así que el textContent del .r-name es "· nombre" o similar → usamos includes()
    let rivalEl = null;
    document.querySelectorAll('.rival-card').forEach(card => {
      const nameEl = card.querySelector('.r-name');
      if (nameEl && nameEl.textContent.includes(nombre)) {
        rivalEl = card;
      }
    });

    if (!rivalEl) return null;

    // Buscar o crear el anchor dentro del rival
    let anchor = rivalEl.querySelector('.bubble-anchor');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.className = 'bubble-anchor';
      rivalEl.appendChild(anchor);
    }
    return anchor;
  }

  /* ========== CHAT PANEL ========== */
  function _appendChatMessage(nombre, texto) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="msg-author">${_esc(nombre)}:</span><span class="msg-text"> ${_esc(texto)}</span>`;
    container.appendChild(div);
    while (container.children.length > 30) container.removeChild(container.firstChild);
    if (chatOpen) {
      container.scrollTop = container.scrollHeight;
    } else {
      unreadCount++;
      const badge = document.getElementById('chat-badge');
      badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      badge.classList.add('show');
    }
  }

  function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ========== ACTIVAR SONIDOS AL PRIMER CLIC ========== */
  function primerClick() {
    AudioSystem.init();
    document.removeEventListener('click', primerClick);
    document.removeEventListener('touchstart', primerClick);
  }
  document.addEventListener('click', primerClick);
  document.addEventListener('touchstart', primerClick);

})();


document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('btn-confirmar')?.addEventListener('click', confirmarRespuesta);

  document.querySelectorAll('.building-slot[data-slot]').forEach(function (el) {
    el.addEventListener('click', function () { clickSlot(Number(el.dataset.slot)); });
  });

  document.getElementById('chat-toggle')?.addEventListener('click', toggleChat);
  document.getElementById('chat-close')?.addEventListener('click', toggleChat);

  document.querySelectorAll('[data-reaction-type][data-reaction-text]').forEach(function (el) {
    el.addEventListener('click', function () {
      sendReaction(el.dataset.reactionType, el.dataset.reactionText);
    });
  });

  document.querySelector('[data-enter-send="chat"]')?.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') sendChatInput();
  });

  document.getElementById('chat-send')?.addEventListener('click', sendChatInput);

  document.querySelectorAll('[data-href]').forEach(function (el) {
    el.addEventListener('click', function () { window.location.href = el.dataset.href; });
  });
});
