// client/js/game.js
'use strict';

const params = new URLSearchParams(location.search);
const MY_ID = params.get('pid');
const ROOM = params.get('code');
const SUIT_CLS = { '♠': 'blk-s', '♥': 'red-s', '♦': 'red-s', '♣': 'blk-s' };
const REQ_LABELS = {
    1: '2 tercias',
    2: '1 tercia + 1 corrida',
    3: '2 corridas',
    4: '3 tercias',
    5: '2 tercias + 1 corrida',
    6: '2 corridas + 1 tercia',
    7: '3 corridas — sin pagar'
};

const REQ = {
    1: { t: 2, c: 0 },
    2: { t: 1, c: 1 },
    3: { t: 0, c: 2 },
    4: { t: 3, c: 0 },
    5: { t: 2, c: 1 },
    6: { t: 1, c: 2 },
    7: { t: 0, c: 3 }
};

const VN = { 'A':1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13 };

let G = null;
let myIdx = -1;
let selId = null;
let ackSent = false;
let pendingReorderIdx = -1;
let intercambioMode = false;
let selectedComodinInfo = null;

let buildingCards = new Map(); // slotIndex (string) -> array de cartas completas

// ═══════════════════════════════════════════════════
// VALIDACIÓN CLIENTE PARA HABILITAR BOTÓN BAJAR
// ═══════════════════════════════════════════════════

function slotTerciaValido(cards) {
    if (cards.length < 3) return false;
    const normales = cards.filter(c => !c.comodin);
    const comodines = cards.filter(c => c.comodin);
    if (normales.length === 0) return false;
    if (comodines.length > 1) return false;
    const valorBase = normales[0].valor;
    return normales.every(c => c.valor === valorBase);
}

function slotCorridaValido(cards) {
    if (cards.length < 4) return false;
    const normales = cards.filter(c => !c.comodin);
    const comodines = cards.filter(c => c.comodin);
    if (normales.length === 0) return false;
    if (comodines.length > 1) return false;
    const palo = normales[0].palo;
    if (!normales.every(c => c.palo === palo)) return false;
    if (new Set(normales.map(c => c.valor)).size !== normales.length) return false;

    function esSecuenciaValida(vals, numComodines) {
        let huecos = 0;
        for (let i = 0; i < vals.length - 1; i++) {
            const diff = vals[i + 1] - vals[i];
            if (diff === 1) continue;
            if (diff === 2) { huecos++; continue; }
            return false;
        }
        return huecos <= numComodines;
    }

    const valsNorm = normales.map(c => VN[c.valor]).sort((a, b) => a - b);
    if (esSecuenciaValida(valsNorm, comodines.length)) return true;
    if (valsNorm.includes(1)) {
        const valsA14 = valsNorm.map(v => v === 1 ? 14 : v).sort((a, b) => a - b);
        if (esSecuenciaValida(valsA14, comodines.length)) return true;
    }
    return false;
}

function slotTerciaCasiCompleta(cards) {
    if (cards.length < 3) return false;
    const normales = cards.filter(c => !c.comodin);
    const comodines = cards.filter(c => c.comodin);
    if (normales.length === 0) return false;
    if (comodines.length > 1) return false;
    if (comodines.length === 1 && normales.length >= 2) return true;
    const conteo = {};
    normales.forEach(c => { conteo[c.valor] = (conteo[c.valor] || 0) + 1; });
    return Object.values(conteo).some(n => n >= 2);
}

function slotCorridaCasiCompleta(cards) {
    if (cards.length < 4) return false;
    const normales = cards.filter(c => !c.comodin);
    const comodines = cards.filter(c => c.comodin);
    if (normales.length === 0) return false;
    if (comodines.length > 1) return false;
    const palo = normales[0].palo;
    if (!normales.every(c => c.palo === palo)) return false;
    if (new Set(normales.map(c => c.valor)).size !== normales.length) return false;

    function contarHuecos(vals) {
        let h = 0;
        for (let i = 0; i < vals.length - 1; i++) {
            const diff = vals[i + 1] - vals[i];
            if (diff >= 2) h += diff - 1;
        }
        return h;
    }

    const valsNorm = normales.map(c => VN[c.valor]).sort((a, b) => a - b);
    const h1 = contarHuecos(valsNorm);
    if ((h1 - comodines.length) === 1) return true;
    if (valsNorm.includes(1)) {
        const valsA14 = valsNorm.map(v => v === 1 ? 14 : v).sort((a, b) => a - b);
        const h2 = contarHuecos(valsA14);
        if ((h2 - comodines.length) === 1) return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════
// DETECCIÓN AUTOMÁTICA DE INTERCAMBIOS POSIBLES
// ═══════════════════════════════════════════════════

const _intercambiosCache = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// detectarIntercambiosPosibles()
//
// CASO A — Jugador NO bajado (esperando_accion):
//   La carta debe permitir bajarse después del intercambio.
//   Validación: misma lógica que antes.
//
// CASO B — Jugador YA bajado (esperando_accion o esperando_pago):
//   Solo necesita que la carta encaje en el joker (mismo valor/palo).
//   No hay validación de "puede bajarse" — ya está bajado.
//   El joker recibido podrá acomodarse en otra jugada de la mesa.
//   Se valida también que el joker PUEDA acomodarse en alguna jugada
//   disponible para que el intercambio tenga utilidad.
// ─────────────────────────────────────────────────────────────────────────────
function detectarIntercambiosPosibles() {
    if (!G || myIdx < 0) return [];
    if (!isMyTurn()) return [];

    const me = G.jugadores[myIdx];
    if (!me) return [];

    const estadosValidos = ['esperando_accion', 'esperando_pago'];
    if (!estadosValidos.includes(G.estado)) return [];

    // Pre-bajada solo en esperando_accion
    if (!me.bajado && G.estado !== 'esperando_accion') return [];

    const intercambios = [];
    const cartasEnSlots = new Set();
    buildingCards.forEach(cards => cards.forEach(c => cartasEnSlots.add(c.id)));

    G.jugadores.forEach((jOrigen, ji) => {
        if (!jOrigen.bajado) return;
        // Post-bajada: también puede intercambiar en sus PROPIAS jugadas
        // Pre-bajada: solo en jugadas de otros (el joker recibido va a slots)
        if (!me.bajado && ji === myIdx) return;

        jOrigen.jugadas?.forEach((jug, jugi) => {
            const comodin = jug.cartas.find(c => c.comodin);
            if (!comodin) return;

            const valorNecesario = comodin.valorReemplazado;
            const paloNecesario = comodin.paloReemplazado;

            me.mano.forEach(carta => {
                if (carta.comodin) return;
                if (!me.bajado && cartasEnSlots.has(carta.id)) return;

                // ¿Esta carta encaja en el joker?
                const encaja = jug.tipo === 'tercia'
                    ? carta.valor === valorNecesario
                    : carta.valor === valorNecesario && carta.palo === paloNecesario;

                if (!encaja) return;

                // ══════════════════════════════════════════════
                // CASO B: Ya bajado — validación simplificada
                // Solo verifica que el joker recibido pueda ser
                // útil: que haya al menos una jugada en la mesa
                // donde se pueda acomodar.
                // ══════════════════════════════════════════════
                if (me.bajado) {
                    // El joker recibido puede acomodarse en cualquier jugada bajada
                    // que no tenga ya un joker (una jugada = máx 1 joker según reglas)
                    const jokerEsUtil = G.jugadores.some((jDest, jdi) => {
                        if (!jDest.bajado) return false;
                        return jDest.jugadas?.some((jugDest, jugiDest) => {
                            // No en la misma jugada de donde viene
                            if (jdi === ji && jugiDest === jugi) return false;
                            // La jugada destino no debe tener ya un joker
                            if (jugDest.cartas.some(c => c.comodin)) return false;
                            // El joker puede ir al final de una corrida o completar una tercia
                            return true; // el server valida la posición exacta
                        });
                    });

                    if (!jokerEsUtil) return;

                    const icObj = {
                        cartaId: carta.id,
                        cartaValor: carta.valor,
                        cartaPalo: carta.palo,
                        jugadorIdx: ji,
                        jugadaIdx: jugi,
                        comodinId: comodin.id,
                        esCasoBajado: true,
                    };
                    const icKey = `${ji}-${jugi}-${comodin.id}`;
                    _intercambiosCache.set(icKey, icObj);
                    intercambios.push(icObj);
                    return;
                }

                // ══════════════════════════════════════════════
                // CASO A: No bajado — validación completa
                // (lógica original sin cambios)
                // ══════════════════════════════════════════════
                const defs = getSlotDefsRonda(G.ronda);
                const jugadasSimuladas = [];
                let comodinUsadoEnSlot = false;

                for (const def of defs) {
                    const cards = buildingCards.get(def.index) || [];
                    if (cards.length === 0) continue;
                    const tieneLaCarta = cards.some(c => c.id === carta.id);
                    let cartasSlot = cards;
                    if (tieneLaCarta) {
                        cartasSlot = cards.map(c => c.id === carta.id ? { ...comodin, comodin: true } : c);
                        comodinUsadoEnSlot = true;
                    }
                    jugadasSimuladas.push({ tipo: def.type, cartas: cartasSlot.filter(Boolean) });
                }

                if (!comodinUsadoEnSlot) {
                    let comodinAsignado = false;
                    for (const def of defs) {
                        const slotCards = buildingCards.get(def.index) || [];
                        if (comodinAsignado) {
                            jugadasSimuladas.push({ tipo: def.type, cartas: slotCards.filter(Boolean) });
                            continue;
                        }
                        const conComodin = [...slotCards, { ...comodin, comodin: true }];
                        const valido = def.type === 'tercia' ? slotTerciaValido(conComodin) : slotCorridaValido(conComodin);
                        const sinComodin = def.type === 'tercia' ? slotTerciaValido(slotCards) : slotCorridaValido(slotCards);
                        if (!sinComodin && valido) {
                            jugadasSimuladas.push({ tipo: def.type, cartas: conComodin });
                            comodinAsignado = true;
                        } else {
                            jugadasSimuladas.push({ tipo: def.type, cartas: slotCards.filter(Boolean) });
                        }
                    }
                }

                const req = REQ[G.ronda];
                let terciasOk = 0, corridasOk = 0;
                for (const js of jugadasSimuladas) {
                    if (!js.cartas || js.cartas.length === 0) continue;
                    if (js.tipo === 'tercia' && slotTerciaValido(js.cartas)) terciasOk++;
                    if (js.tipo === 'corrida' && slotCorridaValido(js.cartas)) corridasOk++;
                }
                if (terciasOk < req.t || corridasOk < req.c) return;

                const icObj = {
                    cartaId: carta.id,
                    cartaValor: carta.valor,
                    cartaPalo: carta.palo,
                    jugadorIdx: ji,
                    jugadaIdx: jugi,
                    comodinId: comodin.id,
                    jugadasSimuladas,
                    esCasoBajado: false,
                };
                const icKey = `${ji}-${jugi}-${comodin.id}`;
                _intercambiosCache.set(icKey, icObj);
                intercambios.push(icObj);
            });
        });
    });

    return intercambios;
}

function getSlotDefsRonda(ronda) {
    const T = i => ({ index: String(i), type: 'tercia' });
    const C = i => ({ index: String(i), type: 'corrida' });
    const map = {
        1: [T(0), T(1)],
        2: [T(0), C(1)],
        3: [C(0), C(1)],
        4: [T(0), T(1), T(2)],
        5: [T(0), T(1), C(2)],
        6: [C(0), C(1), T(2)],
        7: [C(0), C(1), C(2)],
    };
    return map[ronda] || [];
}

function slotsListosParaBajar() {
    if (!G || myIdx < 0) return false;
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) return false;
    if (G.estado !== 'esperando_accion') return false;
    if (me.penalizacion?.activa) return false;

    const req = REQ[G.ronda];
    const defs = getSlotDefsRonda(G.ronda);

    let completos = 0, casiCompletos = 0, insuficientes = 0;
    for (const def of defs) {
        const cards = buildingCards.get(def.index) || [];
        const esCompleto = def.type === 'tercia' ? slotTerciaValido(cards) : slotCorridaValido(cards);
        const esCasi    = def.type === 'tercia' ? slotTerciaCasiCompleta(cards) : slotCorridaCasiCompleta(cards);
        if (esCompleto) completos++;
        else if (esCasi) casiCompletos++;
        else insuficientes++;
    }

    const totalSlots = defs.length;
    if (G.ronda === 7) {
        if (completos !== totalSlots) return false;
        const cartasEnSlots = new Set();
        buildingCards.forEach(cards => cards.forEach(c => { if (c?.id) cartasEnSlots.add(c.id); }));
        const sobrantes = (me.mano || []).filter(c => !cartasEnSlots.has(c.id));
        return sobrantes.length === 0;
    }
    if (completos === totalSlots) return true;
    if (completos === totalSlots - 1 && casiCompletos >= 1 && insuficientes === 0) return true;
    return false;
}

// ═══════════════════════════════════════════════════
// INICIALIZACIÓN Y SOCKET
// ═══════════════════════════════════════════════════

let _firstLoad = true;
const _animatedBajadas = new Set(); // IDs de cartas ya animadas en mesa

function init() {
    if (!MY_ID || !ROOM) { location.href = '/'; return; }
    localStorage.setItem('nombre_' + MY_ID, localStorage.getItem('nombre_' + MY_ID) || 'Jugador');
    setupSocketEvents();
    WS.connect();
}

function setupSocketEvents() {
    WS.on('_connected', () => {
        document.getElementById('modal-disconnected').classList.remove('show');
        document.getElementById('mode-pill').textContent = '🟢 Conectado';
    });
    WS.on('_disconnected', () => {
        document.getElementById('modal-disconnected').classList.add('show');
        document.getElementById('mode-pill').textContent = '🔴 Desconectado';
    });
    WS.on('state_update', async ({ event, data, state, tableColor }) => {
        if (!state) return;
        const prev = G;
        G = state;
        myIdx = G.jugadores.findIndex(j => j.id === MY_ID);
        if (tableColor) applyTableTheme(tableColor);

        const isNewRound = event === 'game_started' || event === 'nueva_ronda';
        const isFirstLoad = _firstLoad;
        _firstLoad = false;

        // Animar reparto solo si es ronda nueva (no recarga)
        const roundKey = `dealt_${ROOM}_r${G.ronda}`;
        const yaAnimado = sessionStorage.getItem(roundKey);

        if ((isNewRound || isFirstLoad) && !yaAnimado) {
            sessionStorage.setItem(roundKey, '1');
            await handleNewRound();
        } else {
            render();
            await applyEvent(event, data, prev);
        }
    });
    WS.on('player_reconnected', ({ nombre }) => toast(`${nombre} se reconectó`, 'green'));
    WS.on('player_disconnected', ({ nombre }) => toast(`${nombre} se desconectó`));
    WS.on('error', ({ msg }) => {
        toast(msg, 'red');
        const esBajada = msg && (
            msg.includes('BAJADA EN FALSO') ||
            msg.includes('Tercia') ||
            msg.includes('Corrida') ||
            msg.includes('Necesitas') ||
            msg.includes('no está en tu mano') ||
            msg.includes('No hay jugadas')
        );
        if (esBajada && buildingCards.size > 0) {
            const me = G?.jugadores?.[myIdx];
            if (me) {
                buildingCards.forEach((cards) => {
                    cards.forEach(carta => {
                        if (carta && !me.mano.some(c => c.id === carta.id)) me.mano.push(carta);
                    });
                });
                buildingCards.clear();
                if (msg.includes('BAJADA EN FALSO')) toast('⚠️ Las cartas regresaron a tus sobrantes. Penalizado 2 turnos.', 'red');
                render();
            }
        }
    });
}

// ═══════════════════════════════════════════════════
// EVENTOS / ANIMACIONES
// ═══════════════════════════════════════════════════

async function applyEvent(event, data, prev) {
    if (!event || !data) return;
    switch (event) {
        case 'game_started':
        case 'nueva_ronda':
            await handleNewRound(); break;
        case 'tomar_mazo':
            await handleTomarMazo(data); break;
        case 'tomar_fondo':
            await handleTomarFondo(data); break;
        case 'pagar':
            await handlePagar(data); break;
        case 'bajar':
            await handleBajar(data); break;
        case 'castigo_acepta':
            await handleCastigo(data); break;
        case 'intercambiar_comodin':
            await handleIntercambiarComodin(data); break;
        case 'fin_ronda':
            handleFinRonda(data); break;
        case 'fin_juego':
            showModalJuego(data.jugadores); break;
    }
}

async function handleNewRound() {
    ackSent = false;
    intercambioMode = false;
    selectedComodinInfo = null;
    buildingCards.clear();
    _animatedBajadas.clear();

    const mazoEl  = document.getElementById('mazo-wrap');
    const handZone = document.getElementById('discard-zone');
    const mano     = G.jugadores[myIdx]?.mano || [];

    // 1. Shuffle del mazo
    await Anim.shuffleAnim(mazoEl);

    // 2. Renderizar mano oculta para tener posiciones destino
    render();
    const cardEls = handZone?.querySelectorAll('.card');
    cardEls?.forEach(el => { el.style.opacity = '0'; el.style.transition = 'none'; });

    // Esperar un frame para que el DOM esté listo
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    if (!mazoEl || !handZone || !mano.length) return;

    const src = mazoEl.getBoundingClientRect();

    // 3. Animar cada carta una por una
    for (let i = 0; i < mano.length; i++) {
        await new Promise(r => setTimeout(r, i * 100));

        const ghost = document.createElement('div');
        ghost.className = 'cback';
        ghost.style.cssText = `
            position:fixed; z-index:9999; pointer-events:none;
            width:${src.width}px; height:${src.height}px;
            left:${src.left}px; top:${src.top}px;
            border-radius:var(--r);
            box-shadow:0 8px 28px rgba(0,0,0,.6);
            transform:scale(1.1);
            transition:none;
        `;
        document.body.appendChild(ghost);

        const targetEl = handZone.querySelectorAll('.card')[i];
        const dst = targetEl?.getBoundingClientRect() || handZone.getBoundingClientRect();

        await new Promise(r => setTimeout(r, 16));

        ghost.style.transition = 'all 280ms cubic-bezier(.22,1,.36,1)';
        ghost.style.left      = `${dst.left}px`;
        ghost.style.top       = `${dst.top}px`;
        ghost.style.width     = `${dst.width}px`;
        ghost.style.height    = `${dst.height}px`;
        ghost.style.transform = `scale(1) rotate(${(Math.random()-.5)*5}deg)`;

        // Mostrar carta real cuando llega el ghost
        setTimeout(() => {
            if (targetEl) {
                targetEl.style.transition = 'opacity 100ms ease';
                targetEl.style.opacity = '1';
            }
            ghost.remove();
        }, 260);
    }
}

async function handleTomarMazo(data) {
    if (data.jugadorIdx === myIdx) {
        const mazoEl    = document.getElementById('mazo-wrap');
        const handZone  = document.getElementById('discard-zone');
        if (!mazoEl || !handZone) return;

        const src = mazoEl.getBoundingClientRect();

        // Render con la carta nueva ya en mano pero oculta
        render();
        const newCardEl = handZone.querySelector(`.card[data-id="${data.carta?.id}"]`);
        if (newCardEl) {
            newCardEl.style.opacity    = '0';
            newCardEl.style.transition = 'none';
        }

        await new Promise(r => requestAnimationFrame(r));

        const dst = newCardEl?.getBoundingClientRect() || handZone.getBoundingClientRect();

        // Ghost volando desde el mazo
        const ghost = document.createElement('div');
        ghost.className = 'cback';
        ghost.style.cssText = `
            position:fixed; z-index:9999; pointer-events:none;
            width:${src.width}px; height:${src.height}px;
            left:${src.left}px; top:${src.top}px;
            border-radius:var(--r);
            box-shadow:0 8px 28px rgba(0,0,0,.6);
            transform:scale(1.1);
            transition:none;
        `;
        document.body.appendChild(ghost);

        await new Promise(r => setTimeout(r, 16));

        ghost.style.transition = 'all 300ms cubic-bezier(.22,1,.36,1)';
        ghost.style.left       = `${dst.left}px`;
        ghost.style.top        = `${dst.top}px`;
        ghost.style.width      = `${dst.width}px`;
        ghost.style.height     = `${dst.height}px`;
        ghost.style.transform  = 'scale(1)';
        ghost.style.boxShadow  = '0 0 20px rgba(200,160,69,.5)';

        await new Promise(r => setTimeout(r, 280));

        // Mostrar carta real con bounce
        if (newCardEl) {
            newCardEl.style.transition = 'opacity 80ms ease, transform 200ms cubic-bezier(.34,1.56,.64,1)';
            newCardEl.style.transform  = 'scale(1.15)';
            newCardEl.style.opacity    = '1';
            setTimeout(() => { newCardEl.style.transform = 'scale(1)'; }, 80);
        }
        ghost.remove();

    } else {
        // Otro jugador robó — pequeño destello en su tarjeta
        const oppEl = document.querySelector(`.opp[data-idx="${data.jugadorIdx}"]`);
        if (oppEl) {
            oppEl.style.transition  = 'box-shadow .15s ease';
            oppEl.style.boxShadow   = '0 0 16px rgba(255,255,255,.25)';
            setTimeout(() => { oppEl.style.boxShadow = ''; }, 400);
        }
    }
}

async function handleTomarFondo(data) {
    if (data.jugadorIdx === myIdx) {
        const fondoEl  = document.getElementById('fondo-wrap');
        const handZone = document.getElementById('discard-zone');
        if (!fondoEl || !handZone) return;
        const srcCard = fondoEl.querySelector('.card');
        const src = (srcCard || fondoEl).getBoundingClientRect();
        render();
        const newCardEl = handZone.querySelector(`.card[data-id="${data.carta?.id}"]`);
        if (newCardEl) { newCardEl.style.opacity = '0'; newCardEl.style.transition = 'none'; }
        await new Promise(r => requestAnimationFrame(r));
        const dst = newCardEl?.getBoundingClientRect() || handZone.getBoundingClientRect();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = srcCard ? srcCard.outerHTML : '<div class="cback"></div>';
        const ghost = wrapper.firstElementChild;
        ghost.style.cssText = `
            position:fixed; z-index:9999; pointer-events:none;
            width:${src.width}px; height:${src.height}px;
            left:${src.left}px; top:${src.top}px;
            border-radius:var(--r);
            box-shadow:0 10px 30px rgba(0,0,0,.6);
            transform:scale(1.05); transition:none;
        `;
        document.body.appendChild(ghost);
        await new Promise(r => setTimeout(r, 16));
        ghost.style.transition = 'all 320ms cubic-bezier(.22,1,.36,1)';
        ghost.style.left = `${dst.left}px`; ghost.style.top = `${dst.top}px`;
        ghost.style.width = `${dst.width}px`; ghost.style.height = `${dst.height}px`;
        ghost.style.transform = `scale(1) rotate(${(Math.random()-.5)*6}deg)`;
        ghost.style.boxShadow = '0 0 20px rgba(200,160,69,.6)';
        await new Promise(r => setTimeout(r, 300));
        if (newCardEl) {
            newCardEl.style.transition = 'opacity 80ms ease, transform 200ms cubic-bezier(.34,1.56,.64,1)';
            newCardEl.style.opacity = '1'; newCardEl.style.transform = 'scale(1.15)';
            setTimeout(() => { newCardEl.style.transform = 'scale(1)'; }, 80);
        }
        ghost.remove();
    } else {
        const oppEl = document.querySelector(`.opp[data-idx="${data.jugadorIdx}"]`);
        if (oppEl) {
            oppEl.style.transition = 'box-shadow .15s ease';
            oppEl.style.boxShadow  = '0 0 16px rgba(255,255,255,.25)';
            setTimeout(() => { oppEl.style.boxShadow = ''; }, 400);
        }
    }
}

async function handleCastigo(data) {
    if (data.jugadorIdx === myIdx && data.acepta) {
        const fondoEl  = document.getElementById('fondo-wrap');
        const mazoEl   = document.getElementById('mazo-wrap');
        const handZone = document.getElementById('discard-zone');
        if (!fondoEl || !mazoEl || !handZone) return;

        const fondoCard = fondoEl.querySelector('.card');
        const srcFondo  = (fondoCard || fondoEl).getBoundingClientRect();
        const srcMazo   = mazoEl.getBoundingClientRect();

        // Flash en el fondo
        fondoEl.style.transition = 'transform 120ms ease, box-shadow 120ms ease';
        fondoEl.style.transform  = 'scale(1.15)';
        fondoEl.style.boxShadow  = '0 0 40px rgba(200,160,69,.9)';
        setTimeout(() => { fondoEl.style.transform = 'scale(1)'; fondoEl.style.boxShadow = ''; }, 150);

        // Crear ghosts ANTES del render
        const g1w = document.createElement('div');
        g1w.innerHTML = fondoCard ? fondoCard.outerHTML : '<div class="cback"></div>';
        const g1 = g1w.firstElementChild;
        g1.style.cssText = `
            position:fixed; z-index:9999; pointer-events:none;
            width:${srcFondo.width}px; height:${srcFondo.height}px;
            left:${srcFondo.left}px; top:${srcFondo.top}px;
            border-radius:var(--r); box-shadow:0 10px 30px rgba(0,0,0,.6);
        `;
        document.body.appendChild(g1);

        const g2 = document.createElement('div');
        g2.className = 'cback';
        g2.style.cssText = `
            position:fixed; z-index:9999; pointer-events:none;
            width:${srcMazo.width}px; height:${srcMazo.height}px;
            left:${srcMazo.left}px; top:${srcMazo.top}px;
            border-radius:var(--r); box-shadow:0 10px 30px rgba(0,0,0,.6);
        `;
        document.body.appendChild(g2);

        render();

        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));

        // Buscar cartas nuevas por ID
        let newCards = [];
        if (data.cartaFondo?.id && data.cartaMazo?.id) {
            const e1 = handZone.querySelector(`.card[data-id="${data.cartaFondo.id}"]`);
            const e2 = handZone.querySelector(`.card[data-id="${data.cartaMazo.id}"]`);
            newCards = [e1, e2].filter(Boolean);
        }
        // Fallback: últimas 2 cartas
        if (newCards.length < 2) newCards = [...handZone.querySelectorAll('.card')].slice(-2);
        if (newCards.length < 2) { g1.remove(); g2.remove(); return; }

        newCards.forEach(el => { el.style.opacity = '0'; el.style.transition = 'none'; });

        const dst1 = newCards[0]?.getBoundingClientRect();
        const dst2 = newCards[1]?.getBoundingClientRect();
        if (!dst1 || !dst2) { g1.remove(); g2.remove(); return; }

        await new Promise(r => setTimeout(r, 20));

        // Volar carta del fondo
        g1.style.transition = 'all 320ms cubic-bezier(.22,1,.36,1)';
        g1.style.left = `${dst1.left}px`; g1.style.top = `${dst1.top}px`;

        // Volar carta del mazo con pequeño delay
        setTimeout(() => {
            g2.style.transition = 'all 260ms cubic-bezier(.22,1,.36,1)';
            g2.style.left = `${dst2.left}px`; g2.style.top = `${dst2.top}px`;
        }, 120);

        // Reveal ambas cartas
        setTimeout(() => {
            newCards.forEach(el => {
                el.style.transition = 'opacity 80ms ease, transform 200ms cubic-bezier(.34,1.56,.64,1)';
                el.style.opacity = '1'; el.style.transform = 'scale(1.15)';
                setTimeout(() => el.style.transform = 'scale(1)', 80);
            });
            g1.remove(); g2.remove();
        }, 350);

    } else if (data.acepta) {
        // Otro jugador se castigó
        const oppEl = document.querySelector(`.opp[data-idx="${data.jugadorIdx}"]`);
        if (oppEl) {
            oppEl.style.transition = 'box-shadow .2s ease';
            oppEl.style.boxShadow  = '0 0 25px rgba(200,160,69,.9)';
            setTimeout(() => oppEl.style.boxShadow = '', 500);
        }
    }
}

async function handlePagar(data) {
    if (data.jugadorIdx !== myIdx) {
        const oppEl = document.querySelector(`.opp[data-idx="${data.jugadorIdx}"]`);
        const fondoW = document.getElementById('fondo-wrap');
        if (oppEl && fondoW) await Anim.rivalPaysToFondo(oppEl, fondoW, null);
    }
}



// Flash + texto "¡SE BAJÓ!" sobre la tarjeta del oponente
function animateOponenteBajo(jugadorIdx) {
    const oppEl = document.querySelector(`.opp[data-idx="${jugadorIdx}"]`);
    if (!oppEl) return;

    // Flash en la tarjeta
    oppEl.style.transition = 'box-shadow .15s ease, border-color .15s ease';
    oppEl.style.boxShadow  = '0 0 30px rgba(200,160,69,.9), 0 0 60px rgba(200,160,69,.4)';
    oppEl.style.borderColor = 'rgba(200,160,69,.9)';
    setTimeout(() => {
        oppEl.style.boxShadow   = '';
        oppEl.style.borderColor = '';
    }, 800);

    // Texto flotante "¡SE BAJÓ!"
    const rect = oppEl.getBoundingClientRect();
    const txt  = document.createElement('div');
    txt.textContent = '¡SE BAJÓ!';
    txt.style.cssText = `
        position:fixed;
        left:${rect.left + rect.width / 2}px;
        top:${rect.top}px;
        transform:translate(-50%, -10px);
        font-family:'Cormorant Garamond',serif;
        font-size:1.3rem;
        font-weight:700;
        color:#ffe066;
        text-shadow:0 0 20px rgba(200,160,69,.8), 0 2px 8px rgba(0,0,0,.8);
        pointer-events:none;
        z-index:9999;
        white-space:nowrap;
        animation:floatUp .9s cubic-bezier(.22,1,.36,1) forwards;
    `;
    document.body.appendChild(txt);
    setTimeout(() => txt.remove(), 1000);

    // Partículas doradas
    Anim.spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 14);
}

async function handleBajar(data) {
    // Si otro jugador se bajó — mostrar animación de atención
    if (data.jugadorIdx !== myIdx) {
        animateOponenteBajo(data.jugadorIdx);
        render();
        restoreAnimatedBajadas();
        return;
    }
    if (data.jugadorIdx === myIdx) {
        const discardZone = document.getElementById('discard-zone');
        const buildingRow = document.getElementById('building-row');

        // 1. Capturar clones visuales ANTES de tocar el DOM
        const allCardEls = [
            ...(discardZone?.querySelectorAll('.card') || []),
            ...(buildingRow?.querySelectorAll('.card')  || []),
        ];

        // Crear ghosts fijos en su posición actual
        const ghosts = allCardEls.map(el => {
            const rect  = el.getBoundingClientRect();
            const ghost = el.cloneNode(true);
            ghost.style.cssText = `
                position:fixed; z-index:9990; pointer-events:none;
                width:${rect.width}px; height:${rect.height}px;
                left:${rect.left}px; top:${rect.top}px;
                border-radius:var(--r);
                box-shadow:0 8px 24px rgba(0,0,0,.5);
                transition:none;
            `;
            document.body.appendChild(ghost);
            return { ghost, rect };
        });

        // 2. Actualizar estado y renderizar mesa con bajadas (ocultas)
        buildingCards.clear();
        render();

        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));

        // 3. Destino: slots de bajadas del jugador en la mesa
        const bajadas   = document.getElementById('table-bajadas');
        const myBajadas = bajadas?.querySelector(`[data-jugador-idx="${myIdx}"]`);
        const slots     = myBajadas?.querySelectorAll('.jugada-cards') || bajadas?.querySelectorAll('.jugada-cards');
        const slotArr   = [...(slots || [])];
        const dstEl     = slotArr[0] || bajadas;
        const dstRect   = dstEl?.getBoundingClientRect();

        if (!dstRect) {
            ghosts.forEach(({ ghost }) => ghost.remove());
            return;
        }

        // 4. Animar cada ghost volando al destino
        const perSlot = Math.max(1, Math.ceil(ghosts.length / Math.max(slotArr.length, 1)));

        ghosts.forEach(({ ghost, rect }, i) => {
            const slotIdx  = Math.floor(i / perSlot);
            const targetEl = slotArr[slotIdx] || dstEl;
            const tRect    = targetEl?.getBoundingClientRect() || dstRect;

            const delay = i * 60;

            setTimeout(() => {
                // Fase 1: salto hacia arriba
                ghost.style.transition = 'all 150ms cubic-bezier(.34,1.56,.64,1)';
                ghost.style.transform  = `translateY(-20px) scale(1.1) rotate(${(Math.random()-.5)*8}deg)`;

                setTimeout(() => {
                    // Fase 2: volar al destino
                    const dx = tRect.left + tRect.width  / 2 - rect.left - rect.width  / 2;
                    const dy = tRect.top  + tRect.height / 2 - rect.top  - rect.height / 2;

                    ghost.style.transition = 'all 360ms cubic-bezier(.22,1,.36,1)';
                    ghost.style.transform  = `translate(${dx}px, ${dy}px) scale(.9) rotate(0deg)`;
                    ghost.style.boxShadow  = '0 0 20px rgba(200,160,69,.7)';

                    setTimeout(() => {
                        // Flash + partículas al aterrizar
                        ghost.style.transition = 'all 80ms ease';
                        ghost.style.transform  = `translate(${dx}px, ${dy}px) scale(1.06)`;
                        ghost.style.boxShadow  = '0 0 40px rgba(200,160,69,1)';

                        Anim.spawnParticles(
                            tRect.left + tRect.width  / 2,
                            tRect.top  + tRect.height / 2,
                            8
                        );

                        setTimeout(() => {
                            ghost.style.transition = 'opacity 100ms ease';
                            ghost.style.opacity    = '0';
                            setTimeout(() => ghost.remove(), 110);
                        }, 90);
                    }, 340);
                }, 160);
            }, delay);
        });

        // Esperar a que terminen todas las animaciones
        await new Promise(r => setTimeout(r, ghosts.length * 60 + 700));


    }
}

async function handleIntercambiarComodin(data) {
    if (data.jugadorIdx === myIdx) {
        toast('Intercambiaste una carta por un comodín', 'green');
    } else if (data.origenJugadorIdx === myIdx) {
        toast('Te intercambiaron un comodín de tus jugadas', 'yellow');
    }
}

function handleFinRonda(data) {
    setTimeout(() => {
        G.jugadores.forEach((j, i) => {
            const pts = data.puntos?.[i];
            if (!pts) return;
            const el = i === myIdx
                ? document.getElementById('my-name')
                : document.querySelector(`.opp[data-idx="${i}"] .opp-name`);
            if (el) Anim.floatScore(el, pts.pts_r, pts.pts_r === 0);
        });
        setTimeout(() => showModalRonda(data.ganadorIdx, data.puntos), 600);
    }, 300);
}

// ═══════════════════════════════════════════════════
// ACCIONES DEL JUGADOR
// ═══════════════════════════════════════════════════

function isMyTurn() { return myIdx === G?.turno; }
function isPayable() { return isMyTurn() && ['esperando_accion', 'esperando_pago'].includes(G?.estado); }

function acMazo() {
    if (!isMyTurn() || G.estado !== 'esperando_robo') return;
    cancelIntercambio();
    WS.send({ type: 'tomar_mazo' });
}

function acFondo() {
    if (!isMyTurn() || G.estado !== 'esperando_robo') return;
    if (G.jugadores[myIdx]?.bajado) { toast('Ya te bajaste.'); return; }
    cancelIntercambio();
    WS.send({ type: 'tomar_fondo' });
}

function acFondoDrag(insertIdx) {
    WS.send({ type: 'tomar_fondo' });
    pendingReorderIdx = insertIdx;
    cancelIntercambio();
}

function acCastigo(acepta) {
    WS.send({ type: 'castigo', acepta });
    cancelIntercambio();
}

function acBajar() {
    if (!slotsListosParaBajar()) { toast('❌ Completa las jugadas requeridas en los slots antes de bajarte'); return; }
    const defs = getSlotDefsRonda(G.ronda);
    const jugadas = [];
    for (const def of defs) {
        const cards = buildingCards.get(def.index) || [];
        if (cards.length === 0) continue;
        const cartasReales = cards.filter(Boolean);
        if (cartasReales.length === 0) continue;
        jugadas.push({ tipo: def.type, cartas: cartasReales });
    }
    if (jugadas.length === 0) { toast('❌ No hay cartas en los slots de construcción'); return; }
    WS.send({ type: 'bajar', jugadas });
    cancelIntercambio();
}

function acPagar(cartaId) {
    const id = cartaId || selId;
    if (!id) { toast('Selecciona una carta para pagar.'); return; }
    buildingCards.forEach((cards, slotIndex) => {
        const index = cards.findIndex(c => c.id === id);
        if (index > -1) {
            cards.splice(index, 1);
            if (cards.length === 0) buildingCards.delete(slotIndex);
            updateSlotUI(slotIndex, cards);
        }
    });
    WS.send({ type: 'pagar', cartaId: id });
    selId = null;
    cancelIntercambio();
}

function acAcomodar(cartaId, destJugadorIdx, destJugadaIdx, posicion = null) {
    const me = G?.jugadores?.[myIdx];
    const jugada = G?.jugadores?.[destJugadorIdx]?.jugadas?.[destJugadaIdx];

    // Solo preguntar alta/baja cuando:
    //   1. El jugador YA está bajado (está acomodando sobrantes)
    //   2. La jugada destino es una corrida
    //   3. No tiene posición elegida todavía
    // Buscar si la carta es joker en la mano (puede venir de intercambio reciente)
    if (me?.bajado && jugada?.tipo === 'corrida' && posicion === null) {
        const carta = me?.mano?.find(c => c.id === cartaId);
        if (carta?.comodin) {
            mostrarSelectorPosicionJoker(cartaId, destJugadorIdx, destJugadaIdx, jugada);
            return;
        }
    }

    buildingCards.forEach((cards, slotIndex) => {
        const index = cards.findIndex(c => c.id === cartaId);
        if (index > -1) {
            cards.splice(index, 1);
            if (cards.length === 0) buildingCards.delete(slotIndex);
            updateSlotUI(slotIndex, cards);
        }
    });

    WS.send({ type: 'acomodar', cartaId, destJugadorIdx, destJugadaIdx, posicion: posicion || null });
    selId = null;
    cancelIntercambio();
}

// ─────────────────────────────────────────────────────────────────────────────
// mostrarSelectorPosicionJoker
// Muestra un mini-modal inline en las bajadas preguntando si el joker
// va como carta ALTA (final de la corrida) o BAJA (inicio de la corrida).
// Muestra el contexto: "5♦ 6♦ 7♦ 8♦ → ¿Joker como 4♦ o 9♦?"
// ─────────────────────────────────────────────────────────────────────────────
function mostrarSelectorPosicionJoker(cartaId, destJugadorIdx, destJugadaIdx, jugada) {
    // Calcular qué valor sería en cada posición para mostrarlo al usuario
    const VN_MAP = { A:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7, 8:8, 9:9, 10:10, J:11, Q:12, K:13 };
    const VN_REV = {1:'A',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'};
    const normales = jugada.cartas.filter(c => !c.comodin);
    const palo = normales[0]?.palo || '';
    const vals = normales.map(c => VN_MAP[c.valor] || parseInt(c.valor)).sort((a, b) => a - b);

    // Detectar si hay As como 14
    const tieneAs = vals.includes(1);
    const tieneAltas = vals.some(v => v >= 11);
    const useA14 = tieneAs && tieneAltas && !vals.includes(2);
    const valsReales = vals.map(v => (v === 1 && useA14) ? 14 : v).sort((a, b) => a - b);

    const minVal = valsReales[0];
    const maxVal = valsReales[valsReales.length - 1];
    const valBaja = minVal - 1;
    const valAlta = maxVal + 1;

    const lblBaja = valBaja >= 1 ? `${VN_REV[valBaja] || valBaja}${palo}` : null;
    const lblAlta = valAlta <= 14 ? `${VN_REV[valAlta] || valAlta}${palo}` : null;

    // Quitar modal anterior si existe
    const prev = document.getElementById('joker-pos-modal');
    if (prev) prev.remove();

    const modal = document.createElement('div');
    modal.id = 'joker-pos-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,.7);
    `;

    const secuenciaHtml = jugada.cartas.map(c => {
        if (c.comodin) return `<span style="background:#4a2080;color:#ffe066;padding:2px 5px;border-radius:4px;font-size:.75rem">🃏</span>`;
        const isRed = c.palo === '♥' || c.palo === '♦';
        return `<span style="color:${isRed ? '#e05050' : '#e8e8e8'};font-size:.75rem">${c.valor}${c.palo}</span>`;
    }).join('<span style="color:#aaa;margin:0 2px">·</span>');

    modal.innerHTML = `
        <div style="
            background: #1a2a1a;
            border: 2px solid var(--gold, #c8a045);
            border-radius: 10px;
            padding: 18px 22px;
            min-width: 260px;
            max-width: 320px;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,.6);
        ">
            <div style="font-size:.72rem;color:#aaa;margin-bottom:6px">¿Dónde va el 🃏 Joker?</div>
            <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;align-items:center">
                ${secuenciaHtml}
            </div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                ${lblBaja ? `<button onclick="window._confirmarPosJoker('${cartaId}',${destJugadorIdx},${destJugadaIdx},'baja')"
                    style="background:#1e4a2e;border:1px solid #2ecc71;color:#2ecc71;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:.8rem">
                    ⬅ Baja<br><small style="font-size:.7rem;color:#aaa">${lblBaja}</small>
                </button>` : ''}
                ${lblAlta ? `<button onclick="window._confirmarPosJoker('${cartaId}',${destJugadorIdx},${destJugadaIdx},'alta')"
                    style="background:#1e4a2e;border:1px solid #2ecc71;color:#2ecc71;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:.8rem">
                    Alta ➡<br><small style="font-size:.7rem;color:#aaa">${lblAlta}</small>
                </button>` : ''}
                ${!lblBaja && !lblAlta ? `<span style="color:#aaa;font-size:.75rem">Solo hay una posición posible</span>` : ''}
            </div>
            <button onclick="document.getElementById('joker-pos-modal').remove(); window.cancelIntercambio();"
                style="margin-top:12px;background:transparent;border:none;color:#888;cursor:pointer;font-size:.72rem">
                ✕ Cancelar
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    // Si solo hay una opción, elegirla automáticamente sin preguntar
    if (!lblBaja && lblAlta) {
        modal.remove();
        acAcomodar(cartaId, destJugadorIdx, destJugadaIdx, 'alta');
    } else if (lblBaja && !lblAlta) {
        modal.remove();
        acAcomodar(cartaId, destJugadorIdx, destJugadaIdx, 'baja');
    }
}

window._confirmarPosJoker = function(cartaId, destJugadorIdx, destJugadaIdx, posicion) {
    const modal = document.getElementById('joker-pos-modal');
    if (modal) modal.remove();
    // cartaId viene del atributo HTML como string — convertir al tipo original
    // Los ids del engine son números, intentar parsear
    const id = isNaN(cartaId) ? cartaId : Number(cartaId);
    const ji = Number(destJugadorIdx);
    const jugi = Number(destJugadaIdx);
    acAcomodar(id, ji, jugi, posicion);
};

// ─────────────────────────────────────────────────────────────────────────────
// acIntercambiarComodin
// Ahora válido en esperando_accion (pre-bajada) Y esperando_pago (post-bajada).
// Post-bajada no manda jugadasEnSlots porque ya no tiene slots activos.
// ─────────────────────────────────────────────────────────────────────────────
function acIntercambiarComodin(cartaId, origenJugadorIdx, origenJugadaIdx) {
    if (!isMyTurn()) { toast('No es tu turno.'); return; }
    const estadosValidos = ['esperando_accion', 'esperando_pago'];
    if (!estadosValidos.includes(G.estado)) { toast('No puedes intercambiar en este momento.'); return; }

    const me = G.jugadores[myIdx];
    const jugadasEnSlots = [];

    // Solo manda slots si NO está bajado (pre-bajada)
    if (!me?.bajado) {
        const defs = getSlotDefsRonda(G.ronda);
        for (const def of defs) {
            const cards = buildingCards.get(def.index) || [];
            if (cards.length > 0) jugadasEnSlots.push({ tipo: def.type, cartas: cards.filter(Boolean) });
        }
    }

    WS.send({ type: 'intercambiar_comodin', cartaId, origenJugadorIdx, origenJugadaIdx, jugadasEnSlots });
    selId = null;
    cancelIntercambio();
}

// ─────────────────────────────────────────────────────────────────────────────
// activarModoIntercambio — permite intercambio manual (clic en joker)
// Ahora también funciona post-bajada en esperando_pago.
// ─────────────────────────────────────────────────────────────────────────────
function activarModoIntercambio(jugadorIdx, jugadaIdx, comodinId) {
    if (!isMyTurn()) { toast('No es tu turno para intercambiar.'); return; }
    const estadosValidos = ['esperando_accion', 'esperando_pago'];
    if (!estadosValidos.includes(G.estado)) { toast('No puedes intercambiar en este momento.'); return; }

    // Removemos la restricción de "me.bajado" — post-bajada también es válido
    if (!selId) { toast('Primero selecciona una carta de tu mano para intercambiar.'); return; }
    const me = G.jugadores[myIdx];
    const cartaSeleccionada = me?.mano?.find(c => c.id === selId);
    if (!cartaSeleccionada) { toast('Error: carta no encontrada.'); return; }
    if (cartaSeleccionada.comodin) { toast('No puedes intercambiar un comodín por otro comodín.'); return; }

    intercambioMode = true;
    selectedComodinInfo = { jugadorIdx, jugadaIdx, comodinId };
    toast(`Intercambiarás ${cartaSeleccionada.valor}${cartaSeleccionada.palo || ''} por el comodín`, 'green');
    render();
}

function cancelIntercambio() {
    intercambioMode = false;
    selectedComodinInfo = null;
    _intercambiosCache.clear();
    render();
}

function ejecutarIntercambioDesdeKey(key) {
    const intercambio = _intercambiosCache.get(key);
    if (!intercambio) { toast('Intercambio no disponible, vuelve a intentar.'); return; }
    ejecutarIntercambioDirecto(intercambio);
}

// ─────────────────────────────────────────────────────────────────────────────
// ejecutarIntercambioDirecto
// Ahora maneja los dos casos:
//   esCasoBajado=false → pre-bajada, manda jugadasEnSlots para validación
//   esCasoBajado=true  → post-bajada, no manda slots, el server solo valida encaje
// ─────────────────────────────────────────────────────────────────────────────
function ejecutarIntercambioDirecto(intercambio) {
    if (!isMyTurn()) { toast('No es tu turno.'); return; }
    const estadosValidos = ['esperando_accion', 'esperando_pago'];
    if (!estadosValidos.includes(G.estado)) { toast('Solo puedes intercambiar después de robar.'); return; }

    const me = G.jugadores[myIdx];
    const carta = `${intercambio.cartaValor}${intercambio.cartaPalo}`;

    if (intercambio.esCasoBajado) {
        // Post-bajada: intercambio simple, sin slots
        toast(`🔄 Intercambiando ${carta} por el Joker…`, 'green');
        WS.send({
            type: 'intercambiar_comodin',
            cartaId: intercambio.cartaId,
            origenJugadorIdx: intercambio.jugadorIdx,
            origenJugadaIdx: intercambio.jugadaIdx,
            jugadasEnSlots: [],
        });
    } else {
        // Pre-bajada: incluye slots para validación
        const defs = getSlotDefsRonda(G.ronda);
        const jugadasEnSlots = [];
        for (const def of defs) {
            const cards = buildingCards.get(def.index) || [];
            if (cards.length > 0) jugadasEnSlots.push({ tipo: def.type, cartas: cards.filter(Boolean) });
        }
        if (jugadasEnSlots.length === 0) { toast('Arma tus jugadas en los slots antes de intercambiar.', 'red'); return; }
        toast(`🔄 Intercambiando ${carta} por el Joker…`, 'green');
        WS.send({
            type: 'intercambiar_comodin',
            cartaId: intercambio.cartaId,
            origenJugadorIdx: intercambio.jugadorIdx,
            origenJugadaIdx: intercambio.jugadaIdx,
            jugadasEnSlots,
        });
    }

    selId = null;
    cancelIntercambio();
}

function confirmarIntercambio() {
    if (!intercambioMode || !selectedComodinInfo || !selId) { cancelIntercambio(); return; }
    acIntercambiarComodin(selId, selectedComodinInfo.jugadorIdx, selectedComodinInfo.jugadaIdx);
}

function acReorder(draggedId, beforeId) {
    const me = G.jugadores[myIdx];
    if (!me) return;
    let slotOrigen = null;
    buildingCards.forEach((cards, slotIndex) => {
        if (cards.some(c => c.id === draggedId)) slotOrigen = slotIndex;
    });
    if (slotOrigen !== null) { toast('No puedes reordenar cartas que están en construcción'); return; }
    const fromIdx = me.mano.findIndex(c => c.id === draggedId);
    if (fromIdx < 0) return;
    let toIdx = beforeId;
    if (beforeId === Infinity || beforeId >= me.mano.length) toIdx = me.mano.length - 1;
    const newOrder = [...me.mano];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    me.mano = newOrder;
    renderHand();
    WS.send({ type: 'reordenar', order: newOrder.map(c => c.id) });
}

function selCard(id) {
    if (intercambioMode && selectedComodinInfo) {
        selId = id;
        confirmarIntercambio();
    } else {
        selId = selId === id ? null : id;
        renderHand();
        renderActions();
    }
}

function ackRonda() {
    if (ackSent) return;
    ackSent = true;
    document.getElementById('modal-ronda').classList.remove('show');
    WS.send({ type: 'ack_fin_ronda' });
}

// ═══════════════════════════════════════════════════
// RENDERIZADO
// ═══════════════════════════════════════════════════

const BADGES = {
    'owner':         { emoji: '👑', label: 'Owner' },
    'beta_tester':   { emoji: '🧪', label: 'Beta Tester' },
    'early_adopter': { emoji: '🎖️', label: 'Early Adopter' },
    'vip':           { emoji: '⭐', label: 'VIP' },
};
function badgeHtml(badge) {
    if (!badge || !BADGES[badge]) return '';
    return ` <span title="${BADGES[badge].label}" style="cursor:default;font-size:.85rem">${BADGES[badge].emoji}</span>`;
}

function applyTableTheme(color) {
    const valid = ['green', 'navy', 'wine', 'black'];
    if (!valid.includes(color)) return;
    [document.documentElement, document.body].forEach(el => {
        el.className = el.className.replace(/\btheme-\w+\b/g, '').trim();
        el.classList.add('theme-' + color);
    });
    sessionStorage.setItem('tableColor', color);
}

function restoreAnimatedBajadas() {
    if (!_animatedBajadas.size) return;
    const bajEl = document.getElementById('table-bajadas');
    if (!bajEl) return;
    bajEl.querySelectorAll('.card-sm, .joker-sm').forEach(el => {
        const id = el.dataset.id || el.dataset.comodinId;
        if (!id) return;
        if (_animatedBajadas.has(id)) {
            el.style.animation  = 'none';
            el.style.opacity    = '1';
            el.style.transform  = 'none';
            el.style.transition = 'none';
        }
    });
}

function render() {
    if (!G || myIdx < 0) return;
    const me = G.jugadores[myIdx];
    document.getElementById('ronda-pill').textContent = `Ronda ${G.ronda} de 7`;
    document.getElementById('req-pill').textContent = REQ_LABELS[G.ronda] || '';
    renderScoreboard();
    renderOpponents();
    renderTableBajadas();
    renderMazo();
    renderFondo(me);
    renderPlayerInfo(me);
    renderHand();
    renderActions();
    restoreAnimatedBajadas();
}



function renderScoreboard() {
    document.getElementById('scoreboard').innerHTML = G.jugadores.map((j, i) => `
        <div class="sitem ${i === myIdx ? 'me' : ''}">
            <div class="sname">${badgeHtml(j.badge)}${j.nombre}</div>
            <div class="spts">${j.pts_t}</div>
        </div>
    `).join('');
}

function renderOpponents() {
    const opEl = document.getElementById('opponents');
    opEl.innerHTML = '';
    G.jugadores.forEach((j, i) => {
        if (i === myIdx) return;
        const d = document.createElement('div');
        d.className = `opp${i === G.turno ? ' turn' : ''}${j.bajado ? ' bajado' : ''}`;
        d.dataset.idx = i;
        d.innerHTML = `
            <div class="opp-name">${badgeHtml(j.badge)}${j.nombre}${j.bajado ? ' ✅' : ''}${!j.conectado ? ' 📴' : ''} · ${j.pts_t}pts</div>
            <div class="opp-backs">${(j.mano || []).map(() => '<div class="cback-xs"></div>').join('')}</div>
            ${j.bajado && j.jugadas?.length ? `<div style="font-size:.62rem;color:#2a8a4a;margin-top:3px">${j.jugadas.length} jugada(s)</div>` : ''}
        `;
        opEl.appendChild(d);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// renderTableBajadas
// Ahora muestra jokers intercambiables también cuando el jugador YA está bajado
// (esperando_accion o esperando_pago), usando la misma función de detección.
// ─────────────────────────────────────────────────────────────────────────────
function renderTableBajadas() {
    const bajEl = document.getElementById('table-bajadas');
    bajEl.innerHTML = '';
    G.jugadores.forEach((j, ji) => {
        if (!j.bajado || !j.jugadas?.length) return;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;align-items:center';
        wrap.innerHTML = `<div style="font-size:.62rem;color:var(--text-dim);margin-bottom:2px">${j.nombre}</div>`;
        j.jugadas.forEach((jug, jugi) => {
            const pile = document.createElement('div');
            pile.className = 'bajada-pile';
            if (intercambioMode) pile.classList.add('intercambio-mode');
            pile.dataset.pi = ji;
            pile.dataset.ji = jugi;

            // ── Detectar intercambios posibles ──
            // Antes: solo si !me.bajado && esperando_accion
            // Ahora: también si me.bajado && (esperando_accion || esperando_pago)
            const _me = G.jugadores[myIdx];
            const puedeIntercambiar = isMyTurn() && ['esperando_accion', 'esperando_pago'].includes(G.estado);
            const intercambiosPosibles = puedeIntercambiar ? detectarIntercambiosPosibles() : [];

            // Marcar cartas nuevas para animar con CSS
        const cartasIds = jug.cartas.map(c => c.id || c.comodinId || '').filter(Boolean);
        const cardsHtml = jug.cartas.map(c => {
                if (c.comodin) {
                    const vr = c.valorReemplazado || '?';
                    const vrPalo = c.paloReemplazado ? c.paloReemplazado : '';
                    const intercPosible = intercambiosPosibles.find(
                        ic => ic.jugadorIdx === ji && ic.jugadaIdx === jugi && ic.comodinId === c.id
                    );
                    if (intercPosible) {
                        const icKey = `${ji}-${jugi}-${c.id}`;
                        // Tooltip diferente según si ya está bajado o no
                        const tipTxt = intercPosible.esCasoBajado
                            ? `🔄 Poner ${intercPosible.cartaValor}${intercPosible.cartaPalo} aquí → recibes el Joker para acomodar`
                            : `🔄 Intercambiar por ${intercPosible.cartaValor}${intercPosible.cartaPalo} → recibes el Joker`;
                        return `<div class="card-sm joker-sm comodin-intercambiable joker-highlight"
                                     title="${tipTxt}"
                                     data-ic-key="${icKey}"
                                     data-comodin-id="${c.id}"
                                     onclick="event.stopPropagation(); window.ejecutarIntercambioDesdeKey('${icKey}')">
                                     🃏<small style="font-size:8px;display:block;color:#ffe066;">=${vr}${vrPalo}</small>
                                     <small style="font-size:7px;display:block;color:#4de88a;">↔ CLIC</small></div>`;
                    }
                    if (intercambioMode && isMyTurn() && ji !== myIdx) {
                        return `<div class="card-sm joker-sm comodin-intercambiable"
                                     title="Reemplaza a: ${vr}${vrPalo}"
                                     data-comodin-id="${c.id}" data-jugador="${ji}" data-jugada="${jugi}"
                                     onclick="event.stopPropagation(); window.activarModoIntercambio(${ji}, ${jugi}, '${c.id}')">
                                     🃏<small style="font-size:8px;display:block;">=${vr}${vrPalo}</small></div>`;
                    }
                    return `<div class="card-sm joker-sm" title="Reemplaza a: ${vr}${vrPalo}" data-comodin-id="${c.id}">🃏<small style="font-size:8px;display:block;">=${vr}${vrPalo}</small></div>`;
                }
                return cSm(c);
            }).join('');

            pile.innerHTML = `<div class="bajada-pile-label">${jug.tipo}</div><div class="bajada-pile-cards">${cardsHtml}</div>`;
            if (!intercambioMode && _me?.bajado) {
                pile.onclick = () => {
                    if (!selId || !isMyTurn()) return;
                    // null como posicion: si es joker en corrida, preguntará automáticamente
                    acAcomodar(selId, ji, jugi, null);
                };
            }
            wrap.appendChild(pile);
        });
        bajEl.appendChild(wrap);
    });

    // Animar solo cartas nuevas (con ID real, no textContent)
    bajEl.querySelectorAll('.card-sm, .joker-sm').forEach((el, i) => {
        const id = el.dataset.id || el.dataset.comodinId;
        if (!id) return;
        if (!_animatedBajadas.has(id)) {
            _animatedBajadas.add(id);
            el.style.animation = 'none';
            el.offsetHeight;
            el.style.animation = `cardLand 320ms cubic-bezier(.22,1,.36,1) ${i * 40}ms both`;
        }
    });
}

function renderMazo() {
    document.getElementById('mazo-count').textContent = `${G.mazo_count} cartas`;
    const mazoW = document.getElementById('mazo-wrap');
    mazoW.style.cursor = isMyTurn() && G.estado === 'esperando_robo' ? 'pointer' : 'default';
}

function renderFondo(me) {
    const fw = document.getElementById('fondo-wrap');
    if (G.fondo_top) {
        fw.innerHTML = cFull(G.fondo_top, false);
        const fc = fw.querySelector('.card');
        if (fc) {
            const canTake = isMyTurn() && G.estado === 'esperando_robo' && !me?.bajado;
            if (!canTake) {
                fc.classList.add('disabled');
            } else {
                fc.onclick = acFondo;
                fc.addEventListener('mousedown', e => DragDrop.startFondoDrag(e, fc, { onTakeFondo: idx => acFondoDrag(idx) }));
                fc.addEventListener('touchstart', e => DragDrop.startFondoDrag(e, fc, { onTakeFondo: idx => acFondoDrag(idx) }), { passive: false });
            }
        }
    } else {
        fw.innerHTML = `<div class="cback" style="opacity:.3;cursor:default"></div>`;
    }
}

function renderPlayerInfo(me) {
    document.getElementById('my-name').innerHTML = (me?.badge ? badgeHtml(me.badge) : '') + (me?.nombre || '—');
    document.getElementById('hand-count').textContent = `${me?.mano?.length || 0} cartas`;
    const dot = document.getElementById('pulse-dot');
    if (dot) dot.style.display = isMyTurn() ? 'inline-block' : 'none';
    document.getElementById('turn-tag').textContent = isMyTurn() ? '' : `Turno de ${G.jugadores[G.turno]?.nombre || '…'}`;
}

// ═══════════════════════════════════════════════════
// SLOTS DE CONSTRUCCIÓN
// ═══════════════════════════════════════════════════

function renderBuildingRow() {
    if (!G || myIdx < 0) return;
    const buildingRow = document.getElementById('building-row');
    if (!buildingRow) return;
    const reqEl = document.getElementById('building-requirement');
    if (reqEl) reqEl.textContent = REQ_LABELS[G.ronda] || '';

    const slotDef = (title, type, index, min, hint) => `
        <div class="building-slot" data-slot-type="${type}" data-slot-index="${index}" data-min-cards="${min}">
            <div class="building-slot-header">
                <span class="building-slot-title">${title}</span>
                <span class="building-slot-count">0/${min}+</span>
            </div>
            <div class="building-slot-cards" id="slot-${index}-cards"></div>
            <div class="slot-hint">${hint}</div>
        </div>`;
    const T = (t, i) => slotDef(t, 'tercia', i, 3, 'Mínimo 3 cartas del mismo valor');
    const C = (t, i) => slotDef(t, 'corrida', i, 4, 'Mínimo 4 cartas del mismo palo en secuencia');

    const htmlMap = {
        1: T('TERCIA 1', 0) + T('TERCIA 2', 1),
        2: T('TERCIA', 0) + C('CORRIDA', 1),
        3: C('CORRIDA 1', 0) + C('CORRIDA 2', 1),
        4: T('TERCIA 1', 0) + T('TERCIA 2', 1) + T('TERCIA 3', 2),
        5: T('TERCIA 1', 0) + T('TERCIA 2', 1) + C('CORRIDA', 2),
        6: C('CORRIDA 1', 0) + C('CORRIDA 2', 1) + T('TERCIA', 2),
        7: C('CORRIDA 1', 0) + C('CORRIDA 2', 1) + C('CORRIDA 3', 2),
    };

    buildingRow.innerHTML = htmlMap[G.ronda] || '';
    buildingCards.forEach((cards, slotIndex) => updateSlotUI(slotIndex, cards));
}

function renderHand() {
    if (!G || myIdx < 0) return;
    const me = G.jugadores[myIdx];
    const discardZone = document.getElementById('discard-zone');
    if (!discardZone) return;

    renderBuildingRow();
    discardZone.innerHTML = '';

    const cartasEnSlots = new Set();
    buildingCards.forEach(cards => cards.forEach(c => { if (c?.id) cartasEnSlots.add(c.id); }));

    (me.mano || []).forEach(c => {
        if (!cartasEnSlots.has(c.id)) discardZone.appendChild(createCardElement(c));
    });

    document.getElementById('hand-count').textContent = `${me?.mano?.length || 0} cartas`;
}

function createCardElement(c, fromSlot = null) {
    const el = document.createElement('div');
    el.className = 'card' + (c.id === selId ? ' selected' : '');
    if (intercambioMode && selId && c.id === selId) el.classList.add('pending-intercambio');
    el.dataset.id = c.id;
    if (fromSlot !== null) el.dataset.slot = fromSlot;
    el.draggable = false;

    if (c.comodin) {
        el.innerHTML = `<div class="card-face joker-f"><span class="cv">🃏</span><span class="cs" style="font-size:.55rem">JOKER</span></div>`;
    } else {
        const sc = SUIT_CLS[c.palo] || '';
        el.innerHTML = `
            <div class="card-face ${sc}">
                <div class="corner tl">${c.valor}<br>${c.palo}</div>
                <div class="cv">${c.palo}</div>
                <div class="cs">${c.valor}</div>
                <div class="corner br">${c.valor}<br>${c.palo}</div>
            </div>`;
    }

    el.addEventListener('click', e => { e.stopPropagation(); selCard(c.id); });

    const dragCallbacks = {
        isPayable,
        onPagar: id => acPagar(id),
        onAcomodar: (id, pi, ji) => acAcomodar(id, pi, ji),
        onReorder: (id, beforeId) => acReorder(id, beforeId),
        onBuildingDrop: (id, slotIndex, slotType, insertIdx) => handleBuildingDrop(id, slotIndex, slotType, insertIdx),
        onRemoveFromSlot: (id, slotIndex) => handleRemoveFromSlot(id, slotIndex),
        onMoveBetweenSlots: (id, fromSlot, toSlot, toSlotType, insertIdx) => handleMoveBetweenSlots(id, fromSlot, toSlot, toSlotType, insertIdx),
        onReturnToHand: (id, slotIndex) => handleReturnToHand(id, slotIndex),
        onReorderWithinSlot: (id, slotIndex, insertIdx) => handleReorderWithinSlot(id, slotIndex, insertIdx),
    };

    el.addEventListener('mousedown', e => { if (e.button !== 0) return; DragDrop.startHandDrag(e, el, c.id, dragCallbacks); });
    el.addEventListener('touchstart', e => DragDrop.startHandDrag(e, el, c.id, dragCallbacks), { passive: false });

    return el;
}

function handleBuildingDrop(cartaId, slotIndex, slotType, insertIdx) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) { toast('Ya estás bajado, no puedes construir más jugadas'); return; }
    const cartaIndex = me.mano.findIndex(c => c.id === cartaId);
    if (cartaIndex === -1) { toast('Carta no encontrada en la mano'); return; }
    let cartaEnOtroSlot = false;
    buildingCards.forEach(cards => { if (cards.some(c => c.id === cartaId)) cartaEnOtroSlot = true; });
    if (cartaEnOtroSlot) { toast('Esta carta ya está en otra jugada'); return; }
    const [cartaMovida] = me.mano.splice(cartaIndex, 1);
    if (!buildingCards.has(slotIndex)) buildingCards.set(slotIndex, []);
    const slotCards = buildingCards.get(slotIndex);
    if (insertIdx !== undefined && insertIdx !== null && insertIdx < slotCards.length) {
        slotCards.splice(insertIdx, 0, cartaMovida);
    } else {
        slotCards.push(cartaMovida);
    }
    updateSlotUI(slotIndex, slotCards);
    renderHand();
    renderActions();
    selId = null;
    toast(`Carta ${cartaMovida.valor}${cartaMovida.palo || ''} agregada a ${slotType}`, 'green');
}

function updateSlotUI(slotIndex, cards) {
    const slot = document.querySelector(`.building-slot[data-slot-index="${slotIndex}"]`);
    if (!slot) return;
    const cardsContainer = document.getElementById(`slot-${slotIndex}-cards`);
    if (!cardsContainer) return;
    cardsContainer.innerHTML = '';
    cards.forEach(carta => {
        if (!carta) return;
        cardsContainer.appendChild(createCardElement(carta, slotIndex));
    });
    const countSpan = slot.querySelector('.building-slot-count');
    const minCards = parseInt(slot.dataset.minCards);
    const slotType = slot.dataset.slotType;
    const esValido = slotType === 'tercia' ? slotTerciaValido(cards) : slotCorridaValido(cards);
    if (countSpan) {
        countSpan.textContent = `${cards.length}/${minCards}+`;
        countSpan.classList.toggle('valid', esValido);
        slot.classList.toggle('complete', esValido);
    }
}

function handleRemoveFromSlot(cartaId, slotIndex) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) { toast('Ya estás bajado, no puedes modificar jugadas'); return; }
    const slotCards = buildingCards.get(slotIndex);
    if (!slotCards) return;
    const index = slotCards.findIndex(c => c.id === cartaId);
    if (index > -1) {
        slotCards.splice(index, 1);
        if (slotCards.length === 0) buildingCards.delete(slotIndex);
        updateSlotUI(slotIndex, slotCards);
        renderHand();
        renderActions();
        toast('Carta removida de la jugada', 'green');
    }
}

function handleReturnToHand(cartaId, slotIndex) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) { toast('Ya estás bajado, no puedes modificar jugadas', 'red'); return; }
    slotIndex = String(slotIndex);
    const slotCards = buildingCards.get(slotIndex);
    if (!slotCards) return;
    const cartaIndex = slotCards.findIndex(c => c.id === cartaId);
    if (cartaIndex === -1) return;
    const [cartaDevuelta] = slotCards.splice(cartaIndex, 1);
    if (slotCards.length === 0) buildingCards.delete(slotIndex);
    const yaEnMano = me.mano.some(c => c.id === cartaDevuelta.id);
    if (!yaEnMano) me.mano.push(cartaDevuelta);
    renderHand();
    renderActions();
    toast(`Carta ${cartaDevuelta.valor}${cartaDevuelta.palo || ''} devuelta a sobrantes`, 'green');
}

function handleMoveBetweenSlots(cartaId, fromSlotIndex, toSlotIndex, toSlotType, insertIdx) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) { toast('Ya estás bajado, no puedes modificar jugadas'); return; }
    fromSlotIndex = String(fromSlotIndex);
    toSlotIndex = String(toSlotIndex);
    const fromSlotCards = buildingCards.get(fromSlotIndex);
    if (!fromSlotCards) return;
    const cartaIndex = fromSlotCards.findIndex(c => c.id === cartaId);
    if (cartaIndex === -1) return;
    const [cartaMovida] = fromSlotCards.splice(cartaIndex, 1);
    if (fromSlotCards.length === 0) buildingCards.delete(fromSlotIndex);
    else updateSlotUI(fromSlotIndex, fromSlotCards);
    if (!buildingCards.has(toSlotIndex)) buildingCards.set(toSlotIndex, []);
    const toSlotCards = buildingCards.get(toSlotIndex);
    if (insertIdx !== undefined && insertIdx !== null && insertIdx < toSlotCards.length) {
        toSlotCards.splice(insertIdx, 0, cartaMovida);
    } else {
        toSlotCards.push(cartaMovida);
    }
    updateSlotUI(toSlotIndex, toSlotCards);
    renderActions();
}

function handleReorderWithinSlot(cartaId, slotIndex, insertIdx) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) return;
    slotIndex = String(slotIndex);
    const slotCards = buildingCards.get(slotIndex);
    if (!slotCards) return;
    const currentIdx = slotCards.findIndex(c => c.id === cartaId);
    if (currentIdx === -1) return;
    const [carta] = slotCards.splice(currentIdx, 1);
    const adjustedIdx = (insertIdx > currentIdx) ? Math.max(0, insertIdx - 1) : insertIdx;
    slotCards.splice(adjustedIdx, 0, carta);
    updateSlotUI(slotIndex, slotCards);
    renderActions();
}

// ═══════════════════════════════════════════════════
// RENDER ACTIONS
// ═══════════════════════════════════════════════════

function renderActions() {
    if (!G || myIdx < 0) return;

    const me = G.jugadores[myIdx];
    const myTurn = isMyTurn();
    const btns = document.getElementById('action-btns');
    const instr = document.getElementById('instr');
    const cb = document.getElementById('castigo-banner');

    if (cb) cb.style.display = 'none';
    if (btns) btns.innerHTML = '';

    const add = (txt, cls, fn, dis = false) => {
        if (!btns) return;
        const b = document.createElement('button');
        b.className = `abtn ${cls}`;
        b.textContent = txt;
        b.disabled = dis;
        b.onclick = fn;
        btns.appendChild(b);
    };

    if (intercambioMode) {
        if (instr) instr.textContent = '🔄 Selecciona una carta de tu mano para intercambiar por el comodín';
        add('❌ Cancelar Intercambio', 'abtn-red', cancelIntercambio);
        return;
    }

    const hasDestForAcomodar = () => {
        if (!me?.bajado || !selId) return false;
        const carta = me?.mano?.find(c => c.id === selId);
        if (!carta) return false;
        return G.jugadores.some((j, ji) => {
            if (!j.bajado || ji === myIdx) return false;
            return j.jugadas?.some(jug => {
                if (jug.tipo === 'tercia') {
                    if (carta.comodin) return true;
                    const vs = jug.cartas.filter(c => !c.comodin).map(c => c.valor);
                    return vs.length > 0 && carta.valor === vs[0];
                } else {
                    if (carta.comodin) return true;
                    const nats = jug.cartas.filter(c => !c.comodin);
                    if (!nats.length || carta.palo !== nats[0].palo) return false;
                    const vs = nats.map(c => ({ A: 1, J: 11, Q: 12, K: 13 }[c.valor] ?? parseInt(c.valor))).sort((a, b) => a - b);
                    const v = ({ A: 1, J: 11, Q: 12, K: 13 }[carta.valor] ?? parseInt(carta.valor));
                    return v === vs[0] - 1 || v === vs[vs.length - 1] + 1;
                }
            });
        });
    };

    const hasComodinesIntercambiables = () => {
        if (!selId) return false;
        const carta = me?.mano?.find(c => c.id === selId);
        if (!carta || carta.comodin) return false;
        // Buscar jugadas bajadas con joker donde esta carta encaje
        return G.jugadores.some((j, ji) => {
            if (!j.bajado) return false;
            // Post-bajada: puede intercambiar en sus propias jugadas también
            // Pre-bajada: solo en jugadas de otros
            if (!me?.bajado && ji === myIdx) return false;
            return j.jugadas?.some(jug => jug.cartas.some(c => c.comodin));
        });
    };

    if (!myTurn) {
        if (instr) instr.textContent = `Turno de ${G.jugadores[G.turno]?.nombre || '…'}`;
        if (G.estado === 'fase_castigo' && G.castigo_idx === myIdx && cb) {
            const top = G.fondo_top;
            cb.style.display = 'block';
            cb.textContent = `⚡ ¿Te castigas el ${top?.valor}${top?.palo || ''}?`;
            if (instr) instr.textContent = 'Tienes prioridad de castigo.';
            add('✅ Sí, castigarme', 'abtn-green', () => acCastigo(true));
            add('❌ No', 'abtn-red', () => acCastigo(false));
        }
        return;
    }

    switch (G.estado) {
        case 'esperando_robo':
            if (instr) instr.textContent = me?.bajado
                ? `${me.nombre} (bajado) — roba del mazo.`
                : `Tu turno — toma del fondo o roba del mazo.`;
            if (!me?.bajado) add('📥 Tomar Fondo', 'abtn-gold', acFondo, !G.fondo_top);
            add('🎴 Robar Mazo', me?.bajado ? 'abtn-gold' : 'abtn-outline', acMazo);
            break;

        case 'fase_castigo': {
            const jc = G.jugadores[G.castigo_idx];
            const top = G.fondo_top;
            if (G.castigo_idx === myIdx && cb) {
                cb.style.display = 'block';
                cb.textContent = `⚡ ¿Te castigas el ${top?.valor}${top?.palo || ''}? (carta extra del mazo)`;
                if (instr) instr.textContent = 'Tienes prioridad de castigo.';
                add('✅ Sí', 'abtn-green', () => acCastigo(true));
                add('❌ No', 'abtn-red', () => acCastigo(false));
            } else {
                if (instr) instr.textContent = `Esperando que ${jc?.nombre} decida el castigo…`;
            }
            break;
        }

        case 'esperando_accion': {
            const listoParaBajar = slotsListosParaBajar();
            if (!me?.bajado) {
                // ── Pre-bajada ──
                if (me?.penalizacion?.activa) {
                    if (instr) instr.textContent = `⚠️ Penalización activa: ${me.penalizacion.turnosRestantes} turno(s) sin bajar.`;
                } else if (listoParaBajar) {
                    if (instr) instr.textContent = '✅ Jugadas listas — pulsa Bajarme para confirmar.';
                } else {
                    if (instr) instr.textContent = selId
                        ? 'Carta seleccionada — págala o arrástrala a un slot.'
                        : 'Arrastra cartas a los slots para armar tus jugadas.';
                }
                add('🔥 Bajarme', 'abtn-gold', acBajar, !listoParaBajar);
                add('💳 Pagar', 'abtn-outline', () => acPagar(selId), !selId);

                const intercambiosPosibles = detectarIntercambiosPosibles();
                if (intercambiosPosibles.length > 0) {
                    const ic = intercambiosPosibles[0];
                    add(`🔄 Intercambiar ${ic.cartaValor}${ic.cartaPalo} por Joker`, 'abtn-green', () => ejecutarIntercambioDirecto(ic));
                    if (instr) instr.textContent = `💡 Puedes intercambiar ${ic.cartaValor}${ic.cartaPalo} por el Joker de ${G.jugadores[ic.jugadorIdx]?.nombre} y bajarte!`;
                } else if (selId && hasComodinesIntercambiables()) {
                    add('🔄 Intercambiar por comodín', 'abtn-outline', () => {
                        toast('Haz clic en un comodín de las jugadas de otros jugadores', 'green');
                        intercambioMode = true;
                        render();
                    });
                }
            } else {
                // ── Post-bajada, esperando_accion ──
                if (instr) instr.textContent = selId
                    ? 'Carta seleccionada — acomódala en jugadas de otros o intercambia por un Joker.'
                    : 'Selecciona una carta para acomodar o intercambiar.';
                add('💳 Pagar', 'abtn-outline', () => acPagar(selId), !selId);
                if (hasDestForAcomodar()) add('🃏 Acomodar → clic en jugada', 'abtn-green', () => {});

                // ── Intercambio post-bajada: detectar y mostrar botón ──
                const intercambiosPosibles = detectarIntercambiosPosibles();
                if (intercambiosPosibles.length > 0) {
                    const ic = intercambiosPosibles[0];
                    add(`🔄 Intercambiar ${ic.cartaValor}${ic.cartaPalo} por Joker`, 'abtn-green', () => ejecutarIntercambioDirecto(ic));
                    if (instr) instr.textContent = `💡 Puedes intercambiar ${ic.cartaValor}${ic.cartaPalo} por el Joker — luego acomódalo donde lo necesites.`;
                } else if (selId && hasComodinesIntercambiables()) {
                    add('🔄 Intercambiar por comodín', 'abtn-outline', () => {
                        toast('Haz clic en un comodín de las jugadas', 'green');
                        intercambioMode = true;
                        render();
                    });
                }
            }
            break;
        }

        case 'esperando_pago':
            if (!me?.bajado) {
                if (instr) instr.textContent = 'Selecciona una carta para pagar al fondo.';
                add('💳 Pagar', selId ? 'abtn-gold' : 'abtn-outline', () => acPagar(selId), !selId);
            } else {
                // ── Post-bajada, esperando_pago ──
                if (instr) instr.textContent = selId
                    ? 'Carta seleccionada — acomódala, intercámbia por un Joker, o págala.'
                    : 'Selecciona una carta para acomodar, intercambiar o pagar.';
                add('💳 Pagar', selId ? 'abtn-gold' : 'abtn-outline', () => acPagar(selId), !selId);
                if (hasDestForAcomodar()) add('🃏 Acomodar → clic en jugada', 'abtn-green', () => {});

                // ── Intercambio post-bajada en esperando_pago ──
                const intercambiosPosibles = detectarIntercambiosPosibles();
                if (intercambiosPosibles.length > 0) {
                    const ic = intercambiosPosibles[0];
                    add(`🔄 Intercambiar ${ic.cartaValor}${ic.cartaPalo} por Joker`, 'abtn-green', () => ejecutarIntercambioDirecto(ic));
                    if (instr) instr.textContent = `💡 Puedes intercambiar ${ic.cartaValor}${ic.cartaPalo} por el Joker — luego acomódalo donde lo necesites.`;
                } else if (selId && hasComodinesIntercambiables()) {
                    add('🔄 Intercambiar por comodín', 'abtn-outline', () => {
                        toast('Haz clic en un comodín de las jugadas', 'green');
                        intercambioMode = true;
                        render();
                    });
                }
            }
            break;
    }

    const logLine = document.getElementById('log-line');
    if (logLine) logLine.textContent = G.log?.[G.log.length - 1] || '';
}

// ═══════════════════════════════════════════════════
// HELPERS CARTAS
// ═══════════════════════════════════════════════════

function cFull(c, withId = true) {
    if (!c) return '';
    if (c.comodin) {
        return `<div class="card"${withId ? ` data-id="${c.id}"` : ''}>
            <div class="card-face joker-f"><span class="cv">🃏</span><span class="cs" style="font-size:.55rem">JOKER</span></div>
        </div>`;
    }
    const sc = SUIT_CLS[c.palo] || '';
    return `<div class="card"${withId ? ` data-id="${c.id}"` : ''}>
        <div class="card-face ${sc}">
            <div class="corner tl">${c.valor}<br>${c.palo}</div>
            <div class="cv">${c.palo}</div>
            <div class="cs">${c.valor}</div>
            <div class="corner br">${c.valor}<br>${c.palo}</div>
        </div>
    </div>`;
}

function cSm(c) {
    if (!c) return '';
    if (c.comodin) return `<div class="card-sm joker-sm" data-comodin-id="${c.id || ''}">🃏</div>`;
    const sc = SUIT_CLS[c.palo] || '';
    return `<div class="card-sm natural ${sc}" data-id="${c.id || ''}">${c.valor}<br>${c.palo}</div>`;
}

// ═══════════════════════════════════════════════════
// MODALES
// ═══════════════════════════════════════════════════

function showModalRonda(ganadorIdx, puntos) {
    const modal = document.getElementById('modal-ronda');
    if (!modal) return;
    document.getElementById('mr-title').textContent = `🏆 Ronda ${G.ronda} — ${G.jugadores[ganadorIdx]?.nombre} gana!`;
    document.getElementById('mr-msg').textContent = G.ronda < 7 ? `Siguiente: ronda ${G.ronda + 1}.` : '¡Última ronda!';
    document.getElementById('mr-scores').innerHTML = G.jugadores.map((j, i) => `
        <div class="srow ${i === ganadorIdx ? 'winner' : ''}">
            <span>${j.nombre}${i === ganadorIdx ? ' 🏆' : ''}</span>
            <span class="srow-pts">+${puntos?.[i]?.pts_r ?? 0} · Total: ${j.pts_t}</span>
        </div>
    `).join('');
    ackSent = false;
    modal.classList.add('show');
}

function showModalJuego(jugadores) {
    const modal = document.getElementById('modal-juego');
    if (!modal) return;
    const sorted = [...jugadores].sort((a, b) => a.pts_t - b.pts_t);
    document.getElementById('mj-scores').innerHTML = sorted.map((j, i) => `
        <div class="srow ${i === 0 ? 'winner' : ''}">
            <span>${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]} ${j.nombre}</span>
            <span class="srow-pts">${j.pts_t} pts</span>
        </div>
    `).join('');
    modal.classList.add('show');
}

function toast(msg, type = 'red') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.background = type === 'green' ? 'rgba(40,160,80,.9)' :
                         type === 'yellow' ? 'rgba(200,160,69,.9)' :
                         'rgba(180,50,50,.9)';
    t.style.display = 'block';
    clearTimeout(t._t);
    t._t = setTimeout(() => t.style.display = 'none', 2600);
}

// Exponer funciones para los onclick
window.acMazo = acMazo;
window.acFondo = acFondo;
window.acCastigo = acCastigo;
window.acBajar = acBajar;
window.acPagar = acPagar;
window.acAcomodar = acAcomodar;
window.acIntercambiarComodin = acIntercambiarComodin;
window.acReorder = acReorder;
window.selCard = selCard;
window.ackRonda = ackRonda;
window.toast = toast;
window.activarModoIntercambio = activarModoIntercambio;
window.cancelIntercambio = cancelIntercambio;
window.ejecutarIntercambioDirecto = ejecutarIntercambioDirecto;
window.ejecutarIntercambioDesdeKey = ejecutarIntercambioDesdeKey;

document.addEventListener('DOMContentLoaded', init);