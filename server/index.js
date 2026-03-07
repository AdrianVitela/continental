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
app.get('/', (_, res) => res.sendFile(path.join(__dirname, '../client/index.html')));
app.get('/game', (_, res) => res.sendFile(path.join(__dirname, '../client/game.html')));

// ── Room registry ──────────────────────────────
const rooms = new Map();   // code -> GameRoom
const clients = new Map(); // ws -> { playerId, roomCode, nombre }

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// Cleanup expired rooms every 30min
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

      // ─── Lobby actions ───────────────────────
      case 'create_room': {
        const { nombre, mode = 'realtime', maxPlayers = 5 } = msg;
        if (!nombre?.trim()) return send(ws, { type: 'error', msg: 'Nombre requerido.' });
        let code;
        do { code = genCode(); } while (rooms.has(code));
        const playerId = randomUUID();
        ctx.playerId = playerId; ctx.roomCode = code; ctx.nombre = nombre;
        const room = new GameRoom({ code, host: { id: playerId, nombre, ws }, mode, maxPlayers });
        rooms.set(code, room);
        send(ws, { type: 'room_created', code, playerId, lobbyState: room.lobbyState() });
        break;
      }

      case 'join_room': {
        const { nombre, code, playerId: existingId } = msg;
        const room = rooms.get(code?.toUpperCase());
        if (!room) return send(ws, { type: 'error', msg: 'Sala no encontrada.' });

        const playerId = existingId || randomUUID();
        ctx.playerId = playerId; ctx.roomCode = code; ctx.nombre = nombre;

        const player = room.addPlayer(playerId, nombre, ws);
        if (!player) return send(ws, { type: 'error', msg: 'Sala llena o ya iniciada.' });

        send(ws, { type: 'room_joined', code, playerId, lobbyState: room.lobbyState() });
        // Notificar a todos los demás con el lobby actualizado
        room.broadcast({ type: 'player_joined', nombre, lobbyState: room.lobbyState() }, playerId);
        // If reconnecting mid-game, send current state
        if (room.engine) {
          send(ws, { type: 'state_update', event: 'reconnect', state: room.engine.stateFor(playerId) });
        }
        break;
      }

      case 'start_game': {
        const room = rooms.get(ctx.roomCode);
        if (!room) return send(ws, { type: 'error', msg: 'Sala no encontrada.' });
        if (room.players[0]?.id !== ctx.playerId)
          return send(ws, { type: 'error', msg: 'Solo el host puede iniciar.' });
        const result = room.startGame();
        if (!result.ok) return send(ws, { type: 'error', msg: result.error });
        // Broadcast initial state to all
        room._broadcastState('game_started', {});
        break;
      }

      case 'reaction': {
        const room = rooms.get(ctx.roomCode);
        if (!room || !ctx.playerId) return;
        // Reenviar a todos los jugadores de la sala excepto al emisor
        room.broadcast({ type: 'reaction', ...msg }, ctx.playerId);
        break;
      }

      // ─── Game actions ────────────────────────
      default: {
        const room = rooms.get(ctx.roomCode);
        if (!room || !ctx.playerId) return send(ws, { type: 'error', msg: 'No estás en una sala.' });
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

function send(ws, msg) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch (_) {}
}

// ── Health check ───────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size, clients: clients.size }));

srv.listen(PORT, () => console.log(`🃏 Continental server on port ${PORT}`));
