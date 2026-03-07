'use strict';
const express  = require('express');
const http     = require('http');
const { WebSocketServer } = require('ws');
const path     = require('path');
const { randomUUID } = require('crypto');
const { GameRoom } = require('./GameRoom');

const PORT = process.env.PORT || 3000;
const app  = express();
const srv  = http.createServer(app);
const wss  = new WebSocketServer({ server: srv });

// ── Static files ───────────────────────────────
app.use(express.static(path.join(__dirname, '../client')));
app.get('/',     (_, res) => res.sendFile(path.join(__dirname, '../client/index.html')));
app.get('/game', (_, res) => res.sendFile(path.join(__dirname, '../client/game.html')));

// ── Room registry ──────────────────────────────
const rooms   = new Map();   // code -> GameRoom
const clients = new Map();   // ws   -> { playerId, roomCode, nombre }

/**
 * Generador de código de sala (5 chars, sin caracteres ambiguos).
 * Sólo letras y números que no se confunden visualmente.
 */
function genCode () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// ── Validación de inputs ───────────────────────

/** Letras (con acentos/ñ) y números. Sin espacios ni símbolos. */
const NAME_RE = /^[A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ]{2,18}$/;

/** Código de sala: letras mayúsculas A-Z y dígitos 0-9 solamente. */
const CODE_RE = /^[A-Z0-9]{4,5}$/;

function validateNombre (nombre) {
  if (typeof nombre !== 'string') return 'Nombre inválido.';
  const v = nombre.trim();
  if (!v)            return 'El nombre no puede estar vacío.';
  if (v.length < 2)  return 'El nombre debe tener al menos 2 caracteres.';
  if (v.length > 18) return 'El nombre no puede superar los 18 caracteres.';
  if (!NAME_RE.test(v)) return 'El nombre solo puede contener letras y números.';
  return null; // ok
}

function validateCode (code) {
  if (typeof code !== 'string') return 'Código inválido.';
  const v = code.trim().toUpperCase();
  if (!v)            return 'El código no puede estar vacío.';
  if (!CODE_RE.test(v)) return 'El código solo puede contener letras y números (4-5 caracteres).';
  return null; // ok
}

// ── Cleanup ────────────────────────────────────
setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.isExpired() || (room.isEmpty() && room.status === 'lobby'))
      rooms.delete(code);
  }
}, 30 * 60 * 1000);

// ── WebSocket handler ──────────────────────────
wss.on('connection', (ws) => {
  clients.set(ws, { playerId: null, roomCode: null, nombre: null });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const ctx = clients.get(ws);

    switch (msg.type) {

      // ─── Crear sala ──────────────────────────
      case 'create_room': {
        const { nombre, mode = 'realtime', maxPlayers = 5 } = msg;

        const nameErr = validateNombre(nombre);
        if (nameErr) return send(ws, { type: 'error', msg: nameErr });

        const safeNombre = nombre.trim();
        let code;
        do { code = genCode(); } while (rooms.has(code));

        const playerId = randomUUID();
        ctx.playerId = playerId;
        ctx.roomCode = code;
        ctx.nombre   = safeNombre;

        const room = new GameRoom({
          code,
          host: { id: playerId, nombre: safeNombre, ws },
          mode,
          maxPlayers: Math.min(Math.max(Number(maxPlayers) || 4, 2), 5),
        });
        rooms.set(code, room);

        send(ws, { type: 'room_created', code, playerId, lobbyState: room.lobbyState() });
        break;
      }

      // ─── Unirse a sala ───────────────────────
      case 'join_room': {
        const { nombre, code, playerId: existingId } = msg;

        const nameErr = validateNombre(nombre);
        if (nameErr) return send(ws, { type: 'error', msg: nameErr });

        const codeErr = validateCode(code);
        if (codeErr) return send(ws, { type: 'error', msg: codeErr });

        const safeCode   = code.trim().toUpperCase();
        const safeNombre = nombre.trim();

        const room = rooms.get(safeCode);
        if (!room) return send(ws, { type: 'error', msg: 'Sala no encontrada.' });

        const playerId = existingId || randomUUID();
        ctx.playerId = playerId;
        ctx.roomCode = safeCode;
        ctx.nombre   = safeNombre;

        const player = room.addPlayer(playerId, safeNombre, ws);
        if (!player) return send(ws, { type: 'error', msg: 'Sala llena o ya iniciada.' });

        send(ws, { type: 'room_joined', code: safeCode, playerId, lobbyState: room.lobbyState() });
        room.broadcast({ type: 'player_joined', nombre: safeNombre, lobbyState: room.lobbyState() }, playerId);

        // Si reconecta a partida en curso, enviar estado actual
        if (room.engine) {
          send(ws, { type: 'state_update', event: 'reconnect', state: room.engine.stateFor(playerId) });
        }
        break;
      }

      // ─── Iniciar juego ───────────────────────
      case 'start_game': {
        const room = rooms.get(ctx.roomCode);
        if (!room) return send(ws, { type: 'error', msg: 'Sala no encontrada.' });
        if (room.players[0]?.id !== ctx.playerId)
          return send(ws, { type: 'error', msg: 'Solo el host puede iniciar.' });

        const result = room.startGame();
        if (!result.ok) return send(ws, { type: 'error', msg: result.error });

        room._broadcastState('game_started', {});
        break;
      }

      // ─── Reacciones de chat ──────────────────
      case 'reaction': {
        const room = rooms.get(ctx.roomCode);
        if (!room || !ctx.playerId) return;

        // Sanitizar el texto de la reacción antes de reenviar
        const safeMsg = {
          type:   'reaction',
          tipo:   ['emoji', 'msg', 'golpe'].includes(msg.tipo) ? msg.tipo : 'msg',
          texto:  String(msg.texto  || '').slice(0, 60),   // max 60 chars
          nombre: String(msg.nombre || ctx.nombre || '').slice(0, 18),
        };

        room.broadcast(safeMsg, ctx.playerId);
        break;
      }

      // ─── Acciones de juego ───────────────────
      default: {
        const room = rooms.get(ctx.roomCode);
        if (!room || !ctx.playerId)
          return send(ws, { type: 'error', msg: 'No estás en una sala.' });

        const result = room.handleAction(ctx.playerId, msg);
        if (!result.ok) send(ws, { type: 'error', msg: result.error });
        break;
      }
    }
  });

  ws.on('close', () => {
    const ctx = clients.get(ws);
    if (ctx?.roomCode) {
      const room = rooms.get(ctx.roomCode);
      if (room) room.removePlayer(ctx.playerId);
    }
    clients.delete(ws);
  });

  ws.on('error', () => ws.terminate());
});

// ── Helpers ────────────────────────────────────
function send (ws, msg) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch (_) {}
}

// ── Health check ───────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size, clients: clients.size }));

srv.listen(PORT, () => console.log(`🃏 Continental server on port ${PORT}`));