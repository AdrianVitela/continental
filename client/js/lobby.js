// client/js/lobby.js
'use strict';

/* ================================================================
   CONSTANTES
   ================================================================ */

const NAME_RE  = /^[A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ]+$/;
const CODE_RE  = /^[A-Z0-9]+$/;
const COOKIE_KEY  = 'continental_nombre';
const COOKIE_DAYS = 365;

/* ================================================================
   POOL DE NOMBRES PREDEFINIDOS — 120 opciones
   ================================================================ */
const NOMBRE_POOL = [
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
let maxPlayers      = 4;
let maxPlayersPesca = 4;
let gameMode        = 'realtime';
let myId            = null;
let myCode          = null;
let isHost          = false;
let playersList     = [];
let currentGame     = null; // 'continental' | 'pesca'

let _activeNameTarget = 'crear';
let _shuffleOffset    = 0;
const NAMES_PER_PAGE  = 12;

/* ================================================================
   COOKIES
   ================================================================ */
function setCookie(key, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${key}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function getCookie(key) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + key + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

function loadSavedName() {
  const saved = getCookie(COOKIE_KEY);
  if (!saved) return;
  [
    'crear-nombre', 'unirse-nombre',
    'crear-nombre-cont', 'unirse-nombre-cont',
    'crear-nombre-pesca', 'unirse-nombre-pesca'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = saved;
  });
}

function saveName(nombre) {
  if (!nombre) return;
  setCookie(COOKIE_KEY, nombre, COOKIE_DAYS);
  [
    'crear-nombre', 'unirse-nombre',
    'crear-nombre-cont', 'unirse-nombre-cont',
    'crear-nombre-pesca', 'unirse-nombre-pesca'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== nombre) el.value = nombre;
  });
}

/* ================================================================
   VALIDACIÓN / SANITIZACIÓN
   ================================================================ */
function sanitizeName(input) {
  const raw   = input.value;
  const clean = raw.replace(/[^A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ]/g, '');
  if (raw !== clean) input.value = clean;
  hideHint(input.id);
  if (clean.length >= 2) saveName(clean);
}

function sanitizeCode(input) {
  const raw   = input.value;
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw !== clean || input.value !== clean) input.value = clean;
  hideHint(input.id);
}

function showHint(id, msg) {
  const elId = id.startsWith('hint-') ? id : 'hint-' + id;
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function hideHint(id) {
  const elId = id.startsWith('hint-') ? id : 'hint-' + id;
  const el = document.getElementById(elId);
  if (el) el.classList.remove('show');
}

function validateName(value, hintId) {
  const v = value.trim();
  if (!v) { showHint(hintId, 'El nombre no puede estar vacío.'); return false; }
  if (v.length < 2) { showHint(hintId, 'Mínimo 2 caracteres.'); return false; }
  if (!NAME_RE.test(v)) { showHint(hintId, 'Solo letras y números, sin espacios ni símbolos.'); return false; }
  hideHint(hintId);
  return true;
}

function validateCode(value, hintId) {
  hintId = hintId || 'unirse-code';
  const v = value.trim().toUpperCase();
  if (!v || v.length < 4) { showHint(hintId, 'Ingresa el código de sala (4-5 caracteres).'); return false; }
  if (!CODE_RE.test(v))   { showHint(hintId, 'Solo letras y números.'); return false; }
  hideHint(hintId);
  return true;
}

/* ================================================================
   SELECTOR DE JUEGO (nuevo HTML con game-selector)
   ================================================================ */
function selectGame(game) {
  currentGame = game;
  const sel = document.getElementById('game-selector');
  if (sel) sel.style.display = 'none';
  const lobbyEl = document.getElementById(game === 'pesca' ? 'lobby-pesca' : 'lobby-continental');
  if (lobbyEl) lobbyEl.style.display = 'block';
  loadSavedName();
}

function goBack() {
  ['lobby-continental','lobby-pesca'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const sel = document.getElementById('game-selector');
  if (sel) sel.style.display = 'block';
  currentGame = null;
}

/* ================================================================
   TABS / MODO / JUGADORES
   ================================================================ */
function switchTab(t, suffix) {
  if (suffix) {
    ['crear','unirse'].forEach(tab => {
      const panel = document.getElementById(`panel-${tab}-${suffix}`);
      if (panel) panel.classList.toggle('active', tab === t);
    });
    const lobbyId = suffix === 'cont' ? 'lobby-continental' : 'lobby-pesca';
    const lobby = document.getElementById(lobbyId);
    if (lobby) {
      lobby.querySelectorAll('.tab').forEach((el, i) => {
        el.classList.toggle('active', (i === 0 && t === 'crear') || (i === 1 && t === 'unirse'));
      });
    }
  } else {
    // HTML original sin sufijos
    document.querySelectorAll('.tab').forEach((el, i) =>
      el.classList.toggle('active', (i === 0 && t === 'crear') || (i === 1 && t === 'unirse'))
    );
    ['panel-crear','panel-unirse'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id === 'panel-' + t);
    });
  }
}

function setMode(el, suffix) {
  const scope = suffix
    ? document.getElementById(suffix === 'cont' ? 'lobby-continental' : 'lobby-pesca')
    : document;
  if (scope) scope.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  gameMode = el.dataset.mode;
}

function chgMax(d, suffix) {
  if (suffix === 'pesca') {
    maxPlayersPesca = Math.max(2, Math.min(6, maxPlayersPesca + d));
    const el = document.getElementById('max-val-pesca');
    if (el) el.textContent = maxPlayersPesca;
  } else {
    maxPlayers = Math.max(2, Math.min(5, maxPlayers + d));
    const el = document.getElementById(suffix ? 'max-val-cont' : 'max-val');
    if (el) el.textContent = maxPlayers;
  }
}

/* ================================================================
   MODAL DE NOMBRES PREDEFINIDOS
   ================================================================ */
function openNamesModal(target) {
  _activeNameTarget = target;
  _shuffleOffset    = Math.floor(Math.random() * NOMBRE_POOL.length);
  renderNamesGrid();
  document.getElementById('names-modal').classList.add('show');
}

function shuffleNames() {
  _shuffleOffset = (_shuffleOffset + NAMES_PER_PAGE) % NOMBRE_POOL.length;
  renderNamesGrid();
}

function renderNamesGrid() {
  const grid = document.getElementById('names-grid');
  if (!grid) return;
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

function pickName(nombre) {
  const map = {
    'crear':        'crear-nombre',
    'unirse':       'unirse-nombre',
    'crear-cont':   'crear-nombre-cont',
    'unirse-cont':  'unirse-nombre-cont',
    'crear-pesca':  'crear-nombre-pesca',
    'unirse-pesca': 'unirse-nombre-pesca',
  };
  const inputId = map[_activeNameTarget] || _activeNameTarget;
  const input   = document.getElementById(inputId);
  if (input) { input.value = nombre; saveName(nombre); hideHint(inputId); }
  closeNamesModal();
}

function closeNamesModal() {
  document.getElementById('names-modal').classList.remove('show');
}

function closeNamesModalOutside(e) {
  if (e.target === document.getElementById('names-modal')) closeNamesModal();
}

/* ================================================================
   TOAST
   ================================================================ */
function toast(msg, type = 'red') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.background = type === 'green' ? 'rgba(40,160,80,.9)' : 'rgba(180,50,50,.9)';
  t.style.display = 'block';
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.style.display = 'none'), 2500);
}

function copyCode() {
  navigator.clipboard?.writeText(myCode);
  toast('¡Código copiado!', 'green');
}

/* ================================================================
   ACCIONES — CONTINENTAL
   ================================================================ */
function crearSala() {
  // Soportar input original y nuevo con sufijo
  const input  = document.getElementById('crear-nombre-cont') || document.getElementById('crear-nombre');
  const nombre = input?.value?.trim() || '';
  const hintId = document.getElementById('crear-nombre-cont') ? 'crear-nombre-cont' : 'crear-nombre';
  if (!validateName(nombre, hintId)) return;
  saveName(nombre);
  WS.send({ type: 'create_room', nombre, mode: gameMode, maxPlayers });
}

function unirse(suffix) {
  if (suffix === 'pesca') { _unirseAPesca(); return; }
  const hasCont = !!document.getElementById('unirse-nombre-cont');
  const nId = hasCont ? 'unirse-nombre-cont' : 'unirse-nombre';
  const cId = hasCont ? 'unirse-code-cont'   : 'unirse-code';
  const nombre = document.getElementById(nId)?.value?.trim() || '';
  const code   = document.getElementById(cId)?.value?.trim().toUpperCase() || '';
  let ok = true;
  if (!validateName(nombre, nId)) ok = false;
  if (!validateCode(code, cId))   ok = false;
  if (!ok) return;
  saveName(nombre);
  WS.send({ type: 'join_room', nombre, code });
}

function iniciarJuego(suffix) {
  WS.send({ type: suffix === 'pesca' ? 'start_pesca' : 'start_game' });
}

/* ================================================================
   ACCIONES — PESCA
   ================================================================ */
function crearSalaPesca() {
  const input  = document.getElementById('crear-nombre-pesca');
  const nombre = input?.value?.trim() || '';
  if (!validateName(nombre, 'crear-nombre-pesca')) return;
  saveName(nombre);
  WS.send({ type: 'create_pesca', nombre, maxPlayers: maxPlayersPesca });
}

function _unirseAPesca() {
  const nombre = document.getElementById('unirse-nombre-pesca')?.value?.trim() || '';
  const code   = document.getElementById('unirse-code-pesca')?.value?.trim().toUpperCase() || '';
  let ok = true;
  if (!validateName(nombre, 'unirse-nombre-pesca')) ok = false;
  if (!validateCode(code,   'unirse-code-pesca'))   ok = false;
  if (!ok) return;
  saveName(nombre);
  WS.send({ type: 'join_pesca', nombre, code });
}

/* ================================================================
   SALA DE ESPERA
   ================================================================ */
function showLobby(lobbyState, pid, code, host) {
  myId   = pid;
  myCode = code;
  isHost = host;

  if (currentGame === 'pesca') {
    // Ocultar primer card-box del lobby pesca (el formulario)
    const lobbyEl = document.getElementById('lobby-pesca');
    if (lobbyEl) {
      const boxes = lobbyEl.querySelectorAll('.card-box');
      if (boxes[0]) boxes[0].style.display = 'none';
    }
    const room = document.getElementById('lobby-room-pesca');
    if (room) room.style.display = 'flex';
    const codeEl = document.getElementById('room-code-display-pesca');
    if (codeEl) codeEl.textContent = code;
  } else if (document.getElementById('lobby-setup-cont')) {
    document.getElementById('lobby-setup-cont').style.display = 'none';
    const room = document.getElementById('lobby-room-cont');
    if (room) room.style.display = 'flex';
    const codeEl = document.getElementById('room-code-display-cont');
    if (codeEl) codeEl.textContent = code;
  } else {
    // HTML original
    const setup = document.getElementById('lobby-setup');
    if (setup) setup.style.display = 'none';
    const room = document.getElementById('lobby-room');
    if (room) room.classList.add('show');
    const codeEl = document.getElementById('room-code-display');
    if (codeEl) codeEl.textContent = code;
  }

  updateLobbyState(lobbyState);
}

function updateLobbyState(lobbyState) {
  playersList = lobbyState.players;

  let listId, msgId, btnId;
  if (currentGame === 'pesca') {
    listId = 'player-list-pesca'; msgId = 'waiting-msg-pesca'; btnId = 'btn-start-pesca';
  } else if (document.getElementById('player-list-cont')) {
    listId = 'player-list-cont';  msgId = 'waiting-msg-cont';  btnId = 'btn-start-cont';
  } else {
    listId = 'player-list';       msgId = 'waiting-msg';       btnId = 'btn-start';
  }

  const list = document.getElementById(listId);
  if (list) {
    list.innerHTML = playersList.map((p, i) => `
      <div class="player-item">
        <div class="player-dot ${p.conectado ? '' : 'away'}"></div>
        <span>${escHtml(p.nombre)}</span>
        ${i === 0 ? '<span class="player-badge">HOST</span>' : ''}
      </div>
    `).join('');
  }

  const canStart = playersList.length >= 2 && lobbyState.status === 'lobby';
  const soyHost  = playersList.length > 0 && myId && playersList[0].id === myId;
  const btn = document.getElementById(btnId);
  if (btn) btn.style.display = canStart && soyHost ? 'block' : 'none';

  const waiting = document.getElementById(msgId);
  if (waiting) {
    waiting.innerHTML = canStart
      ? `<span style="color:var(--gold-hi)">${playersList.length} jugadores listos</span>`
      : `Esperando jugadores<span class="dot-pulse"></span>`;
  }
}

/* ================================================================
   EVENTOS DEL SOCKET
   ================================================================ */
function setupSocketEvents() {
  WS.on('room_created', ({ code, playerId, lobbyState }) => {
    showLobby(lobbyState, playerId, code, true);
    try { localStorage.setItem('cid_' + code, playerId); } catch(_) {}
  });

  WS.on('room_joined', ({ code, playerId, lobbyState }) => {
    showLobby(lobbyState, playerId, code, false);
    try { localStorage.setItem('cid_' + code, playerId); } catch(_) {}
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

  WS.on('state_update', ({ event }) => {
    if (event === 'game_started' || event === 'nueva_ronda') {
      if (currentGame === 'pesca') {
        window.location.href = `/pesca?room=${myCode}&pid=${myId}`;
      } else {
        window.location.href = `/game?code=${myCode}&pid=${myId}`;
      }
    }
  });

  WS.on('error', ({ msg }) => toast(msg));
}

/* ================================================================
   HELPERS
   ================================================================ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ================================================================
   INIT
   ================================================================ */
function init() {
  loadSavedName();
  setupSocketEvents();
  WS.connect();
}

/* ================================================================
   GLOBALES
   ================================================================ */
window.switchTab              = switchTab;
window.setMode                = setMode;
window.chgMax                 = chgMax;
window.copyCode               = copyCode;
window.crearSala              = crearSala;
window.crearSalaPesca         = crearSalaPesca;
window.unirse                 = unirse;
window.iniciarJuego           = iniciarJuego;
window.sanitizeName           = sanitizeName;
window.sanitizeCode           = sanitizeCode;
window.openNamesModal         = openNamesModal;
window.closeNamesModal        = closeNamesModal;
window.closeNamesModalOutside = closeNamesModalOutside;
window.shuffleNames           = shuffleNames;
window.selectGame             = selectGame;
window.goBack                 = goBack;

document.addEventListener('DOMContentLoaded', init);