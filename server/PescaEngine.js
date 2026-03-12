'use strict';

// ═══════════════════════════════════════════════════
// PESCA — Game Engine
// Variante de Go Fish: grupos de 4 cartas iguales.
// Jokers son cartas normales (hay 4 en 2 mazos).
// ═══════════════════════════════════════════════════

const PALOS  = ['♠', '♥', '♦', '♣'];
const VALORES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

let _uid = 1;
const mkCard = (valor, palo = null) => ({ id: _uid++, valor, palo });

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function mkMazo(numJugadores = 2) {
    const barajas = numJugadores >= 7 ? 3 : 2;
    const m = [];
    for (let b = 0; b < barajas; b++) {
        for (const p of PALOS) {
            for (const v of VALORES) m.push(mkCard(v, p));
        }
        // Jokers: 2 por baraja, cada uno como carta normal
        m.push(mkCard('JOKER', '★'));
        m.push(mkCard('JOKER', '★'));
    }
    return shuffle(m);
}

// ═══════════════════════════════════════════════════
class PescaEngine {
    constructor(jugadores) {
        this.jugadores = jugadores.map(({ id, nombre }) => ({
            id, nombre,
            mano: [],
            jugadas: [],      // grupos de 4 bajados
            activo: true,     // false cuando se quedan sin cartas Y sin poder pedir
            conectado: true,
            terminadoEn: null // timestamp cuando se quedó sin cartas
        }));
        this.mazo   = [];
        this.turno  = 0;      // índice del jugador activo
        this.estado = 'esperando_inicio';
        this.log    = [];
        this.lastAction = Date.now();
        // Cuando un jugador pide una carta, guardamos la petición activa
        // para el timer de 5 segundos de respuesta.
        this.peticionActiva = null; // { dePidx, aIdx, valor }
    }

    get jActivo() { return this.jugadores[this.turno]; }

    addLog(m) {
        this.log.push({ msg: m, ts: Date.now() });
        if (this.log.length > 30) this.log.shift();
    }

    // ─────────────────────────────────────────────
    // Repartir 5 cartas a cada jugador e iniciar
    // ─────────────────────────────────────────────
    repartir() {
        this.mazo = mkMazo(this.jugadores.length);
        this.jugadores.forEach(j => {
            j.mano = [];
            j.jugadas = [];
            j.activo = true;
            j.terminadoEn = null;
        });
        // Repartir 5 cartas a cada jugador
        for (let i = 0; i < 5; i++) {
            this.jugadores.forEach(j => { if (this.mazo.length) j.mano.push(this.mazo.pop()); });
        }
        // Bajar grupos iniciales si alguien ya tiene 4 iguales
        this.jugadores.forEach((j, idx) => this._bajarGruposAuto(idx));

        this.turno  = 0;
        this.estado = 'esperando_peticion';
        this.peticionActiva = null;
        this.addLog('🎣 ¡Comienza Pesca! Turno de ' + this.jActivo.nombre);
    }

    // ─────────────────────────────────────────────
    // acPedir: el jugador activo pide una carta a otro
    // { dePidx: idx del que pide, aIdx: idx al que pide, valor }
    // ─────────────────────────────────────────────
    acPedir(playerId, aIdx, valor) {
        const j = this._findPlayer(playerId);
        if (!j) return this._err('Jugador no encontrado.');
        const pidx = this.jugadores.indexOf(j);
        if (pidx !== this.turno) return this._err('No es tu turno.');
        if (this.estado !== 'esperando_peticion') return this._err('No es momento de pedir.');
        if (aIdx === pidx) return this._err('No puedes pedirte a ti mismo.');
        const destJ = this.jugadores[aIdx];
        if (!destJ || !destJ.activo) return this._err('Jugador no disponible.');

        // El que pide debe tener al menos una carta del valor pedido
        if (!j.mano.some(c => c.valor === valor)) {
            return this._err('Debes tener al menos una carta del valor que pides.');
        }

        this.peticionActiva = { pidx, aIdx, valor, ts: Date.now() };
        this.estado = 'esperando_respuesta';
        this.addLog(`🙋 ${j.nombre} le pregunta a ${destJ.nombre}: ¿Tienes un ${valor}?`);
        this.lastAction = Date.now();

        return this._ok('peticion', { pidx, aIdx, valor });
    }

    // ─────────────────────────────────────────────
    // acResponder: resolver la petición activa
    // Puede llamarse por el timer (auto) o manualmente
    // ─────────────────────────────────────────────
    acResponder() {
        if (this.estado !== 'esperando_respuesta' || !this.peticionActiva) {
            return this._err('No hay petición activa.');
        }
        const { pidx, aIdx, valor } = this.peticionActiva;
        this.peticionActiva = null;

        const quePide  = this.jugadores[pidx];
        const queRecibe = this.jugadores[aIdx];

        // Buscar todas las cartas del valor pedido en la mano del que responde
        const cartasDelValor = queRecibe.mano.filter(c => c.valor === valor);

        if (cartasDelValor.length > 0) {
            // Transferir las cartas
            queRecibe.mano = queRecibe.mano.filter(c => c.valor !== valor);
            quePide.mano.push(...cartasDelValor);

            this.addLog(`✅ ${queRecibe.nombre} tenía ${cartasDelValor.length}x ${valor} → pasan a ${quePide.nombre}.`);

            // Bajar grupos si se completaron
            this._bajarGruposAuto(pidx);
            this._bajarGruposAuto(aIdx);

            // Revisar si alguien se quedó sin cartas
            this._checkSinCartas();

            // El que acertó sigue pidiendo (si aún tiene cartas y hay activos)
            const sigueActivo = quePide.activo && quePide.mano.length > 0;
            if (sigueActivo && this._hayOtrosActivos(pidx)) {
                this.estado = 'esperando_peticion';
                this.addLog(`🔄 ${quePide.nombre} acertó — sigue pidiendo.`);
            } else {
                this._avanzarTurno();
            }

            return this._ok('respuesta_si', {
                pidx, aIdx, valor,
                cartas: cartasDelValor,
                sigueTurno: pidx
            });
        } else {
            // No tenía — el que pidió roba del mazo
            this.addLog(`❌ ${queRecibe.nombre} no tenía ${valor}.`);
            let cartaRobada = null;
            let cartaEsLaBuscada = false;

            if (this.mazo.length > 0) {
                cartaRobada = this.mazo.pop();
                quePide.mano.push(cartaRobada);
                cartaEsLaBuscada = cartaRobada.valor === valor;
                this.addLog(`🎴 ${quePide.nombre} robó del mazo${cartaEsLaBuscada ? ' — ¡era la carta buscada!' : ''}.`);

                // Si sacó justo la carta que pedía, puede volver a pedir
                if (cartaEsLaBuscada) {
                    this._bajarGruposAuto(pidx);
                    this._checkSinCartas();
                    const sigueActivo = quePide.activo && quePide.mano.length > 0;
                    if (sigueActivo && this._hayOtrosActivos(pidx)) {
                        this.estado = 'esperando_peticion';
                    } else {
                        this._avanzarTurno();
                    }
                } else {
                    this._bajarGruposAuto(pidx);
                    this._checkSinCartas();
                    this._avanzarTurno();
                }
            } else {
                // Mazo vacío — avanzar turno sin robar
                this.addLog('🃏 Mazo vacío — sin carta para robar.');
                this._checkSinCartas();
                this._avanzarTurno();
            }

            return this._ok('respuesta_no', {
                pidx, aIdx, valor,
                cartaRobada: cartaEsLaBuscada ? cartaRobada : null,
                cartaOculta: !cartaEsLaBuscada && cartaRobada ? { id: cartaRobada.id } : null,
                cartaEsLaBuscada
            });
        }
    }

    // ─────────────────────────────────────────────
    // Bajar automáticamente grupos de 4 iguales
    // ─────────────────────────────────────────────
    _bajarGruposAuto(idx) {
        const j = this.jugadores[idx];
        const conteo = {};
        j.mano.forEach(c => {
            conteo[c.valor] = conteo[c.valor] || [];
            conteo[c.valor].push(c);
        });
        for (const valor in conteo) {
            if (conteo[valor].length >= 4) {
                const grupo = conteo[valor].splice(0, 4);
                j.jugadas.push({ valor, cartas: grupo });
                j.mano = j.mano.filter(c => !grupo.includes(c));
                this.addLog(`🏆 ${j.nombre} bajó 4x ${valor}!`);
            }
        }
    }

    // ─────────────────────────────────────────────
    // Revisar si alguien se quedó sin cartas
    // ─────────────────────────────────────────────
    _checkSinCartas() {
        this.jugadores.forEach(j => {
            if (j.activo && j.mano.length === 0) {
                j.activo = false;
                j.terminadoEn = j.terminadoEn || Date.now();
                this.addLog(`🚪 ${j.nombre} se quedó sin cartas.`);
            }
        });
        // Verificar fin de juego
        const activos = this.jugadores.filter(j => j.activo);
        if (activos.length <= 1) {
            if (activos.length === 1) {
                activos[0].activo = false;
                activos[0].terminadoEn = activos[0].terminadoEn || Date.now();
            }
            this._finJuego();
        }
    }

    // ─────────────────────────────────────────────
    // Avanzar al siguiente jugador activo
    // ─────────────────────────────────────────────
    _avanzarTurno() {
        if (this.estado === 'fin_juego') return;
        const n = this.jugadores.length;
        let sig = (this.turno + 1) % n;
        let intentos = 0;
        while (!this.jugadores[sig].activo && intentos < n) {
            sig = (sig + 1) % n;
            intentos++;
        }
        if (!this.jugadores[sig].activo) {
            // No hay más activos
            this._finJuego();
            return;
        }
        this.turno = sig;
        this.estado = 'esperando_peticion';
        this.addLog(`➡️ Turno de ${this.jActivo.nombre}.`);
        this.lastAction = Date.now();
    }

    _hayOtrosActivos(pidx) {
        return this.jugadores.some((j, i) => i !== pidx && j.activo);
    }

    // ─────────────────────────────────────────────
    // Fin del juego — calcular ganador
    // ─────────────────────────────────────────────
    _finJuego() {
        this.estado = 'fin_juego';
        // Ganador: más jugadas bajadas.
        // Desempate: el que terminó primero (terminadoEn menor).
        const sorted = [...this.jugadores].sort((a, b) => {
            if (b.jugadas.length !== a.jugadas.length) return b.jugadas.length - a.jugadas.length;
            const tA = a.terminadoEn || Infinity;
            const tB = b.terminadoEn || Infinity;
            return tA - tB;
        });
        const ganador = sorted[0];
        this.addLog(`🏆 ¡${ganador.nombre} gana con ${ganador.jugadas.length} jugada(s)!`);
        this.lastAction = Date.now();
    }

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────
    _findPlayer(id)  { return this.jugadores.find(j => j.id === id); }
    _err(msg)        { return { ok: false, error: msg }; }
    _ok(event, data = {}) {
        return { ok: true, event, data, state: this.publicState() };
    }

    resultados() {
        return [...this.jugadores].sort((a, b) => {
            if (b.jugadas.length !== a.jugadas.length) return b.jugadas.length - a.jugadas.length;
            const tA = a.terminadoEn || Infinity;
            const tB = b.terminadoEn || Infinity;
            return tA - tB;
        });
    }

    stateFor(playerId) {
        const base = this.publicState();
        base.jugadores = this.jugadores.map(j => {
            if (j.id === playerId) return { ...j };
            // Ocultar mano de otros, solo mostrar cantidad
            return { ...j, mano: j.mano.map(() => ({ hidden: true })) };
        });
        return base;
    }

    publicState() {
        return {
            turno:   this.turno,
            estado:  this.estado,
            mazo_count: this.mazo.length,
            peticionActiva: this.peticionActiva,
            jugadores: this.jugadores.map(j => ({
                id: j.id,
                nombre: j.nombre,
                num_cartas: j.mano.length,
                jugadas: j.jugadas,
                activo: j.activo,
                conectado: j.conectado,
                terminadoEn: j.terminadoEn,
                mano: [],
            })),
            log: this.log.slice(-8).map(l => l.msg),
            resultados: this.estado === 'fin_juego' ? this.resultados().map(j => ({
                nombre: j.nombre, jugadas: j.jugadas.length, terminadoEn: j.terminadoEn
            })) : null,
        };
    }
}

module.exports = { PescaEngine };