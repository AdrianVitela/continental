'use strict';
// ═══════════════════════════════════════════════════
// CONTINENTAL — Game Engine (server-side source of truth)
// ═══════════════════════════════════════════════════

const PALOS = ['♠', '♥', '♦', '♣'];
const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const PUNTOS = {
    'A': 20, 'J': 10, 'Q': 10, 'K': 10, '10': 10, '9': 10, '8': 10,
    '2': 5, '3': 5, '4': 5, '5': 5, '6': 5, '7': 5
};

const REQ = {
  1:{t:2,c:0}, 2:{t:1,c:1}, 3:{t:0,c:2},
  4:{t:3,c:0}, 5:{t:2,c:1}, 6:{t:1,c:2}, 7:{t:0,c:3}
};

const VNUM = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13
};

let _uid = 1;

const mkCard = (valor, palo = null, comodin = false) =>
    ({ id: _uid++, valor, palo, comodin });

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ─────────────────────────────────────────────────────
// mkMazo: construye 2 barajas normalmente.
// Si hay 7 o más jugadores agrega una tercera baraja
// para que alcancen las cartas en rondas largas.
// ─────────────────────────────────────────────────────
function mkMazo(numJugadores = 2) {
    const barajas = numJugadores >= 7 ? 3 : 2;
    const m = [];
    for (let baraja = 0; baraja < barajas; baraja++) {
        for (const p of PALOS) {
            for (const v of VALORES) {
                m.push(mkCard(v, p));
            }
        }
        m.push(mkCard('JOKER', null, true));
        m.push(mkCard('JOKER', null, true));
    }
    return shuffle(m);
}

// ═══════════════════════════════════════════════════
// COMODINES
// ═══════════════════════════════════════════════════

function getValorComodinEnJugada(jugada) {
    if (!jugada) return null;
    const cartasNormales = jugada.cartas.filter(c => !c.comodin);
    if (cartasNormales.length === 0) return null;

    if (jugada.tipo === 'tercia') {
        return { valor: cartasNormales[0].valor, palo: null };
    } else {
        const valsRaw = cartasNormales.map(c => VNUM[c.valor]);
        const tieneAs = valsRaw.includes(1);
        const tieneCartasAltas = valsRaw.some(v => v >= 11);
        const useA14 = tieneAs && tieneCartasAltas && !valsRaw.includes(2);

        const valores = cartasNormales
            .map(c => ({ ...c, valorNum: (c.valor === 'A' && useA14) ? 14 : VNUM[c.valor] }))
            .sort((a, b) => a.valorNum - b.valorNum);

        const palo = valores[0].palo;

        const VNUM_R = {'1':'A','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9','10':'10','11':'J','12':'Q','13':'K','14':'A'};

        let valorEsperado = valores[0].valorNum;
        for (let i = 0; i < valores.length; i++) {
            if (valores[i].valorNum !== valorEsperado) {
                return { valor: VNUM_R[String(valorEsperado)] || '?', palo };
            }
            valorEsperado++;
        }

        const minVal = valores[0].valorNum;
        const maxVal = valores[valores.length - 1].valorNum;
        const ante = minVal - 1;
        const sig  = maxVal + 1;

        const idxJoker = jugada.cartas.findIndex(c => c.comodin);
        const idxsNormalesEnOriginal = jugada.cartas
            .map((c, i) => c.comodin ? -1 : i)
            .filter(i => i >= 0);
        const jokerAntesDeAlgunaNormal = idxJoker < Math.min(...idxsNormalesEnOriginal);
        const jokerDespuesDeTodasNormales = idxJoker > Math.max(...idxsNormalesEnOriginal);

        if (jokerAntesDeAlgunaNormal && ante >= 1) {
            return { valor: VNUM_R[String(ante)] || '?', palo };
        }
        if ((jokerDespuesDeTodasNormales || !jokerAntesDeAlgunaNormal) && sig <= 14) {
            return { valor: VNUM_R[String(sig)] || '?', palo };
        }
        if (ante >= 1) return { valor: VNUM_R[String(ante)] || '?', palo };
    }
    return null;
}

function guardarValorComodin(jugada) {
    if (!jugada) return;
    const comodines = jugada.cartas.filter(c => c.comodin);
    if (comodines.length === 0) return;
    if (comodines.length > 1) { console.warn('Una jugada no puede tener más de un comodín'); return; }
    const comodin = comodines[0];
    const valorReemplazado = getValorComodinEnJugada(jugada);
    if (valorReemplazado) {
        comodin.valorReemplazado = valorReemplazado.valor;
        comodin.paloReemplazado = valorReemplazado.palo;
        comodin.jugadaId = jugada.id || Date.now();
    }
}

function puedeIntercambiarComodin(carta, jugadaBajada) {
    if (carta.comodin) return false;
    const comodin = jugadaBajada.cartas.find(c => c.comodin);
    if (!comodin) return false;
    guardarValorComodin(jugadaBajada);
    if (jugadaBajada.tipo === 'tercia') {
        return carta.valor === comodin.valorReemplazado;
    } else {
        return carta.palo === comodin.paloReemplazado && carta.valor === comodin.valorReemplazado;
    }
}

// ═══════════════════════════════════════════════════
// VALIDACIÓN DE JUGADAS
// ═══════════════════════════════════════════════════

function encontrarTercias(mano) {
    const grupos = {};
    const comodines = mano.filter(c => c.comodin);
    const cartasNormales = mano.filter(c => !c.comodin);
    cartasNormales.forEach(c => {
        grupos[c.valor] = grupos[c.valor] || [];
        grupos[c.valor].push(c);
    });
    const terciasEncontradas = [];
    const comodinesUsados = new Set();
    for (const valor in grupos) {
        const cartas = grupos[valor];
        while (cartas.length >= 3) terciasEncontradas.push(cartas.splice(0, 3));
    }
    for (const valor in grupos) {
        const cartas = grupos[valor];
        while (cartas.length === 2 && comodines.length > comodinesUsados.size) {
            const comodinDisponible = comodines.find(c => !comodinesUsados.has(c.id));
            if (comodinDisponible) {
                terciasEncontradas.push([...cartas, comodinDisponible]);
                comodinesUsados.add(comodinDisponible.id);
                cartas.splice(0, 2);
            } else break;
        }
    }
    return terciasEncontradas;
}

function encontrarCorridas(mano) {
    const comodines = mano.filter(c => c.comodin);
    const cartasNormales = mano.filter(c => !c.comodin);
    const corridasEncontradas = [];
    const cartasUsadas = new Set();

    for (const palo of PALOS) {
        const cartasPalo = cartasNormales.filter(c => c.palo === palo);
        const mapaValores = {};
        cartasPalo.forEach(c => {
            const v = VNUM[c.valor];
            mapaValores[v] = mapaValores[v] || [];
            mapaValores[v].push(c);
        });
        const valores = Object.keys(mapaValores).map(Number).sort((a, b) => a - b);

        for (let i = 0; i < valores.length; i++) {
            let secuencia = [valores[i]];
            let comodinesUsados = 0;
            for (let j = i + 1; j < valores.length; j++) {
                const esperado = secuencia[secuencia.length - 1] + 1;
                if (valores[j] === esperado) {
                    secuencia.push(valores[j]);
                } else {
                    const faltantes = esperado - secuencia[secuencia.length - 1] - 1;
                    if (comodinesUsados + faltantes <= comodines.length) {
                        for (let k = 0; k < faltantes; k++) {
                            secuencia.push(`JOKER_${secuencia[secuencia.length - 1] + 1}`);
                            comodinesUsados++;
                        }
                        secuencia.push(valores[j]);
                    } else break;
                }
            }
            if (secuencia.length >= 4) {
                const cartasSecuencia = [];
                const comodinesTemp = [...comodines];
                const comodinesUsadosIds = new Set();
                let valida = true;
                for (const item of secuencia) {
                    if (typeof item === 'string' && item.startsWith('JOKER')) {
                        const comodin = comodinesTemp.find(c => !comodinesUsadosIds.has(c.id) && !cartasUsadas.has(c.id));
                        if (comodin) { cartasSecuencia.push(comodin); comodinesUsadosIds.add(comodin.id); }
                        else { valida = false; break; }
                    } else {
                        const carta = mapaValores[item]?.find(c => !cartasUsadas.has(c.id));
                        if (carta) cartasSecuencia.push(carta);
                        else { valida = false; break; }
                    }
                }
                if (valida && cartasSecuencia.length >= 4) {
                    corridasEncontradas.push(cartasSecuencia);
                    cartasSecuencia.forEach(c => cartasUsadas.add(c.id));
                    break;
                }
            }
        }
    }
    return corridasEncontradas;
}

function puedeBajarse(mano, ronda) {
    const req = REQ[ronda];
    return encontrarTercias(mano).length >= req.t && encontrarCorridas(mano).length >= req.c;
}

// ═══════════════════════════════════════════════════
// VALIDACIÓN PARA ACOMODAR
// ═══════════════════════════════════════════════════

function puedeAcomodarEnTercia(carta, tercia) {
    if (carta.comodin) return !tercia.some(c => c.comodin);
    const valores = tercia.filter(c => !c.comodin).map(c => c.valor);
    if (valores.length === 0) return true;
    return carta.valor === valores[0];
}

function puedeAcomodarEnCorrida(carta, corrida) {
    if (carta.comodin) return !corrida.some(c => c.comodin);
    const cartasNormales = corrida.filter(c => !c.comodin);
    const comodin = corrida.find(c => c.comodin);
    if (cartasNormales.length === 0) return true;
    if (carta.palo !== cartasNormales[0].palo) return false;

    const valsNorm = cartasNormales.map(c => VNUM[c.valor]);

    // Detectar si el As debe valer 14 en el contexto de las normales
    const tieneAs = valsNorm.includes(1);
    const tieneCartasAltas = valsNorm.some(v => v >= 11);
    const useA14base = tieneAs && tieneCartasAltas && !valsNorm.includes(2);

    const valsNormAdj = valsNorm.map(v => (v === 1 && useA14base) ? 14 : v).sort((a, b) => a - b);

    // Valor numérico del joker si existe
    let valJoker = null;
    if (comodin && comodin.valorReemplazado && comodin.paloReemplazado === cartasNormales[0].palo) {
        const vj = VNUM[comodin.valorReemplazado];
        if (vj) {
            // El joker puede reemplazar un As como 14 si la corrida tiene cartas altas
            valJoker = (vj === 1 && useA14base) ? 14 : vj;
        }
    }

    // Valor numérico de la carta que queremos acomodar
    // El As puede valer 1 o 14 — probar ambos
    const valorCartaRaw = VNUM[carta.valor];
    const posiblesValores = carta.valor === 'A' ? [1, 14] : [valorCartaRaw];

    for (const valCarta of posiblesValores) {
        // Construir el conjunto de valores ocupados considerando este valor del As
        const useA14 = valCarta === 14 || useA14base;
        const valsAdj = valsNorm.map(v => (v === 1 && useA14) ? 14 : v).sort((a, b) => a - b);

        // Calcular valJoker con el nuevo contexto de useA14
        let valJokerAdj = null;
        if (comodin && comodin.valorReemplazado && comodin.paloReemplazado === cartasNormales[0].palo) {
            const vj = VNUM[comodin.valorReemplazado];
            if (vj) valJokerAdj = (vj === 1 && useA14) ? 14 : vj;
        }

        // No incluir el valor del joker en "ocupados" si la carta tiene exactamente
        // ese valor — eso sería un intercambio, no un acomodo. Aquí solo evaluamos
        // si la carta puede ir en un extremo LIBRE (no ocupado por joker ni por normal).
        const valsOcupados = [...valsAdj];
        if (valJokerAdj !== null && valJokerAdj !== valCarta) {
            valsOcupados.push(valJokerAdj);
            valsOcupados.sort((a, b) => a - b);
        }

        // La carta no puede ir donde ya hay una normal
        if (valsAdj.includes(valCarta)) continue;

        const minVal = valsOcupados[0];
        const maxVal = valsOcupados[valsOcupados.length - 1];

        // La carta puede ir en el extremo inferior o superior
        if (valCarta === minVal - 1 || valCarta === maxVal + 1) return true;
    }

    return false;
}

function ordenarCorridaAcomodada(cartas) {
    const normales = cartas.filter(c => !c.comodin);
    const comodines = cartas.filter(c => c.comodin);
    if (normales.length === 0) return cartas;

    const valsNorm = normales.map(c => VNUM[c.valor]);
    const tieneAs = valsNorm.includes(1);
    const tieneCartasAltas = valsNorm.some(v => v >= 11);
    const useA14 = tieneAs && tieneCartasAltas && !valsNorm.includes(2);

    const normalesConNum = normales.map(c => ({
        ...c,
        _num: (c.valor === 'A' && useA14) ? 14 : VNUM[c.valor]
    })).sort((a, b) => a._num - b._num);

    const resultado = [];
    let comodinesRestantes = [...comodines];
    for (let i = 0; i < normalesConNum.length; i++) {
        resultado.push(normalesConNum[i]);
        if (i < normalesConNum.length - 1) {
            const hueco = normalesConNum[i + 1]._num - normalesConNum[i]._num - 1;
            for (let k = 0; k < hueco && comodinesRestantes.length > 0; k++) {
                resultado.push(comodinesRestantes.shift());
            }
        }
    }
    resultado.push(...comodinesRestantes);
    resultado.forEach(c => delete c._num);
    return resultado;
}

function puedeAcomodar(carta, jugada) {
    return jugada.tipo === 'tercia'
        ? puedeAcomodarEnTercia(carta, jugada.cartas)
        : puedeAcomodarEnCorrida(carta, jugada.cartas);
}

// ═══════════════════════════════════════════════════
// VALIDACIÓN DE JUGADAS CONSTRUIDAS
// ═══════════════════════════════════════════════════

function validarTercia(cartas) {
    if (cartas.length < 3) return false;
    const normales = cartas.filter(c => !c.comodin);
    const comodines = cartas.filter(c => c.comodin);
    if (comodines.length > 1) return false;
    if (normales.length === 0) return false;

    const conteo = {};
    normales.forEach(c => { conteo[c.valor] = (conteo[c.valor] || 0) + 1; });
    let maxFreq = 0, valorMayor = null;
    for (const [v, f] of Object.entries(conteo)) {
        if (f > maxFreq) { maxFreq = f; valorMayor = v; }
    }
    return normales.filter(c => c.valor === valorMayor).length + comodines.length >= 3;
}

function ordenarCorrida(cartas) {
    const normales = cartas.filter(c => !c.comodin).map(c => ({ ...c, valorNum: VNUM[c.valor] }));
    const comodines = cartas.filter(c => c.comodin);
    if (normales.length === 0) return cartas;

    const normalesOrdenadas = [...normales].sort((a, b) => a.valorNum - b.valorNum);
    const resultado = [];
    let comodinesRestantes = [...comodines];

    for (let i = 0; i < normalesOrdenadas.length; i++) {
        resultado.push(normalesOrdenadas[i]);
        if (i < normalesOrdenadas.length - 1) {
            const hueco = normalesOrdenadas[i + 1].valorNum - normalesOrdenadas[i].valorNum - 1;
            for (let j = 0; j < hueco && comodinesRestantes.length > 0; j++) {
                resultado.push(comodinesRestantes.shift());
            }
        }
    }
    resultado.push(...comodinesRestantes);
    return resultado;
}

function validarCorrida(cartas) {
    if (cartas.length < 4) return false;
    const normales = cartas.filter(c => !c.comodin);
    const comodines = cartas.filter(c => c.comodin);
    if (comodines.length > 1) return false;
    if (normales.length === 0) return false;

    const primerPalo = normales[0].palo;
    if (!normales.every(c => c.palo === primerPalo)) return false;

    const vals = normales.map(c => VNUM[c.valor]).sort((a, b) => a - b);
    if (new Set(vals).size !== vals.length) return false;

    function esSecuenciaValida(v, numComodines) {
        let comodinesUsados = 0;
        for (let i = 0; i < v.length - 1; i++) {
            const diff = v[i + 1] - v[i];
            if (diff === 1) continue;
            if (diff > 1) {
                const huecos = diff - 1;
                if (comodinesUsados + huecos <= numComodines) { comodinesUsados += huecos; }
                else return false;
            }
        }
        return true;
    }

    if (esSecuenciaValida(vals, comodines.length)) return true;
    if (vals.includes(1)) {
        const con14 = vals.map(v => v === 1 ? 14 : v).sort((a, b) => a - b);
        if (esSecuenciaValida(con14, comodines.length)) return true;
    }
    return false;
}

function validarJugadasConstruidas(jugadas) {
    const resultado = { valido: true, errores: [], jugadasOrdenadas: [] };

    for (let i = 0; i < jugadas.length; i++) {
        const jugada = jugadas[i];
        const cartas = jugada.cartas;
        const comodines = cartas.filter(c => c.comodin);
        if (comodines.length > 1) {
            resultado.valido = false;
            resultado.errores.push(`Jugada ${i + 1} tiene más de un comodín`);
            continue;
        }
        if (jugada.tipo === 'tercia') {
            if (!validarTercia(cartas)) {
                resultado.valido = false;
                resultado.errores.push(`Tercia ${i + 1} inválida — las cartas deben ser del mismo valor`);
            } else {
                resultado.jugadasOrdenadas.push({ tipo: 'tercia', cartas });
            }
        } else if (jugada.tipo === 'corrida') {
            if (!validarCorrida(cartas)) {
                resultado.valido = false;
                resultado.errores.push(`Corrida ${i + 1} inválida — deben ser del mismo palo en secuencia`);
            } else {
                resultado.jugadasOrdenadas.push({ tipo: 'corrida', cartas: ordenarCorrida(cartas) });
            }
        }
    }
    return resultado;
}

// ═══════════════════════════════════════════════════
// GAME ENGINE CLASS
// ═══════════════════════════════════════════════════

class GameEngine {
    constructor(jugadores) {
        this.jugadores = jugadores.map(({ id, nombre }) => ({
            id, nombre,
            mano: [],
            bajado: false,
            pts_r: 0,
            pts_t: 0,
            jugadas: [],
            conectado: true,
            penalizacion: null,
            puedeBajar: true,
        }));
        this.ronda = 1;
        this.dealer = 0;
        this.turno = 1 % jugadores.length;
        this.mazo = [];
        this.fondo = [];

        // ─── Gestión de mazo agotado ───────────────────
        // fondoDescartado: cartas que pasaron por el fondo
        // y nadie castigó (se ignoran una vez el fondo se
        // recicla como mazo, para no volver a usarlas).
        this.fondoDescartado = [];
        // true mientras el mazo reciclado (del fondo) esté activo.
        // Cuando este mazo también se agota → reinicio de ronda.
        this.mazoReciclado = false;
        // ──────────────────────────────────────────────

        this.estado = 'esperando_robo';
        this.log = [];
        this.castigo_idx = -1;
        this.lastAction = Date.now();
    }

    get jActivo() { return this.jugadores[this.turno]; }

    addLog(m) {
        this.log.push({ msg: m, ts: Date.now() });
        if (this.log.length > 20) this.log.shift();
    }

    // ─────────────────────────────────────────────────
    // chkMazo — se llama antes de cada robo del mazo.
    //
    // Caso 1 — mazo vacío, primera vez:
    //   Toma fondoDescartado, lo baraja y lo convierte
    //   en el nuevo mazo. Activa mazoReciclado = true.
    //   Deja una carta visible en el fondo para que el
    //   juego continúe normalmente.
    //
    // Caso 2 — mazo vacío, ya fue reciclado antes:
    //   No hay más cartas disponibles. Reinicia la ronda
    //   actual sin sumar puntos (nadie ganó).
    //
    // Caso 3 — mazo normal pero bajo (< 3):
    //   Funciona igual que siempre; se reporta en el log.
    // ─────────────────────────────────────────────────
    chkMazo() {
        if (this.mazo.length > 0) return; // hay cartas, no hacer nada

        // ── El mazo ya fue reciclado una vez y se agotó de nuevo ──
        // No importa si el fondo tiene cartas: reiniciar la ronda.
        if (this.mazoReciclado) {
            this.addLog('⚠️ Mazo agotado por segunda vez — la ronda se reinicia sin ganador.');
            this._reiniciarRonda();
            return;
        }

        // ── Primera vez que se agota el mazo ──
        // Reciclar: fondo (menos la carta visible) + fondoDescartado.
        const reciclables = [];

        // Tomar todas las cartas del fondo excepto la última (que se queda visible)
        if (this.fondo.length > 1) {
            const cartasDelFondo = this.fondo.splice(0, this.fondo.length - 1);
            reciclables.push(...cartasDelFondo);
        }

        // Agregar las cartas que nadie tomó del fondo en turnos anteriores
        reciclables.push(...this.fondoDescartado);
        this.fondoDescartado = [];

        if (reciclables.length === 0) {
            // Absolutamente no hay cartas — reiniciar directamente
            this.addLog('⚠️ Sin cartas disponibles — la ronda se reinicia sin ganador.');
            this._reiniciarRonda();
            return;
        }

        this.mazo = shuffle(reciclables);
        this.mazoReciclado = true;
        this.addLog(`♻️ Mazo agotado — se reciclaron ${this.mazo.length} cartas del fondo como nuevo mazo.`);
    }

    // ─────────────────────────────────────────────────
    // _reiniciarRonda: reparte de nuevo la misma ronda
    // sin sumar ni restar puntos. Avisa a todos.
    // ─────────────────────────────────────────────────
    _reiniciarRonda() {
        this.addLog(`🔄 Ronda ${this.ronda} reiniciada — mazo insuficiente.`);
        // Resetear estado de jugadores pero conservar pts_t
        this.jugadores.forEach(j => {
            j.mano = [];
            j.bajado = false;
            j.pts_r = 0;
            j.jugadas = [];
            j.penalizacion = null;
            j.puedeBajar = true;
        });
        // Repartir de nuevo (repartir() ya construye mazo fresco y limpia fondoDescartado)
        this.repartir();
        // Notificar via _broadcastReinicio (el caller — GameRoom — debe manejar el broadcast)
        this._pendingReinicio = true;
    }

    repartir() {
        const numJugadores = this.jugadores.length;
        this.mazo = mkMazo(numJugadores);
        this.fondo = [];
        this.fondoDescartado = [];   // limpiar al inicio de cada ronda
        this.mazoReciclado = false;  // resetear flag de reciclado

        this.jugadores.forEach(j => {
            j.mano = [];
            j.bajado = false;
            j.pts_r = 0;
            j.jugadas = [];
            j.penalizacion = null;
            j.puedeBajar = true;
        });

        const n = 5 + this.ronda;
        for (let i = 0; i < n; i++) {
            this.jugadores.forEach(j => { this.chkMazo(); j.mano.push(this.mazo.pop()); });
        }
        this.chkMazo();
        this.fondo.push(this.mazo.pop());
        this.estado = 'esperando_robo';
        this.addLog(`🃏 Ronda ${this.ronda}. Dealer: ${this.jugadores[this.dealer].nombre}. Inicia: ${this.jActivo.nombre}.`);
    }

    acTomarFondo(playerId) {
        const err = this._checkTurn(playerId, 'esperando_robo');
        if (err) return err;
        if (this.jActivo.bajado) return this._err('Ya te bajaste.');
        if (!this.fondo.length) return this._err('No hay carta en el fondo.');
        const carta = this.fondo.pop();
        this.jActivo.mano.push(carta);
        this.addLog(`📥 ${this.jActivo.nombre} tomó del fondo.`);
        this.estado = 'esperando_accion';
        this.lastAction = Date.now();
        return this._ok('tomar_fondo', { carta, jugadorIdx: this.turno });
    }

    acTomarMazo(playerId) {
        const err = this._checkTurn(playerId, 'esperando_robo');
        if (err) return err;
        this.chkMazo();
        const carta = this.mazo.pop();
        this.jActivo.mano.push(carta);
        this.addLog(`🎴 ${this.jActivo.nombre} robó del mazo.`);

        // La carta que estaba visible en el fondo nadie la tomó en este turno.
        // Si hay una carta en el fondo que no sea la que acaba de llegar,
        // moverla a fondoDescartado (solo cuando NO hay mazoReciclado activo,
        // porque en ese caso ya no guardamos para evitar loop infinito).
        // En realidad la carta del fondo se queda visible hasta que alguien la tome
        // o se pague otra carta. No la movemos aquí — se mueve cuando se paga (acPagar).

        let idx = (this.turno + 1) % this.jugadores.length;
        while (this.jugadores[idx].bajado && idx !== this.turno) idx = (idx + 1) % this.jugadores.length;
        if (this.fondo.length > 0 && idx !== this.turno) {
            this.castigo_idx = idx;
            this.estado = 'fase_castigo';
        } else {
            this.estado = 'esperando_accion';
        }
        this.lastAction = Date.now();
        return this._ok('tomar_mazo', { carta, jugadorIdx: this.turno });
    }

    acCastigo(playerId, acepta) {
        if (this.estado !== 'fase_castigo') return this._err('No hay fase de castigo.');
        if (this.jugadores[this.castigo_idx].id !== playerId) return this._err('No es tu turno de castigo.');
        const jc = this.jugadores[this.castigo_idx];
        if (acepta) {
            const cartaFondo = this.fondo.pop();
            this.chkMazo();
            const cartaMazo = this.mazo.pop();
            jc.mano.push(cartaFondo, cartaMazo);
            this.addLog(`⚡ ${jc.nombre} se castigó.`);
            this.estado = 'esperando_accion';
            this.lastAction = Date.now();
            return this._ok('castigo_acepta', { jugadorIdx: this.castigo_idx, cartaFondo, cartaMazo });
        } else {
            // Nadie tomó la carta del fondo en este castigo — guardarla en fondoDescartado
            // solo si el mazo aún no fue reciclado (para evitar duplicados).
            if (this.fondo.length > 0 && !this.mazoReciclado) {
                // Verificar si el siguiente jugador también pasará el castigo
                // La carta se guarda cuando ya nadie la quiera (al llegar al turno activo)
            }
            this.addLog(`🙅 ${jc.nombre} pasó.`);
            let sig = (this.castigo_idx + 1) % this.jugadores.length;
            while (this.jugadores[sig].bajado && sig !== this.turno) sig = (sig + 1) % this.jugadores.length;

            if (sig === this.turno) {
                // Nadie quiso la carta del fondo — moverla a fondoDescartado
                if (this.fondo.length > 0) {
                    const cartaRechazada = this.fondo.pop();
                    this.fondoDescartado.push(cartaRechazada);
                    this.addLog(`📦 Carta del fondo rechazada, guardada para reciclaje.`);
                    // El fondo queda vacío hasta que el jugador activo pague
                }
                this.estado = 'esperando_accion';
            } else {
                this.castigo_idx = sig;
            }
            this.lastAction = Date.now();
            return this._ok('castigo_pasa', { nextCastigoIdx: this.estado === 'fase_castigo' ? sig : -1 });
        }
    }

    // ═══════════════════════════════════════════════════
    // BAJAR
    // ═══════════════════════════════════════════════════
    acBajar(playerId, jugadasConstruidas) {
        const err = this._checkTurn(playerId, 'esperando_accion');
        if (err) return err;
        if (this.jActivo.bajado) return this._err('Ya te bajaste.');

        if (this.jActivo.penalizacion?.activa) {
            return this._err(`Tienes penalización activa por ${this.jActivo.penalizacion.turnosRestantes} turno(s) más. No puedes bajar.`);
        }

        if (!jugadasConstruidas || !Array.isArray(jugadasConstruidas) || jugadasConstruidas.length === 0) {
            return this._err('No hay jugadas para bajar.');
        }

        const cartasEnJugadasIds = new Set();
        for (const jugada of jugadasConstruidas) {
            for (const carta of (jugada.cartas || [])) {
                cartasEnJugadasIds.add(carta.id);
            }
        }

        for (const cartaId of cartasEnJugadasIds) {
            if (!this.jActivo.mano.some(c => c.id === cartaId)) {
                return this._err(`Carta ${cartaId} no está en tu mano`);
            }
        }

        const validacion = validarJugadasConstruidas(jugadasConstruidas);

        if (!validacion.valido) {
            this.jActivo.penalizacion = { activa: true, turnosRestantes: 2 };
            this.jActivo.puedeBajar = false;
            const motivo = validacion.errores.join(', ');
            this.addLog(`⚠️ ¡BAJADA EN FALSO! ${this.jActivo.nombre}: ${motivo}. Penalizado 2 turnos.`);
            return this._err(`¡BAJADA EN FALSO! ${motivo}. Castigado 2 turnos sin bajar.`);
        }

        const terciasCount = validacion.jugadasOrdenadas.filter(j => j.tipo === 'tercia').length;
        const corridasCount = validacion.jugadasOrdenadas.filter(j => j.tipo === 'corrida').length;
        const req = REQ[this.ronda];

        if (terciasCount < req.t) return this._err(`Necesitas ${req.t} tercia(s) (tienes ${terciasCount})`);
        if (corridasCount < req.c) return this._err(`Necesitas ${req.c} corrida(s) (tienes ${corridasCount})`);

        if (this.ronda === 7) {
            const cartasEnJugadas = new Set();
            jugadasConstruidas.forEach(jug => jug.cartas.forEach(c => cartasEnJugadas.add(c.id)));
            const sobrantes = this.jActivo.mano.filter(c => !cartasEnJugadas.has(c.id));
            if (sobrantes.length > 0) {
                this.jActivo.penalizacion = { activa: true, turnosRestantes: 2 };
                this.jActivo.puedeBajar = false;
                this.addLog(`⚠️ ¡BAJADA EN FALSO! ${this.jActivo.nombre}: ronda 7 requiere 0 sobrantes. Penalizado 2 turnos.`);
                return this._err(`¡BAJADA EN FALSO! En la ronda 7 debes meter TODAS tus cartas en las jugadas. Te quedan ${sobrantes.length} carta(s) en sobrantes. Castigado 2 turnos.`);
            }
        }

        const cartasUsadasIds = new Set();
        validacion.jugadasOrdenadas.forEach(jugada => jugada.cartas.forEach(c => cartasUsadasIds.add(c.id)));

        validacion.jugadasOrdenadas.forEach(jugada => {
            const nuevaJugada = { tipo: jugada.tipo, cartas: jugada.cartas };
            this.jActivo.jugadas.push(nuevaJugada);
            guardarValorComodin(nuevaJugada);
        });

        this.jActivo.mano = this.jActivo.mano.filter(c => !cartasUsadasIds.has(c.id));
        this.jActivo.bajado = true;

        this.addLog(`🔥 ${this.jActivo.nombre} se bajó en ronda ${this.ronda}!`);
        this.lastAction = Date.now();

        if (this.jActivo.mano.length === 0) {
            return this._finRonda(this.turno, { tipo: 'bajar', jugadas: this.jActivo.jugadas });
        }

        this.estado = 'esperando_pago';
        return this._ok('bajar', {
            jugadorIdx: this.turno,
            jugadas: this.jActivo.jugadas,
            sobrantes: this.jActivo.mano
        });
    }

    acPagar(playerId, cartaId) {
        const valid = ['esperando_accion', 'esperando_pago'];
        if (!valid.includes(this.estado)) return this._err('No es momento de pagar.');
        const j = this._findPlayer(playerId);
        if (!j || this.turno !== this.jugadores.indexOf(j)) return this._err('No es tu turno.');
        const idx = j.mano.findIndex(c => c.id === cartaId);
        if (idx < 0) return this._err('Carta no encontrada.');
        const carta = j.mano.splice(idx, 1)[0];

        // La carta visible del fondo queda desplazada por la nueva.
        // Siempre la guardamos en fondoDescartado para poder reciclarla
        // si el mazo se agota de nuevo.
        if (this.fondo.length > 0) {
            const cartaAnterior = this.fondo.pop();
            this.fondoDescartado.push(cartaAnterior);
        }

        this.fondo.push(carta);
        this.addLog(`💳 ${j.nombre} pagó ${carta.valor}${carta.palo || ''}.`);
        this.lastAction = Date.now();

        if (j.mano.length === 0 && j.bajado) {
            return this._finRonda(this.turno, { tipo: 'pagar', carta });
        }

        const prevTurno = this.turno;
        this.turno = (this.turno + 1) % this.jugadores.length;

        this.jugadores.forEach(jugador => {
            if (jugador.penalizacion?.activa) {
                jugador.penalizacion.turnosRestantes--;
                if (jugador.penalizacion.turnosRestantes <= 0) {
                    jugador.penalizacion = null;
                    jugador.puedeBajar = true;
                    this.addLog(`✅ ${jugador.nombre} ya puede bajar nuevamente.`);
                }
            }
        });

        this.estado = 'esperando_robo';
        this.addLog(`➡️ Turno de ${this.jActivo.nombre}.`);
        return this._ok('pagar', { carta, jugadorIdx: prevTurno, nextTurno: this.turno });
    }

    acIntercambiarComodin(playerId, cartaId, origenJugadorIdx, origenJugadaIdx, jugadasEnSlots = []) {
        const j = this._findPlayer(playerId);
        if (!j) return this._err('Jugador no encontrado.');
        const tidx = this.jugadores.indexOf(j);
        if (tidx !== this.turno) return this._err('No es tu turno.');
        // Permitir intercambio tanto antes de pagar (esperando_accion)
        // como después de bajarse con sobrantes (esperando_pago).
        // En ningún otro estado tiene sentido.
        const estadosValidos = ['esperando_accion', 'esperando_pago'];
        if (!estadosValidos.includes(this.estado)) return this._err('No puedes intercambiar en este momento.');
        const origen = this.jugadores[origenJugadorIdx];
        if (!origen || !origen.bajado) return this._err('Jugador origen no se ha bajado.');
        const jugadaOrigen = origen.jugadas[origenJugadaIdx];
        if (!jugadaOrigen) return this._err('Jugada no encontrada.');
        const comodinIdx = jugadaOrigen.cartas.findIndex(c => c.comodin);
        if (comodinIdx === -1) return this._err('No hay comodín en esa jugada.');
        const cartaEnManoIdx = j.mano.findIndex(c => c.id === cartaId);
        if (cartaEnManoIdx === -1) return this._err('Carta no encontrada en tu mano.');
        const cartaParaIntercambiar = j.mano[cartaEnManoIdx];
        if (!puedeIntercambiarComodin(cartaParaIntercambiar, jugadaOrigen)) {
            return this._err('Esta carta no puede reemplazar al comodín en esa jugada.');
        }

        if (!j.bajado) {
            const comodinRecibido = jugadaOrigen.cartas[comodinIdx];
            const req = REQ[this.ronda];

            if (jugadasEnSlots && jugadasEnSlots.length > 0) {
                let jugadasSimuladas = jugadasEnSlots.map(jug => ({
                    ...jug,
                    cartas: jug.cartas.map(c => c.id === cartaId ? { ...comodinRecibido } : c)
                }));

                const cartaEnSlot = jugadasEnSlots.some(jug => jug.cartas.some(c => c.id === cartaId));
                if (!cartaEnSlot) {
                    let comodinUsado = false;
                    jugadasSimuladas = jugadasEnSlots.map(jug => {
                        if (comodinUsado) return jug;
                        const cartasConComodin = [...jug.cartas, { ...comodinRecibido }];
                        const esValidaConComodin = jug.tipo === 'tercia'
                            ? validarTercia(cartasConComodin)
                            : validarCorrida(cartasConComodin);
                        const esValidaSin = jug.tipo === 'tercia'
                            ? validarTercia(jug.cartas)
                            : validarCorrida(jug.cartas);
                        if (!esValidaSin && esValidaConComodin) {
                            comodinUsado = true;
                            return { ...jug, cartas: cartasConComodin };
                        }
                        return jug;
                    });
                }

                const validacion = validarJugadasConstruidas(jugadasSimuladas);
                if (!validacion.valido) {
                    return this._err('Con el intercambio, tus jugadas no serían válidas para bajarte.');
                }
                const tercias = validacion.jugadasOrdenadas.filter(j => j.tipo === 'tercia').length;
                const corridas = validacion.jugadasOrdenadas.filter(j => j.tipo === 'corrida').length;
                if (tercias < req.t || corridas < req.c) {
                    return this._err('Con el intercambio aún no cumplirías los requisitos para bajarte.');
                }
            } else {
                const manoSimulada = j.mano.filter(c => c.id !== cartaId);
                manoSimulada.push({ ...comodinRecibido });
                if (!puedeBajarse(manoSimulada, this.ronda)) {
                    return this._err('Con el intercambio no podrías bajarte con las cartas en tu mano.');
                }
            }
        }

        const comodin = jugadaOrigen.cartas[comodinIdx];
        jugadaOrigen.cartas[comodinIdx] = cartaParaIntercambiar;
        j.mano[cartaEnManoIdx] = comodin;
        delete comodin.valorReemplazado;
        delete comodin.paloReemplazado;
        delete comodin.jugadaId;
        guardarValorComodin(jugadaOrigen);
        this.addLog(`🔄 ${j.nombre} intercambió ${cartaParaIntercambiar.valor}${cartaParaIntercambiar.palo || ''} por un comodín de ${origen.nombre}.`);
        this.lastAction = Date.now();
        return this._ok('intercambiar_comodin', {
            jugadorIdx: tidx, origenJugadorIdx, origenJugadaIdx,
            cartaEntregada: cartaParaIntercambiar, comodinRecibido: comodin
        });
    }

    // posicion: 'alta' | 'baja' | null
    //   null      → carta normal, ordenar automáticamente
    //   'alta'    → joker va al FINAL de la corrida (valor más alto)
    //   'baja'    → joker va al INICIO de la corrida (valor más bajo)
    //   Para tercias posicion se ignora (siempre al final).
    acAcomodar(playerId, cartaId, destJugadorIdx, destJugadaIdx, posicion = null) {
        const j = this._findPlayer(playerId);
        if (!j) return this._err('Jugador no encontrado.');
        const tidx = this.jugadores.indexOf(j);
        if (tidx !== this.turno) return this._err('No es tu turno.');
        if (!j.bajado) return this._err('Debes bajarte primero antes de poder acomodar cartas en jugadas de otros.');
        const dest = this.jugadores[destJugadorIdx];
        if (!dest || !dest.bajado) return this._err('Jugador destino no se ha bajado.');
        const jug = dest.jugadas[destJugadaIdx];
        if (!jug) return this._err('Jugada no encontrada.');
        const cidx = j.mano.findIndex(c => c.id === cartaId);
        if (cidx < 0) return this._err('Carta no encontrada.');
        const carta = j.mano[cidx];
        if (!puedeAcomodar(carta, jug)) return this._err(`No puedes acomodar ${carta.valor}${carta.palo || ''} ahí.`);

        if (jug.tipo === 'corrida') {
            if (carta.comodin && posicion) {
                // Usuario eligió posición explícita para el joker.
                // Respetar su elección sin validar si "tiene sentido":
                // el usuario es libre de ponerlo como baja o alta.
                // Ordenar las cartas normales y colocar el joker al inicio o final.
                const normales = jug.cartas.filter(c => !c.comodin);
                normales.sort((a, b) => VNUM[a.valor] - VNUM[b.valor]);
                if (posicion === 'baja') {
                    jug.cartas = [carta, ...normales];
                } else {
                    // 'alta' o cualquier otro valor → al final
                    jug.cartas = [...normales, carta];
                }
            } else {
                // Carta normal o joker sin posición elegida → ordenar automático
                jug.cartas.push(carta);
                jug.cartas = ordenarCorridaAcomodada(jug.cartas);
            }
        } else {
            // Tercia: siempre al final
            jug.cartas.push(carta);
        }

        guardarValorComodin(jug);
        j.mano.splice(cidx, 1);
        this.addLog(`🃏 ${j.nombre} acomodó en jugada de ${dest.nombre}.`);
        this.lastAction = Date.now();
        if (j.mano.length === 0) return this._finRonda(tidx, { tipo: 'acomodar', carta });
        return this._ok('acomodar', { carta, jugadorIdx: tidx, destJugadorIdx, destJugadaIdx });
    }

    acReordenarMano(playerId, newOrder) {
        const j = this._findPlayer(playerId);
        if (!j) return this._err('Jugador no encontrado.');
        const reordered = newOrder.map(id => j.mano.find(c => c.id === id)).filter(Boolean);
        if (reordered.length !== j.mano.length) return this._err('Orden inválido.');
        j.mano = reordered;
        return this._ok('reordenar', { jugadorIdx: this.jugadores.indexOf(j) }, false);
    }

    _checkTurn(playerId, estado) {
        if (this.estado !== estado) return this._err(`Estado incorrecto: ${this.estado}`);
        if (this.jActivo.id !== playerId) return this._err('No es tu turno.');
        return null;
    }

    _findPlayer(id) { return this.jugadores.find(j => j.id === id); }
    _err(msg) { return { ok: false, error: msg }; }
    _ok(event, data = {}, broadcast = true) {
        return { ok: true, event, data, broadcast, state: this.publicState() };
    }

    _finRonda(ganadorIdx, extra = {}) {
        this.jugadores.forEach((j, i) => {
            if (i === ganadorIdx) {
                j.pts_r = 0;
            } else {
                j.pts_r = j.mano.reduce((s, c) => {
                    if (c.comodin) return s + 50;
                    return s + (PUNTOS[c.valor] || 10);
                }, 0);
                j.pts_t += j.pts_r;
            }
        });
        this.addLog(`🏆 ${this.jugadores[ganadorIdx].nombre} gana ronda ${this.ronda}!`);
        this.estado = 'fin_ronda';
        this.lastAction = Date.now();
        return this._ok('fin_ronda', {
            ganadorIdx,
            puntos: this.jugadores.map(j => ({ pts_r: j.pts_r, pts_t: j.pts_t })),
            ...extra
        });
    }

    finalizarRonda() {
        this.ronda++;
        if (this.ronda > 7) {
            this.estado = 'fin_juego';
            return this._ok('fin_juego', {
                jugadores: this.jugadores.map(j => ({ nombre: j.nombre, pts_t: j.pts_t }))
            });
        }
        this.dealer = (this.dealer + 1) % this.jugadores.length;
        this.turno = (this.dealer + 1) % this.jugadores.length;
        this.repartir();
        return this._ok('nueva_ronda', { ronda: this.ronda });
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
            ronda: this.ronda,
            dealer: this.dealer,
            turno: this.turno,
            estado: this.estado,
            fondo_top: this.fondo.length ? this.fondo[this.fondo.length - 1] : null,
            mazo_count: this.mazo.length,
            // Exponer cuántas cartas hay en el fondo reciclable (info para UI)
            fondo_reciclable_count: this.fondoDescartado.length,
            mazo_reciclado: this.mazoReciclado,
            castigo_idx: this.castigo_idx,
            jugadores: this.jugadores.map(j => ({
                id: j.id,
                nombre: j.nombre,
                num_cartas: j.mano.length,
                bajado: j.bajado,
                pts_r: j.pts_r,
                pts_t: j.pts_t,
                jugadas: j.jugadas,
                conectado: j.conectado,
                mano: [],
                penalizacion: j.penalizacion,
                puedeBajar: j.puedeBajar,
            })),
            log: this.log.slice(-6).map(l => l.msg),
            req: REQ[this.ronda],
        };
    }
}

module.exports = { GameEngine, REQ, PUNTOS };