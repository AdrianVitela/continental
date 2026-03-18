'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express  = require('express');
const http     = require('http');
const { WebSocketServer } = require('ws');
const path     = require('path');
const { randomUUID } = require('crypto');
const { GameRoom } = require('./GameRoom');
const pool         = require('./db');

const PORT = process.env.PORT || 3000;
const app  = express();
const srv  = http.createServer(app);
const wss  = new WebSocketServer({ server: srv });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Rutas auth, feedback y admin
const authRouter     = require('./auth');
const feedbackRouter = require('./feedback');
const adminRouter    = require('./admin');
app.use('/api', authRouter);
app.use('/api', feedbackRouter);
app.use('/api', adminRouter);

app.get('/',         (_, res) => res.sendFile(path.join(__dirname, '../client/index.html')));
app.get('/login',    (_, res) => res.sendFile(path.join(__dirname, '../client/login.html')));
app.get('/register', (_, res) => res.sendFile(path.join(__dirname, '../client/register.html')));
app.get('/game',     (_, res) => res.sendFile(path.join(__dirname, '../client/game.html')));
app.get('/admin',    (_, res) => res.sendFile(path.join(__dirname, '../client/admin.html')));

const rooms   = new Map();
const clients = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

const NAME_RE = /^[A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ]{2,18}$/;
const CODE_RE = /^[A-Z0-9]{4,5}$/;

function validateNombre(nombre) {
  if (typeof nombre !== 'string') return 'Nombre inválido.';
  const v = nombre.trim();
  if (!v)            return 'El nombre no puede estar vacío.';
  if (v.length < 2)  return 'El nombre debe tener al menos 2 caracteres.';
  if (v.length > 18) return 'El nombre no puede superar los 18 caracteres.';
  if (!NAME_RE.test(v)) return 'El nombre solo puede contener letras y números.';
  return null;
}

function validateCode(code) {
  if (typeof code !== 'string') return 'Código inválido.';
  const v = code.trim().toUpperCase();
  if (!v)               return 'El código no puede estar vacío.';
  if (!CODE_RE.test(v)) return 'El código solo puede contener letras y números (4-5 caracteres).';
  return null;
}

setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.isExpired() || (room.isEmpty() && room.status === 'lobby'))
      rooms.delete(code);
  }
}, 30 * 60 * 1000);

wss.on('connection', (ws) => {
  clients.set(ws, { playerId: null, roomCode: null, nombre: null });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const ctx = clients.get(ws);

    try {
      switch (msg.type) {

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

          let hostBadge = null;
          try {
            const query = msg.userId
              ? 'SELECT badge FROM usuarios WHERE id = $1'
              : 'SELECT badge FROM usuarios WHERE nombre = $1';
            const param = msg.userId || safeNombre;
            const r = await pool.query(query, [param]);
            hostBadge = r.rows[0]?.badge || null;
          } catch (_) {}

          const room = new GameRoom({
            code,
            host: { id: playerId, nombre: safeNombre, badge: hostBadge, ws },
            mode,
            maxPlayers: Math.min(Math.max(Number(maxPlayers) || 4, 2), 5),
          });
          rooms.set(code, room);
          send(ws, { type: 'room_created', code, playerId, lobbyState: room.lobbyState() });
          break;
        }

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

          let joinBadge = null;
          try {
            const query = msg.userId
              ? 'SELECT badge FROM usuarios WHERE id = $1'
              : 'SELECT badge FROM usuarios WHERE nombre = $1';
            const param = msg.userId || safeNombre;
            const r = await pool.query(query, [param]);
            joinBadge = r.rows[0]?.badge || null;
          } catch (_) {}

          const player = room.addPlayer(playerId, safeNombre, ws, joinBadge);
          if (!player) return send(ws, { type: 'error', msg: 'Sala llena o ya iniciada.' });

          send(ws, { type: 'room_joined', code: safeCode, playerId, lobbyState: room.lobbyState() });
          room.broadcast({ type: 'player_joined', nombre: safeNombre, lobbyState: room.lobbyState() }, playerId);

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
          room._broadcastState('game_started', {});
          break;
        }

        case 'reaction': {
          const room = rooms.get(ctx.roomCode);
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

        case 'set_table_color': {
          const room = rooms.get(ctx.roomCode);
          if (!room || !ctx.playerId) return;
          if (room.players[0]?.id !== ctx.playerId) return;
          const validColors = ['green', 'navy', 'wine', 'black'];
          const color = validColors.includes(msg.color) ? msg.color : 'green';
          room.setTableColor(color);
          room.broadcast({ type: 'table_color_changed', color, lobbyState: room.lobbyState() });
          break;
        }

        default: {
          const room = rooms.get(ctx.roomCode);
          if (!room || !ctx.playerId)
            return send(ws, { type: 'error', msg: 'No estás en una sala.' });

          const result = room.handleAction(ctx.playerId, msg);
          if (result && !result.ok) send(ws, { type: 'error', msg: result.error });
          break;
        }

      }
    } catch (err) {
      console.error('[index] Excepción no capturada en ws.message, tipo:', msg?.type, err);
      try { send(ws, { type: 'error', msg: 'Error interno del servidor.' }); } catch (_) {}
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

  ws.on('error', (err) => {
    console.error('[WS] error en socket:', err.message);
    ws.terminate();
  });
});

function send(ws, msg) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch (_) {}
}

app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size, clients: clients.size }));

srv.listen(PORT, () => console.log(`🃏 Continental server on port ${PORT}`));