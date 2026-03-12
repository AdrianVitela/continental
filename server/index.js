'use strict';
const express  = require('express');
const http     = require('http');
const { WebSocketServer } = require('ws');
const path     = require('path');
const { randomUUID } = require('crypto');
const { GameRoom  } = require('./GameRoom');
const { PescaRoom } = require('./PescaRoom');

const PORT = process.env.PORT || 3000;
const app  = express();
const srv  = http.createServer(app);
const wss  = new WebSocketServer({ server: srv });

app.use(express.static(path.join(__dirname, '../client')));
app.get('/',        (_, res) => res.sendFile(path.join(__dirname, '../client/index.html')));
app.get('/game',    (_, res) => res.sendFile(path.join(__dirname, '../client/game.html')));
app.get('/pesca',   (_, res) => res.sendFile(path.join(__dirname, '../client/pesca.html')));

// ── Registros separados por juego ──────────────────
const continentalRooms = new Map(); // code -> GameRoom
const pescaRooms       = new Map(); // code -> PescaRoom
const clients          = new Map(); // ws   -> { playerId, roomCode, nombre, juego }

function genCode(existingMap) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c;
    do {
        c = '';
        for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
    } while (existingMap.has(c));
    return c;
}

const NAME_RE = /^[A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ]{2,18}$/;
const CODE_RE = /^[A-Z0-9]{4,5}$/;

function validateNombre(n) {
    if (typeof n !== 'string') return 'Nombre inválido.';
    const v = n.trim();
    if (!v || v.length < 2) return 'Nombre muy corto.';
    if (v.length > 18)      return 'Nombre muy largo.';
    if (!NAME_RE.test(v))   return 'Solo letras y números.';
    return null;
}
function validateCode(c) {
    if (typeof c !== 'string') return 'Código inválido.';
    const v = c.trim().toUpperCase();
    if (!v || !CODE_RE.test(v)) return 'Código inválido (4-5 chars).';
    return null;
}

// Cleanup periódico
setInterval(() => {
    for (const [code, room] of continentalRooms)
        if (room.isExpired() || (room.isEmpty() && room.status === 'lobby')) continentalRooms.delete(code);
    for (const [code, room] of pescaRooms)
        if (room.isExpired() || (room.isEmpty() && room.status === 'lobby')) pescaRooms.delete(code);
}, 30 * 60 * 1000);

// ── WebSocket ──────────────────────────────────────
wss.on('connection', (ws) => {
    clients.set(ws, { playerId: null, roomCode: null, nombre: null, juego: null });

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        const ctx = clients.get(ws);

        try {
            switch (msg.type) {

                // ─── Crear sala Continental ──────────────
                case 'create_room': {
                    const { nombre, mode = 'realtime', maxPlayers = 5 } = msg;
                    const err = validateNombre(nombre);
                    if (err) return send(ws, { type: 'error', msg: err });
                    const safeNombre = nombre.trim();
                    const code = genCode(continentalRooms);
                    const playerId = randomUUID();
                    ctx.playerId = playerId; ctx.roomCode = code; ctx.nombre = safeNombre; ctx.juego = 'continental';
                    const room = new GameRoom({
                        code, host: { id: playerId, nombre: safeNombre, ws },
                        mode, maxPlayers: Math.min(Math.max(Number(maxPlayers) || 4, 2), 8),
                    });
                    continentalRooms.set(code, room);
                    send(ws, { type: 'room_created', code, playerId, lobbyState: room.lobbyState() });
                    break;
                }

                // ─── Unirse a sala Continental ───────────
                case 'join_room': {
                    const { nombre, code, playerId: existingId } = msg;
                    const ne = validateNombre(nombre); if (ne) return send(ws, { type: 'error', msg: ne });
                    const ce = validateCode(code);     if (ce) return send(ws, { type: 'error', msg: ce });
                    const safeCode = code.trim().toUpperCase();
                    const room = continentalRooms.get(safeCode);
                    if (!room) return send(ws, { type: 'error', msg: 'Sala no encontrada.' });
                    const playerId = existingId || randomUUID();
                    ctx.playerId = playerId; ctx.roomCode = safeCode; ctx.nombre = nombre.trim(); ctx.juego = 'continental';
                    const player = room.addPlayer(playerId, nombre.trim(), ws);
                    if (!player) return send(ws, { type: 'error', msg: 'Sala llena o ya iniciada.' });
                    send(ws, { type: 'room_joined', code: safeCode, playerId, lobbyState: room.lobbyState() });
                    room.broadcast({ type: 'player_joined', nombre: nombre.trim(), lobbyState: room.lobbyState() }, playerId);
                    if (room.engine) send(ws, { type: 'state_update', event: 'reconnect', state: room.engine.stateFor(playerId) });
                    break;
                }

                // ─── Iniciar Continental ─────────────────
                case 'start_game': {
                    const room = continentalRooms.get(ctx.roomCode);
                    if (!room) return send(ws, { type: 'error', msg: 'Sala no encontrada.' });
                    if (room.players[0]?.id !== ctx.playerId) return send(ws, { type: 'error', msg: 'Solo el host puede iniciar.' });
                    const result = room.startGame();
                    if (!result.ok) return send(ws, { type: 'error', msg: result.error });
                    room._broadcastState('game_started', {});
                    break;
                }

                // ─── Crear sala Pesca ────────────────────
                case 'create_pesca': {
                    if (!PescaRoom) return send(ws, { type: 'error', msg: 'Juego Pesca no disponible en el servidor.' });
                    const { nombre, maxPlayers = 5 } = msg;
                    const err = validateNombre(nombre);
                    if (err) return send(ws, { type: 'error', msg: err });
                    const safeNombre = nombre.trim();
                    const code = genCode(pescaRooms);
                    const playerId = randomUUID();
                    ctx.playerId = playerId; ctx.roomCode = code; ctx.nombre = safeNombre; ctx.juego = 'pesca';
                    const room = new PescaRoom({
                        code, host: { id: playerId, nombre: safeNombre, ws },
                        maxPlayers: Math.min(Math.max(Number(maxPlayers) || 4, 2), 8),
                    });
                    pescaRooms.set(code, room);
                    send(ws, { type: 'room_created', code, playerId, lobbyState: room.lobbyState() });
                    break;
                }

                // ─── Unirse a sala Pesca ─────────────────
                case 'join_pesca': {
                    if (!PescaRoom) return send(ws, { type: 'error', msg: 'Juego Pesca no disponible en el servidor.' });
                    const { nombre, code, playerId: existingId } = msg;
                    const ne = validateNombre(nombre); if (ne) return send(ws, { type: 'error', msg: ne });
                    const ce = validateCode(code);     if (ce) return send(ws, { type: 'error', msg: ce });
                    const safeCode = code.trim().toUpperCase();
                    const room = pescaRooms.get(safeCode);
                    if (!room) return send(ws, { type: 'error', msg: 'Sala no encontrada.' });
                    const playerId = existingId || randomUUID();
                    ctx.playerId = playerId; ctx.roomCode = safeCode; ctx.nombre = nombre.trim(); ctx.juego = 'pesca';
                    const player = room.addPlayer(playerId, nombre.trim(), ws);
                    if (!player) return send(ws, { type: 'error', msg: 'Sala llena o ya iniciada.' });
                    send(ws, { type: 'room_joined', code: safeCode, playerId, lobbyState: room.lobbyState() });
                    room.broadcast({ type: 'player_joined', nombre: nombre.trim(), lobbyState: room.lobbyState() }, playerId);
                    if (room.engine) send(ws, { type: 'state_update', event: 'reconnect', state: room.engine.stateFor(playerId) });
                    break;
                }

                // ─── Iniciar Pesca ───────────────────────
                case 'start_pesca': {
                    const room = pescaRooms.get(ctx.roomCode);
                    if (!room) return send(ws, { type: 'error', msg: 'Sala no encontrada.' });
                    if (room.players[0]?.id !== ctx.playerId) return send(ws, { type: 'error', msg: 'Solo el host puede iniciar.' });
                    const result = room.startGame();
                    if (!result.ok) return send(ws, { type: 'error', msg: result.error });
                    room._broadcastState('game_started', {});
                    break;
                }

                // ─── Reacciones (ambos juegos) ───────────
                case 'reaction': {
                    const map  = ctx.juego === 'pesca' ? pescaRooms : continentalRooms;
                    const room = map.get(ctx.roomCode);
                    if (!room || !ctx.playerId) return;
                    const safeMsg = {
                        type:   'reaction',
                        tipo:   ['emoji', 'msg', 'golpe'].includes(msg.tipo) ? msg.tipo : 'msg',
                        texto:  String(msg.texto  || '').slice(0, 60),
                        nombre: String(msg.nombre || ctx.nombre || '').slice(0, 18),
                    };
                    room.broadcast(safeMsg, ctx.playerId);
                    break;
                }

                // ─── Acciones de juego ───────────────────
                default: {
                    const map  = ctx.juego === 'pesca' ? pescaRooms : continentalRooms;
                    const room = map.get(ctx.roomCode);
                    if (!room || !ctx.playerId) return send(ws, { type: 'error', msg: 'No estás en una sala.' });
                    const result = room.handleAction(ctx.playerId, msg);
                    if (result && !result.ok) send(ws, { type: 'error', msg: result.error });
                    break;
                }
            }
        } catch (err) {
            console.error('[index] Excepción no capturada, tipo:', msg?.type, err);
            try { send(ws, { type: 'error', msg: 'Error interno del servidor.' }); } catch (_) {}
        }
    });

    ws.on('close', () => {
        const ctx = clients.get(ws);
        if (ctx?.roomCode) {
            const map  = ctx.juego === 'pesca' ? pescaRooms : continentalRooms;
            const room = map.get(ctx.roomCode);
            if (room) room.removePlayer(ctx.playerId);
        }
        clients.delete(ws);
    });

    ws.on('error', (err) => { console.error('[WS] error:', err.message); ws.terminate(); });
});

function send(ws, msg) {
    try { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch (_) {}
}

app.get('/health', (_, res) => res.json({
    ok: true,
    continental: continentalRooms.size,
    pesca: pescaRooms.size,
    clients: clients.size
}));

srv.listen(PORT, () => console.log(`🃏 Continental+Pesca server on port ${PORT}`));