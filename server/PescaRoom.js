'use strict';
const { PescaEngine } = require('./PescaEngine');
const { randomUUID }  = require('crypto');

const RESPUESTA_TIMEOUT_MS = 5000; // 5 segundos para responder

class PescaRoom {
    constructor({ code, host, maxPlayers = 5 }) {
        this.code       = code;
        this.maxPlayers = maxPlayers;
        this.status     = 'lobby';
        this.players    = []; // [{ id, nombre, ws, conectado }]
        this.engine     = null;
        this.createdAt  = Date.now();
        this.host       = host;
        this._respTimer = null;

        this.addPlayer(host.id, host.nombre, host.ws);
    }

    addPlayer(id, nombre, ws) {
        const existing = this.players.find(p => p.id === id);
        if (existing) {
            existing.ws = ws;
            existing.conectado = true;
            if (this.engine) {
                const ej = this.engine._findPlayer(id);
                if (ej) ej.conectado = true;
            }
            this.broadcast({ type: 'player_reconnected', nombre }, id);
            return existing;
        }
        if (this.players.length >= this.maxPlayers) return null;
        if (this.status !== 'lobby') return null;
        const player = { id, nombre, ws, conectado: true };
        this.players.push(player);
        this.broadcast({ type: 'player_joined', nombre, lobbyState: this.lobbyState() }, id);
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
        this.engine = new PescaEngine(this.players.map(p => ({ id: p.id, nombre: p.nombre })));
        this.engine.repartir();
        this.status = 'playing';
        return { ok: true };
    }

    handleAction(playerId, msg) {
        if (!this.engine) return { ok: false, error: 'Partida no iniciada.' };

        let result;
        try {
            switch (msg.type) {
                case 'pedir':
                    result = this.engine.acPedir(playerId, msg.aIdx, msg.valor);
                    if (result.ok) this._startRespTimer();
                    break;
                case 'responder':
                    // El jugador al que le pidieron confirma manualmente (antes del timer)
                    this._clearRespTimer();
                    result = this.engine.acResponder();
                    break;
                default:
                    return { ok: false, error: `Acción desconocida: ${msg.type}` };
            }
        } catch (err) {
            console.error('[PescaRoom] Error en handleAction', msg.type, err);
            return { ok: false, error: 'Error interno procesando la acción.' };
        }

        if (!result || !result.ok) return result || { ok: false, error: 'Sin resultado.' };

        this._broadcastState(result.event, result.data);
        return result;
    }

    // Timer de 5 segundos — si no responde manualmente, se resuelve automático
    _startRespTimer() {
        this._clearRespTimer();
        this._respTimer = setTimeout(() => {
            if (this.engine?.estado === 'esperando_respuesta') {
                const result = this.engine.acResponder();
                if (result?.ok) this._broadcastState(result.event, result.data);
            }
        }, RESPUESTA_TIMEOUT_MS);
    }

    _clearRespTimer() {
        if (this._respTimer) { clearTimeout(this._respTimer); this._respTimer = null; }
    }

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
            if (player?.ws?.readyState === 1) player.ws.send(JSON.stringify(msg));
        } catch (_) {}
    }

    sendToPlayer(playerId, msg) {
        const p = this.players.find(p => p.id === playerId);
        if (p) this._send(p, msg);
    }

    isExpired() { return Date.now() - this.createdAt > 6 * 60 * 60 * 1000; }
    isEmpty()   { return this.players.every(p => !p.conectado); }

    lobbyState() {
        return {
            code: this.code,
            status: this.status,
            players: this.players.map(p => ({ id: p.id, nombre: p.nombre, conectado: p.conectado })),
            maxPlayers: this.maxPlayers,
        };
    }
}

module.exports = { PescaRoom };