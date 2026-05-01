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

let buildingCards = new Map();

// ================================================================
// VERIFICAR Y CONFIGURAR NOTIFICACIONES MODERNAS
// ================================================================

if (typeof Notify === 'undefined') {
    console.warn('Notify no disponible, usando sistema de respaldo');
    window.Notify = {
        success: (msg) => { console.log(msg); toastLegacy(msg, 'green'); },
        warning: (msg) => { console.log(msg); toastLegacy(msg, 'yellow'); },
        danger:  (msg) => { console.log(msg); toastLegacy(msg, 'red'); },
        info:    (msg) => { console.log(msg); toastLegacy(msg, 'blue'); },
        show:    (msg, type) => { toastLegacy(msg, type === 'danger' ? 'red' : 'green'); },
        showCastigoDialog: (card, onYes, onNo) => {
            const result = confirm(`¿Te castigas el ${card?.valor}${card?.palo || ''}?`);
            if (result) onYes(); else onNo();
        }
    };
}

function toastLegacy(msg, type = 'red') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.background = type === 'green'  ? 'rgba(40,160,80,.9)'  :
                         type === 'yellow' ? 'rgba(200,160,69,.9)' :
                                             'rgba(180,50,50,.9)';
    t.style.display = 'block';
    clearTimeout(t._t);
    t._t = setTimeout(() => t.style.display = 'none', 2600);
}

function toastModern(msg, type = 'info') {
    if (typeof Notify !== 'undefined') {
        let newType = 'info';
        if (type === 'red')    newType = 'danger';
        else if (type === 'green')  newType = 'success';
        else if (type === 'yellow') newType = 'warning';
        Notify.show(msg, newType);
    } else {
        toastLegacy(msg, type);
    }
}

window.toast = toastModern;

// ================================================================
// FUNCIONES PARA IMÁGENES DE CARTAS
// ================================================================

function getCurrentDesign() {
    return localStorage.getItem('cardDesign') || 'mexico';
}

function getCardImageURL(card, design = null) {
    if (!design) design = getCurrentDesign();

    if (card.comodin) {
        return design === 'mexico'
            ? 'imagenes/Mexico/Joker/Joker_1.png'
            : 'imagenes/Estados Unidos/Joker/j1.png';
    }

    let base   = design === 'mexico' ? 'imagenes/Mexico/' : 'imagenes/Estados Unidos/';
    let folder = '';

    switch (card.palo) {
        case '♥': case '♥️': folder = 'corazones'; break;
        case '♦': case '♦️': folder = 'diamantes'; break;
        case '♠': case '♠️': folder = 'picas';     break;
        case '♣': case '♣️': folder = 'treboles';  break;
        default:              folder = 'corazones';
    }

    const valor = card.valor;
    let filename = '';
    if      (valor === 'A' || valor === 'As')         filename = 'As.png';
    else if (valor === 'J')                            filename = 'J.png';
    else if (valor === 'Q' || valor === 'Reina')       filename = 'Q.png';
    else if (valor === 'K' || valor === 'Rey')         filename = 'K.png';
    else                                               filename = `${valor}.png`;

    return `${base}${folder}/${filename}`.replace(/ /g, '%20');
}

function getTextCardHTML(card) {
    if (card.comodin) {
        return `<div class="card-face joker-f"><span class="cv">🃏</span><span class="cs" style="font-size:.55rem">JOKER</span></div>`;
    }
    const sc = SUIT_CLS[card.palo] || '';
    return `<div class="card-face ${sc}">
                <div class="corner tl">${card.valor}<br>${card.palo}</div>
                <div class="cv">${card.palo}</div>
                <div class="cs">${card.valor}</div>
                <div class="corner br">${card.valor}<br>${card.palo}</div>
            </div>`;
}

// ================================================================
// VALIDACIÓN CLIENTE
// ================================================================

function slotTerciaValido(cards) {
    if (cards.length < 3) return false;
    const normales  = cards.filter(c => !c.comodin);
    const comodines = cards.filter(c =>  c.comodin);
    if (normales.length === 0) return false;
    if (comodines.length > 1)  return false;
    const valorBase = normales[0].valor;
    return normales.every(c => c.valor === valorBase);
}

function slotCorridaValido(cards) {
    if (cards.length < 4) return false;
    const normales  = cards.filter(c => !c.comodin);
    const comodines = cards.filter(c =>  c.comodin);
    if (normales.length === 0) return false;
    if (comodines.length > 1)  return false;
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
    const normales  = cards.filter(c => !c.comodin);
    const comodines = cards.filter(c =>  c.comodin);
    if (normales.length === 0) return false;
    if (comodines.length > 1)  return false;
    if (comodines.length === 1 && normales.length >= 2) return true;
    const conteo = {};
    normales.forEach(c => { conteo[c.valor] = (conteo[c.valor] || 0) + 1; });
    return Object.values(conteo).some(n => n >= 2);
}

function slotCorridaCasiCompleta(cards) {
    if (cards.length < 4) return false;
    const normales  = cards.filter(c => !c.comodin);
    const comodines = cards.filter(c =>  c.comodin);
    if (normales.length === 0) return false;
    if (comodines.length > 1)  return false;
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
    if ((contarHuecos(valsNorm) - comodines.length) === 1) return true;
    if (valsNorm.includes(1)) {
        const valsA14 = valsNorm.map(v => v === 1 ? 14 : v).sort((a, b) => a - b);
        if ((contarHuecos(valsA14) - comodines.length) === 1) return true;
    }
    return false;
}

// ================================================================
// DETECCIÓN AUTOMÁTICA DE INTERCAMBIOS
// ================================================================

const _intercambiosCache = new Map();

function detectarIntercambiosPosibles() {
    if (!G || myIdx < 0) return [];
    if (!isMyTurn()) return [];
    const me = G.jugadores[myIdx];
    if (!me) return [];
    const estadosValidos = ['esperando_accion', 'esperando_pago'];
    if (!estadosValidos.includes(G.estado)) return [];
    if (!me.bajado && G.estado !== 'esperando_accion') return [];

    const intercambios = [];
    const cartasEnSlots = new Set();
    buildingCards.forEach(cards => cards.forEach(c => cartasEnSlots.add(c.id)));

    G.jugadores.forEach((jOrigen, ji) => {
        if (!jOrigen.bajado) return;
        if (!me.bajado && ji === myIdx) return;

        jOrigen.jugadas?.forEach((jug, jugi) => {
            const comodin = jug.cartas.find(c => c.comodin);
            if (!comodin) return;
            const valorNecesario = comodin.valorReemplazado;
            const paloNecesario  = comodin.paloReemplazado;

            me.mano.forEach(carta => {
                if (carta.comodin) return;
                if (!me.bajado && cartasEnSlots.has(carta.id)) return;

                const encaja = jug.tipo === 'tercia'
                    ? carta.valor === valorNecesario
                    : carta.valor === valorNecesario && carta.palo === paloNecesario;
                if (!encaja) return;

                if (me.bajado) {
                    const jokerEsUtil = G.jugadores.some((jDest, jdi) => {
                        if (!jDest.bajado) return false;
                        return jDest.jugadas?.some((jugDest, jugiDest) => {
                            if (jdi === ji && jugiDest === jugi) return false;
                            if (jugDest.cartas.some(c => c.comodin)) return false;
                            return true;
                        });
                    });
                    if (!jokerEsUtil) return;

                    const icObj = { cartaId: carta.id, cartaValor: carta.valor, cartaPalo: carta.palo, jugadorIdx: ji, jugadaIdx: jugi, comodinId: comodin.id, esCasoBajado: true };
                    const icKey = `${ji}-${jugi}-${comodin.id}`;
                    _intercambiosCache.set(icKey, icObj);
                    intercambios.push(icObj);
                    return;
                }

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
                        if (comodinAsignado) { jugadasSimuladas.push({ tipo: def.type, cartas: slotCards.filter(Boolean) }); continue; }
                        const conComodin = [...slotCards, { ...comodin, comodin: true }];
                        const valido    = def.type === 'tercia' ? slotTerciaValido(conComodin) : slotCorridaValido(conComodin);
                        const sinComodin = def.type === 'tercia' ? slotTerciaValido(slotCards)  : slotCorridaValido(slotCards);
                        if (!sinComodin && valido) { jugadasSimuladas.push({ tipo: def.type, cartas: conComodin }); comodinAsignado = true; }
                        else { jugadasSimuladas.push({ tipo: def.type, cartas: slotCards.filter(Boolean) }); }
                    }
                }

                const req = REQ[G.ronda];
                let terciasOk = 0, corridasOk = 0;
                for (const js of jugadasSimuladas) {
                    if (!js.cartas || js.cartas.length === 0) continue;
                    if (js.tipo === 'tercia'  && slotTerciaValido(js.cartas))  terciasOk++;
                    if (js.tipo === 'corrida' && slotCorridaValido(js.cartas)) corridasOk++;
                }
                if (terciasOk < req.t || corridasOk < req.c) return;

                const icObj = { cartaId: carta.id, cartaValor: carta.valor, cartaPalo: carta.palo, jugadorIdx: ji, jugadaIdx: jugi, comodinId: comodin.id, jugadasSimuladas, esCasoBajado: false };
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

    const req  = REQ[G.ronda];
    const defs = getSlotDefsRonda(G.ronda);

    let completos = 0, casiCompletos = 0, insuficientes = 0;
    for (const def of defs) {
        const cards      = buildingCards.get(def.index) || [];
        const esCompleto = def.type === 'tercia' ? slotTerciaValido(cards)        : slotCorridaValido(cards);
        const esCasi     = def.type === 'tercia' ? slotTerciaCasiCompleta(cards)  : slotCorridaCasiCompleta(cards);
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

// ================================================================
// INICIALIZACIÓN Y SOCKET
// ================================================================

function init() {
    if (!MY_ID || !ROOM) { location.href = '/'; return; }
    setupSocketEvents();
    WS.connect();
}

function setupSocketEvents() {
    WS.on('_connected', () => {
        document.getElementById('modal-disconnected').classList.remove('show');
        document.getElementById('mode-pill').textContent = 'Conectado';
    });
    WS.on('_disconnected', () => {
        document.getElementById('modal-disconnected').classList.add('show');
        document.getElementById('mode-pill').textContent = 'Desconectado';
    });
    WS.on('state_update', ({ event, data, state }) => {
        if (!state) return;
        const prev = G;
        G = state;
        myIdx = G.jugadores.findIndex(j => j.id === MY_ID);
        applyEvent(event, data, prev);
        render();
    });
    WS.on('player_reconnected',  ({ nombre }) => Notify?.success(`${nombre} se reconectó`));
    WS.on('player_disconnected', ({ nombre }) => Notify?.warning(`${nombre} se desconectó`));
    WS.on('error', ({ msg }) => {
        Notify?.danger(msg);
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
                buildingCards.forEach(cards => {
                    cards.forEach(carta => {
                        if (carta && !me.mano.some(c => c.id === carta.id)) me.mano.push(carta);
                    });
                });
                buildingCards.clear();
                if (msg.includes('BAJADA EN FALSO')) Notify?.danger('Las cartas regresaron a tus sobrantes. Penalizado 2 turnos.');
                render();
            }
        }
    });
}

// ================================================================
// EVENTOS / ANIMACIONES
// ================================================================

async function applyEvent(event, data, prev) {
    if (!event || !data) return;
    switch (event) {
        case 'game_started':
        case 'nueva_ronda':
            await handleNewRound(); break;
        case 'tomar_mazo':
            await handleTomarMazo(data); break;
        case 'pagar':
            await handlePagar(data); break;
        case 'bajar':
            await handleBajar(data); break;
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
    const mazoEl = document.getElementById('mazo-wrap');
    await Anim.shuffleAnim(mazoEl);
    const discardZone = document.getElementById('discard-zone');
    if (discardZone && G.jugadores[myIdx]) {
        await Anim.dealAnim(mazoEl, discardZone, G.jugadores[myIdx].mano || [], 0);
    }
}

async function handleTomarMazo(data) {
    if (data.jugadorIdx === myIdx) {
        const mazoEl      = document.getElementById('mazo-wrap');
        const discardZone = document.getElementById('discard-zone');
        await new Promise(r => setTimeout(r, 20));
        const newCardEl = discardZone?.querySelector(`.card[data-id="${data.carta?.id}"]`);
        if (mazoEl && discardZone && newCardEl) {
            await Anim.flyToHand(mazoEl, discardZone, discardZone.querySelectorAll('.card').length - 1, newCardEl);
        }
    }
}

async function handlePagar(data) {
    if (data.jugadorIdx !== myIdx) {
        const oppEl  = document.querySelector(`.opp[data-idx="${data.jugadorIdx}"]`);
        const fondoW = document.getElementById('fondo-wrap');
        if (oppEl && fondoW) await Anim.rivalPaysToFondo(oppEl, fondoW, null);
    }
}

async function handleBajar(data) {
    if (data.jugadorIdx === myIdx) {
        buildingCards.clear();
        const discardZone = document.getElementById('discard-zone');
        const bajadas     = document.getElementById('table-bajadas');
        const cardEls     = [...(discardZone?.querySelectorAll('.card') || [])];
        if (cardEls.length && bajadas) await Anim.bajarAnim(cardEls, bajadas);
    }
}

async function handleIntercambiarComodin(data) {
    if (data.jugadorIdx === myIdx) {
        Notify?.success('Intercambio exitoso — recibiste un comodín');
    } else if (data.origenJugadorIdx === myIdx) {
        Notify?.warning('Te intercambiaron un comodín de tus jugadas');
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

// ================================================================
// ACCIONES DEL JUGADOR
// ================================================================

function isMyTurn()  { return myIdx === G?.turno; }
function isPayable() { return isMyTurn() && ['esperando_accion', 'esperando_pago'].includes(G?.estado); }

function acMazo() {
    if (!isMyTurn() || G.estado !== 'esperando_robo') return;
    cancelIntercambio();
    WS.send({ type: 'tomar_mazo' });
}

function acFondo() {
    if (!isMyTurn() || G.estado !== 'esperando_robo') return;
    if (G.jugadores[myIdx]?.bajado) { Notify?.warning('Ya te bajaste.'); return; }
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

function mostrarDialogoCastigo(card) {
  if (typeof Notify !== 'undefined' && Notify.showCastigoDialog) {
    // Usamos el nuevo diálogo con colores personalizados
    // Botón SÍ = amarillo (warning), Botón NO = rojo (danger)
    Notify.showCastigoDialog(card, 
      () => acCastigo(true),   // onYes
      () => acCastigo(false),  // onNo
      {
        confirmText: 'SÍ, CASTIGARME',
        cancelText: 'NO',
        confirmColor: 'warning',  // Amarillo
        cancelColor: 'danger',    // Rojo
        title: '¿Te castigas?'
      }
    );
  } else {
    const result = confirm(`¿Te castigas el ${card?.valor}${card?.palo || ''}?`);
    acCastigo(result);
  }
}

function acBajar() {
    if (!slotsListosParaBajar()) { Notify?.danger('Completa las jugadas requeridas en los slots antes de bajarte'); return; }
    const defs    = getSlotDefsRonda(G.ronda);
    const jugadas = [];
    for (const def of defs) {
        const cards       = buildingCards.get(def.index) || [];
        const cartasReales = cards.filter(Boolean);
        if (cartasReales.length === 0) continue;
        jugadas.push({ tipo: def.type, cartas: cartasReales });
    }
    if (jugadas.length === 0) { Notify?.warning('No hay cartas en los slots de construcción'); return; }
    WS.send({ type: 'bajar', jugadas });
    cancelIntercambio();
}

function acPagar(cartaId) {
    const id = cartaId || selId;
    if (!id) { Notify?.warning('Selecciona una carta para pagar.'); return; }
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
    const me     = G?.jugadores?.[myIdx];
    const jugada = G?.jugadores?.[destJugadorIdx]?.jugadas?.[destJugadaIdx];

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

function mostrarSelectorPosicionJoker(cartaId, destJugadorIdx, destJugadaIdx, jugada) {
    const VN_MAP = { A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13 };
    const VN_REV = {1:'A',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'};
    const normales = jugada.cartas.filter(c => !c.comodin);
    const palo     = normales[0]?.palo || '';
    const vals     = normales.map(c => VN_MAP[c.valor] || parseInt(c.valor)).sort((a, b) => a - b);

    const tieneAs   = vals.includes(1);
    const tieneAltas = vals.some(v => v >= 11);
    const useA14    = tieneAs && tieneAltas && !vals.includes(2);
    const valsReales = vals.map(v => (v === 1 && useA14) ? 14 : v).sort((a, b) => a - b);

    const minVal  = valsReales[0];
    const maxVal  = valsReales[valsReales.length - 1];
    const valBaja = minVal - 1;
    const valAlta = maxVal + 1;

    const lblBaja = valBaja >= 1  ? `${VN_REV[valBaja] || valBaja}${palo}` : null;
    const lblAlta = valAlta <= 14 ? `${VN_REV[valAlta] || valAlta}${palo}` : null;

    const prev = document.getElementById('joker-pos-modal');
    if (prev) prev.remove();

    const modal = document.createElement('div');
    modal.id = 'joker-pos-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);';

    const secuenciaHtml = jugada.cartas.map(c => {
        if (c.comodin) return `<span style="background:#4a2080;color:#ffe066;padding:2px 5px;border-radius:4px;font-size:.75rem">JOKER</span>`;
        const isRed = c.palo === '♥' || c.palo === '♦';
        return `<span style="color:${isRed ? '#e05050' : '#e8e8e8'};font-size:.75rem">${c.valor}${c.palo}</span>`;
    }).join('<span style="color:#aaa;margin:0 2px">·</span>');

    modal.innerHTML = `
        <div style="background:#1a2a1a;border:2px solid var(--gold,#c8a045);border-radius:10px;padding:18px 22px;min-width:260px;max-width:320px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.6);">
            <div style="font-size:.72rem;color:#aaa;margin-bottom:6px">¿Dónde va el Joker?</div>
            <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;align-items:center">${secuenciaHtml}</div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                ${lblBaja ? `<button onclick="window._confirmarPosJoker('${cartaId}',${destJugadorIdx},${destJugadaIdx},'baja')" style="background:#1e4a2e;border:1px solid #2ecc71;color:#2ecc71;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:.8rem">Baja<br><small style="font-size:.7rem;color:#aaa">${lblBaja}</small></button>` : ''}
                ${lblAlta ? `<button onclick="window._confirmarPosJoker('${cartaId}',${destJugadorIdx},${destJugadaIdx},'alta')" style="background:#1e4a2e;border:1px solid #2ecc71;color:#2ecc71;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:.8rem">Alta<br><small style="font-size:.7rem;color:#aaa">${lblAlta}</small></button>` : ''}
                ${!lblBaja && !lblAlta ? `<span style="color:#aaa;font-size:.75rem">Solo hay una posición posible</span>` : ''}
            </div>
            <button onclick="document.getElementById('joker-pos-modal').remove();window.cancelIntercambio();" style="margin-top:12px;background:transparent;border:none;color:#888;cursor:pointer;font-size:.72rem">Cancelar</button>
        </div>`;

    document.body.appendChild(modal);

    if (!lblBaja && lblAlta)  { modal.remove(); acAcomodar(cartaId, destJugadorIdx, destJugadaIdx, 'alta'); }
    else if (lblBaja && !lblAlta) { modal.remove(); acAcomodar(cartaId, destJugadorIdx, destJugadaIdx, 'baja'); }
}

window._confirmarPosJoker = function(cartaId, destJugadorIdx, destJugadaIdx, posicion) {
    const modal = document.getElementById('joker-pos-modal');
    if (modal) modal.remove();
    acAcomodar(isNaN(cartaId) ? cartaId : Number(cartaId), Number(destJugadorIdx), Number(destJugadaIdx), posicion);
};

function acIntercambiarComodin(cartaId, origenJugadorIdx, origenJugadaIdx) {
    if (!isMyTurn()) { Notify?.warning('No es tu turno.'); return; }
    const estadosValidos = ['esperando_accion', 'esperando_pago'];
    if (!estadosValidos.includes(G.estado)) { Notify?.warning('No puedes intercambiar en este momento.'); return; }

    const me = G.jugadores[myIdx];
    const jugadasEnSlots = [];
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

function activarModoIntercambio(jugadorIdx, jugadaIdx, comodinId) {
    if (!isMyTurn()) { Notify?.warning('No es tu turno para intercambiar.'); return; }
    const estadosValidos = ['esperando_accion', 'esperando_pago'];
    if (!estadosValidos.includes(G.estado)) { Notify?.warning('No puedes intercambiar en este momento.'); return; }
    if (!selId) { Notify?.warning('Primero selecciona una carta de tu mano para intercambiar.'); return; }
    const me = G.jugadores[myIdx];
    const cartaSeleccionada = me?.mano?.find(c => c.id === selId);
    if (!cartaSeleccionada) { Notify?.danger('Error: carta no encontrada.'); return; }
    if (cartaSeleccionada.comodin) { Notify?.warning('No puedes intercambiar un comodín por otro comodín.'); return; }

    intercambioMode = true;
    selectedComodinInfo = { jugadorIdx, jugadaIdx, comodinId };
    Notify?.info(`Intercambiarás ${cartaSeleccionada.valor}${cartaSeleccionada.palo || ''} por el comodín`);
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
    if (!intercambio) { Notify?.warning('Intercambio no disponible, vuelve a intentar.'); return; }
    ejecutarIntercambioDirecto(intercambio);
}

function ejecutarIntercambioDirecto(intercambio) {
    if (!isMyTurn()) { Notify?.warning('No es tu turno.'); return; }
    const estadosValidos = ['esperando_accion', 'esperando_pago'];
    if (!estadosValidos.includes(G.estado)) { Notify?.warning('Solo puedes intercambiar después de robar.'); return; }

    const carta = `${intercambio.cartaValor}${intercambio.cartaPalo}`;

    if (intercambio.esCasoBajado) {
        Notify?.info(`Intercambiando ${carta} por el Joker…`);
        WS.send({ type: 'intercambiar_comodin', cartaId: intercambio.cartaId, origenJugadorIdx: intercambio.jugadorIdx, origenJugadaIdx: intercambio.jugadaIdx, jugadasEnSlots: [] });
    } else {
        const defs = getSlotDefsRonda(G.ronda);
        const jugadasEnSlots = [];
        for (const def of defs) {
            const cards = buildingCards.get(def.index) || [];
            if (cards.length > 0) jugadasEnSlots.push({ tipo: def.type, cartas: cards.filter(Boolean) });
        }
        if (jugadasEnSlots.length === 0) { Notify?.danger('Arma tus jugadas en los slots antes de intercambiar.'); return; }
        Notify?.info(`Intercambiando ${carta} por el Joker…`);
        WS.send({ type: 'intercambiar_comodin', cartaId: intercambio.cartaId, origenJugadorIdx: intercambio.jugadorIdx, origenJugadaIdx: intercambio.jugadaIdx, jugadasEnSlots });
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
    buildingCards.forEach((cards, slotIndex) => { if (cards.some(c => c.id === draggedId)) slotOrigen = slotIndex; });
    if (slotOrigen !== null) { Notify?.warning('No puedes reordenar cartas que están en construcción'); return; }
    const fromIdx = me.mano.findIndex(c => c.id === draggedId);
    if (fromIdx < 0) return;
    let toIdx = beforeId;
    if (beforeId === Infinity || beforeId >= me.mano.length) toIdx = me.mano.length - 1;
    const newOrder = [...me.mano];
    const [moved]  = newOrder.splice(fromIdx, 1);
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

// ================================================================
// RENDERIZADO
// ================================================================

function render() {
    if (!G || myIdx < 0) return;
    const me = G.jugadores[myIdx];
    document.getElementById('ronda-pill').textContent = `Ronda ${G.ronda} de 7`;
    document.getElementById('req-pill').textContent   = REQ_LABELS[G.ronda] || '';
    renderScoreboard();
    renderOpponents();
    renderTableBajadas();
    renderMazo();
    renderFondo(me);
    renderPlayerInfo(me);
    renderHand();
    renderActions();
}

function renderScoreboard() {
    document.getElementById('scoreboard').innerHTML = G.jugadores.map((j, i) => `
        <div class="sitem ${i === myIdx ? 'me' : ''}">
            <div class="sname">${j.nombre}</div>
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
            <div class="opp-name">${j.nombre}${j.bajado ? ' ✓' : ''}${!j.conectado ? ' (desconectado)' : ''} · ${j.pts_t}pts</div>
            <div class="opp-backs">${(j.mano || []).map(() => '<div class="cback-xs"></div>').join('')}</div>
            ${j.bajado && j.jugadas?.length ? `<div style="font-size:.62rem;color:#2a8a4a;margin-top:3px">${j.jugadas.length} jugada(s)</div>` : ''}
        `;
        opEl.appendChild(d);
    });
}

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

            const _me = G.jugadores[myIdx];
            const puedeIntercambiar  = isMyTurn() && ['esperando_accion', 'esperando_pago'].includes(G.estado);
            const intercambiosPosibles = puedeIntercambiar ? detectarIntercambiosPosibles() : [];

            const cardsHtml = jug.cartas.map(c => {
                if (c.comodin) {
                    const vr     = c.valorReemplazado || '?';
                    const vrPalo = c.paloReemplazado  || '';
                    const intercPosible = intercambiosPosibles.find(
                        ic => ic.jugadorIdx === ji && ic.jugadaIdx === jugi && ic.comodinId === c.id
                    );
                    if (intercPosible) {
                        const icKey  = `${ji}-${jugi}-${c.id}`;
                        const tipTxt = intercPosible.esCasoBajado
                            ? `Poner ${intercPosible.cartaValor}${intercPosible.cartaPalo} aquí → recibes el Joker para acomodar`
                            : `Intercambiar por ${intercPosible.cartaValor}${intercPosible.cartaPalo} → recibes el Joker`;
                        return `<div class="card-sm joker-sm comodin-intercambiable joker-highlight"
                                     title="${tipTxt}"
                                     data-ic-key="${icKey}"
                                     onclick="event.stopPropagation();window.ejecutarIntercambioDesdeKey('${icKey}')">
                                     JOKER<small style="font-size:8px;display:block;color:#ffe066;">=${vr}${vrPalo}</small>
                                     <small style="font-size:7px;display:block;color:#4de88a;">CLIC</small></div>`;
                    }
                    if (intercambioMode && isMyTurn() && ji !== myIdx) {
                        return `<div class="card-sm joker-sm comodin-intercambiable"
                                     title="Reemplaza a: ${vr}${vrPalo}"
                                     data-comodin-id="${c.id}" data-jugador="${ji}" data-jugada="${jugi}"
                                     onclick="event.stopPropagation();window.activarModoIntercambio(${ji},${jugi},'${c.id}')">
                                     JOKER<small style="font-size:8px;display:block;">=${vr}${vrPalo}</small></div>`;
                    }
                    return `<div class="card-sm joker-sm" title="Reemplaza a: ${vr}${vrPalo}">JOKER<small style="font-size:8px;display:block;">=${vr}${vrPalo}</small></div>`;
                }
                return cSm(c);
            }).join('');

            pile.innerHTML = `<div class="bajada-pile-label">${jug.tipo}</div><div class="bajada-pile-cards">${cardsHtml}</div>`;
            if (!intercambioMode && _me?.bajado) {
                pile.onclick = () => {
                    if (!selId || !isMyTurn()) return;
                    acAcomodar(selId, ji, jugi, null);
                };
            }
            wrap.appendChild(pile);
        });
        bajEl.appendChild(wrap);
    });
}

function renderMazo() {
    document.getElementById('mazo-count').textContent = `${G.mazo_count} cartas`;
    const mazoW = document.getElementById('mazo-wrap');
    mazoW.style.cursor = isMyTurn() && G.estado === 'esperando_robo' ? 'pointer' : 'default';
}

function renderFondo(me) {
    const fw = document.getElementById('fondo-wrap');
    fw.innerHTML = '';
    if (G.fondo_top) {
        const canTake = isMyTurn() && G.estado === 'esperando_robo' && !me?.bajado;
        fw.innerHTML  = cFull(G.fondo_top, true);
        const fc = fw.querySelector('.card');
        if (fc) {
            if (!canTake) {
                fc.classList.add('disabled');
            } else {
                const newFc = fc.cloneNode(true);
                fw.innerHTML = '';
                fw.appendChild(newFc);
                newFc.onclick = acFondo;
                newFc.addEventListener('mousedown', e => DragDrop.startFondoDrag(e, newFc, { onTakeFondo: idx => acFondoDrag(idx) }));
                newFc.addEventListener('touchstart', e => DragDrop.startFondoDrag(e, newFc, { onTakeFondo: idx => acFondoDrag(idx) }), { passive: false });
            }
        }
    } else {
        fw.innerHTML = `<div class="cback" style="opacity:.3;cursor:default"></div>`;
    }
}

function renderPlayerInfo(me) {
    document.getElementById('my-name').textContent    = me?.nombre || '—';
    document.getElementById('hand-count').textContent = `${me?.mano?.length || 0} cartas`;
    const dot = document.getElementById('pulse-dot');
    if (dot) dot.style.display = isMyTurn() ? 'inline-block' : 'none';
    document.getElementById('turn-tag').textContent   = isMyTurn() ? '' : `Turno de ${G.jugadores[G.turno]?.nombre || '…'}`;
}

// ================================================================
// SLOTS DE CONSTRUCCIÓN
// ================================================================

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
    const T = (t, i) => slotDef(t, 'tercia',  i, 3, 'Mínimo 3 cartas del mismo valor');
    const C = (t, i) => slotDef(t, 'corrida', i, 4, 'Mínimo 4 cartas del mismo palo en secuencia');

    const htmlMap = {
        1: T('TERCIA 1',0) + T('TERCIA 2',1),
        2: T('TERCIA',0)   + C('CORRIDA',1),
        3: C('CORRIDA 1',0)+ C('CORRIDA 2',1),
        4: T('TERCIA 1',0) + T('TERCIA 2',1) + T('TERCIA 3',2),
        5: T('TERCIA 1',0) + T('TERCIA 2',1) + C('CORRIDA',2),
        6: C('CORRIDA 1',0)+ C('CORRIDA 2',1)+ T('TERCIA',2),
        7: C('CORRIDA 1',0)+ C('CORRIDA 2',1)+ C('CORRIDA 3',2),
    };

    buildingRow.innerHTML = htmlMap[G.ronda] || '';
    buildingCards.forEach((cards, slotIndex) => updateSlotUI(slotIndex, cards));
}

function renderHand() {
    if (!G || myIdx < 0) return;
    const me          = G.jugadores[myIdx];
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
    const el       = document.createElement('div');
    el.className   = 'card' + (c.id === selId ? ' selected' : '');
    if (intercambioMode && selId && c.id === selId) el.classList.add('pending-intercambio');
    el.dataset.id  = c.id;
    if (fromSlot !== null) el.dataset.slot = fromSlot;
    el.draggable   = false;

    const imgUrl = getCardImageURL(c);
    const img    = document.createElement('img');
    img.src      = imgUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:var(--r);display:block;';
    img.onerror  = () => { el.innerHTML = getTextCardHTML(c); attachDragAndClickEvents(el, c, fromSlot); };
    el.appendChild(img);
    attachDragAndClickEvents(el, c, fromSlot);
    return el;
}

function attachDragAndClickEvents(el, c, fromSlot) {
    el.addEventListener('click', e => { e.stopPropagation(); selCard(c.id); });

    const dragCallbacks = {
        isPayable,
        onPagar:               id                              => acPagar(id),
        onAcomodar:            (id, pi, ji)                    => acAcomodar(id, pi, ji),
        onReorder:             (id, beforeId)                  => acReorder(id, beforeId),
        onBuildingDrop:        (id, slotIndex, slotType, insertIdx) => handleBuildingDrop(id, slotIndex, slotType, insertIdx),
        onRemoveFromSlot:      (id, slotIndex)                 => handleRemoveFromSlot(id, slotIndex),
        onMoveBetweenSlots:    (id, fromSlot, toSlot, toSlotType, insertIdx) => handleMoveBetweenSlots(id, fromSlot, toSlot, toSlotType, insertIdx),
        onReturnToHand:        (id, slotIndex)                 => handleReturnToHand(id, slotIndex),
        onReorderWithinSlot:   (id, slotIndex, insertIdx)      => handleReorderWithinSlot(id, slotIndex, insertIdx),
    };

    el.addEventListener('mousedown', e => { if (e.button !== 0) return; DragDrop.startHandDrag(e, el, c.id, dragCallbacks); });
    el.addEventListener('touchstart', e => DragDrop.startHandDrag(e, el, c.id, dragCallbacks), { passive: false });
}

function handleBuildingDrop(cartaId, slotIndex, slotType, insertIdx) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) { Notify?.warning('Ya estás bajado, no puedes construir más jugadas'); return; }
    const cartaIndex = me.mano.findIndex(c => c.id === cartaId);
    if (cartaIndex === -1) { Notify?.danger('Carta no encontrada en la mano'); return; }
    let cartaEnOtroSlot = false;
    buildingCards.forEach(cards => { if (cards.some(c => c.id === cartaId)) cartaEnOtroSlot = true; });
    if (cartaEnOtroSlot) { Notify?.warning('Esta carta ya está en otra jugada'); return; }
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
    Notify?.success(`${cartaMovida.valor}${cartaMovida.palo || ''} agregada a ${slotType}`);
}

function updateSlotUI(slotIndex, cards) {
    const slot = document.querySelector(`.building-slot[data-slot-index="${slotIndex}"]`);
    if (!slot) return;
    const cardsContainer = document.getElementById(`slot-${slotIndex}-cards`);
    if (!cardsContainer) return;
    cardsContainer.innerHTML = '';
    cards.forEach(carta => { if (!carta) return; cardsContainer.appendChild(createCardElement(carta, slotIndex)); });
    const countSpan = slot.querySelector('.building-slot-count');
    const minCards  = parseInt(slot.dataset.minCards);
    const slotType  = slot.dataset.slotType;
    const esValido  = slotType === 'tercia' ? slotTerciaValido(cards) : slotCorridaValido(cards);
    if (countSpan) {
        countSpan.textContent = `${cards.length}/${minCards}+`;
        countSpan.classList.toggle('valid', esValido);
        slot.classList.toggle('complete', esValido);
    }
}

function handleRemoveFromSlot(cartaId, slotIndex) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) { Notify?.warning('Ya estás bajado, no puedes modificar jugadas'); return; }
    const slotCards = buildingCards.get(slotIndex);
    if (!slotCards) return;
    const index = slotCards.findIndex(c => c.id === cartaId);
    if (index > -1) {
        slotCards.splice(index, 1);
        if (slotCards.length === 0) buildingCards.delete(slotIndex);
        updateSlotUI(slotIndex, slotCards);
        renderHand();
        renderActions();
        Notify?.success('Carta removida de la jugada');
    }
}

function handleReturnToHand(cartaId, slotIndex) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) { Notify?.danger('Ya estás bajado, no puedes modificar jugadas'); return; }
    slotIndex = String(slotIndex);
    const slotCards  = buildingCards.get(slotIndex);
    if (!slotCards) return;
    const cartaIndex = slotCards.findIndex(c => c.id === cartaId);
    if (cartaIndex === -1) return;
    const [cartaDevuelta] = slotCards.splice(cartaIndex, 1);
    if (slotCards.length === 0) buildingCards.delete(slotIndex);
    const yaEnMano = me.mano.some(c => c.id === cartaDevuelta.id);
    if (!yaEnMano) me.mano.push(cartaDevuelta);
    renderHand();
    renderActions();
    Notify?.info(`${cartaDevuelta.valor}${cartaDevuelta.palo || ''} devuelta a sobrantes`);
}

function handleMoveBetweenSlots(cartaId, fromSlotIndex, toSlotIndex, toSlotType, insertIdx) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) { Notify?.warning('Ya estás bajado, no puedes modificar jugadas'); return; }
    fromSlotIndex = String(fromSlotIndex);
    toSlotIndex   = String(toSlotIndex);
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
    const [carta]      = slotCards.splice(currentIdx, 1);
    const adjustedIdx  = (insertIdx > currentIdx) ? Math.max(0, insertIdx - 1) : insertIdx;
    slotCards.splice(adjustedIdx, 0, carta);
    updateSlotUI(slotIndex, slotCards);
    renderActions();
}

// ================================================================
// RENDER ACTIONS
// ================================================================

function renderActions() {
  if (!G || myIdx < 0) return;

  const me     = G.jugadores[myIdx];
  const myTurn = isMyTurn();
  const btns   = document.getElementById('action-btns');
  const instr  = document.getElementById('instr');
  const cb     = document.getElementById('castigo-banner');

  if (cb)   cb.style.display = 'none';
  if (btns) btns.innerHTML   = '';

  // ── helper para crear botones con estilo ALERTA MODERNO ──
  const add = (txt, alertType, fn, dis = false) => {
    if (!btns) return;
    const b = document.createElement('button');
    
    // Mapear el tipo a la clase CSS correspondiente
    let btnClass = '';
    switch(alertType) {
      case 'success':
        btnClass = 'action-alert-success';
        break;
      case 'info':
        btnClass = 'action-alert-info';
        break;
      case 'warning':
        btnClass = 'action-alert-warning';
        break;
      case 'danger':
        btnClass = 'action-alert-danger';
        break;
      default:
        btnClass = 'action-alert-info';
    }
    
    b.className = btnClass;
    b.textContent = txt;
    b.disabled    = dis;
    b.onclick     = fn;
    btns.appendChild(b);
  };

  // ── Modo intercambio ──
  if (intercambioMode) {
    if (instr) instr.textContent = 'Selecciona una carta de tu mano para intercambiar por el comodín';
    add('Cancelar intercambio', 'danger', cancelIntercambio);
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
          const vs = nats.map(c => ({ A:1,J:11,Q:12,K:13 }[c.valor] ?? parseInt(c.valor))).sort((a,b) => a-b);
          const v  = ({ A:1,J:11,Q:12,K:13 }[carta.valor] ?? parseInt(carta.valor));
          return v === vs[0] - 1 || v === vs[vs.length-1] + 1;
        }
      });
    });
  };

  const hasComodinesIntercambiables = () => {
    if (!selId) return false;
    const carta = me?.mano?.find(c => c.id === selId);
    if (!carta || carta.comodin) return false;
    return G.jugadores.some((j, ji) => {
      if (!j.bajado) return false;
      if (!me?.bajado && ji === myIdx) return false;
      return j.jugadas?.some(jug => jug.cartas.some(c => c.comodin));
    });
  };

  // ── No es mi turno ──
  if (!myTurn) {
    if (instr) instr.textContent = `Turno de ${G.jugadores[G.turno]?.nombre || '…'}`;
    if (G.estado === 'fase_castigo' && G.castigo_idx === myIdx && cb) {
      DragDrop.cancelDrag();
      const top = G.fondo_top;
      cb.style.display = 'block';
      cb.textContent   = `¿Te castigas el ${top?.valor}${top?.palo || ''}? (carta extra del mazo)`;
      if (instr) instr.textContent = 'Tienes prioridad de castigo.';
      add('Sí, castigarme', 'warning', () => acCastigo(true));
      add('No', 'danger', () => acCastigo(false));
    }
    return;
  }

  // ── Estados de juego ──
  switch (G.estado) {

    case 'esperando_robo':
      if (instr) instr.textContent = me?.bajado
        ? `${me.nombre} (bajado) — roba del mazo.`
        : 'Tu turno — toma del fondo o roba del mazo.';
      if (!me?.bajado) add('Tomar fondo', 'warning', acFondo, !G.fondo_top);
      add('Robar mazo', 'info', acMazo);
      break;

    case 'fase_castigo': {
      const jc  = G.jugadores[G.castigo_idx];
      const top = G.fondo_top;
      if (G.castigo_idx === myIdx && cb) {
        cb.style.display = 'block';
        cb.textContent   = `¿Te castigas el ${top?.valor}${top?.palo || ''}? (carta extra del mazo)`;
        if (instr) instr.textContent = 'Tienes prioridad de castigo.';
        add('Sí, castigarme', 'warning', () => mostrarDialogoCastigo(top));
        add('No', 'danger', () => acCastigo(false));
      } else {
        if (instr) instr.textContent = `Esperando que ${jc?.nombre} decida el castigo…`;
      }
      break;
    }

    case 'esperando_accion': {
      const listoParaBajar = slotsListosParaBajar();
      if (!me?.bajado) {
        if (me?.penalizacion?.activa) {
          if (instr) instr.textContent = `Penalización activa: ${me.penalizacion.turnosRestantes} turno(s) sin bajar.`;
        } else if (listoParaBajar) {
          if (instr) instr.textContent = 'Jugadas listas — pulsa Bajarme para confirmar.';
        } else {
          if (instr) instr.textContent = selId
            ? 'Carta seleccionada — págala o arrástrala a un slot.'
            : 'Arrastra cartas a los slots para armar tus jugadas.';
        }
        add('Bajarme', 'success', acBajar, !listoParaBajar);
        add('Pagar', 'danger', () => acPagar(selId), !selId);

        const intercambiosPosibles = detectarIntercambiosPosibles();
        if (intercambiosPosibles.length > 0) {
          const ic = intercambiosPosibles[0];
          add(`Intercambiar ${ic.cartaValor}${ic.cartaPalo} por Joker`, 'warning', () => ejecutarIntercambioDirecto(ic));
          if (instr) instr.textContent = `Puedes intercambiar ${ic.cartaValor}${ic.cartaPalo} por el Joker de ${G.jugadores[ic.jugadorIdx]?.nombre} y bajarte.`;
        } else if (selId && hasComodinesIntercambiables()) {
          add('Intercambiar por comodín', 'info', () => {
            Notify?.info('Haz clic en un comodín de las jugadas de otros jugadores');
            intercambioMode = true;
            render();
          });
        }
      } else {
        if (instr) instr.textContent = selId
          ? 'Carta seleccionada — acomódala en jugadas de otros o intercambia por un Joker.'
          : 'Selecciona una carta para acomodar o intercambiar.';
        add('Pagar', 'danger', () => acPagar(selId), !selId);
        if (hasDestForAcomodar()) add('Acomodar — clic en jugada', 'success', () => {});

        const intercambiosPosibles = detectarIntercambiosPosibles();
        if (intercambiosPosibles.length > 0) {
          const ic = intercambiosPosibles[0];
          add(`Intercambiar ${ic.cartaValor}${ic.cartaPalo} por Joker`, 'warning', () => ejecutarIntercambioDirecto(ic));
          if (instr) instr.textContent = `Puedes intercambiar ${ic.cartaValor}${ic.cartaPalo} por el Joker — luego acomódalo donde lo necesites.`;
        } else if (selId && hasComodinesIntercambiables()) {
          add('Intercambiar por comodín', 'info', () => {
            Notify?.info('Haz clic en un comodín de las jugadas');
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
        add('Pagar', 'danger', () => acPagar(selId), !selId);
      } else {
        if (instr) instr.textContent = selId
          ? 'Carta seleccionada — acomódala, intercámbia por un Joker, o págala.'
          : 'Selecciona una carta para acomodar, intercambiar o pagar.';
        add('Pagar', 'danger', () => acPagar(selId), !selId);
        if (hasDestForAcomodar()) add('Acomodar — clic en jugada', 'success', () => {});

        const intercambiosPosibles = detectarIntercambiosPosibles();
        if (intercambiosPosibles.length > 0) {
          const ic = intercambiosPosibles[0];
          add(`Intercambiar ${ic.cartaValor}${ic.cartaPalo} por Joker`, 'warning', () => ejecutarIntercambioDirecto(ic));
          if (instr) instr.textContent = `Puedes intercambiar ${ic.cartaValor}${ic.cartaPalo} por el Joker — luego acomódalo donde lo necesites.`;
        } else if (selId && hasComodinesIntercambiables()) {
          add('Intercambiar por comodín', 'info', () => {
            Notify?.info('Haz clic en un comodín de las jugadas');
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

// ================================================================
// HELPERS CARTAS
// ================================================================

function cFull(c, withId = true) {
    if (!c) return '';
    const imgUrl = getCardImageURL(c);
    const sc     = SUIT_CLS[c.palo] || '';

    if (c.comodin) {
        return `<div class="card"${withId ? ` data-id="${c.id}"` : ''}>
            <img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r);"
                 onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\'card-face joker-f\'><span class=\'cv\'>JOKER</span></div>';">
        </div>`;
    }

    return `<div class="card"${withId ? ` data-id="${c.id}"` : ''}>
        <img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r);"
             onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\'card-face ${sc}\'><div class=\'corner tl\'>${c.valor}<br>${c.palo}</div><div class=\'cv\'>${c.palo}</div><div class=\'cs\'>${c.valor}</div><div class=\'corner br\'>${c.valor}<br>${c.palo}</div></div>';">
    </div>`;
}

function cSm(c) {
    if (!c) return '';
    const imgUrl = getCardImageURL(c);
    const sc     = SUIT_CLS[c.palo] || '';

    if (c.comodin) {
        return `<div class="card-sm joker-sm" style="background:transparent;padding:0;overflow:hidden;">
                    <img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;"
                         onerror="this.style.display='none';this.parentElement.textContent='JOKER';this.parentElement.style.background='linear-gradient(160deg,#1a0a4a,#2d1060)';">
                </div>`;
    }

    return `<div class="card-sm natural ${sc}" style="background:transparent;padding:0;overflow:hidden;">
                <img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;"
                     onerror="this.style.display='none';this.parentElement.textContent='${c.valor}${c.palo}';this.parentElement.style.background='linear-gradient(160deg,#fffbf2,#f5ead8)';">
            </div>`;
}

// ================================================================
// MODALES
// ================================================================

function showModalRonda(ganadorIdx, puntos) {
    DragDrop.cancelDrag();
    const modal = document.getElementById('modal-ronda');
    if (!modal) return;
    document.getElementById('mr-title').textContent = `Ronda ${G.ronda} — ${G.jugadores[ganadorIdx]?.nombre} gana`;
    document.getElementById('mr-msg').textContent   = G.ronda < 7 ? `Siguiente: ronda ${G.ronda + 1}.` : 'Última ronda.';
    document.getElementById('mr-scores').innerHTML  = G.jugadores.map((j, i) => `
        <div class="srow ${i === ganadorIdx ? 'winner' : ''}">
            <span>${j.nombre}${i === ganadorIdx ? ' — ganador' : ''}</span>
            <span class="srow-pts">+${puntos?.[i]?.pts_r ?? 0} · Total: ${j.pts_t}</span>
        </div>
    `).join('');
    ackSent = false;
    modal.classList.add('show');
}

function showModalJuego(jugadores) {
    DragDrop.cancelDrag();
    const modal = document.getElementById('modal-juego');
    if (!modal) return;
    const sorted = [...jugadores].sort((a, b) => a.pts_t - b.pts_t);
    document.getElementById('mj-scores').innerHTML = sorted.map((j, i) => `
        <div class="srow ${i === 0 ? 'winner' : ''}">
            <span>${['1°', '2°', '3°', '4°', '5°'][i]} ${j.nombre}</span>
            <span class="srow-pts">${j.pts_t} pts</span>
        </div>
    `).join('');
    modal.classList.add('show');
}

function toast(msg, type = 'red') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent   = msg;
    t.style.background = type === 'green'  ? 'rgba(40,160,80,.9)'  :
                         type === 'yellow' ? 'rgba(200,160,69,.9)' :
                                             'rgba(180,50,50,.9)';
    t.style.display = 'block';
    clearTimeout(t._t);
    t._t = setTimeout(() => t.style.display = 'none', 2600);
}

// ================================================================
// EXPONER GLOBALES
// ================================================================

window.acMazo                    = acMazo;
window.acFondo                   = acFondo;
window.acCastigo                 = acCastigo;
window.acBajar                   = acBajar;
window.acPagar                   = acPagar;
window.acAcomodar                = acAcomodar;
window.acIntercambiarComodin     = acIntercambiarComodin;
window.acReorder                 = acReorder;
window.selCard                   = selCard;
window.ackRonda                  = ackRonda;
window.toast                     = toast;
window.activarModoIntercambio    = activarModoIntercambio;
window.cancelIntercambio         = cancelIntercambio;
window.ejecutarIntercambioDirecto  = ejecutarIntercambioDirecto;
window.ejecutarIntercambioDesdeKey = ejecutarIntercambioDesdeKey;

document.addEventListener('DOMContentLoaded', init);