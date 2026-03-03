'use strict';

// CONTINENTAL — Lógica del juego (servidor)

const PALOS = ['♠', '♥', '♦', '♣'];
const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const PUNTOS = {
    'A': 20, 'J': 10, 'Q': 10, 'K': 10, '10': 10, '9': 10, '8': 10,
    '2': 5, '3': 5, '4': 5, '5': 5, '6': 5, '7': 5
};
const VNUM = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13
};
const VNUM_ALTO = {
    'A': 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13
};

// Puntos por valor para decidir qué jugada priorizar
const PUNTOS_POR_VALOR = {
    'A': 20, 'K': 10, 'Q': 10, 'J': 10, '10': 10, '9': 10, '8': 10,
    '7': 5, '6': 5, '5': 5, '4': 5, '3': 5, '2': 5
};

// Requisitos por ronda: t=tercias, c=corridas
const REQ = {
    1: { t: 2, c: 0 },  // 2 tercias
    2: { t: 1, c: 1 },  // 1 tercia + 1 corrida
    3: { t: 0, c: 2 },  // 2 corridas
    4: { t: 3, c: 0 },  // 3 tercias
    5: { t: 2, c: 1 },  // 2 tercias + 1 corrida
    6: { t: 1, c: 2 },  // 1 tercia + 2 corridas
    7: { t: 0, c: 3 }   // 3 corridas (sin pagar)
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

function mkMazo() {
    const m = [];
    
    for (let baraja = 0; baraja < 2; baraja++) {
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

// Funciones de utilidad para jugadas
function getValorNumerico(carta, usarAlto = false) {
    if (carta.comodin) return null;
    return usarAlto ? VNUM_ALTO[carta.valor] : VNUM[carta.valor];
}

function calcularPuntosJugada(jugada) {
    return jugada.cartas.reduce((total, c) => {
        if (c.comodin) return total + 50;
        return total + (PUNTOS_POR_VALOR[c.valor] || 0);
    }, 0);
}

// Para decidir qué jugada priorizar (mayor puntaje primero)
function compararJugadas(jugadaA, jugadaB) {
    const puntosA = calcularPuntosJugada(jugadaA);
    const puntosB = calcularPuntosJugada(jugadaB);
    
    if (puntosA !== puntosB) return puntosB - puntosA;
    
    // Si iguales, preferir la más larga
    return jugadaB.cartas.length - jugadaA.cartas.length;
}

// Detección de tercias (3 cartas del mismo valor)
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
    
    // Priorizar valores altos
    const valoresOrdenados = Object.keys(grupos).sort((a, b) => 
        PUNTOS_POR_VALOR[b] - PUNTOS_POR_VALOR[a]);
    
    // Tercias sin comodines
    for (const valor of valoresOrdenados) {
        const cartas = grupos[valor];
        while (cartas.length >= 3) {
            terciasEncontradas.push(cartas.splice(0, 3));
        }
    }
    
    // Tercias con un comodín (máximo 1 por tercia)
    for (const valor of valoresOrdenados) {
        const cartas = grupos[valor];
        while (cartas.length === 2 && comodines.length > comodinesUsados.size) {
            const comodinDisponible = comodines.find(c => !comodinesUsados.has(c.id));
            if (comodinDisponible) {
                terciasEncontradas.push([...cartas, comodinDisponible]);
                comodinesUsados.add(comodinDisponible.id);
                cartas.splice(0, 2);
            } else {
                break;
            }
        }
    }
    
    return terciasEncontradas;
}

// Detección de corridas (secuencias de 4+ cartas del mismo palo)
function encontrarCorridas(mano) {
    const comodines = mano.filter(c => c.comodin);
    const cartasNormales = mano.filter(c => !c.comodin);
    const todasLasCorridas = [];
    const cartasUsadas = new Set();
    
    for (const palo of PALOS) {
        const cartasPalo = cartasNormales.filter(c => c.palo === palo);
        
        const mapaValores = {};
        cartasPalo.forEach(c => {
            const vBajo = VNUM[c.valor];
            mapaValores[vBajo] = mapaValores[vBajo] || [];
            mapaValores[vBajo].push(c);
            
            if (c.valor === 'A') {
                mapaValores[14] = mapaValores[14] || [];
                mapaValores[14].push(c);
            }
        });
        
        const valores = Object.keys(mapaValores).map(Number).sort((a, b) => a - b);
        
        for (let i = 0; i < valores.length; i++) {
            const secuencia = [valores[i]];
            const comodinesUsados = [];
            
            for (let j = i + 1; j < valores.length; j++) {
                const esperado = secuencia[secuencia.length - 1] + 1;
                
                if (valores[j] === esperado) {
                    secuencia.push(valores[j]);
                } else {
                    // Intentar llenar huecos con comodines
                    if (comodinesUsados.length < comodines.length) {
                        secuencia.push(`JOKER_${esperado}`);
                        comodinesUsados.push(`temp`);
                        j--;
                    } else {
                        break;
                    }
                }
            }
            
            if (secuencia.length >= 4) {
                const corrida = [];
                const comodinesTemp = [...comodines];
                const comodinesUsadosIds = new Set();
                let valida = true;
                
                for (const item of secuencia) {
                    if (typeof item === 'string' && item.startsWith('JOKER')) {
                        const comodin = comodinesTemp.find(c => !comodinesUsadosIds.has(c.id) && !cartasUsadas.has(c.id));
                        if (comodin) {
                            corrida.push(comodin);
                            comodinesUsadosIds.add(comodin.id);
                        } else {
                            valida = false;
                            break;
                        }
                    } else {
                        const carta = mapaValores[item]?.find(c => !cartasUsadas.has(c.id));
                        if (carta) {
                            corrida.push(carta);
                        } else {
                            valida = false;
                            break;
                        }
                    }
                }
                
                if (valida && corrida.length >= 4) {
                    todasLasCorridas.push({
                        cartas: corrida,
                        longitud: corrida.length,
                        puntos: calcularPuntosJugada({ cartas: corrida })
                    });
                }
            }
        }
    }
    
    todasLasCorridas.sort((a, b) => {
        if (a.puntos !== b.puntos) return b.puntos - a.puntos;
        return b.longitud - a.longitud;
    });
    
    return todasLasCorridas.map(c => c.cartas);
}

// Determina qué valor representa un comodín dentro de una jugada
function getValorComodinEnJugada(jugada) {
    if (!jugada) return null;
    
    const cartasNormales = jugada.cartas.filter(c => !c.comodin);
    if (cartasNormales.length === 0) return null;
    
    if (jugada.tipo === 'tercia') {
        return cartasNormales[0].valor;
    } else {
        // Encontrar el hueco en la secuencia
        const valores = cartasNormales
            .map(c => getValorNumerico(c))
            .filter(v => v !== null)
            .sort((a, b) => a - b);
        
        for (let i = 0; i < valores.length - 1; i++) {
            if (valores[i + 1] - valores[i] > 1) {
                const valorFaltante = valores[i] + 1;
                for (const [k, v] of Object.entries(VNUM)) {
                    if (v === valorFaltante) return k;
                }
            }
        }
        
        // Si no hay hueco, el comodín está al principio o al final
        if (valores[0] > 2) {
            const valorAnterior = valores[0] - 1;
            for (const [k, v] of Object.entries(VNUM)) {
                if (v === valorAnterior) return k;
            }
        } else if (valores[valores.length - 1] < 13) {
            const valorSiguiente = valores[valores.length - 1] + 1;
            for (const [k, v] of Object.entries(VNUM)) {
                if (v === valorSiguiente) return k;
            }
        } else if (valores[0] === 2 && valores.includes(13)) {
            return 'A'; // Q,K,A con comodín como J
        }
    }
    
    return null;
}

// Construye las jugadas necesarias para bajarse
function construirJugadas(mano, ronda) {
    const req = REQ[ronda];
    
    const tercias = encontrarTercias(mano);
    const corridas = encontrarCorridas(mano);
    
    if (tercias.length < req.t || corridas.length < req.c) return null;
    
    // Tomar las mejores según el algoritmo de priorización
    const terciasUsadas = tercias.slice(0, req.t);
    const corridasUsadas = corridas.slice(0, req.c);
    
    const cartasUsadas = new Set();
    terciasUsadas.forEach(t => t.forEach(c => cartasUsadas.add(c.id)));
    corridasUsadas.forEach(c => c.forEach(carta => cartasUsadas.add(carta.id)));
    
    return {
        tercias: terciasUsadas,
        corridas: corridasUsadas,
        sobrantes: mano.filter(c => !cartasUsadas.has(c.id))
    };
}

function puedeBajarse(mano, ronda) {
    const req = REQ[ronda];
    const tercias = encontrarTercias(mano);
    const corridas = encontrarCorridas(mano);
    
    return tercias.length >= req.t && corridas.length >= req.c;
}

// Validaciones para acomodar cartas en jugadas existentes
function puedeAcomodarEnTercia(carta, tercia) {
    if (carta.comodin) {
        const tieneComodin = tercia.some(c => c.comodin);
        return !tieneComodin;
    }
    
    const valores = tercia.filter(c => !c.comodin).map(c => c.valor);
    if (valores.length === 0) return true;
    
    return carta.valor === valores[0];
}

function puedeAcomodarEnCorrida(carta, corrida) {
    if (carta.comodin) {
        const tieneComodin = corrida.some(c => c.comodin);
        return !tieneComodin;
    }
    
    const cartasNormales = corrida.filter(c => !c.comodin);
    if (cartasNormales.length === 0) return true;
    
    if (carta.palo !== cartasNormales[0].palo) return false;
    
    const valores = cartasNormales
        .map(c => VNUM[c.valor])
        .sort((a, b) => a - b);
    const valorCarta = VNUM[carta.valor];
    
    return valorCarta === valores[0] - 1 || 
           valorCarta === valores[valores.length - 1] + 1 ||
           (carta.valor === 'A' && valores[valores.length - 1] === 13) ||
           (carta.valor === '2' && valores[0] === 1);
}

function puedeAcomodar(carta, jugada) {
    return jugada.tipo === 'tercia'
        ? puedeAcomodarEnTercia(carta, jugada.cartas)
        : puedeAcomodarEnCorrida(carta, jugada.cartas);
}

// Verifica si una carta puede reemplazar a un comodín en una jugada
function puedeReemplazarComodin(carta, jugada) {
    if (carta.comodin) return false;
    
    const tieneComodin = jugada.cartas.some(c => c.comodin);
    if (!tieneComodin) return false;
    
    const valorRequerido = getValorComodinEnJugada(jugada);
    if (!valorRequerido) return false;
    
    if (jugada.tipo === 'tercia') {
        return carta.valor === valorRequerido;
    } else {
        const cartasNormales = jugada.cartas.filter(c => !c.comodin);
        if (cartasNormales.length === 0) return true;
        return carta.palo === cartasNormales[0].palo && carta.valor === valorRequerido;
    }
}

// Motor principal del juego
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
        }));
        this.ronda = 1;
        this.dealer = 0;
        this.turno = 1 % jugadores.length;
        this.mazo = [];
        this.fondo = [];
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

    // Rearma el mazo si se acaba
    chkMazo() {
        if (!this.mazo.length && this.fondo.length > 1) {
            const last = this.fondo.pop();
            this.mazo = shuffle([...this.fondo]);
            this.fondo = [last];
            this.addLog('♻️ Mazo rearmado.');
        }
    }

    repartir() {
        this.mazo = mkMazo();
        this.fondo = [];
        this.jugadores.forEach(j => {
            j.mano = [];
            j.bajado = false;
            j.pts_r = 0;
            j.jugadas = [];
        });
        
        const n = 5 + this.ronda;
        for (let i = 0; i < n; i++) {
            this.jugadores.forEach(j => {
                this.chkMazo();
                j.mano.push(this.mazo.pop());
            });
        }
        
        this.chkMazo();
        this.fondo.push(this.mazo.pop());
        this.estado = 'esperando_robo';
        this.addLog(`🃏 Ronda ${this.ronda}. Dealer: ${this.jugadores[this.dealer].nombre}. Inicia: ${this.jActivo.nombre}.`);
    }

    // Acciones de los jugadores
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
        
        // Determinar quién puede tener castigo
        let idx = (this.turno + 1) % this.jugadores.length;
        while (this.jugadores[idx].bajado && idx !== this.turno) {
            idx = (idx + 1) % this.jugadores.length;
        }
        
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
        if (this.jugadores[this.castigo_idx].id !== playerId)
            return this._err('No es tu turno de castigo.');
        
        const jc = this.jugadores[this.castigo_idx];
        const top = this.fondo[this.fondo.length - 1];
        
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
            this.addLog(`🙅 ${jc.nombre} pasó.`);
            
            let sig = (this.castigo_idx + 1) % this.jugadores.length;
            while (this.jugadores[sig].bajado && sig !== this.turno) {
                sig = (sig + 1) % this.jugadores.length;
            }
            
            if (sig === this.turno) {
                this.estado = 'esperando_accion';
            } else {
                this.castigo_idx = sig;
            }
            
            this.lastAction = Date.now();
            return this._ok('castigo_pasa', { nextCastigoIdx: this.estado === 'fase_castigo' ? sig : -1 });
        }
    }

    acBajar(playerId) {
        const err = this._checkTurn(playerId, 'esperando_accion');
        if (err) return err;
        if (this.jActivo.bajado) return this._err('Ya te bajaste.');
        
        const jugadas = construirJugadas(this.jActivo.mano, this.ronda);
        if (!jugadas) return this._err('No cumples los requisitos.');
        
        // Registrar las jugadas
        jugadas.tercias.forEach(t => {
            this.jActivo.jugadas.push({ tipo: 'tercia', cartas: t });
        });
        
        jugadas.corridas.forEach(c => {
            this.jActivo.jugadas.push({ tipo: 'corrida', cartas: c });
        });
        
        this.jActivo.mano = jugadas.sobrantes;
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
        this.fondo.push(carta);
        this.addLog(`💳 ${j.nombre} pagó ${carta.valor}${carta.palo || ''}.`);
        this.lastAction = Date.now();
        
        if (j.mano.length === 0 && j.bajado) {
            return this._finRonda(this.turno, { tipo: 'pagar', carta });
        }
        
        const prevTurno = this.turno;
        this.turno = (this.turno + 1) % this.jugadores.length;
        this.estado = 'esperando_robo';
        this.addLog(`➡️ Turno de ${this.jActivo.nombre}.`);
        
        return this._ok('pagar', { carta, jugadorIdx: prevTurno, nextTurno: this.turno });
    }

    acIntercambiarComodin(playerId, cartaId, origenJugadorIdx, origenJugadaIdx) {
        const j = this._findPlayer(playerId);
        if (!j) return this._err('Jugador no encontrado.');
        
        const tidx = this.jugadores.indexOf(j);
        if (tidx !== this.turno) return this._err('No es tu turno.');
        
        if (this.estado !== 'esperando_accion' && this.estado !== 'esperando_pago') {
            return this._err('No es momento de intercambiar comodines.');
        }
        
        const origen = this.jugadores[origenJugadorIdx];
        if (!origen || !origen.bajado) return this._err('Jugador origen no se ha bajado.');
        
        const jugadaOrigen = origen.jugadas[origenJugadaIdx];
        if (!jugadaOrigen) return this._err('Jugada no encontrada.');
        
        const comodinIdx = jugadaOrigen.cartas.findIndex(c => c.comodin);
        if (comodinIdx === -1) return this._err('No hay comodín en esa jugada.');
        
        const cartaEnManoIdx = j.mano.findIndex(c => c.id === cartaId);
        if (cartaEnManoIdx === -1) return this._err('Carta no encontrada en tu mano.');
        
        const cartaParaIntercambiar = j.mano[cartaEnManoIdx];
        
        if (!puedeReemplazarComodin(cartaParaIntercambiar, jugadaOrigen)) {
            return this._err('Esta carta no puede reemplazar al comodín en esa jugada.');
        }
        
        // Realizar el intercambio
        const comodin = jugadaOrigen.cartas[comodinIdx];
        jugadaOrigen.cartas[comodinIdx] = cartaParaIntercambiar;
        j.mano[cartaEnManoIdx] = comodin;
        
        this.addLog(`🔄 ${j.nombre} intercambió ${cartaParaIntercambiar.valor}${cartaParaIntercambiar.palo || ''} por un comodín de ${origen.nombre}.`);
        this.lastAction = Date.now();
        
        if (j.mano.length === 0 && j.bajado) {
            return this._finRonda(tidx, { tipo: 'intercambiar', carta: cartaParaIntercambiar, comodin });
        }
        
        return this._ok('intercambiar_comodin', {
            jugadorIdx: tidx,
            origenJugadorIdx,
            origenJugadaIdx,
            cartaEntregada: cartaParaIntercambiar,
            comodinRecibido: comodin
        });
    }

    acAcomodar(playerId, cartaId, destJugadorIdx, destJugadaIdx) {
        const j = this._findPlayer(playerId);
        if (!j) return this._err('Jugador no encontrado.');
        
        const tidx = this.jugadores.indexOf(j);
        if (tidx !== this.turno) return this._err('No es tu turno.');
        
        const dest = this.jugadores[destJugadorIdx];
        if (!dest || !dest.bajado) return this._err('Jugador destino no se ha bajado.');
        
        const jug = dest.jugadas[destJugadaIdx];
        if (!jug) return this._err('Jugada no encontrada.');
        
        const cidx = j.mano.findIndex(c => c.id === cartaId);
        if (cidx < 0) return this._err('Carta no encontrada.');
        
        const carta = j.mano[cidx];
        
        if (!puedeAcomodar(carta, jug)) {
            return this._err(`No puedes acomodar ${carta.valor}${carta.palo || ''} ahí.`);
        }
        
        jug.cartas.push(carta);
        j.mano.splice(cidx, 1);
        this.addLog(`🃏 ${j.nombre} acomodó en jugada de ${dest.nombre}.`);
        this.lastAction = Date.now();
        
        if (j.mano.length === 0 && j.bajado) {
            return this._finRonda(tidx, { tipo: 'acomodar', carta });
        }
        
        return this._ok('acomodar', {
            carta,
            jugadorIdx: tidx,
            destJugadorIdx,
            destJugadaIdx
        });
    }

    acReordenarMano(playerId, newOrder) {
        const j = this._findPlayer(playerId);
        if (!j) return this._err('Jugador no encontrado.');
        
        const reordered = newOrder.map(id => j.mano.find(c => c.id === id)).filter(Boolean);
        if (reordered.length !== j.mano.length) return this._err('Orden inválido.');
        
        j.mano = reordered;
        return this._ok('reordenar', { jugadorIdx: this.jugadores.indexOf(j) }, false);
    }

    // Validaciones internas
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

    // Cuando un jugador se queda sin cartas
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
                jugadores: this.jugadores.map(j => ({
                    nombre: j.nombre,
                    pts_t: j.pts_t
                }))
            });
        }
        
        this.dealer = (this.dealer + 1) % this.jugadores.length;
        this.turno = (this.dealer + 1) % this.jugadores.length;
        this.repartir();
        
        return this._ok('nueva_ronda', { ronda: this.ronda });
    }

    // Estado público (oculta manos de otros jugadores)
    stateFor(playerId) {
        const base = this.publicState();
        base.jugadores = this.jugadores.map(j => {
            if (j.id === playerId) {
                return { ...j };
            } else {
                return {
                    ...j,
                    mano: j.mano.map(() => ({ hidden: true }))
                };
            }
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
            })),
            log: this.log.slice(-6).map(l => l.msg),
            req: REQ[this.ronda],
        };
    }
}

module.exports = { GameEngine, REQ, PUNTOS };