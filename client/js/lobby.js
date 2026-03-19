// client/js/lobby.js
'use strict';

/* ================================================================
   CONSTANTES
   ================================================================ */

/** Sólo letras (incluyendo acentos y ñ) y números. Sin espacios ni especiales. */
const NAME_RE  = /^[A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ]+$/;

/** Código de sala: sólo letras mayúsculas y números (sin caracteres ambiguos) */
const CODE_RE  = /^[A-Z0-9]+$/;

const COOKIE_KEY  = 'continental_nombre';
const COOKIE_DAYS = 365;

/* ================================================================
   POOL DE NOMBRES PREDEFINIDOS
   120 opciones agrupadas con icono + nombre base
   ================================================================ */
const NOMBRE_POOL = [
  // Míticos / épicos
  { icon: '⚔️',  nombre: 'AceViper'    },
  { icon: '🦁',  nombre: 'LeonBravo'   },
  { icon: '🐉',  nombre: 'DrakeFuego'  },
  { icon: '👑',  nombre: 'ReyNegro'    },
  { icon: '🌪️',  nombre: 'TormentaSK'  },
  { icon: '🔱',  nombre: 'PosidonX'    },
  { icon: '🌊',  nombre: 'MareaBrava'  },
  { icon: '⚡',  nombre: 'RayoZeta'   },
  { icon: '🌙',  nombre: 'LunaCruda'   },
  { icon: '🦅',  nombre: 'AguilaReal'  },
  { icon: '🐺',  nombre: 'LoboNoche'   },
  { icon: '🦊',  nombre: 'ZorroAstuto' },
  { icon: '🐍',  nombre: 'SerpenteFria'},
  { icon: '🦈',  nombre: 'TiburonRojo' },
  { icon: '🦂',  nombre: 'EscorpionX'  },
  { icon: '🔥',  nombre: 'Incendio99'  },
  { icon: '💀',  nombre: 'CalaveraN'   },
  { icon: '🏴‍☠️', nombre: 'CorsarioK'   },
  { icon: '🗡️',  nombre: 'EspadaVerde' },
  { icon: '🛡️',  nombre: 'EscudoFirme' },
  // Cartas / apuestas
  { icon: '🃏',  nombre: 'Joker777'    },
  { icon: '🎴',  nombre: 'CartaMaestra'},
  { icon: '♠️',  nombre: 'EspadaNegra' },
  { icon: '♣️',  nombre: 'TrebolFatal' },
  { icon: '♦️',  nombre: 'DiamanteDro' },
  { icon: '♥️',  nombre: 'CorazonRojo' },
  { icon: '🎰',  nombre: 'CasinoKing'  },
  { icon: '🎲',  nombre: 'DadosMalos'  },
  { icon: '🏆',  nombre: 'CampeonPuro' },
  { icon: '🥇',  nombre: 'OroMexicano' },
  // Sabor picante / bravucón
  { icon: '🌶️',  nombre: 'ChileVerde'  },
  { icon: '🔫',  nombre: 'GatilloX'    },
  { icon: '💣',  nombre: 'BombaLista'  },
  { icon: '🤠',  nombre: 'VaqueroCool' },
  { icon: '😈',  nombre: 'DiabloCool'  },
  { icon: '👹',  nombre: 'OgreBreaker' },
  { icon: '🤡',  nombre: 'PayadoPro'   },
  { icon: '🦾',  nombre: 'BrazoFuerte' },
  { icon: '🥊',  nombre: 'BoxerBravo'  },
  { icon: '💪',  nombre: 'MuscleKing'  },
  // Naturaleza / animales
  { icon: '🐻',  nombre: 'OsoFuerte'   },
  { icon: '🐯',  nombre: 'TigreSalvaj' },
  { icon: '🦋',  nombre: 'MariposaMal' },
  { icon: '🦉',  nombre: 'BuhoSabio'   },
  { icon: '🐊',  nombre: 'CocodriloZ'  },
  { icon: '🦓',  nombre: 'CebraLoca'   },
  { icon: '🦏',  nombre: 'RinoBravo'   },
  { icon: '🐘',  nombre: 'ElefanteK'   },
  { icon: '🦁',  nombre: 'Simba2025'   },
  { icon: '🐆',  nombre: 'GuepaVeloz'  },
  // Espacial / tech
  { icon: '🚀',  nombre: 'RocketMan'   },
  { icon: '🛸',  nombre: 'OvniRider'   },
  { icon: '🤖',  nombre: 'RobotMalo'   },
  { icon: '👾',  nombre: 'AlienPlayer' },
  { icon: '💻',  nombre: 'HackerX99'   },
  { icon: '🧬',  nombre: 'ADNPURO'     },
  { icon: '⚛️',  nombre: 'AtomFusion'  },
  { icon: '🌌',  nombre: 'GalaxiaPro'  },
  { icon: '🪐',  nombre: 'SaturnoK'    },
  { icon: '☄️',  nombre: 'CometaRoja'  },
  // Mexicano / latam
  { icon: '🎸',  nombre: 'GuitarHero'  },
  { icon: '🌮',  nombre: 'TacoFuerte'  },
  { icon: '🍺',  nombre: 'CervezaBrav' },
  { icon: '🎺',  nombre: 'TrompetaK'   },
  { icon: '🪗',  nombre: 'AccordionX'  },
  { icon: '💃',  nombre: 'SalsaQueen'  },
  { icon: '🕺',  nombre: 'BailadorPro' },
  { icon: '🏜️',  nombre: 'DesiertoRex' },
  { icon: '🌵',  nombre: 'CactusFiero' },
  { icon: '🦅',  nombre: 'AguilaCalli' },
  // Comida / random divertido
  { icon: '🍕',  nombre: 'PizzaKing'   },
  { icon: '🍣',  nombre: 'SushiMaster' },
  { icon: '🌯',  nombre: 'BurritoX'    },
  { icon: '🥩',  nombre: 'ArrachKing'  },
  { icon: '🍜',  nombre: 'RamenBoss'   },
  { icon: '🍉',  nombre: 'SandiaFres'  },
  { icon: '🥑',  nombre: 'AguacateGod' },
  { icon: '🧃',  nombre: 'JugoMango'   },
  { icon: '☕',  nombre: 'CafeSolo'    },
  { icon: '🍫',  nombre: 'ChocoLoco'   },
  // Legendarios / histórico
  { icon: '🏛️',  nombre: 'CesarPRO'    },
  { icon: '⚔️',  nombre: 'AquilesX'   },
  { icon: '🗺️',  nombre: 'ColonMaster' },
  { icon: '🔭',  nombre: 'GalileoX'    },
  { icon: '📐',  nombre: 'PitagorasK'  },
  { icon: '🎭',  nombre: 'ShakespaerK' },
  { icon: '🎨',  nombre: 'PicassoMov'  },
  { icon: '🎻',  nombre: 'MozartBeat'  },
  { icon: '⚗️',  nombre: 'AlquimistaZ' },
  { icon: '📜',  nombre: 'ManuscritoK' },
  // Sport / competencia
  { icon: '⚽',  nombre: 'GolazoK'     },
  { icon: '🏀',  nombre: 'DunkMaster'  },
  { icon: '🎾',  nombre: 'ServeAce'    },
  { icon: '🏊',  nombre: 'NadadorX'    },
  { icon: '🧗',  nombre: 'EscaladoR'   },
  { icon: '🤺',  nombre: 'EsgrimaK'    },
  { icon: '🏋️',  nombre: 'PesoPesado'  },
  { icon: '🥋',  nombre: 'KarateKid2'  },
  { icon: '🎯',  nombre: 'TiroAlBlanco'},
  { icon: '🏇',  nombre: 'JineteRex'   },
  // Humor / random
  { icon: '🤓',  nombre: 'NerdPower'   },
  { icon: '😎',  nombre: 'CoolDude99'  },
  { icon: '🥸',  nombre: 'DisguisePro' },
  { icon: '🥶',  nombre: 'IceKingX'    },
  { icon: '🤯',  nombre: 'MindBlown1'  },
  { icon: '🧠',  nombre: 'CerebroX'    },
  { icon: '👀',  nombre: 'OjosPros'    },
  { icon: '🫀',  nombre: 'CorazonXL'   },
  { icon: '🧲',  nombre: 'ImanFatal'   },
  { icon: '🪄',  nombre: 'MagoTruco'   },
];

/* ================================================================
   ESTADO DEL MÓDULO
   ================================================================ */
let maxPlayers  = 4;
let gameMode    = 'realtime';
let myId        = null;
let myCode      = null;
let isHost      = false;
let playersList = [];
let currentTableColor = 'green';
let musicPlaying = false;
let musicAudio = null;

// Para el modal de nombres: qué input está activo
let _activeNameTarget = 'crear';
// Índice de inicio del shuffle actual
let _shuffleOffset = 0;
const NAMES_PER_PAGE = 12;

/* ================================================================
   COOKIES
   ================================================================ */
function setCookie (key, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${key}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function getCookie (key) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + key + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

/* Carga el nombre guardado en ambos inputs al iniciar */
function loadSavedName () {
  const saved = getCookie(COOKIE_KEY);
  if (!saved) return;
  const a = document.getElementById('crear-nombre');
  const b = document.getElementById('unirse-nombre');
  if (a) a.value = saved;
  if (b) b.value = saved;
}

/* Guarda el nombre en cookie y sincroniza los dos inputs */
function saveName (nombre) {
  if (!nombre) return;
  setCookie(COOKIE_KEY, nombre, COOKIE_DAYS);
  // Sincronizar ambos campos para que siempre estén iguales
  const a = document.getElementById('crear-nombre');
  const b = document.getElementById('unirse-nombre');
  if (a && a.value !== nombre) a.value = nombre;
  if (b && b.value !== nombre) b.value = nombre;
}

/* ================================================================
   VALIDACIÓN / SANITIZACIÓN
   ================================================================ */

/**
 * Limpia un input de nombre:
 * - Elimina todo lo que no sea letra (incluyendo acentos/ñ) o número
 * - Actualiza el campo y la cookie
 */
function sanitizeName (input) {
  const raw   = input.value;
  const clean = raw.replace(/[^A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ]/g, '');
  if (raw !== clean) input.value = clean;
  hideHint(input.id === 'crear-nombre' ? 'crear-nombre' : 'unirse-nombre');
  // Guardar en cookie mientras escribe
  if (clean.length >= 2) saveName(clean);
}

/**
 * Limpia un input de código de sala:
 * - Solo letras y números (sin guiones ni especiales)
 * - Convierte a mayúsculas
 */
function sanitizeCode (input) {
  const raw   = input.value;
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw !== clean || input.value !== clean) input.value = clean;
  hideHint('unirse-code');
}

/** Muestra un hint de error bajo un campo */
function showHint (id, msg) {
  const el = document.getElementById('hint-' + id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function hideHint (id) {
  const el = document.getElementById('hint-' + id);
  if (el) el.classList.remove('show');
}

/** Valida nombre, retorna true si es válido */
function validateName (value, hintId) {
  const v = value.trim();
  if (!v) {
    showHint(hintId, 'El nombre no puede estar vacío.');
    return false;
  }
  if (v.length < 2) {
    showHint(hintId, 'Mínimo 2 caracteres.');
    return false;
  }
  if (!NAME_RE.test(v)) {
    showHint(hintId, 'Solo letras y números, sin espacios ni símbolos.');
    return false;
  }
  hideHint(hintId);
  return true;
}

/** Valida código de sala, retorna true si es válido */
function validateCode (value) {
  const v = value.trim().toUpperCase();
  if (!v || v.length < 4) {
    showHint('unirse-code', 'Ingresa el código de sala (4-5 caracteres).');
    return false;
  }
  if (!CODE_RE.test(v)) {
    showHint('unirse-code', 'Solo letras y números.');
    return false;
  }
  hideHint('unirse-code');
  return true;
}

/* ================================================================
   TABS / MODO / JUGADORES
   ================================================================ */
function switchTab (t) {
  document.querySelectorAll('.tab').forEach((el, i) =>
    el.classList.toggle('active', (i === 0 && t === 'crear') || (i === 1 && t === 'unirse'))
  );
  document.getElementById('panel-crear').classList.toggle('active', t === 'crear');
  document.getElementById('panel-unirse').classList.toggle('active', t === 'unirse');
}

function setMode (el) {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  gameMode = el.dataset.mode;
}

function chgMax (d) {
  maxPlayers = Math.max(2, Math.min(5, maxPlayers + d));
  document.getElementById('max-val').textContent = maxPlayers;
}

/* ================================================================
   MODAL DE NOMBRES PREDEFINIDOS
   ================================================================ */

/** Abre el modal y muestra una página de nombres */
function openNamesModal (target) {
  _activeNameTarget = target;
  _shuffleOffset    = Math.floor(Math.random() * NOMBRE_POOL.length); // inicio aleatorio
  renderNamesGrid();
  document.getElementById('names-modal').classList.add('show');
}

/** Muestra la siguiente tanda de nombres */
function shuffleNames () {
  _shuffleOffset = (_shuffleOffset + NAMES_PER_PAGE) % NOMBRE_POOL.length;
  renderNamesGrid();
}

function renderNamesGrid () {
  const grid = document.getElementById('names-grid');
  grid.innerHTML = '';
  for (let i = 0; i < NAMES_PER_PAGE; i++) {
    const entry = NOMBRE_POOL[(_shuffleOffset + i) % NOMBRE_POOL.length];
    const div   = document.createElement('div');
    div.className = 'name-option';
    div.innerHTML = `<span class="nicon">${entry.icon}</span>${entry.nombre}`;
    div.onclick = () => pickName(entry.nombre);
    grid.appendChild(div);
  }
}

/** El usuario eligió un nombre del modal */
function pickName (nombre) {
  const inputId = _activeNameTarget === 'crear' ? 'crear-nombre' : 'unirse-nombre';
  const input   = document.getElementById(inputId);
  if (input) {
    input.value = nombre;
    saveName(nombre);
    hideHint(_activeNameTarget === 'crear' ? 'crear-nombre' : 'unirse-nombre');
  }
  closeNamesModal();
}

function closeNamesModal () {
  document.getElementById('names-modal').classList.remove('show');
}

function closeNamesModalOutside (e) {
  if (e.target === document.getElementById('names-modal')) closeNamesModal();
}

/* ================================================================
   ACCIONES DE LOBBY
   ================================================================ */
/* ================================================================
   COLOR DE MESA
   ================================================================ */
function setMesaColor (color) {
  currentTableColor = color;
  document.querySelectorAll('.mesa-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === color);
  });
  WS.send({ type: 'set_table_color', color });
}

/* ================================================================
   MÚSICA
   ================================================================ */
// Jazz de casino - usamos una URL pública de stream libre
function initMusic () {
  musicAudio = new Audio('https://files.catbox.moe/bs0qiq.mp3');
  musicAudio.loop = true;
  musicAudio.volume = 0.25;
}

function toggleMusic () {
  if (!musicAudio) initMusic();
  if (musicPlaying) {
    musicAudio.pause();
    musicPlaying = false;
    document.getElementById('music-toggle').textContent = '▶ Play';
  } else {
    musicAudio.play().catch(() => {});
    musicPlaying = true;
    document.getElementById('music-toggle').textContent = '⏸ Pausa';
  }
}

function setVolume (val) {
  if (musicAudio) musicAudio.volume = val / 100;
}

function copyCode () {
  navigator.clipboard?.writeText(myCode);
  toast('¡Código copiado!', 'green');
}

function toast (msg, type = 'red') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type === 'green' ? 'rgba(40,160,80,.9)' : 'rgba(180,50,50,.9)';
  t.style.display = 'block';
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.style.display = 'none'), 2500);
}

function crearSala () {
  const nombre   = (window.getAuthNombre ? window.getAuthNombre() : '');
  const usuario  = JSON.parse(localStorage.getItem('usuario') || 'null');
  const userId   = usuario?.id || null;
  if (!nombre) { window.location.href = '/login'; return; }
  WS.send({ type: 'create_room', nombre, userId, mode: gameMode, maxPlayers });
}

function unirse () {
  const nombre   = (window.getAuthNombre ? window.getAuthNombre() : '');
  const usuario  = JSON.parse(localStorage.getItem('usuario') || 'null');
  const userId   = usuario?.id || null;
  const cInput   = document.getElementById('unirse-code');
  const code     = cInput.value.trim().toUpperCase();
  if (!nombre) { window.location.href = '/login'; return; }
  if (!validateCode(code)) return;
  WS.send({ type: 'join_room', nombre, userId, code });
}

function iniciarJuego () {
  WS.send({ type: 'start_game' });
}

/* ================================================================
   SALA DE ESPERA
   ================================================================ */
function showLobby (lobbyState, pid, code, host) {
  myId   = pid;
  myCode = code;
  isHost = host;

  document.getElementById('lobby-setup').style.display = 'none';
  const lr = document.getElementById('lobby-room');
  lr.classList.add('show');
  document.getElementById('room-code-display').textContent = code;
  // Mostrar selector de color solo al host
  const pickerWrap = document.getElementById('mesa-picker-wrap');
  if (pickerWrap) pickerWrap.style.display = host ? 'block' : 'none';
  updateLobbyState(lobbyState);
}

function updateLobbyState (lobbyState) {
  playersList = lobbyState.players;

  const list = document.getElementById('player-list');
  const BADGES_LOBBY = {
    'owner':         { emoji: '👑', label: 'Owner' },
    'beta_tester':   { emoji: '🧪', label: 'Beta Tester' },
    'early_adopter': { emoji: '🎖️', label: 'Early Adopter' },
    'vip':           { emoji: '⭐', label: 'VIP' },
  };
  list.innerHTML = playersList.map((p, i) => {
    const badge = p.badge && BADGES_LOBBY[p.badge]
      ? `<span title="${BADGES_LOBBY[p.badge].label}" style="cursor:default;font-size:.95rem">${BADGES_LOBBY[p.badge].emoji}</span>`
      : '';
    return `
    <div class="player-item">
      <div class="player-dot ${p.conectado ? '' : 'away'}"></div>
      <span>${escHtml(p.nombre)}</span>
      ${badge}
      ${i === 0 ? '<span class="player-badge">HOST</span>' : ''}
    </div>`;
  }).join('');

  const canStart = playersList.length >= 2 && lobbyState.status === 'lobby';
  const btn      = document.getElementById('btn-start');
  const soyHost  = playersList.length > 0 && myId && playersList[0].id === myId;
  btn.style.display = canStart && soyHost ? 'block' : 'none';

  const waiting = document.getElementById('waiting-msg');
  waiting.innerHTML = canStart
    ? `<span style="color:var(--gold-hi)">${playersList.length} jugadores listos</span>`
    : `Esperando jugadores<span class="dot-pulse"></span>`;
}

/* ================================================================
   EVENTOS DEL SOCKET
   ================================================================ */
function setupSocketEvents () {
  WS.on('room_created', ({ code, playerId, lobbyState }) => {
    showLobby(lobbyState, playerId, code, true);
    localStorage.setItem('cid_' + code, playerId);
  });

  WS.on('room_joined', ({ code, playerId, lobbyState }) => {
    showLobby(lobbyState, playerId, code, false);
    localStorage.setItem('cid_' + code, playerId);
  });

  WS.on('player_joined', ({ lobbyState }) => {
    if (lobbyState) updateLobbyState(lobbyState);
  });

  WS.on('player_reconnected', ({ lobbyState }) => {
    if (lobbyState) updateLobbyState(lobbyState);
  });

  WS.on('player_disconnected', ({ lobbyState }) => {
    if (lobbyState) updateLobbyState(lobbyState);
  });

  WS.on('table_color_changed', ({ color, lobbyState }) => {
    currentTableColor = color;
    // Actualizar swatches si el host los ve
    document.querySelectorAll('.mesa-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === color);
    });
    if (lobbyState) updateLobbyState(lobbyState);
    // Guardar en sessionStorage para que game.html lo lea al cargar
    sessionStorage.setItem('tableColor', color);
  });

  WS.on('state_update', ({ event, tableColor }) => {
    if (event === 'game_started' || event === 'nueva_ronda') {
      // El host ya tiene currentTableColor; los demás lo reciben en tableColor del servidor
      const color = tableColor || currentTableColor || 'green';
      currentTableColor = color;
      sessionStorage.setItem('tableColor', color);
      if (musicAudio) sessionStorage.setItem('musicTime', musicAudio.currentTime);
      sessionStorage.setItem('musicPlaying', musicPlaying ? '1' : '0');
      window.location.href = `/game?code=${myCode}&pid=${myId}&color=${color}`;
    }
  });

  WS.on('error', ({ msg }) => toast(msg));
}

/* ================================================================
   INIT
   ================================================================ */
function escHtml (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function init () {
  loadSavedName();
  setupSocketEvents();
  WS.connect();
}

/* Exponer globales que usa el HTML */
window.setMesaColor        = setMesaColor;
window.toggleMusic         = toggleMusic;
window.setVolume           = setVolume;
window.switchTab           = switchTab;
window.setMode             = setMode;
window.chgMax              = chgMax;
window.copyCode            = copyCode;
window.crearSala           = crearSala;
window.unirse              = unirse;
window.iniciarJuego        = iniciarJuego;
window.sanitizeName        = sanitizeName;
window.sanitizeCode        = sanitizeCode;
window.openNamesModal      = openNamesModal;
window.closeNamesModal     = closeNamesModal;
window.closeNamesModalOutside = closeNamesModalOutside;
window.shuffleNames        = shuffleNames;

document.addEventListener('DOMContentLoaded', init);