'use strict';
const { GameEngine } = require('./GameEngine');
const { randomUUID } = require('crypto');
const fs   = require('fs');
const path = require('path');

const SAVE_DIR = path.join(__dirname, '../saves');
if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });

const ROOM_TIMEOUT_MS  = 6 * 60 * 60 * 1000; // 6h async room TTL
const TURN_TIMEOUT_MS  = 5 * 60 * 1000;       // 5min turn timeout (async)

class GameRoom {
  constructor({ code, host, mode = 'realtime', maxPlayers = 5 }) {
    this.code       = code;
    this.mode       = mode;       // 'realtime' | 'async'
    this.maxPlayers = maxPlayers;
    this.status     = 'lobby';    // lobby | playing | finished
    this.players    = [];         // [{id, nombre, ws}]
    this.readyAcks  = new Set();  // for fin_ronda acknowledgement
    this.engine     = null;
    this.createdAt  = Date.now();
    this.host       = host;       // player id
    this._turnTimer = null;

    // Add host
    this.addPlayer(host.id, host.nombre, host.ws);
  }

  // ── Player management ──────────────────────────
  addPlayer(id, nombre, ws) {
    if (this.players.find(p => p.id === id)) {
      // Reconnect
      const p = this.players.find(p => p.id === id);
      p.ws = ws; p.conectado = true;
      if (this.engine) this.engine._findPlayer(id).conectado = true;
      this.broadcast({ type: 'player_reconnected', nombre }, id);
      return p;
    }
    if (this.players.length >= this.maxPlayers) return null;
    if (this.status !== 'lobby') return null;
    const player = { id, nombre, ws, conectado: true };
    this.players.push(player);
    this.broadcast({ type: 'player_joined', nombre, count: this.players.length, lobbyState: this.lobbyState() }, id);    return player;
  }

  removePlayer(id) {
    const p = this.players.find(p => p.id === id);
    if (!p) return;
    p.ws = null; p.conectado = false;
    if (this.engine) this.engine._findPlayer(id).conectado = false;
    this.broadcast({ type: 'player_disconnected', nombre: p.nombre });
  }

  // ── Game lifecycle ─────────────────────────────
  startGame() {
    if (this.status !== 'lobby') return { ok: false, error: 'Partida ya iniciada.' };
    if (this.players.length < 2) return { ok: false, error: 'Se necesitan al menos 2 jugadores.' };
    this.engine = new GameEngine(this.players.map(p => ({ id: p.id, nombre: p.nombre })));
    this.engine.repartir();
    this.status = 'playing';
    this._startTurnTimer();
    this._save();
    return { ok: true };
  }

  // ── Action dispatch ────────────────────────────
  handleAction(playerId, msg) {
    if (!this.engine) return { ok: false, error: 'Partida no iniciada.' };
    let result;

    switch (msg.type) {
      case 'tomar_fondo':   result = this.engine.acTomarFondo(playerId); break;
      case 'tomar_mazo':    result = this.engine.acTomarMazo(playerId);  break;
      case 'castigo':       result = this.engine.acCastigo(playerId, msg.acepta); break;
      case 'bajar':         result = this.engine.acBajar(playerId);      break;
      case 'pagar':         result = this.engine.acPagar(playerId, msg.cartaId); break;
      case 'acomodar':      result = this.engine.acAcomodar(playerId, msg.cartaId, msg.destJugadorIdx, msg.destJugadaIdx); break;
      case 'reordenar':     result = this.engine.acReordenarMano(playerId, msg.order); break;
      case 'ack_fin_ronda': return this._handleAckFinRonda(playerId);
      default: return { ok: false, error: `Acción desconocida: ${msg.type}` };
    }

    if (!result.ok) return result;

    this._resetTurnTimer();
    this._save();

    // Broadcast full state to all, but with private hands
    if (result.broadcast !== false) {
      this._broadcastState(result.event, result.data);
    } else {
      // Only send to the requesting player (reorder)
      const p = this.players.find(p => p.id === playerId);
      this._send(p, { type: 'state_update', event: result.event, state: this.engine.stateFor(playerId) });
    }

    return result;
  }

  _handleAckFinRonda(playerId) {
    this.readyAcks.add(playerId);
    const connected = this.players.filter(p => p.conectado).map(p => p.id);
    if (connected.every(id => this.readyAcks.has(id))) {
      this.readyAcks.clear();
      const result = this.engine.finalizarRonda();
      this._resetTurnTimer();
      this._save();
      this._broadcastState(result.event, result.data);
    }
    return { ok: true };
  }

  // ── Broadcast helpers ──────────────────────────
  _broadcastState(event, data = {}) {
    this.players.forEach(p => {
      if (!p.ws || !p.conectado) return;
      const state = this.engine ? this.engine.stateFor(p.id) : null;
      this._send(p, { type: 'state_update', event, data, state });
    });
  }

  broadcast(msg, excludeId = null) {
    this.players.forEach(p => {
      if (p.id === excludeId || !p.ws || !p.conectado) return;
      this._send(p, msg);
    });
  }

  _send(player, msg) {
    try {
      if (player.ws && player.ws.readyState === 1 /* OPEN */)
        player.ws.send(JSON.stringify(msg));
    } catch (_) {}
  }

  sendToPlayer(playerId, msg) {
    const p = this.players.find(p => p.id === playerId);
    if (p) this._send(p, msg);
  }

  // ── Turn timer (async mode) ────────────────────
  _startTurnTimer() {
    if (this.mode !== 'async') return;
    this._clearTurnTimer();
    this._turnTimer = setTimeout(() => this._onTurnTimeout(), TURN_TIMEOUT_MS);
  }
  _resetTurnTimer() { this._clearTurnTimer(); this._startTurnTimer(); }
  _clearTurnTimer() { if (this._turnTimer) { clearTimeout(this._turnTimer); this._turnTimer = null; } }

  _onTurnTimeout() {
    if (!this.engine || this.engine.estado === 'fin_juego') return;
    const j = this.engine.jActivo;
    // Auto-pay first card
    if (j.mano.length > 0) {
      this.engine.acPagar(j.id, j.mano[0].id);
      this._broadcastState('timeout_auto_pago', { jugadorIdx: this.engine.turno });
      this._save();
    }
  }

  // ── Persistence (async mode) ──────────────────
  _save() {
    if (this.mode !== 'async') return;
    const data = {
      code: this.code,
      mode: this.mode,
      status: this.status,
      players: this.players.map(({ id, nombre }) => ({ id, nombre })),
      engineState: this.engine ? JSON.stringify(this.engine) : null,
      savedAt: Date.now(),
    };
    try { fs.writeFileSync(path.join(SAVE_DIR, `${this.code}.json`), JSON.stringify(data)); }
    catch (_) {}
  }

  isExpired() { return Date.now() - this.createdAt > ROOM_TIMEOUT_MS; }
  isEmpty()   { return this.players.every(p => !p.conectado); }

  lobbyState() {
    return {
      code: this.code, mode: this.mode, status: this.status,
      players: this.players.map(p => ({ nombre: p.nombre, conectado: p.conectado })),
      maxPlayers: this.maxPlayers,
    };
  }
}

module.exports = { GameRoom };
