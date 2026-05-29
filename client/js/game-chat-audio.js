/* ================================================================
   CHAT / REACCIONES — lógica cliente
   ================================================================ */
(function () {
  'use strict';

  const BUBBLE_DURATION = 3800;

  window.toggleChat = function () {
    const panel = document.getElementById('chat-panel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      document.getElementById('chat-toggle').textContent = '💬';
    }
  };

  document.addEventListener('click', (e) => {
    const panel  = document.getElementById('chat-panel');
    const toggle = document.getElementById('chat-toggle');
    if (panel.classList.contains('open') &&
        !panel.contains(e.target) &&
        e.target !== toggle && !toggle.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  // Función para reproducir sonido según tipo y texto
  function reproducirSonidoReaccion(tipo, texto) {
    if (tipo === 'emoji') {
      switch(texto) {
        case '😂':
          AudioSystem.jaja();
          break;
        case '🤬':
          AudioSystem.caraEnojada();
          break;
        default:
          console.log('Emoji sin sonido asignado:', texto);
      }
    } else if (tipo === 'msg' || tipo === 'golpe') {
      switch(texto) {
        case '¡Ya dame mi carta! 😩':
          AudioSystem.dameCarta();
          break;
        case '¡Castígate! 😈':
          AudioSystem.castigate();
          break;
        case '¡Ya gané, jaja! 🏆':
          AudioSystem.gane();
          break;
        case '¡¡¡PAGA!!!':
          AudioSystem.golpe();
          break;
        default:
          console.log('Mensaje sin sonido asignado:', texto);
      }
    }
  }

  window.sendReaction = function (tipo, texto) {
    if (typeof G === 'undefined' || !G) return;
    const nombre = G.jugadores[myIdx]?.nombre || 'Yo';
    
    // 1. Reproducir sonido localmente (para quien hace clic)
    reproducirSonidoReaccion(tipo, texto);
    
    // 2. Enviar al servidor para que lo retransmita a otros
    WS.send({ type: 'reaction', tipo, texto, nombre });
    
    // 3. Mostrar la reacción visual localmente (sin sonido, ya lo reprodujimos)
    showReaction({ tipo, texto, nombre }, false);
    
    // 4. Cerrar el panel de chat
    document.getElementById('chat-panel').classList.remove('open');
  };

  WS.on('reaction', (msg) => {
    // Ignorar nuestros propios mensajes (ya los mostramos localmente)
    if (typeof G !== 'undefined' && G &&
        G.jugadores[myIdx]?.nombre === msg.nombre) return;
    
    // Mostrar la reacción de OTROS jugadores CON sonido
    showReaction(msg, true);
  });

  function showReaction ({ tipo, texto, nombre }, reproducirSonido = true) {
    // Siempre mostrar el mensaje en el chat
    appendChatMessage(nombre, texto);
    
    // Reproducir sonido si se solicita
    if (reproducirSonido) {
      reproducirSonidoReaccion(tipo, texto);
    }
    
    // Mostrar burbuja visual
    if (tipo === 'golpe') {
      triggerPaga(nombre);
    } else {
      showSpeechBubble(nombre, texto);
    }
  }

  function showSpeechBubble (nombre, texto, esPaga) {
    const anchorEl = getOrCreateBubbleAnchor(nombre);
    if (!anchorEl) return;

    let bubble = anchorEl.querySelector('.speech-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'speech-bubble';
      anchorEl.appendChild(bubble);
    }

    bubble.textContent = texto;
    bubble.classList.toggle('paga', !!esPaga);
    bubble.classList.remove('visible');
    void bubble.offsetWidth;
    bubble.classList.add('visible');

    clearTimeout(bubble._hideT);
    bubble._hideT = setTimeout(() => {
      bubble.classList.remove('visible');
    }, esPaga ? 3000 : BUBBLE_DURATION);
  }

  function getOrCreateBubbleAnchor (nombre) {
    if (typeof G === 'undefined' || !G) return null;
    const idx = G.jugadores.findIndex(j => j.nombre === nombre);
    if (idx === myIdx) {
      return document.getElementById('my-bubble-anchor');
    }
    const oppEl = document.querySelector(`.opp[data-idx="${idx}"]`);
    if (!oppEl) return null;
    let anchor = oppEl.querySelector('.bubble-anchor');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.className = 'bubble-anchor';
      oppEl.appendChild(anchor);
    }
    return anchor;
  }

  function appendChatMessage (nombre, texto) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML =
      `<span class="msg-author">${esc(nombre)}:</span>` +
      `<span class="msg-text">${esc(texto)}</span>`;
    container.appendChild(div);
    while (container.children.length > 30) container.removeChild(container.firstChild);
    container.scrollTop = container.scrollHeight;

    const panel  = document.getElementById('chat-panel');
    const toggle = document.getElementById('chat-toggle');
    if (!panel.classList.contains('open')) {
      toggle.textContent = '💬🔴';
      clearTimeout(toggle._badgeT);
      toggle._badgeT = setTimeout(() => { toggle.textContent = '💬'; }, 5000);
    }
  }

  function triggerPaga (nombre) {
    const table = document.getElementById('main-table');
    if (table) {
      table.classList.remove('table-bang');
      void table.offsetWidth;
      table.classList.add('table-bang');
      setTimeout(() => table.classList.remove('table-bang'), 580);
    }
    showSpeechBubble(nombre, '🔥 ¡¡¡PAGA!!!', true);
  }

  function esc (str) {
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

})();

/* ================================================================
   SISTEMA DE SONIDOS - Efectos de audio
   ================================================================ */
(function() {
  'use strict';

  const AudioSystem = {
    sonidos: {},
    inicializado: false,
    
    // Inicializar todos los sonidos
    init: function() {
      if (this.inicializado) return;
      
      // Lista de sonidos a cargar
      const sonidosACargar = [
        { nombre: 'golpe', archivo: 'sounds/golpe.mp3', volumen: 0.6 },
        { nombre: 'jaja', archivo: 'sounds/jaja.mp3', volumen: 0.5 },
        { nombre: 'cara_enojada', archivo: 'sounds/cara_enojada.mp3', volumen: 0.55 },
        { nombre: 'dame_carta', archivo: 'sounds/dame_carta.mp3', volumen: 0.6 },
        { nombre: 'castigate', archivo: 'sounds/castigate.mp3', volumen: 0.6 },
        { nombre: 'gane', archivo: 'sounds/gane.mp3', volumen: 0.55 },
        // Aquí puedes agregar más sonidos en el futuro
      ];
      
      sonidosACargar.forEach(s => {
        try {
          const audio = new Audio();
          audio.src = s.archivo;
          audio.volume = s.volumen;
          audio.load(); // Precargar
          this.sonidos[s.nombre] = audio;
          console.log(`Sonido cargado: ${s.nombre}`);
        } catch (e) {
          console.warn(`Error cargando sonido ${s.nombre}:`, e);
          this.sonidos[s.nombre] = null;
        }
      });
      
      this.inicializado = true;
    },
    
    // Reproducir un sonido
    play: function(nombre, volumen = 0.6) {
      // Asegurar que los sonidos están inicializados
      if (!this.inicializado) {
        this.init();
      }
      
      const audio = this.sonidos[nombre];
      if (!audio) {
        console.warn(`Sonido no encontrado: ${nombre}`);
        return;
      }
      
      try {
        // Clonar para reproducción simultánea
        const clone = audio.cloneNode();
        clone.volume = volumen;
        
        // Intentar reproducir
        const playPromise = clone.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.log(`Error reproduciendo ${nombre}:`, e);
          });
        }
      } catch (e) {
        console.warn(`Error con sonido ${nombre}:`, e);
      }
    },
    
    // Métodos específicos para cada sonido
    golpe: function() {
      this.play('golpe', 0.65);
    },
    
    jaja: function() {
      this.play('jaja', 0.5);
    },
    
    caraEnojada: function() {
      this.play('cara_enojada', 0.55);
    },
    
    dameCarta: function() {
      this.play('dame_carta', 0.6);
    },
    
    castigate: function() {
      this.play('castigate', 0.6);
    },
    
    gane: function() {
      this.play('gane', 0.55);
    }
  };

  // Exponer al ámbito global
  window.AudioSystem = AudioSystem;

  // Modificar la función triggerPaga existente
  const triggerPagaOriginal = window.triggerPaga;
  window.triggerPaga = function(nombre) {
    // Reproducir sonido de golpe (por si se llama directamente)
    AudioSystem.golpe();
    
    // Llamar a la función original
    if (triggerPagaOriginal) {
      triggerPagaOriginal(nombre);
    }
  };

  // Precargar sonidos cuando el usuario interactúe por primera vez
  function primerClick() {
    AudioSystem.init();
    document.removeEventListener('click', primerClick);
    document.removeEventListener('touchstart', primerClick);
    console.log('🎵 Sistema de sonidos activado');
  }
  
  document.addEventListener('click', primerClick);
  document.addEventListener('touchstart', primerClick);

})();


document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('chat-toggle')?.addEventListener('click', toggleChat);

  document.querySelectorAll('[data-reaction-type][data-reaction-text]').forEach(function (el) {
    el.addEventListener('click', function () {
      sendReaction(el.dataset.reactionType, el.dataset.reactionText);
    });
  });

  document.querySelector('[data-action="ack-ronda"]')?.addEventListener('click', ackRonda);

  document.querySelectorAll('[data-href]').forEach(function (el) {
    el.addEventListener('click', function () { window.location.href = el.dataset.href; });
  });
});
