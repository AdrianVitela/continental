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

    this.addPlayer(host.id, host.nombre, host.ws, host.badge || null, host.skin || 'clasico', host.rol || 'jugador');
  }

  addPlayer(id, nombre, ws, badge = null, skin = 'clasico', rol = 'jugador') {
    if (this.players.find(p => p.id === id)) {
      const p = this.players.find(p => p.id === id);
      p.ws = ws;
      p.conectado = true;
      p.badge = badge;
      p.skin = skin;
      p.rol = rol;
      if (this.engine) {
        const enginePlayer = this.engine._findPlayer(id);
        if (enginePlayer) {
          enginePlayer.conectado = true;
          enginePlayer.badge = badge;
          enginePlayer.skin = skin;
        }
      }
      this.broadcast({ type: 'player_reconnected', nombre, lobbyState: this.lobbyState() }, id);
      if (this.engine) {
        this._broadcastState('player_connection_changed', { playerId: id, conectado: true });
      }
      return p;
    }
    const sameSocketPlayer = this.players.find(p => p.ws === ws);
    if (sameSocketPlayer) {
      return sameSocketPlayer;
    }
    if (this.players.length >= this.maxPlayers) return null;
    if (this.status !== 'lobby') return null;
    const player = { id, nombre, badge, skin, rol, ws, conectado: true };
    this.players.push(player);
    this.broadcast({ type: 'player_joined', nombre, count: this.players.length, lobbyState: this.lobbyState() }, id);
    return player;
  }

  refreshPlayerProfile(nombre, { badge = null, skin = 'clasico' } = {}) {
    let changed = false;

    this.players.forEach(player => {
      if (player.nombre !== nombre) return;
      player.badge = badge;
      player.skin = skin;
      changed = true;
    });

    if (this.host?.nombre === nombre) {
      this.host.badge = badge;
      this.host.skin = skin;
    }

    if (this.engine) {
      this.engine.jugadores.forEach(player => {
        if (player.nombre !== nombre) return;
        player.badge = badge;
        player.skin = skin;
        changed = true;
      });
    }

    if (!changed) return false;

    if (this.engine) {
      this._broadcastState('profile_updated', { nombre, badge, skin });
    } else {
      this.broadcast({ type: 'lobby_state_updated', lobbyState: this.lobbyState() });
    }
    return true;
  }

  removePlayer(id, closingWs = null) {
    const p = this.players.find(p => p.id === id);
    if (!p) return;
    if (closingWs && p.ws && p.ws !== closingWs) {
      console.log('[ROOM]', this.code, 'ignore stale close', {
        player: p.nombre,
        closingSocketId: closingWs._socketId || null,
        activeSocketId: p.ws._socketId || null,
      });
      return;
    }
    p.ws = null;
    p.conectado = false;
    if (this.engine) {
      const ej = this.engine._findPlayer(id);
      if (ej) ej.conectado = false;
    }
    this.broadcast({ type: 'player_disconnected', nombre: p.nombre, lobbyState: this.lobbyState() });
    if (this.engine) {
      this._broadcastState('player_connection_changed', { playerId: id, conectado: false });
    }
  }

  startGame() {
    if (this.status !== 'lobby') return { ok: false, error: 'Partida ya iniciada.' };
    if (this.players.length < 2) return { ok: false, error: 'Se necesitan al menos 2 jugadores.' };
    this.engine = new GameEngine(this.players.map(p => ({ id: p.id, nombre: p.nombre, badge: p.badge || null, skin: p.skin || 'clasico' })));
    this.engine.repartir();
    this.status = 'playing';
    this._startTurnTimer();
    this._save();
    return { ok: true };
  }

  handleAction(playerId, msg) {
    if (!this.engine) return { ok: false, error: 'Partida no iniciada.' };

    let result;
    const actor = this.players.find(p => p.id === playerId);

    console.log('[ROOM]', this.code, 'accion:start', {
      player: actor?.nombre || playerId,
      type: msg.type,
      estado: this.engine.estado,
      turno: this.engine.turno,
      turnoJugador: this.engine.jActivo?.nombre || null,
      castigo_idx: this.engine.castigo_idx,
      data: msg.type === 'castigo' ? { acepta: msg.acepta } : undefined,
    });

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

    if (!result || !result.ok) {
      console.warn('[ROOM]', this.code, 'accion:error', {
        player: actor?.nombre || playerId,
        type: msg.type,
        estado: this.engine.estado,
        turno: this.engine.turno,
        turnoJugador: this.engine.jActivo?.nombre || null,
        castigo_idx: this.engine.castigo_idx,
        error: result?.error || 'Sin resultado.',
      });
      return result || { ok: false, error: 'Sin resultado.' };
    }

    console.log('[ROOM]', this.code, 'accion:ok', {
      player: actor?.nombre || playerId,
      type: msg.type,
      event: result.event,
      estado: this.engine.estado,
      turno: this.engine.turno,
      turnoJugador: this.engine.jActivo?.nombre || null,
      castigo_idx: this.engine.castigo_idx,
    });

    this._resetTurnTimer();
    this._save();

    if (this.engine._pendingReinicio) {
      this.engine._pendingReinicio = false;
      this._broadcastState('nueva_ronda', { ronda: this.engine.ronda, reinicio: true });
      return result;
    }

    if (result.broadcast !== false) {
      this._broadcastState(result.event, result.data);
    } else {
      const p = this.players.find(p => p.id === playerId);
      this._send(p, {
        type: 'state_update',
        event: result.event,
        state: this.engine.stateFor(playerId, { includeLog: p?.rol === 'owner' })
      });
    }

    return result;
  }

  _handleAckFinRonda(playerId) {
    this.readyAcks.add(playerId);
    const connectedPlayers = this.players.filter(p => p.conectado);
    const connected = connectedPlayers.map(p => p.id);
    if (connected.every(id => this.readyAcks.has(id))) {
      this.readyAcks.clear();
      const result = this.engine.finalizarRonda();
      this._resetTurnTimer();
      this._save();
      this._broadcastState(result.event, result.data);
    } else {
      const readyPlayerIds = connected.filter(id => this.readyAcks.has(id));
      this._broadcastState('esperando_siguiente_ronda', {
        readyCount: readyPlayerIds.length,
        totalCount: connected.length,
        readyPlayerIds,
        waitingNames: connectedPlayers
          .filter(p => !this.readyAcks.has(p.id))
          .map(p => p.nombre),
      });
    }
    return { ok: true };
  }

  _broadcastState(event, data = {}) {
    this.players.forEach(p => {
      if (!p.ws || !p.conectado) return;
      const state = this.engine ? this.engine.stateFor(p.id, { includeLog: p.rol === 'owner' }) : null;
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

  forceClose(reason = 'Mesa cerrada por administración.') {
    this.players.forEach(player => {
      if (!player.ws) return;
      this._send(player, { type: 'room_closed', code: this.code, msg: reason });
      try {
        if (player.ws.readyState === 1 || player.ws.readyState === 0) {
          player.ws.close(4001, reason.slice(0, 120));
        }
      } catch (_) {}
      player.ws = null;
      player.conectado = false;
    });

    if (this.engine) {
      this.engine.jugadores.forEach(player => {
        player.conectado = false;
      });
    }

    this._clearTurnTimer();
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
      players: this.players.map(({ id, nombre, badge, skin, rol }) => ({ id, nombre, badge: badge || null, skin: skin || 'clasico', rol: rol || 'jugador' })),
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
      players: this.players.map(p => ({ id: p.id, nombre: p.nombre, badge: p.badge || null, skin: p.skin || 'clasico', conectado: p.conectado })),
      maxPlayers: this.maxPlayers,
      tableColor: this.tableColor || 'green',
    };
  }
}

module.exports = { GameRoom };