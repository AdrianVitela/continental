// client/js/lobby.js - Gestión de salas y espera de jugadores

'use strict';

let maxPlayers = 4;
let gameMode = 'realtime';
let myId = null;
let myCode = null;
let isHost = false;
let playersList = [];

// Cambia entre pestañas de crear y unirse
function switchTab(t) {
    document.querySelectorAll('.tab').forEach((el, i) => 
        el.classList.toggle('active', (i === 0 && t === 'crear') || (i === 1 && t === 'unirse'))
    );
    document.getElementById('panel-crear').classList.toggle('active', t === 'crear');
    document.getElementById('panel-unirse').classList.toggle('active', t === 'unirse');
}

// Selecciona modo de juego (tiempo real / asíncrono)
function setMode(el) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    gameMode = el.dataset.mode;
}

// Ajusta número máximo de jugadores
function chgMax(d) {
    maxPlayers = Math.max(2, Math.min(5, maxPlayers + d));
    document.getElementById('max-val').textContent = maxPlayers;
}

// Copia código de sala al portapapeles
function copyCode() {
    navigator.clipboard?.writeText(myCode);
    toast('¡Código copiado!', 'green');
}

// Mensaje emergente temporal
function toast(msg, type = 'red') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = type === 'green' ? 'rgba(40,160,80,.9)' : 'rgba(180,50,50,.9)';
    t.style.display = 'block';
    
    clearTimeout(t._t);
    t._t = setTimeout(() => t.style.display = 'none', 2500);
}

// Crea una nueva sala
function crearSala() {
    const nombre = document.getElementById('crear-nombre').value.trim();
    if (!nombre) {
        toast('Ingresa tu nombre.');
        return;
    }
    WS.send({ type: 'create_room', nombre, mode: gameMode, maxPlayers });
}

// Se une a una sala existente
function unirse() {
    const nombre = document.getElementById('unirse-nombre').value.trim();
    const code = document.getElementById('unirse-code').value.trim().toUpperCase();
    
    if (!nombre) {
        toast('Ingresa tu nombre.');
        return;
    }
    if (code.length < 4) {
        toast('Ingresa el código de sala.');
        return;
    }
    WS.send({ type: 'join_room', nombre, code });
}

// Inicia la partida (solo host)
function iniciarJuego() {
    WS.send({ type: 'start_game' });
}

// Muestra la sala de espera
function showLobby(lobbyState, pid, code, host) {
    myId = pid;
    myCode = code;
    isHost = host;
    
    document.getElementById('lobby-setup').style.display = 'none';
    
    const lr = document.getElementById('lobby-room');
    lr.classList.add('show');
    document.getElementById('room-code-display').textContent = code;
    
    updateLobbyState(lobbyState);
}

// Actualiza la lista de jugadores en la sala
function updateLobbyState(lobbyState) {
    playersList = lobbyState.players;
    
    const list = document.getElementById('player-list');
    list.innerHTML = playersList.map((p, i) => `
        <div class="player-item">
            <div class="player-dot ${p.conectado ? '' : 'away'}"></div>
            <span>${p.nombre}</span>
            ${i === 0 ? '<span class="player-badge">HOST</span>' : ''}
        </div>
    `).join('');
    
    const canStart = playersList.length >= 2 && lobbyState.status === 'lobby';
    const btn = document.getElementById('btn-start');
    btn.style.display = canStart ? 'block' : 'none';
    
    const waiting = document.getElementById('waiting-msg');
    waiting.innerHTML = canStart
        ? `<span style="color:var(--gold-hi)">${playersList.length} jugadores listos</span>`
        : `Esperando jugadores<span class="dot-pulse"></span>`;
}

// Configura eventos del socket
function setupSocketEvents() {
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

    WS.on('state_update', ({ event }) => {
        if (event === 'game_started' || event === 'nueva_ronda') {
            window.location.href = `/game?code=${myCode}&pid=${myId}`;
        }
    });

    WS.on('error', ({ msg }) => toast(msg));
}

// Inicialización
function init() {
    setupSocketEvents();
    WS.connect();
}

// Exponer funciones globales
window.switchTab = switchTab;
window.setMode = setMode;
window.chgMax = chgMax;
window.copyCode = copyCode;
window.crearSala = crearSala;
window.unirse = unirse;
window.iniciarJuego = iniciarJuego;

document.addEventListener('DOMContentLoaded', init);