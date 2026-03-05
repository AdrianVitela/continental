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

// ═══════════════════════════════════════════════════
// FUNCIONES PARA MANEJO DE COMODINES
// ═══════════════════════════════════════════════════

// Determinar qué valor está reemplazando un comodín en una jugada
function getValorComodinEnJugada(jugada) {
    if (!jugada) return null;
    
    const cartasNormales = jugada.cartas.filter(c => !c.comodin);
    if (cartasNormales.length === 0) return null;
    
    if (jugada.tipo === 'tercia') {
        // En una tercia, el comodín representa el mismo valor que las demás
        return cartasNormales[0].valor;
    } else {
        // En una corrida, encontrar el hueco
        const valores = cartasNormales
            .map(c => VNUM[c.valor])
            .sort((a, b) => a - b);
        
        // Buscar el primer hueco en la secuencia
        let valorEsperado = valores[0];
        for (let i = 0; i < valores.length; i++) {
            if (valores[i] !== valorEsperado) {
                // Encontramos el hueco
                for (const [k, v] of Object.entries(VNUM)) {
                    if (v === valorEsperado) return k;
                }
            }
            valorEsperado++;
        }
        
        // Si no hay hueco, el comodín está al final
        if (valores[valores.length - 1] < 13) {
            const valorSiguiente = valores[valores.length - 1] + 1;
            for (const [k, v] of Object.entries(VNUM)) {
                if (v === valorSiguiente) return k;
            }
        }
    }
    
    return null;
}

// Guardar el valor que reemplaza el comodín en la jugada
function guardarValorComodin(jugada) {
    if (!jugada) return;
    
    const comodin = jugada.cartas.find(c => c.comodin);
    if (!comodin) return;
    
    const valorReemplazado = getValorComodinEnJugada(jugada);
    if (valorReemplazado) {
        // Guardamos el valor en el mismo objeto del comodín para referencia futura
        comodin.valorReemplazado = valorReemplazado;
    }
}

// Verificar si una carta puede reemplazar a un comodín
function puedeReemplazarComodin(carta, jugada) {
    if (carta.comodin) return false;
    
    const comodin = jugada.cartas.find(c => c.comodin);
    if (!comodin) return false;
    
    const valorReemplazado = comodin.valorReemplazado || getValorComodinEnJugada(jugada);
    if (!valorReemplazado) return false;
    
    if (jugada.tipo === 'tercia') {
        return carta.valor === valorReemplazado;
    } else {
        const cartasNormales = jugada.cartas.filter(c => !c.comodin);
        if (cartasNormales.length === 0) return true;
        return carta.palo === cartasNormales[0].palo && carta.valor === valorReemplazado;
    }
}

// ═══════════════════════════════════════════════════
// FUNCIONES DE VALIDACIÓN DE JUGADAS
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
    
    // Tercias sin comodines
    for (const valor in grupos) {
        const cartas = grupos[valor];
        while (cartas.length >= 3) {
            terciasEncontradas.push(cartas.splice(0, 3));
        }
    }
    
    // Tercias con comodines
    for (const valor in grupos) {
        const cartas = grupos[valor];
        while (cartas.length === 2 && comodines.length > comodinesUsados.size) {
            const comodinDisponible = comodines.find(c => !comodinesUsados.has(c.id));
            if (comodinDisponible) {
                const nuevaTercia = [...cartas, comodinDisponible];
                terciasEncontradas.push(nuevaTercia);
                comodinesUsados.add(comodinDisponible.id);
                cartas.splice(0, 2);
            } else {
                break;
            }
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
            let comodinesIds = [];
            
            for (let j = i + 1; j < valores.length; j++) {
                const esperado = secuencia[secuencia.length - 1] + 1;
                
                if (valores[j] === esperado) {
                    secuencia.push(valores[j]);
                } else {
                    // Intentar llenar con comodines
                    const faltantes = esperado - secuencia[secuencia.length - 1] - 1;
                    if (comodinesUsados + faltantes <= comodines.length) {
                        for (let k = 0; k < faltantes; k++) {
                            secuencia.push(`JOKER_${secuencia[secuencia.length - 1] + 1}`);
                            comodinesUsados++;
                        }
                        secuencia.push(valores[j]);
                    } else {
                        break;
                    }
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
                        if (comodin) {
                            cartasSecuencia.push(comodin);
                            comodinesUsadosIds.add(comodin.id);
                        } else {
                            valida = false;
                            break;
                        }
                    } else {
                        const carta = mapaValores[item]?.find(c => !cartasUsadas.has(c.id));
                        if (carta) {
                            cartasSecuencia.push(carta);
                        } else {
                            valida = false;
                            break;
                        }
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
    const tercias = encontrarTercias(mano);
    const corridas = encontrarCorridas(mano);
    
    return tercias.length >= req.t && corridas.length >= req.c;
}

function construirJugadas(mano, ronda) {
    const req = REQ[ronda];
    const tercias = encontrarTercias(mano);
    const corridas = encontrarCorridas(mano);
    
    if (tercias.length < req.t || corridas.length < req.c) return null;
    
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

// ═══════════════════════════════════════════════════
// VALIDACIÓN PARA ACOMODAR CARTAS
// ═══════════════════════════════════════════════════

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
           valorCarta === valores[valores.length - 1] + 1;
}

function puedeAcomodar(carta, jugada) {
    return jugada.tipo === 'tercia'
        ? puedeAcomodarEnTercia(carta, jugada.cartas)
        : puedeAcomodarEnCorrida(carta, jugada.cartas);
}

// ═══════════════════════════════════════════════════
// NUEVAS FUNCIONES DE VALIDACIÓN PARA JUGADAS CONSTRUIDAS
// ═══════════════════════════════════════════════════

// Validar una tercia (puede estar desordenada)
function validarTercia(cartas) {
    if (cartas.length < 3) return false;
    
    // Separar normales y comodines
    const normales = cartas.filter(c => !c.comodin);
    const comodines = cartas.filter(c => c.comodin);
    
    // Si solo hay comodines, es válido (mínimo 3)
    if (normales.length === 0) return cartas.length >= 3;
    
    // Verificar que todas las normales sean del mismo valor
    const primerValor = normales[0].valor;
    const todosIguales = normales.every(c => c.valor === primerValor);
    
    if (!todosIguales) return false;
    
    // Verificar que no haya más de 8 cartas del mismo valor
    // (2 barajas × 4 palos = máximo 8 cartas por valor)
    if (normales.length > 8) return false;
    
    return true;
}

// Ordenar una corrida correctamente (detectando si es ascendente o descendente)
function ordenarCorrida(cartas) {
    // Separar normales y comodines
    const normales = cartas.filter(c => !c.comodin).map(c => ({
        ...c,
        valorNum: VNUM[c.valor]
    }));
    
    const comodines = cartas.filter(c => c.comodin);
    
    if (normales.length === 0) return cartas; // Solo comodines
    
    // Detectar la dirección de la secuencia
    const valores = normales.map(c => c.valorNum);
    
    // Función para verificar si una secuencia es continua
    function esSecuenciaContinua(arr) {
        for (let i = 0; i < arr.length - 1; i++) {
            if (arr[i + 1] !== arr[i] + 1) return false;
        }
        return true;
    }
    
    // Probar orden ascendente
    const ascendente = [...valores].sort((a, b) => a - b);
    const esAscendente = esSecuenciaContinua(ascendente);
    
    // Probar orden descendente
    const descendente = [...valores].sort((a, b) => b - a);
    const esDescendente = esSecuenciaContinua(descendente);
    
    // Ordenar según la dirección válida detectada
    let normalesOrdenadas;
    if (esAscendente) {
        normalesOrdenadas = [...normales].sort((a, b) => a.valorNum - b.valorNum);
    } else if (esDescendente) {
        normalesOrdenadas = [...normales].sort((a, b) => b.valorNum - a.valorNum);
    } else {
        // Si ninguna dirección es continua, ordenamos ascendente por defecto
        normalesOrdenadas = [...normales].sort((a, b) => a.valorNum - b.valorNum);
    }
    
    // Insertar comodines en los huecos de la secuencia
    const resultado = [];
    const valoresOrdenados = normalesOrdenadas.map(c => c.valorNum);
    
    // Si hay comodines, intentar insertarlos en los huecos
    if (comodines.length > 0) {
        let comodinesRestantes = [...comodines];
        
        for (let i = 0; i < normalesOrdenadas.length; i++) {
            resultado.push(normalesOrdenadas[i]);
            
            // Si no es el último, verificar si hay hueco hasta la siguiente carta
            if (i < normalesOrdenadas.length - 1) {
                const actual = valoresOrdenados[i];
                const siguiente = valoresOrdenados[i + 1];
                const hueco = Math.abs(siguiente - actual) - 1;
                
                // Insertar comodines en el hueco
                for (let j = 0; j < hueco && comodinesRestantes.length > 0; j++) {
                    resultado.push(comodinesRestantes.shift());
                }
            }
        }
        
        // Añadir comodines restantes al final
        resultado.push(...comodinesRestantes);
    } else {
        resultado.push(...normalesOrdenadas);
    }
    
    return resultado;
}

// Validar una corrida (puede estar desordenada)
function validarCorrida(cartas) {
    if (cartas.length < 4) return false;
    
    // Separar normales y comodines
    const normales = cartas.filter(c => !c.comodin);
    const comodines = cartas.filter(c => c.comodin);
    
    // Si solo hay comodines, es válido (mínimo 4)
    if (normales.length === 0) return cartas.length >= 4;
    
    // Verificar que todas las normales sean del mismo palo
    const primerPalo = normales[0].palo;
    const mismoPalo = normales.every(c => c.palo === primerPalo);
    
    if (!mismoPalo) return false;
    
    // Obtener valores numéricos
    const valores = normales.map(c => VNUM[c.valor]);
    
    // Función para verificar si una secuencia es continua con posibles comodines
    function esSecuenciaContinua(vals, comodinesDisponibles) {
        if (vals.length === 0) return true;
        
        for (let i = 0; i < vals.length - 1; i++) {
            const esperado = vals[i] + 1;
            const actual = vals[i + 1];
            
            if (actual === esperado) {
                continue;
            } else if (actual > esperado) {
                const saltos = actual - esperado;
                if (comodinesDisponibles >= saltos) {
                    comodinesDisponibles -= saltos;
                } else {
                    return false;
                }
            } else {
                return false;
            }
        }
        return true;
    }
    
    // Probar secuencia ascendente
    const ascendente = [...valores].sort((a, b) => a - b);
    if (esSecuenciaContinua(ascendente, comodines.length)) {
        return true;
    }
    
    // Probar secuencia descendente
    const descendente = [...valores].sort((a, b) => b - a);
    if (esSecuenciaContinua(descendente, comodines.length)) {
        return true;
    }
    
    // Caso especial: A puede ser 1 o 14 (después de K)
    if (valores.includes(1) && valores.includes(13)) {
        // Probar con A como 14
        const valoresConAComo14 = valores.map(v => v === 1 ? 14 : v).sort((a, b) => a - b);
        if (esSecuenciaContinua(valoresConAComo14, comodines.length)) {
            return true;
        }
    }
    
    return false;
}

// Validar TODAS las jugadas construidas
function validarJugadasConstruidas(jugadas) {
    const resultado = {
        valido: true,
        errores: [],
        jugadasOrdenadas: []
    };
    
    for (let i = 0; i < jugadas.length; i++) {
        const jugada = jugadas[i];
        const cartas = jugada.cartas;
        
        if (jugada.tipo === 'tercia') {
            if (!validarTercia(cartas)) {
                resultado.valido = false;
                resultado.errores.push(`Tercia ${i+1} inválida`);
            } else {
                resultado.jugadasOrdenadas.push({
                    tipo: 'tercia',
                    cartas: cartas
                });
            }
        } else if (jugada.tipo === 'corrida') {
            if (!validarCorrida(cartas)) {
                resultado.valido = false;
                resultado.errores.push(`Corrida ${i+1} inválida`);
            } else {
                const cartasOrdenadas = ordenarCorrida(cartas);
                resultado.jugadasOrdenadas.push({
                    tipo: 'corrida',
                    cartas: cartasOrdenadas
                });
            }
        }
    }
    
    return resultado;
}

// ═══════════════════════════════════════════════════
// NUEVAS FUNCIONES PARA DETECTAR ESTADO DEL BOTÓN BAJAR
// ═══════════════════════════════════════════════════

// Verifica si una corrida está completa (tiene al menos 4 cartas del mismo palo en secuencia)
function corridaCompleta(cartas) {
    if (cartas.length < 4) return false;
    
    const normales = cartas.filter(c => !c.comodin);
    if (normales.length === 0) return false;
    
    const primerPalo = normales[0].palo;
    const mismoPalo = normales.every(c => c.palo === primerPalo);
    if (!mismoPalo) return false;
    
    const valores = normales.map(c => VNUM[c.valor]).sort((a, b) => a - b);
    
    for (let i = 0; i < valores.length - 1; i++) {
        if (valores[i + 1] !== valores[i] + 1) return false;
    }
    
    return true;
}

// Verifica si una corrida está casi completa (le falta 1 carta para ser completa)
function corridaCasiCompleta(cartas) {
    if (cartas.length < 3) return false;
    
    const normales = cartas.filter(c => !c.comodin);
    const comodines = cartas.filter(c => c.comodin);
    
    if (normales.length === 0) return false;
    
    const primerPalo = normales[0].palo;
    const mismoPalo = normales.every(c => c.palo === primerPalo);
    if (!mismoPalo) return false;
    
    const valores = normales.map(c => VNUM[c.valor]).sort((a, b) => a - b);
    
    let huecos = 0;
    for (let i = 0; i < valores.length - 1; i++) {
        const diferencia = valores[i + 1] - valores[i];
        if (diferencia === 2) {
            huecos += 1;
        } else if (diferencia > 2) {
            return false;
        }
    }
    
    const puedeExtenderseAlPrincipio = valores[0] > 1;
    const puedeExtenderseAlFinal = valores[valores.length - 1] < 13;
    
    const totalHuecos = huecos + (puedeExtenderseAlPrincipio ? 1 : 0) + (puedeExtenderseAlFinal ? 1 : 0);
    
    return totalHuecos === 1 && (cartas.length + (comodines.length > 0 ? 1 : 0)) >= 4;
}

// Verifica si una tercia está completa (3 o más cartas del mismo valor)
function terciaCompleta(cartas) {
    if (cartas.length < 3) return false;
    
    const normales = cartas.filter(c => !c.comodin);
    if (normales.length === 0) return false;
    
    const primerValor = normales[0].valor;
    return normales.every(c => c.valor === primerValor);
}

// Verifica si una tercia está casi completa (2 cartas del mismo valor + posibilidad)
function terciaCasiCompleta(cartas) {
    if (cartas.length < 2) return false;
    
    const normales = cartas.filter(c => !c.comodin);
    const comodines = cartas.filter(c => c.comodin);
    
    if (normales.length === 0) return false;
    
    const primerValor = normales[0].valor;
    const mismoValor = normales.every(c => c.valor === primerValor);
    
    if (!mismoValor) return false;
    
    if (normales.length === 2 && comodines.length >= 1) return true;
    if (normales.length === 2) return true;
    
    return false;
}

// Función principal para determinar si el botón "Bajar" debe habilitarse
function puedeHabilitarBajar(jugadasConstruidas, req) {
    if (!jugadasConstruidas || jugadasConstruidas.length === 0) return false;
    
    let terciasCompletas = 0;
    let corridasCompletas = 0;
    let terciasCasiCompletas = 0;
    let corridasCasiCompletas = 0;
    
    jugadasConstruidas.forEach(jugada => {
        if (jugada.tipo === 'tercia') {
            if (terciaCompleta(jugada.cartas)) {
                terciasCompletas++;
            } else if (terciaCasiCompleta(jugada.cartas)) {
                terciasCasiCompletas++;
            }
        } else if (jugada.tipo === 'corrida') {
            if (corridaCompleta(jugada.cartas)) {
                corridasCompletas++;
            } else if (corridaCasiCompleta(jugada.cartas)) {
                corridasCasiCompletas++;
            }
        }
    });
    
    if (terciasCompletas >= req.t && corridasCompletas >= req.c) {
        return true;
    }
    
    const totalCompletas = terciasCompletas + corridasCompletas;
    const totalRequeridas = req.t + req.c;
    
    if (totalCompletas === totalRequeridas - 1) {
        const faltanTercias = req.t - terciasCompletas;
        const faltanCorridas = req.c - corridasCompletas;
        
        if (faltanTercias === 1 && terciasCasiCompletas >= 1) return true;
        if (faltanCorridas === 1 && corridasCasiCompletas >= 1) return true;
    }
    
    return false;
}

// ═══════════════════════════════════════════════════
// VALIDACIÓN DE BAJADA EN FALSO
// ═══════════════════════════════════════════════════

// Verificar si hay una bajada en falso (cartas de diferentes palos en una corrida)
function detectarBajadaEnFalso(jugadas) {
    const errores = [];
    
    jugadas.forEach((jugada, index) => {
        if (jugada.tipo === 'corrida') {
            const normales = jugada.cartas.filter(c => !c.comodin);
            
            if (normales.length > 0) {
                const primerPalo = normales[0].palo;
                const palosDiferentes = normales.some(c => c.palo !== primerPalo);
                
                if (palosDiferentes) {
                    errores.push({
                        tipo: 'falso',
                        jugadaIndex: index,
                        mensaje: 'Corrida con palos diferentes'
                    });
                }
            }
            
            if (normales.length >= 2) {
                const valores = normales.map(c => VNUM[c.valor]).sort((a, b) => a - b);
                for (let i = 0; i < valores.length - 1; i++) {
                    if (valores[i + 1] - valores[i] > 2) {
                        errores.push({
                            tipo: 'invalida',
                            jugadaIndex: index,
                            mensaje: 'Corrida con saltos grandes'
                        });
                        break;
                    }
                }
            }
        }
    });
    
    return errores;
}

// Aplicar penalización por bajada en falso
function aplicarPenalizacionBajadaFalso(jugador) {
    jugador.penalizacion = {
        activa: true,
        turnosRestantes: 2,
        fecha: Date.now()
    };
    
    jugador.puedeBajar = false;
    
    return `⚠️ ${jugador.nombre} hizo una bajada en falso. No podrá bajar durante 2 turnos.`;
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
            jugadas: [],   // [{tipo, cartas}]
            conectado: true,
            penalizacion: null,
            puedeBajar: true,
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
            j.penalizacion = null;
            j.puedeBajar = true;
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

    acBajar(playerId, jugadasConstruidas) {
        const err = this._checkTurn(playerId, 'esperando_accion');
        if (err) return err;
        if (this.jActivo.bajado) return this._err('Ya te bajaste.');
        
        // Verificar si el jugador tiene penalización activa
        if (this.jActivo.penalizacion?.activa) {
            return this._err(`Tienes penalización activa por ${this.jActivo.penalizacion.turnosRestantes} turnos más. No puedes bajar.`);
        }
        
        // Validar que se recibieron jugadas
        if (!jugadasConstruidas || !Array.isArray(jugadasConstruidas) || jugadasConstruidas.length === 0) {
            return this._err('No hay jugadas para bajar.');
        }
        
        // DETECTAR BAJADA EN FALSO
        const erroresFalso = detectarBajadaEnFalso(jugadasConstruidas);
        const tieneBajadaFalso = erroresFalso.some(e => e.tipo === 'falso');
        
        if (tieneBajadaFalso) {
            const mensajePenalizacion = aplicarPenalizacionBajadaFalso(this.jActivo);
            this.addLog(mensajePenalizacion);
            return this._err('¡BAJADA EN FALSO! Has mezclado palos en una corrida. No podrás bajar durante 2 turnos.');
        }
        
        // Validar las jugadas construidas por el usuario
        const validacion = validarJugadasConstruidas(jugadasConstruidas);
        
        if (!validacion.valido) {
            return this._err(validacion.errores.join(', '));
        }
        
        // Verificar que se cumplan los requisitos de la ronda
        const terciasCount = validacion.jugadasOrdenadas.filter(j => j.tipo === 'tercia').length;
        const corridasCount = validacion.jugadasOrdenadas.filter(j => j.tipo === 'corrida').length;
        const req = REQ[this.ronda];
        
        if (terciasCount < req.t) {
            return this._err(`Necesitas ${req.t} tercias (tienes ${terciasCount})`);
        }
        
        if (corridasCount < req.c) {
            return this._err(`Necesitas ${req.c} corridas (tienes ${corridasCount})`);
        }
        
        // Recolectar IDs de todas las cartas usadas en las jugadas
        const cartasUsadasIds = new Set();
        validacion.jugadasOrdenadas.forEach(jugada => {
            jugada.cartas.forEach(carta => {
                cartasUsadasIds.add(carta.id);
            });
        });
        
        // Verificar que todas las cartas usadas están realmente en la mano del jugador
        for (const cartaId of cartasUsadasIds) {
            if (!this.jActivo.mano.some(c => c.id === cartaId)) {
                return this._err(`Carta ${cartaId} no está en tu mano`);
            }
        }
        
        // Registrar las jugadas ordenadas
        validacion.jugadasOrdenadas.forEach(jugada => {
            const nuevaJugada = {
                tipo: jugada.tipo,
                cartas: jugada.cartas
            };
            this.jActivo.jugadas.push(nuevaJugada);
            guardarValorComodin(nuevaJugada);
        });
        
        // Quitar las cartas usadas de la mano
        this.jActivo.mano = this.jActivo.mano.filter(c => !cartasUsadasIds.has(c.id));
        this.jActivo.bajado = true;
        
        this.addLog(`🔥 ${this.jActivo.nombre} se bajó en ronda ${this.ronda}!`);
        this.lastAction = Date.now();
        
        if (this.jActivo.mano.length === 0) {
            return this._finRonda(this.turno, { 
                tipo: 'bajar', 
                jugadas: this.jActivo.jugadas 
            });
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
        
        // Reducir penalizaciones al cambiar de turno
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

    acIntercambiarComodin(playerId, cartaId, origenJugadorIdx, origenJugadaIdx) {
        const j = this._findPlayer(playerId);
        if (!j) return this._err('Jugador no encontrado.');
        
        const tidx = this.jugadores.indexOf(j);
        if (tidx !== this.turno) return this._err('No es tu turno.');
        
        if (this.estado !== 'esperando_accion') {
            return this._err('Debes robar una carta antes de intercambiar.');
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
        
        const manoSimulada = [...j.mano];
        manoSimulada.splice(cartaEnManoIdx, 1);
        manoSimulada.push(jugadaOrigen.cartas[comodinIdx]);
        
        if (!puedeBajarse(manoSimulada, this.ronda)) {
            return this._err('Después del intercambio no podrías bajarte. Debes poder bajarte inmediatamente.');
        }
        
        const comodin = jugadaOrigen.cartas[comodinIdx];
        jugadaOrigen.cartas[comodinIdx] = cartaParaIntercambiar;
        j.mano[cartaEnManoIdx] = comodin;
        
        guardarValorComodin({ cartas: [comodin] });
        
        this.addLog(`🔄 ${j.nombre} intercambió ${cartaParaIntercambiar.valor}${cartaParaIntercambiar.palo || ''} por un comodín de ${origen.nombre}.`);
        this.lastAction = Date.now();
        
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
        
        if (!j.bajado) {
            return this._err('Debes bajarte primero antes de poder acomodar cartas en jugadas de otros.');
        }
        
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
        
        if (j.mano.length === 0) {
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

    // Nueva función para que el cliente consulte si puede habilitar el botón
    puedeBajarCliente(playerId, jugadasConstruidas) {
        const j = this._findPlayer(playerId);
        if (!j) return false;
        
        if (j.bajado) return false;
        if (j.penalizacion?.activa) return false;
        if (this.estado !== 'esperando_accion') return false;
        
        const req = REQ[this.ronda];
        return puedeHabilitarBajar(jugadasConstruidas, req);
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
                penalizacion: j.penalizacion,
                puedeBajar: j.puedeBajar,
            })),
            log: this.log.slice(-6).map(l => l.msg),
            req: REQ[this.ronda],
        };
    }
}

module.exports = { GameEngine, REQ, PUNTOS };