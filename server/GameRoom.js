'use strict';
const { GameEngine } = require('./GameEngine');
const { randomUUID } = require('crypto');
const fs   = require('fs');
const path = require('path');

const SAVE_DIR = path.join(__dirname, '../saves');
if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });

const ROOM_TIMEOUT_MS  = 6 * 60 * 60 * 1000;
const TURN_TIMEOUT_MS  = 5 * 60 * 1000;

class GameRoom {
  constructor({ code, host, mode = 'realtime', maxPlayers = 5 }) {
    this.code       = code;
    this.mode       = mode;
    this.maxPlayers = maxPlayers;
    this.status     = 'lobby';
    this.players    = [];
    this.readyAcks  = new Set();
    this.engine     = null;
    this.createdAt  = Date.now();
    this.host       = host;
    this._turnTimer = null;

    this.addPlayer(host.id, host.nombre, host.ws, host.badge || null);
  }

  addPlayer(id, nombre, ws, badge = null) {
    if (this.players.find(p => p.id === id)) {
      const p = this.players.find(p => p.id === id);
      p.ws = ws;
      p.conectado = true;
      if (this.engine) this.engine._findPlayer(id).conectado = true;
      this.broadcast({ type: 'player_reconnected', nombre }, id);
      return p;
    }
    if (this.players.length >= this.maxPlayers) return null;
    if (this.status !== 'lobby') return null;
    const player = { id, nombre, badge, ws, conectado: true };
    this.players.push(player);
    this.broadcast({ type: 'player_joined', nombre, count: this.players.length, lobbyState: this.lobbyState() }, id);
    return player;
  }

  removePlayer(id) {
    const p = this.players.find(p => p.id === id);
    if (!p) return;
    p.ws = null;
    p.conectado = false;
    if (this.engine) {
      const ej = this.engine._findPlayer(id);
      if (ej) ej.conectado = false;
    }
    this.broadcast({ type: 'player_disconnected', nombre: p.nombre });
  }

  startGame() {
    if (this.status !== 'lobby') return { ok: false, error: 'Partida ya iniciada.' };
    if (this.players.length < 2) return { ok: false, error: 'Se necesitan al menos 2 jugadores.' };
    this.engine = new GameEngine(this.players.map(p => ({ id: p.id, nombre: p.nombre, badge: p.badge || null })));
    this.engine.repartir();
    this.status = 'playing';
    this._startTurnTimer();
    this._save();
    return { ok: true };
  }

  handleAction(playerId, msg) {
    if (!this.engine) return { ok: false, error: 'Partida no iniciada.' };

    let result;

    try {
      switch (msg.type) {
        case 'tomar_fondo':
          result = this.engine.acTomarFondo(playerId);
          break;
        case 'tomar_mazo':
          result = this.engine.acTomarMazo(playerId);
          break;
        case 'castigo':
          result = this.engine.acCastigo(playerId, msg.acepta);
          break;
        case 'bajar':
          result = this.engine.acBajar(playerId, msg.jugadas);
          break;
        case 'pagar':
          result = this.engine.acPagar(playerId, msg.cartaId);
          break;
        case 'acomodar':
          result = this.engine.acAcomodar(
            playerId,
            msg.cartaId,
            msg.destJugadorIdx,
            msg.destJugadaIdx,
            msg.posicion || null
          );
          break;
        case 'reordenar':
          result = this.engine.acReordenarMano(playerId, msg.order);
          break;
        case 'intercambiar_comodin':
          result = this.engine.acIntercambiarComodin(
            playerId,
            msg.cartaId,
            msg.origenJugadorIdx,
            msg.origenJugadaIdx,
            msg.jugadasEnSlots
          );
          break;
        case 'ack_fin_ronda':
          return this._handleAckFinRonda(playerId);
        default:
          return { ok: false, error: `Acción desconocida: ${msg.type}` };
      }
    } catch (err) {
      // Capturar cualquier excepción inesperada del engine para que no
      // derribe el servidor ni desconecte al jugador
      console.error('[GameRoom] Error en handleAction', msg.type, err);
      return { ok: false, error: 'Error interno procesando la acción.' };
    }

    if (!result || !result.ok) return result || { ok: false, error: 'Sin resultado.' };

    this._resetTurnTimer();
    this._save();

    if (result.broadcast !== false) {
      this._broadcastState(result.event, result.data);
    } else {
      const p = this.players.find(p => p.id === playerId);
      this._send(p, { type: 'state_update', event: result.event, state: this.engine.stateFor(playerId) });
    }

    // Si el engine marcó un reinicio de ronda pendiente (mazo agotado dos veces),
    // broadcastearlo como nueva ronda
    if (this.engine._pendingReinicio) {
      this.engine._pendingReinicio = false;
      this._broadcastState('nueva_ronda', { ronda: this.engine.ronda, reinicio: true });
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

  _broadcastState(event, data = {}) {
    this.players.forEach(p => {
      if (!p.ws || !p.conectado) return;
      const state = this.engine ? this.engine.stateFor(p.id) : null;
      this._send(p, { type: 'state_update', event, data, state, tableColor: this.tableColor || 'green' });
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
      if (player && player.ws && player.ws.readyState === 1)
        player.ws.send(JSON.stringify(msg));
    } catch (_) {}
  }

  sendToPlayer(playerId, msg) {
    const p = this.players.find(p => p.id === playerId);
    if (p) this._send(p, msg);
  }

  _startTurnTimer() {
    if (this.mode !== 'async') return;
    this._clearTurnTimer();
    this._turnTimer = setTimeout(() => this._onTurnTimeout(), TURN_TIMEOUT_MS);
  }

  _resetTurnTimer() {
    this._clearTurnTimer();
    this._startTurnTimer();
  }

  _clearTurnTimer() {
    if (this._turnTimer) {
      clearTimeout(this._turnTimer);
      this._turnTimer = null;
    }
  }

  _onTurnTimeout() {
    if (!this.engine || this.engine.estado === 'fin_juego') return;
    const j = this.engine.jActivo;
    if (j.mano.length > 0) {
      this.engine.acPagar(j.id, j.mano[0].id);
      this._broadcastState('timeout_auto_pago', { jugadorIdx: this.engine.turno });
      this._save();
    }
  }

  _save() {
    if (this.mode !== 'async') return;
    const data = {
      code: this.code,
      mode: this.mode,
      status: this.status,
      players: this.players.map(({ id, nombre, badge }) => ({ id, nombre, badge: badge || null })),
      engineState: this.engine ? JSON.stringify(this.engine) : null,
      savedAt: Date.now(),
    };
    try {
      fs.writeFileSync(path.join(SAVE_DIR, `${this.code}.json`), JSON.stringify(data));
    } catch (_) {}
  }

  isExpired() { return Date.now() - this.createdAt > ROOM_TIMEOUT_MS; }
  isEmpty()   { return this.players.every(p => !p.conectado); }

  setTableColor(color) {
    const valid = ['green', 'navy', 'wine', 'black'];
    if (!valid.includes(color)) return;
    this.tableColor = color;
  }

  lobbyState() {
    return {
      code: this.code,
      mode: this.mode,
      status: this.status,
      players: this.players.map(p => ({ id: p.id, nombre: p.nombre, badge: p.badge || null, conectado: p.conectado })),
      maxPlayers: this.maxPlayers,
      tableColor: this.tableColor || 'green',
    };
  }
}

module.exports = { GameRoom };