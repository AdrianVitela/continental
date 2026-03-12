'use strict';

// ═══════════════════════════════════════════════════
// PESCA — Game Engine
// Variante de Go Fish: grupos de 4 cartas iguales.
// Jokers son cartas NORMALES (valor 'JOKER', palo '★').
// Necesitas 4 jokers para bajar — no reemplazan nada.
// ═══════════════════════════════════════════════════

const PALOS   = ['♠', '♥', '♦', '♣'];
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
        // Jokers: 2 por baraja, carta normal (valor JOKER, palo ★)
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
            jugadas: [],        // grupos de 4 bajados manualmente
            activo: true,       // false cuando se quedan sin cartas
            conectado: true,
            terminadoEn: null,
            penalizacion: null, // { activa, turnosRestantes } — bajada en falso
        }));
        this.mazo   = [];
        this.turno  = 0;
        this.estado = 'esperando_inicio';
        this.log    = [];
        this.lastAction = Date.now();
        this.peticionActiva = null; // { pidx, aIdx, valor, ts }
    }

    get jActivo() { return this.jugadores[this.turno]; }

    addLog(m) {
        this.log.push({ msg: m, ts: Date.now() });
        if (this.log.length > 30) this.log.shift();
    }

    // ─────────────────────────────────────────────
    // Repartir 5 cartas e iniciar
    // ─────────────────────────────────────────────
    repartir() {
        this.mazo = mkMazo(this.jugadores.length);
        this.jugadores.forEach(j => {
            j.mano = [];
            j.jugadas = [];
            j.activo = true;
            j.terminadoEn = null;
            j.penalizacion = null;
        });
        for (let i = 0; i < 5; i++) {
            this.jugadores.forEach(j => { if (this.mazo.length) j.mano.push(this.mazo.pop()); });
        }
        // Bajar grupos iniciales automáticos
        this.jugadores.forEach((j, idx) => this._bajarGruposAuto(idx));

        this.turno  = 0;
        this.estado = 'esperando_peticion';
        this.peticionActiva = null;
        this.addLog('🎣 ¡Comienza Pesca! Turno de ' + this.jActivo.nombre);
    }

    // ─────────────────────────────────────────────
    // acPedir
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
    // acResponder
    // ─────────────────────────────────────────────
    acResponder() {
        if (this.estado !== 'esperando_respuesta' || !this.peticionActiva) {
            return this._err('No hay petición activa.');
        }
        const { pidx, aIdx, valor } = this.peticionActiva;
        this.peticionActiva = null;

        const quePide   = this.jugadores[pidx];
        const queRecibe = this.jugadores[aIdx];
        const cartasDelValor = queRecibe.mano.filter(c => c.valor === valor);

        if (cartasDelValor.length > 0) {
            queRecibe.mano = queRecibe.mano.filter(c => c.valor !== valor);
            quePide.mano.push(...cartasDelValor);
            this.addLog(`✅ ${queRecibe.nombre} tenía ${cartasDelValor.length}x ${valor} → pasan a ${quePide.nombre}.`);

            // Bajar grupos automáticos
            this._bajarGruposAuto(pidx);
            this._bajarGruposAuto(aIdx);
            this._checkSinCartas();

            // Descontar penalización al avanzar turno
            this._descontarPenalizacion();

            const sigueActivo = quePide.activo && quePide.mano.length > 0;
            if (sigueActivo && this._hayOtrosActivos(pidx)) {
                this.estado = 'esperando_peticion';
                this.addLog(`🔄 ${quePide.nombre} acertó — sigue pidiendo.`);
            } else {
                this._avanzarTurno();
            }

            return this._ok('respuesta_si', { pidx, aIdx, valor, cartas: cartasDelValor, sigueTurno: pidx });

        } else {
            this.addLog(`❌ ${queRecibe.nombre} no tenía ${valor}.`);
            let cartaRobada = null;
            let cartaEsLaBuscada = false;

            if (this.mazo.length > 0) {
                cartaRobada = this.mazo.pop();
                quePide.mano.push(cartaRobada);
                cartaEsLaBuscada = cartaRobada.valor === valor;
                this.addLog(`🎴 ${quePide.nombre} robó del mazo${cartaEsLaBuscada ? ' — ¡era la carta buscada!' : ''}.`);

                if (cartaEsLaBuscada) {
                    this._bajarGruposAuto(pidx);
                    this._checkSinCartas();
                    this._descontarPenalizacion();
                    const sigueActivo = quePide.activo && quePide.mano.length > 0;
                    if (sigueActivo && this._hayOtrosActivos(pidx)) {
                        this.estado = 'esperando_peticion';
                    } else {
                        this._avanzarTurno();
                    }
                } else {
                    this._bajarGruposAuto(pidx);
                    this._checkSinCartas();
                    this._descontarPenalizacion();
                    this._avanzarTurno();
                }
            } else {
                this.addLog('🃏 Mazo vacío — sin carta para robar.');
                this._checkSinCartas();
                this._descontarPenalizacion();
                this._avanzarTurno();
            }

            return this._ok('respuesta_no', {
                pidx, aIdx, valor,
                cartaRobada: cartaEsLaBuscada ? cartaRobada : null,
                cartaOculta: !cartaEsLaBuscada && cartaRobada ? { id: cartaRobada.id } : null,
                cartaEsLaBuscada,
            });
        }
    }

    // ─────────────────────────────────────────────
    // acBajar — bajar jugadas manualmente desde los slots del cliente
    //
    // slotsData: array de { cartas: [{id, valor, palo}] }
    //   Cada elemento = un slot que el usuario quiere bajar.
    //   Se ignoran los slots vacíos.
    //
    // Validación:
    //   - Cada slot debe tener exactamente 4 cartas del MISMO valor.
    //   - Joker (valor 'JOKER') solo agrupa con otros jokers.
    //   - Las cartas deben estar en la mano del jugador.
    //   - Si falla: penalización 2 turnos, mensaje de error.
    //   - Si pasa: bajar esas jugadas, quitarlas de la mano.
    // ─────────────────────────────────────────────
    acBajar(playerId, slotsData) {
        const j = this._findPlayer(playerId);
        if (!j) return this._err('Jugador no encontrado.');
        const pidx = this.jugadores.indexOf(j);
        if (pidx !== this.turno) return this._err('No es tu turno.');
        if (this.estado !== 'esperando_peticion') return this._err('No es momento de bajar.');

        if (j.penalizacion?.activa) {
            return this._err(`Penalización activa: ${j.penalizacion.turnosRestantes} turno(s) sin bajar.`);
        }

        // Filtrar slots vacíos
        const slots = (slotsData || []).filter(s => s && s.cartas && s.cartas.length > 0);
        if (slots.length === 0) return this._err('No hay jugadas para bajar.');

        // ── Validar cada slot ──
        const errores = [];
        const jugadasValidas = [];

        for (let i = 0; i < slots.length; i++) {
            const { cartas } = slots[i];

            // Verificar que las cartas estén en la mano
            for (const c of cartas) {
                if (!j.mano.some(m => m.id === c.id)) {
                    errores.push(`Carta ${c.valor}${c.palo || ''} no está en tu mano`);
                }
            }

            // Exactamente 4 cartas
            if (cartas.length !== 4) {
                errores.push(`Jugada ${i + 1}: necesitas exactamente 4 cartas (tienes ${cartas.length})`);
                continue;
            }

            // Todas del mismo valor
            const primerValor = cartas[0].valor;
            const todasIguales = cartas.every(c => c.valor === primerValor);
            if (!todasIguales) {
                const valores = [...new Set(cartas.map(c => c.valor))].join(', ');
                errores.push(`Jugada ${i + 1}: las 4 cartas deben ser del mismo valor (tienes: ${valores})`);
                continue;
            }

            jugadasValidas.push({ valor: primerValor, cartas });
        }

        // ── Si hay errores → bajada en falso ──
        if (errores.length > 0) {
            j.penalizacion = { activa: true, turnosRestantes: 2 };
            const motivo = errores.join('; ');
            this.addLog(`⚠️ ¡BAJADA EN FALSO! ${j.nombre}: ${motivo}. Penalizado 2 turnos.`);
            return this._err(`¡BAJADA EN FALSO! ${motivo}. Penalizado 2 turnos sin bajar.`);
        }

        // ── Bajar jugadas válidas ──
        const idsABajar = new Set();
        jugadasValidas.forEach(jug => jug.cartas.forEach(c => idsABajar.add(c.id)));

        // Obtener referencias reales desde la mano (no del cliente)
        const jugadasFinales = jugadasValidas.map(jug => ({
            valor: jug.valor,
            cartas: jug.cartas.map(c => j.mano.find(m => m.id === c.id)).filter(Boolean),
        }));

        jugadasFinales.forEach(jug => {
            j.jugadas.push(jug);
            this.addLog(`🏆 ${j.nombre} bajó 4x ${jug.valor}!`);
        });

        j.mano = j.mano.filter(c => !idsABajar.has(c.id));

        this._checkSinCartas();
        this.lastAction = Date.now();

        return this._ok('bajar_manual', {
            pidx,
            jugadas: jugadasFinales,
            manoRestante: j.mano.length,
        });
    }

    // ─────────────────────────────────────────────
    // Bajar automáticamente grupos de 4 iguales
    // (solo al repartir y al recibir cartas — NO durante el turno normal)
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
    // Descontar penalización al avanzar turno
    // ─────────────────────────────────────────────
    _descontarPenalizacion() {
        this.jugadores.forEach(jug => {
            if (jug.penalizacion?.activa) {
                jug.penalizacion.turnosRestantes--;
                if (jug.penalizacion.turnosRestantes <= 0) {
                    jug.penalizacion = null;
                    this.addLog(`✅ ${jug.nombre} ya puede bajar nuevamente.`);
                }
            }
        });
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
    // Fin del juego
    // ─────────────────────────────────────────────
    _finJuego() {
        this.estado = 'fin_juego';
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
                penalizacion: j.penalizacion,
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