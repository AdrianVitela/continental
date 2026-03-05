// client/js/game.js
'use strict';

// Configuración inicial y estado del juego
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

// Mapa de requisitos por ronda (tercias, corridas)
const REQ = {
    1: { t: 2, c: 0 },
    2: { t: 1, c: 1 },
    3: { t: 0, c: 2 },
    4: { t: 3, c: 0 },
    5: { t: 2, c: 1 },
    6: { t: 1, c: 2 },
    7: { t: 0, c: 3 }
};

// Valores numéricos para validar secuencias
const VN = { 'A':1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13 };

let G = null;
let myIdx = -1;
let selId = null;
let ackSent = false;
let pendingReorderIdx = -1;
let intercambioMode = false;
let selectedComodinInfo = null; // { jugadorIdx, jugadaIdx, cartaId }

// Mapa para tracking de cartas en zonas de construcción
// Ahora guarda objetos carta COMPLETOS, no solo IDs
let buildingCards = new Map(); // slotIndex -> array de cartas completas

// Inicialización
function init() {
    if (!MY_ID || !ROOM) {
        location.href = '/';
        return;
    }

    localStorage.setItem('nombre_' + MY_ID, localStorage.getItem('nombre_' + MY_ID) || 'Jugador');
    
    setupSocketEvents();
    WS.connect();
}

// Eventos del socket
function setupSocketEvents() {
    WS.on('_connected', () => {
        document.getElementById('modal-disconnected').classList.remove('show');
        document.getElementById('mode-pill').textContent = '🟢 Conectado';
    });

    WS.on('_disconnected', () => {
        document.getElementById('modal-disconnected').classList.add('show');
        document.getElementById('mode-pill').textContent = '🔴 Desconectado';
    });

    WS.on('state_update', ({ event, data, state }) => {
        if (!state) return;
        const prev = G;
        G = state;
        myIdx = G.jugadores.findIndex(j => j.id === MY_ID);
        applyEvent(event, data, prev);
        render();
    });

    WS.on('player_reconnected', ({ nombre }) => toast(`${nombre} se reconectó`, 'green'));
    WS.on('player_disconnected', ({ nombre }) => toast(`${nombre} se desconectó`));
    WS.on('error', ({ msg }) => toast(msg));
}

// Procesa eventos y dispara animaciones
async function applyEvent(event, data, prev) {
    if (!event || !data) return;

    switch (event) {
        case 'game_started':
        case 'nueva_ronda':
            await handleNewRound();
            break;

        case 'tomar_mazo':
            await handleTomarMazo(data);
            break;

        case 'pagar':
            await handlePagar(data);
            break;

        case 'bajar':
            await handleBajar(data);
            break;

        case 'intercambiar_comodin':
            await handleIntercambiarComodin(data);
            break;

        case 'fin_ronda':
            handleFinRonda(data);
            break;

        case 'fin_juego':
            showModalJuego(data.jugadores);
            break;
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
        const mazoEl = document.getElementById('mazo-wrap');
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
        const oppEl = document.querySelector(`.opp[data-idx="${data.jugadorIdx}"]`);
        const fondoW = document.getElementById('fondo-wrap');
        if (oppEl && fondoW) await Anim.rivalPaysToFondo(oppEl, fondoW, null);
    }
}

async function handleBajar(data) {
    if (data.jugadorIdx === myIdx) {
        const discardZone = document.getElementById('discard-zone');
        const bajadas = document.getElementById('table-bajadas');
        const cardEls = [...(discardZone?.querySelectorAll('.card') || [])];
        if (cardEls.length && bajadas) await Anim.bajarAnim(cardEls, bajadas);
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

// Acciones del jugador (envían comandos al servidor)
function isMyTurn() { return myIdx === G?.turno; }
function isPayable() { return isMyTurn() && ['esperando_accion', 'esperando_pago'].includes(G?.estado); }

function acMazo() {
    if (!isMyTurn() || G.estado !== 'esperando_robo') return;
    cancelIntercambio();
    WS.send({ type: 'tomar_mazo' });
}

function acFondo() {
    if (!isMyTurn() || G.estado !== 'esperando_robo') return;
    if (G.jugadores[myIdx]?.bajado) {
        toast('Ya te bajaste.');
        return;
    }
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
    const slots = document.querySelectorAll('.building-slot');
    const jugadas = [];
    
    // Construir las jugadas desde los slots
    for (const slot of slots) {
        const slotIndex = slot.dataset.slotIndex;
        const slotType = slot.dataset.slotType;
        const cards = buildingCards.get(slotIndex) || [];
        
        if (cards.length === 0) continue;
        
        // Las cartas ya son objetos completos
        const cartasReales = cards.filter(Boolean);
        
        if (cartasReales.length === 0) continue;
        
        jugadas.push({ 
            tipo: slotType, 
            cartas: cartasReales  // Enviamos las cartas completas, no solo IDs
        });
    }
    
    if (jugadas.length === 0) {
        toast('❌ No hay cartas en los slots de construcción');
        return;
    }
    
    console.log('Enviando jugadas al servidor:', jugadas);
    
    // Enviar las jugadas al servidor para validación
    WS.send({ 
        type: 'bajar', 
        jugadas: jugadas
    });
    
    cancelIntercambio();
}

function acPagar(cartaId) {
    const id = cartaId || selId;
    if (!id) {
        toast('Selecciona una carta para pagar.');
        return;
    }
    
    // Verificar si la carta está en un slot y removerla
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

function acAcomodar(cartaId, destJugadorIdx, destJugadaIdx) {
    // Verificar si la carta está en un slot y removerla
    buildingCards.forEach((cards, slotIndex) => {
        const index = cards.findIndex(c => c.id === cartaId);
        if (index > -1) {
            cards.splice(index, 1);
            if (cards.length === 0) buildingCards.delete(slotIndex);
            updateSlotUI(slotIndex, cards);
        }
    });
    
    WS.send({ type: 'acomodar', cartaId, destJugadorIdx, destJugadaIdx });
    selId = null;
    cancelIntercambio();
}

// Intercambio de comodines
function acIntercambiarComodin(cartaId, origenJugadorIdx, origenJugadaIdx) {
    if (!isMyTurn()) {
        toast('No es tu turno.');
        return;
    }
    
    if (G.estado !== 'esperando_accion') {
        toast('Debes robar una carta primero antes de intercambiar.');
        return;
    }
    
    // Verificar si la carta está en un slot y removerla
    buildingCards.forEach((cards, slotIndex) => {
        const index = cards.findIndex(c => c.id === cartaId);
        if (index > -1) {
            cards.splice(index, 1);
            if (cards.length === 0) buildingCards.delete(slotIndex);
            updateSlotUI(slotIndex, cards);
        }
    });
    
    WS.send({ 
        type: 'intercambiar_comodin', 
        cartaId, 
        origenJugadorIdx, 
        origenJugadaIdx 
    });
    
    selId = null;
    cancelIntercambio();
}

function activarModoIntercambio(jugadorIdx, jugadaIdx, comodinId) {
    if (!isMyTurn()) {
        toast('No es tu turno para intercambiar.');
        return;
    }
    
    if (G.estado !== 'esperando_accion') {
        toast('Debes robar una carta primero antes de intercambiar.');
        return;
    }
    
    const me = G.jugadores[myIdx];
    if (me?.bajado) {
        toast('Ya estás bajado. Puedes acomodar directamente, no necesitas intercambiar.');
        return;
    }
    
    if (!selId) {
        toast('Primero selecciona una carta de tu mano para intercambiar.');
        return;
    }
    
    const cartaSeleccionada = me?.mano?.find(c => c.id === selId);
    if (!cartaSeleccionada) {
        toast('Error: carta no encontrada.');
        return;
    }
    
    if (cartaSeleccionada.comodin) {
        toast('No puedes intercambiar un comodín por otro comodín.');
        return;
    }
    
    intercambioMode = true;
    selectedComodinInfo = { jugadorIdx, jugadaIdx, comodinId };
    
    toast(`Intercambiarás ${cartaSeleccionada.valor}${cartaSeleccionada.palo || ''} por el comodín`, 'green');
    render();
}

function cancelIntercambio() {
    intercambioMode = false;
    selectedComodinInfo = null;
    render();
}

function confirmarIntercambio() {
    if (!intercambioMode || !selectedComodinInfo || !selId) {
        cancelIntercambio();
        return;
    }
    
    acIntercambiarComodin(
        selId, 
        selectedComodinInfo.jugadorIdx, 
        selectedComodinInfo.jugadaIdx
    );
}

function acReorder(draggedId, beforeId) {
    const me = G.jugadores[myIdx];
    if (!me) return;
    
    // Verificar si la carta está en un slot (no debería poder reordenarse)
    let slotOrigen = null;
    buildingCards.forEach((cards, slotIndex) => {
        if (cards.some(c => c.id === draggedId)) slotOrigen = slotIndex;
    });
    
    if (slotOrigen !== null) {
        toast('No puedes reordenar cartas que están en construcción');
        return;
    }
    
    const fromIdx = me.mano.findIndex(c => c.id === draggedId);
    if (fromIdx < 0) return;
    
    let toIdx = beforeId;
    if (beforeId === Infinity || beforeId >= me.mano.length) {
        toIdx = me.mano.length - 1;
    }
    
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

// Renderizado de la interfaz
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
            <div class="opp-name">${j.nombre}${j.bajado ? ' ✅' : ''}${!j.conectado ? ' 📴' : ''} · ${j.pts_t}pts</div>
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
            if (intercambioMode) {
                pile.classList.add('intercambio-mode');
            }
            pile.dataset.pi = ji;
            pile.dataset.ji = jugi;
            
            const cardsHtml = jug.cartas.map(c => {
                if (c.comodin) {
                    let valorReemplazado = c.valorReemplazado || '?';
                    
                    if (intercambioMode && isMyTurn() && ji !== myIdx) {
                        return `<div class="card-sm joker-sm comodin-intercambiable" 
                                     title="Reemplaza a: ${valorReemplazado}"
                                     data-comodin-id="${c.id}"
                                     data-jugador="${ji}"
                                     data-jugada="${jugi}"
                                     onclick="event.stopPropagation(); window.activarModoIntercambio(${ji}, ${jugi}, '${c.id}')">
                                     🃏<small style="font-size:8px;display:block;">=${valorReemplazado}</small>
                                </div>`;
                    } else {
                        return `<div class="card-sm joker-sm" title="Reemplaza a: ${valorReemplazado}">
                                    🃏<small style="font-size:8px;display:block;">=${valorReemplazado}</small>
                                </div>`;
                    }
                } else {
                    return cSm(c);
                }
            }).join('');
            
            pile.innerHTML = `
                <div class="bajada-pile-label">${jug.tipo}</div>
                <div class="bajada-pile-cards">${cardsHtml}</div>
            `;
            
            if (!intercambioMode && G.jugadores[myIdx]?.bajado) {
                pile.onclick = () => {
                    if (selId && isMyTurn()) acAcomodar(selId, ji, jugi);
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
    
    if (G.fondo_top) {
        fw.innerHTML = cFull(G.fondo_top, false);
        const fc = fw.querySelector('.card');
        
        if (fc) {
            const canTake = isMyTurn() && G.estado === 'esperando_robo' && !me?.bajado;
            
            if (!canTake) {
                fc.classList.add('disabled');
            } else {
                fc.onclick = acFondo;
                fc.addEventListener('mousedown', e => DragDrop.startFondoDrag(e, fc, {
                    onTakeFondo: idx => { acFondoDrag(idx); }
                }));
                fc.addEventListener('touchstart', e => DragDrop.startFondoDrag(e, fc, {
                    onTakeFondo: idx => { acFondoDrag(idx); }
                }), { passive: false });
            }
        }
    } else {
        fw.innerHTML = `<div class="cback" style="opacity:.3;cursor:default"></div>`;
    }
}

function renderPlayerInfo(me) {
    document.getElementById('my-name').textContent = me?.nombre || '—';
    document.getElementById('hand-count').textContent = `${me?.mano?.length || 0} cartas`;
    
    const dot = document.getElementById('pulse-dot');
    if (dot) dot.style.display = isMyTurn() ? 'inline-block' : 'none';
    
    document.getElementById('turn-tag').textContent = isMyTurn() ? '' :
        `Turno de ${G.jugadores[G.turno]?.nombre || '…'}`;
}

// ═══════════════════════════════════════════════════
// RENDER DE LAS DOS FILAS (SOBRANTES Y CONSTRUCCIÓN)
// ═══════════════════════════════════════════════════

function renderBuildingRow() {
    if (!G || myIdx < 0) return;
    
    const buildingRow = document.getElementById('building-row');
    if (!buildingRow) return;
    
    const req = REQ_LABELS[G.ronda] || '';
    const reqEl = document.getElementById('building-requirement');
    if (reqEl) reqEl.textContent = req;
    
    let html = '';
    
    if (G.ronda === 1) {
        html = `
            <div class="building-slot" data-slot-type="tercia" data-slot-index="0" data-min-cards="3">
                <div class="building-slot-header">
                    <span class="building-slot-title">TERCIA 1</span>
                    <span class="building-slot-count">0/3+</span>
                </div>
                <div class="building-slot-cards" id="slot-0-cards"></div>
                <div class="slot-hint">Mínimo 3 cartas del mismo valor</div>
            </div>
            <div class="building-slot" data-slot-type="tercia" data-slot-index="1" data-min-cards="3">
                <div class="building-slot-header">
                    <span class="building-slot-title">TERCIA 2</span>
                    <span class="building-slot-count">0/3+</span>
                </div>
                <div class="building-slot-cards" id="slot-1-cards"></div>
                <div class="slot-hint">Mínimo 3 cartas del mismo valor</div>
            </div>
        `;
    } else if (G.ronda === 2) {
        html = `
            <div class="building-slot" data-slot-type="tercia" data-slot-index="0" data-min-cards="3">
                <div class="building-slot-header">
                    <span class="building-slot-title">TERCIA</span>
                    <span class="building-slot-count">0/3+</span>
                </div>
                <div class="building-slot-cards" id="slot-0-cards"></div>
                <div class="slot-hint">Mínimo 3 cartas del mismo valor</div>
            </div>
            <div class="building-slot" data-slot-type="corrida" data-slot-index="1" data-min-cards="4">
                <div class="building-slot-header">
                    <span class="building-slot-title">CORRIDA</span>
                    <span class="building-slot-count">0/4+</span>
                </div>
                <div class="building-slot-cards" id="slot-1-cards"></div>
                <div class="slot-hint">Mínimo 4 cartas del mismo palo en secuencia</div>
            </div>
        `;
    } else if (G.ronda === 3) {
        html = `
            <div class="building-slot" data-slot-type="corrida" data-slot-index="0" data-min-cards="4">
                <div class="building-slot-header">
                    <span class="building-slot-title">CORRIDA 1</span>
                    <span class="building-slot-count">0/4+</span>
                </div>
                <div class="building-slot-cards" id="slot-0-cards"></div>
                <div class="slot-hint">Mínimo 4 cartas del mismo palo en secuencia</div>
            </div>
            <div class="building-slot" data-slot-type="corrida" data-slot-index="1" data-min-cards="4">
                <div class="building-slot-header">
                    <span class="building-slot-title">CORRIDA 2</span>
                    <span class="building-slot-count">0/4+</span>
                </div>
                <div class="building-slot-cards" id="slot-1-cards"></div>
                <div class="slot-hint">Mínimo 4 cartas del mismo palo en secuencia</div>
            </div>
        `;
    } else if (G.ronda === 4) {
        html = `
            <div class="building-slot" data-slot-type="tercia" data-slot-index="0" data-min-cards="3">
                <div class="building-slot-header">
                    <span class="building-slot-title">TERCIA 1</span>
                    <span class="building-slot-count">0/3+</span>
                </div>
                <div class="building-slot-cards" id="slot-0-cards"></div>
                <div class="slot-hint">Mínimo 3 cartas del mismo valor</div>
            </div>
            <div class="building-slot" data-slot-type="tercia" data-slot-index="1" data-min-cards="3">
                <div class="building-slot-header">
                    <span class="building-slot-title">TERCIA 2</span>
                    <span class="building-slot-count">0/3+</span>
                </div>
                <div class="building-slot-cards" id="slot-1-cards"></div>
                <div class="slot-hint">Mínimo 3 cartas del mismo valor</div>
            </div>
            <div class="building-slot" data-slot-type="tercia" data-slot-index="2" data-min-cards="3">
                <div class="building-slot-header">
                    <span class="building-slot-title">TERCIA 3</span>
                    <span class="building-slot-count">0/3+</span>
                </div>
                <div class="building-slot-cards" id="slot-2-cards"></div>
                <div class="slot-hint">Mínimo 3 cartas del mismo valor</div>
            </div>
        `;
    } else if (G.ronda === 5) {
        html = `
            <div class="building-slot" data-slot-type="tercia" data-slot-index="0" data-min-cards="3">
                <div class="building-slot-header">
                    <span class="building-slot-title">TERCIA 1</span>
                    <span class="building-slot-count">0/3+</span>
                </div>
                <div class="building-slot-cards" id="slot-0-cards"></div>
                <div class="slot-hint">Mínimo 3 cartas del mismo valor</div>
            </div>
            <div class="building-slot" data-slot-type="tercia" data-slot-index="1" data-min-cards="3">
                <div class="building-slot-header">
                    <span class="building-slot-title">TERCIA 2</span>
                    <span class="building-slot-count">0/3+</span>
                </div>
                <div class="building-slot-cards" id="slot-1-cards"></div>
                <div class="slot-hint">Mínimo 3 cartas del mismo valor</div>
            </div>
            <div class="building-slot" data-slot-type="corrida" data-slot-index="2" data-min-cards="4">
                <div class="building-slot-header">
                    <span class="building-slot-title">CORRIDA</span>
                    <span class="building-slot-count">0/4+</span>
                </div>
                <div class="building-slot-cards" id="slot-2-cards"></div>
                <div class="slot-hint">Mínimo 4 cartas del mismo palo en secuencia</div>
            </div>
        `;
    } else if (G.ronda === 6) {
        html = `
            <div class="building-slot" data-slot-type="corrida" data-slot-index="0" data-min-cards="4">
                <div class="building-slot-header">
                    <span class="building-slot-title">CORRIDA 1</span>
                    <span class="building-slot-count">0/4+</span>
                </div>
                <div class="building-slot-cards" id="slot-0-cards"></div>
                <div class="slot-hint">Mínimo 4 cartas del mismo palo en secuencia</div>
            </div>
            <div class="building-slot" data-slot-type="corrida" data-slot-index="1" data-min-cards="4">
                <div class="building-slot-header">
                    <span class="building-slot-title">CORRIDA 2</span>
                    <span class="building-slot-count">0/4+</span>
                </div>
                <div class="building-slot-cards" id="slot-1-cards"></div>
                <div class="slot-hint">Mínimo 4 cartas del mismo palo en secuencia</div>
            </div>
            <div class="building-slot" data-slot-type="tercia" data-slot-index="2" data-min-cards="3">
                <div class="building-slot-header">
                    <span class="building-slot-title">TERCIA</span>
                    <span class="building-slot-count">0/3+</span>
                </div>
                <div class="building-slot-cards" id="slot-2-cards"></div>
                <div class="slot-hint">Mínimo 3 cartas del mismo valor</div>
            </div>
        `;
    } else if (G.ronda === 7) {
        html = `
            <div class="building-slot" data-slot-type="corrida" data-slot-index="0" data-min-cards="4">
                <div class="building-slot-header">
                    <span class="building-slot-title">CORRIDA 1</span>
                    <span class="building-slot-count">0/4+</span>
                </div>
                <div class="building-slot-cards" id="slot-0-cards"></div>
                <div class="slot-hint">Mínimo 4 cartas del mismo palo en secuencia</div>
            </div>
            <div class="building-slot" data-slot-type="corrida" data-slot-index="1" data-min-cards="4">
                <div class="building-slot-header">
                    <span class="building-slot-title">CORRIDA 2</span>
                    <span class="building-slot-count">0/4+</span>
                </div>
                <div class="building-slot-cards" id="slot-1-cards"></div>
                <div class="slot-hint">Mínimo 4 cartas del mismo palo en secuencia</div>
            </div>
            <div class="building-slot" data-slot-type="corrida" data-slot-index="2" data-min-cards="4">
                <div class="building-slot-header">
                    <span class="building-slot-title">CORRIDA 3</span>
                    <span class="building-slot-count">0/4+</span>
                </div>
                <div class="building-slot-cards" id="slot-2-cards"></div>
                <div class="slot-hint">Mínimo 4 cartas del mismo palo en secuencia</div>
            </div>
        `;
    }
    
    buildingRow.innerHTML = html;
    
    // Restaurar el estado de los slots
    buildingCards.forEach((cards, slotIndex) => {
        updateSlotUI(slotIndex, cards);
    });
}

function renderHand() {
    if (!G || myIdx < 0) return;
    
    const me = G.jugadores[myIdx];
    const discardZone = document.getElementById('discard-zone');
    
    if (!discardZone) return;
    
    renderBuildingRow();
    
    discardZone.innerHTML = '';
    
    // Recopilar IDs de cartas que están en slots
    const cartasEnSlots = new Set();
    buildingCards.forEach(cards => {
        cards.forEach(carta => {
            if (carta && carta.id) cartasEnSlots.add(carta.id);
        });
    });
    
    // Mostrar solo cartas que NO están en slots
    (me.mano || []).forEach(c => {
        if (!cartasEnSlots.has(c.id)) {
            const el = createCardElement(c);
            discardZone.appendChild(el);
        }
    });
    
    document.getElementById('hand-count').textContent = `${me?.mano?.length || 0} cartas`;
}

function createCardElement(c, fromSlot = null) {
    const el = document.createElement('div');
    el.className = 'card' + (c.id === selId ? ' selected' : '');
    if (intercambioMode && selId && c.id === selId) {
        el.classList.add('pending-intercambio');
    }
    el.dataset.id = c.id;
    if (fromSlot !== null) {
        el.dataset.slot = fromSlot;
    }
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
            </div>
        `;
    }
    
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        selCard(c.id);
    });
    
    const dragCallbacks = {
        isPayable,
        onPagar: id => acPagar(id),
        onAcomodar: (id, pi, ji) => acAcomodar(id, pi, ji),
        onReorder: (id, beforeId) => acReorder(id, beforeId),
        onBuildingDrop: (id, slotIndex, slotType) => {
            handleBuildingDrop(id, slotIndex, slotType);
        },
        onRemoveFromSlot: (id, slotIndex) => {
            handleRemoveFromSlot(id, slotIndex);
        },
        onMoveBetweenSlots: (id, fromSlot, toSlot, toSlotType) => {
            handleMoveBetweenSlots(id, fromSlot, toSlot, toSlotType);
        },
        onReturnToHand: (id, slotIndex) => {
            handleReturnToHand(id, slotIndex);
        }
    };
    
    el.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        DragDrop.startHandDrag(e, el, c.id, dragCallbacks);
    });
    
    el.addEventListener('touchstart', e => {
        DragDrop.startHandDrag(e, el, c.id, dragCallbacks);
    }, { passive: false });
    
    return el;
}

function handleBuildingDrop(cartaId, slotIndex, slotType) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) {
        toast('Ya estás bajado, no puedes construir más jugadas');
        return;
    }
    
    // Buscar la carta en la mano
    const cartaIndex = me.mano.findIndex(c => c.id === cartaId);
    if (cartaIndex === -1) {
        toast('Carta no encontrada en la mano');
        return;
    }
    
    // Verificar que no esté ya en otro slot
    let cartaEnOtroSlot = false;
    buildingCards.forEach((cards) => {
        if (cards.some(c => c.id === cartaId)) cartaEnOtroSlot = true;
    });
    
    if (cartaEnOtroSlot) {
        toast('Esta carta ya está en otra jugada');
        return;
    }
    
    // Quitar la carta de la mano (guardamos el objeto completo)
    const [cartaMovida] = me.mano.splice(cartaIndex, 1);
    
    // Añadir la carta completa al slot
    if (!buildingCards.has(slotIndex)) {
        buildingCards.set(slotIndex, []);
    }
    const slotCards = buildingCards.get(slotIndex);
    slotCards.push(cartaMovida);
    
    updateSlotUI(slotIndex, slotCards);
    renderHand();
    
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
        const cardEl = createCardElement(carta, slotIndex);
        cardsContainer.appendChild(cardEl);
    });
    
    const countSpan = slot.querySelector('.building-slot-count');
    const minCards = parseInt(slot.dataset.minCards);
    if (countSpan) {
        countSpan.textContent = `${cards.length}/${minCards}+`;
        if (cards.length >= minCards) {
            countSpan.classList.add('valid');
            slot.classList.add('complete');
        } else {
            countSpan.classList.remove('valid');
            slot.classList.remove('complete');
        }
    }
}

function handleRemoveFromSlot(cartaId, slotIndex) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) {
        toast('Ya estás bajado, no puedes modificar jugadas');
        return;
    }
    
    const slotCards = buildingCards.get(slotIndex);
    if (!slotCards) return;
    
    const index = slotCards.findIndex(c => c.id === cartaId);
    if (index > -1) {
        slotCards.splice(index, 1);
        
        if (slotCards.length === 0) {
            buildingCards.delete(slotIndex);
        }
        
        updateSlotUI(slotIndex, slotCards);
        renderHand();
        
        toast('Carta removida de la jugada', 'green');
    }
}

function handleReturnToHand(cartaId, slotIndex) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) {
        toast('Ya estás bajado, no puedes modificar jugadas', 'red');
        return;
    }
    
    // Normalizar a string — dragdrop.js manda parseInt (número), el Map usa strings del dataset
    slotIndex = String(slotIndex);
    
    const slotCards = buildingCards.get(slotIndex);
    if (!slotCards) return;
    
    // Buscar la carta completa en el slot
    const cartaIndex = slotCards.findIndex(c => c.id === cartaId);
    if (cartaIndex === -1) return;
    
    // Quitar la carta completa del slot
    const [cartaDevuelta] = slotCards.splice(cartaIndex, 1);
    
    if (slotCards.length === 0) {
        buildingCards.delete(slotIndex);
    }
    
    // Devolver la carta completa a la mano
    me.mano.push(cartaDevuelta);
    
    updateSlotUI(slotIndex, slotCards);
    renderHand();
    
    toast(`Carta ${cartaDevuelta.valor}${cartaDevuelta.palo || ''} devuelta a sobrantes`, 'green');
}

function handleMoveBetweenSlots(cartaId, fromSlotIndex, toSlotIndex, toSlotType) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) {
        toast('Ya estás bajado, no puedes modificar jugadas');
        return;
    }
    
    // Normalizar a string — dragdrop.js manda parseInt (números), el Map usa strings del dataset
    fromSlotIndex = String(fromSlotIndex);
    toSlotIndex = String(toSlotIndex);
    
    const fromSlotCards = buildingCards.get(fromSlotIndex);
    if (!fromSlotCards) return;
    
    const cartaIndex = fromSlotCards.findIndex(c => c.id === cartaId);
    if (cartaIndex === -1) return;
    
    // Quitar la carta completa del slot origen
    const [cartaMovida] = fromSlotCards.splice(cartaIndex, 1);
    
    if (fromSlotCards.length === 0) {
        buildingCards.delete(fromSlotIndex);
    } else {
        updateSlotUI(fromSlotIndex, fromSlotCards);
    }
    
    // Añadir la carta completa al slot destino
    if (!buildingCards.has(toSlotIndex)) {
        buildingCards.set(toSlotIndex, []);
    }
    const toSlotCards = buildingCards.get(toSlotIndex);
    toSlotCards.push(cartaMovida);
    
    updateSlotUI(toSlotIndex, toSlotCards);
    
    toast(`Carta movida a ${toSlotType}`, 'green');
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
        if (!me?.bajado) return false;
        if (!selId) return false;
        
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
        if (me?.bajado) return false;
        
        const carta = me?.mano?.find(c => c.id === selId);
        if (!carta || carta.comodin) return false;
        
        return G.jugadores.some((j, ji) => {
            if (!j.bajado || ji === myIdx) return false;
            return j.jugadas?.some(jug => {
                return jug.cartas.some(c => c.comodin);
            });
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
        
        case 'esperando_accion':
            if (!me?.bajado) {
                if (instr) instr.textContent = selId ? 'Carta seleccionada — págala o intercambia por comodín' : 'Selecciona una carta para pagar o bájate.';
                add('🔥 Bajarme', 'abtn-gold', acBajar);
                add('💳 Pagar', selId ? 'abtn-outline' : 'abtn-outline', () => acPagar(selId), !selId);
                
                if (selId && hasComodinesIntercambiables()) {
                    add('🔄 Intercambiar por comodín', 'abtn-outline', () => {
                        toast('Haz clic en un comodín de las jugadas de otros jugadores', 'green');
                        intercambioMode = true;
                        render();
                    });
                }
            } else {
                if (instr) instr.textContent = selId ? 'Carta seleccionada — acomódala en jugadas de otros' : 'Selecciona una carta para acomodar.';
                add('💳 Pagar', 'abtn-outline', () => acPagar(selId), !selId);
                if (hasDestForAcomodar()) {
                    add('🃏 Acomodar → clic en jugada', 'abtn-green', () => {});
                }
            }
            break;
            
        case 'esperando_pago':
            if (!me?.bajado) {
                if (instr) instr.textContent = 'Selecciona una carta para pagar al fondo.';
                add('💳 Pagar', selId ? 'abtn-gold' : 'abtn-outline', () => acPagar(selId), !selId);
            } else {
                if (instr) instr.textContent = 'Selecciona una carta para acomodar o pagar.';
                add('💳 Pagar', selId ? 'abtn-gold' : 'abtn-outline', () => acPagar(selId), !selId);
                if (hasDestForAcomodar()) {
                    add('🃏 Acomodar → clic en jugada', 'abtn-green', () => {});
                }
            }
            break;
    }
    
    const logLine = document.getElementById('log-line');
    if (logLine) logLine.textContent = G.log?.[G.log.length - 1] || '';
}

// Helpers para renderizar cartas
function cFull(c, withId = true) {
    if (!c) return '';
    
    if (c.comodin) {
        return `<div class="card"${withId ? ` data-id="${c.id}"` : ''}>
            <div class="card-face joker-f">
                <span class="cv">🃏</span>
                <span class="cs" style="font-size:.55rem">JOKER</span>
            </div>
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
    
    if (c.comodin) {
        return `<div class="card-sm joker-sm">🃏</div>`;
    }
    
    const sc = SUIT_CLS[c.palo] || '';
    return `<div class="card-sm natural ${sc}">${c.valor}<br>${c.palo}</div>`;
}

// Modales
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

document.addEventListener('DOMContentLoaded', init);