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
let buildingCards = new Map(); // slotIndex -> array de cartas

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
    buildingCards.clear(); // Limpiar mapa de construcción
    
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

// MODIFICADO: Validación de TODAS las jugadas al bajar
function acBajar() {
    // Construir las jugadas desde los slots
    const slots = document.querySelectorAll('.building-slot');
    const jugadas = [];
    const cartasUsadas = new Set();
    const req = REQ[G.ronda];
    
    let terciasValidas = 0;
    let corridasValidas = 0;
    
    // Primero, validar cada slot individualmente
    for (const slot of slots) {
        const slotIndex = slot.dataset.slotIndex;
        const slotType = slot.dataset.slotType;
        const cards = buildingCards.get(slotIndex) || [];
        
        if (cards.length === 0) continue; // Slot vacío, no se usa
        
        // Obtener las cartas reales de la mano
        const cartasReales = cards.map(cardId => 
            G.jugadores[myIdx].mano.find(c => c.id === cardId)
        ).filter(Boolean);
        
        if (cartasReales.length === 0) continue;
        
        // VALIDACIÓN PARA TERCIAS
        if (slotType === 'tercia') {
            // Separar normales y comodines
            const normales = cartasReales.filter(c => !c.comodin);
            const comodines = cartasReales.filter(c => c.comodin);
            
            // Si no hay cartas normales, la tercia es solo de comodines (válido)
            if (normales.length === 0) {
                // Tercia de puros comodines es válida
                terciasValidas++;
                cartasReales.forEach(c => cartasUsadas.add(c.id));
                jugadas.push({
                    tipo: slotType,
                    cartasIds: cards,
                    cartas: cartasReales
                });
                continue;
            }
            
            // Verificar que todas las normales sean del mismo valor
            const primerValor = normales[0].valor;
            const todosIguales = normales.every(c => c.valor === primerValor);
            
            if (!todosIguales) {
                // Buscar el valor que más se repite para dar un mensaje más útil
                const conteo = {};
                normales.forEach(c => conteo[c.valor] = (conteo[c.valor] || 0) + 1);
                const valorMasComun = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0][0];
                
                toast(`❌ En ${slotType}: las cartas deben ser del mismo valor (ej: todas ${valorMasComun})`);
                return;
            }
            
            // Mínimo 3 cartas (contando comodines)
            if (cartasReales.length < 3) {
                toast(`❌ ${slotType} necesita al menos 3 cartas (tienes ${cartasReales.length})`);
                return;
            }
            
            terciasValidas++;
            cartasReales.forEach(c => cartasUsadas.add(c.id));
            jugadas.push({
                tipo: slotType,
                cartasIds: cards,
                cartas: cartasReales
            });
        }
        
        // VALIDACIÓN PARA CORRIDAS
        else if (slotType === 'corrida') {
            // Separar normales y comodines
            const normales = cartasReales.filter(c => !c.comodin);
            const comodines = cartasReales.filter(c => c.comodin);
            
            // Si no hay cartas normales, la corrida es solo de comodines (válida pero necesita al menos 4)
            if (normales.length === 0) {
                if (cartasReales.length < 4) {
                    toast(`❌ Corrida necesita al menos 4 cartas (tienes ${cartasReales.length})`);
                    return;
                }
                corridasValidas++;
                cartasReales.forEach(c => cartasUsadas.add(c.id));
                jugadas.push({
                    tipo: slotType,
                    cartasIds: cards,
                    cartas: cartasReales
                });
                continue;
            }
            
            // Verificar mismo palo
            const primerPalo = normales[0].palo;
            const mismoPalo = normales.every(c => c.palo === primerPalo);
            
            if (!mismoPalo) {
                toast(`❌ En corrida: todas las cartas deben ser del mismo palo (${primerPalo})`);
                return;
            }
            
            // Obtener valores numéricos de las normales
            const valores = normales.map(c => VN[c.valor] || parseInt(c.valor)).sort((a, b) => a - b);
            
            // Verificar que no haya valores repetidos
            const unicos = new Set(valores);
            if (unicos.size !== valores.length) {
                toast(`❌ En corrida: no puede haber valores repetidos`);
                return;
            }
            
            // Calcular cuántos huecos hay que llenar con comodines
            const valorMin = valores[0];
            const valorMax = valores[valores.length - 1];
            const totalPosiciones = valorMax - valorMin + 1;
            const huecosNecesarios = totalPosiciones - valores.length;
            
            if (huecosNecesarios > comodines.length) {
                toast(`❌ Corrida inválida: faltan ${huecosNecesarios} cartas y solo tienes ${comodines.length} comodines`);
                return;
            }
            
            // Mínimo 4 cartas en total
            if (cartasReales.length < 4) {
                toast(`❌ Corrida necesita al menos 4 cartas (tienes ${cartasReales.length})`);
                return;
            }
            
            corridasValidas++;
            cartasReales.forEach(c => cartasUsadas.add(c.id));
            jugadas.push({
                tipo: slotType,
                cartasIds: cards,
                cartas: cartasReales
            });
        }
    }
    
    // Validar cantidad de jugadas según la ronda
    if (terciasValidas < req.t) {
        toast(`❌ Necesitas ${req.t} tercias válidas (tienes ${terciasValidas})`);
        return;
    }
    
    if (corridasValidas < req.c) {
        toast(`❌ Necesitas ${req.c} corridas válidas (tienes ${corridasValidas})`);
        return;
    }
    
    // Verificar que no haya cartas repetidas entre slots
    const totalCartasUsadas = jugadas.reduce((acc, j) => acc + j.cartasIds.length, 0);
    if (cartasUsadas.size !== totalCartasUsadas) {
        toast('❌ Error: Cartas duplicadas en las jugadas');
        return;
    }
    
    // TODO: Enviar al servidor con las jugadas construidas
    toast(`✅ ${terciasValidas} tercias y ${corridasValidas} corridas válidas!`, 'green');
    console.log('Jugadas válidas:', jugadas);
    
    // Descomentar cuando el servidor esté listo:
    // WS.send({ type: 'bajar', jugadas: jugadas });
    
    cancelIntercambio();
}

function acPagar(cartaId) {
    const id = cartaId || selId;
    if (!id) {
        toast('Selecciona una carta para pagar.');
        return;
    }
    
    // Verificar si la carta está en un slot
    let slotOrigen = null;
    buildingCards.forEach((cards, slotIndex) => {
        if (cards.includes(id)) slotOrigen = slotIndex;
    });
    
    if (slotOrigen !== null) {
        // La carta está en un slot, quitarla de ahí
        const slotCards = buildingCards.get(slotOrigen);
        const index = slotCards.indexOf(id);
        if (index > -1) {
            slotCards.splice(index, 1);
            if (slotCards.length === 0) {
                buildingCards.delete(slotOrigen);
            }
            updateSlotUI(slotOrigen, slotCards);
        }
    }
    
    WS.send({ type: 'pagar', cartaId: id });
    selId = null;
    cancelIntercambio();
}

function acAcomodar(cartaId, destJugadorIdx, destJugadaIdx) {
    // Verificar si la carta está en un slot
    let slotOrigen = null;
    buildingCards.forEach((cards, slotIndex) => {
        if (cards.includes(cartaId)) slotOrigen = slotIndex;
    });
    
    if (slotOrigen !== null) {
        // La carta está en un slot, quitarla de ahí
        const slotCards = buildingCards.get(slotOrigen);
        const index = slotCards.indexOf(cartaId);
        if (index > -1) {
            slotCards.splice(index, 1);
            if (slotCards.length === 0) {
                buildingCards.delete(slotOrigen);
            }
            updateSlotUI(slotOrigen, slotCards);
        }
    }
    
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
    
    // Verificar si la carta está en un slot
    let slotOrigen = null;
    buildingCards.forEach((cards, slotIndex) => {
        if (cards.includes(cartaId)) slotOrigen = slotIndex;
    });
    
    if (slotOrigen !== null) {
        // La carta está en un slot, quitarla de ahí
        const slotCards = buildingCards.get(slotOrigen);
        const index = slotCards.indexOf(cartaId);
        if (index > -1) {
            slotCards.splice(index, 1);
            if (slotCards.length === 0) {
                buildingCards.delete(slotOrigen);
            }
            updateSlotUI(slotOrigen, slotCards);
        }
    }
    
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
    
    // Verificar si la carta está en un slot (no debería, pero por si acaso)
    let slotOrigen = null;
    buildingCards.forEach((cards, slotIndex) => {
        if (cards.includes(draggedId)) slotOrigen = slotIndex;
    });
    
    if (slotOrigen !== null) {
        toast('No puedes reordenar cartas que están en construcción');
        return;
    }
    
    // Reordenar en discard zone
    const fromIdx = me.mano.findIndex(c => c.id === draggedId);
    if (fromIdx < 0) return;
    
    // beforeId puede ser un índice o Infinity
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
    renderHand(); // Esto ahora renderiza ambas filas
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

// ═══════════════════════════════════════════════════
// RENDER TABLE BAJADAS
// ═══════════════════════════════════════════════════
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
            
            // Renderizar cartas de la jugada
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

// Renderizar la fila de construcción (slots según la ronda)
function renderBuildingRow() {
    if (!G || myIdx < 0) return;
    
    const buildingRow = document.getElementById('building-row');
    if (!buildingRow) return;
    
    const req = REQ_LABELS[G.ronda] || '';
    const reqEl = document.getElementById('building-requirement');
    if (reqEl) reqEl.textContent = req;
    
    let html = '';
    
    // Generar slots según la ronda
    if (G.ronda === 1) { // 2 tercias
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
    } else if (G.ronda === 2) { // 1 tercia + 1 corrida
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
    } else if (G.ronda === 3) { // 2 corridas
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
    } else if (G.ronda === 4) { // 3 tercias
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
    } else if (G.ronda === 5) { // 2 tercias + 1 corrida
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
    } else if (G.ronda === 6) { // 2 corridas + 1 tercia
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
    } else if (G.ronda === 7) { // 3 corridas
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
    
    // Actualizar contadores si hay cartas guardadas
    updateSlotCounters();
}

// Actualizar los contadores de los slots
function updateSlotCounters() {
    buildingCards.forEach((cards, slotIndex) => {
        const slot = document.querySelector(`.building-slot[data-slot-index="${slotIndex}"]`);
        if (!slot) return;
        
        const cardsContainer = document.getElementById(`slot-${slotIndex}-cards`);
        if (cardsContainer) {
            cardsContainer.innerHTML = cards.map(cardId => {
                const carta = G.jugadores[myIdx].mano.find(c => c.id === cardId);
                return carta ? cSm(carta) : '';
            }).join('');
        }
        
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
    });
}

// Renderizar la mano completa (sobrantes + slots)
function renderHand() {
    if (!G || myIdx < 0) return;
    
    const me = G.jugadores[myIdx];
    const discardZone = document.getElementById('discard-zone');
    
    if (!discardZone) return;
    
    // Guardar referencia a la carta que se está arrastrando (si existe)
    const draggingCard = document.querySelector('.card.dragging');
    const draggingId = draggingCard?.dataset.id;
    
    // Renderizar la fila de construcción
    renderBuildingRow();
    
    // Limpiar zona de sobrantes (pero mantener la carta arrastrada si existe)
    const cardsToKeep = draggingCard ? [draggingCard] : [];
    discardZone.innerHTML = '';
    
    // Si el jugador ya se bajó, mostrar solo sobrantes
    if (me.bajado) {
        (me.mano || []).forEach(c => {
            // No recrear la carta que se está arrastrando
            if (c.id !== draggingId) {
                const el = createCardElement(c);
                discardZone.appendChild(el);
            }
        });
    } else {
        // Aún no se ha bajado - mostrar todas las cartas en sobrantes
        // pero marcar las que ya están en slots
        (me.mano || []).forEach(c => {
            // Verificar si la carta ya está en algún slot
            let enSlot = false;
            buildingCards.forEach((cards) => {
                if (cards.includes(c.id)) enSlot = true;
            });
            
            if (!enSlot && c.id !== draggingId) {
                const el = createCardElement(c);
                discardZone.appendChild(el);
            }
        });
    }
    
    // Si había una carta arrastrada, mantenerla
    if (draggingCard) {
        discardZone.appendChild(draggingCard);
    }
    
    document.getElementById('hand-count').textContent = `${me?.mano?.length || 0} cartas`;
    
    // Configurar event listeners para los slots
    setupSlotDropListeners();
}

// Configurar listeners para drag & drop en slots
function setupSlotDropListeners() {
    if (!G || myIdx < 0) return;
    
    const me = G.jugadores[myIdx];
    if (me.bajado) return; // Si ya está bajado, no permitir más cambios
    
    document.querySelectorAll('.building-slot').forEach(slot => {
        // Eliminar listeners anteriores para evitar duplicados
        slot.removeEventListener('dragover', handleSlotDragOver);
        slot.removeEventListener('dragleave', handleSlotDragLeave);
        slot.removeEventListener('drop', handleSlotDrop);
        
        // Agregar nuevos listeners
        slot.addEventListener('dragover', handleSlotDragOver);
        slot.addEventListener('dragleave', handleSlotDragLeave);
        slot.addEventListener('drop', handleSlotDrop);
    });
}

function handleSlotDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drop-target');
}

function handleSlotDragLeave(e) {
    e.currentTarget.classList.remove('drop-target');
}

function handleSlotDrop(e) {
    e.preventDefault();
    const slot = e.currentTarget;
    slot.classList.remove('drop-target');
    
    if (!selId) {
        toast('Primero selecciona una carta');
        return;
    }
    
    const me = G.jugadores[myIdx];
    const carta = me.mano.find(c => c.id === selId);
    if (!carta) {
        toast('Carta no encontrada');
        return;
    }
    
    const slotIndex = slot.dataset.slotIndex;
    const slotType = slot.dataset.slotType;
    
    // Verificar que la carta no esté ya en otro slot
    let cartaEnOtroSlot = false;
    buildingCards.forEach((cards, idx) => {
        if (cards.includes(selId)) cartaEnOtroSlot = true;
    });
    
    if (cartaEnOtroSlot) {
        toast('Esta carta ya está en otra jugada');
        return;
    }
    
    // Obtener o crear el array para este slot
    if (!buildingCards.has(slotIndex)) {
        buildingCards.set(slotIndex, []);
    }
    
    const slotCards = buildingCards.get(slotIndex);
    slotCards.push(selId);
    
    // Actualizar UI
    updateSlotUI(slotIndex, slotCards);
    
    // Remover la carta de discard zone
    const cartaEl = document.querySelector(`.card[data-id="${selId}"]`);
    if (cartaEl) cartaEl.remove();
    
    selId = null;
    toast(`Carta agregada a ${slotType}`, 'green');
}

function createCardElement(c, fromSlot = null) {
    const el = document.createElement('div');
    el.className = 'card' + (c.id === selId ? ' selected' : '');
    if (intercambioMode && selId && c.id === selId) {
        el.classList.add('pending-intercambio');
    }
    el.dataset.id = c.id;
    if (fromSlot !== null) {
        el.dataset.slot = fromSlot; // Guardar de qué slot viene
    }
    el.draggable = false; // Nosotros manejamos el drag con DragDrop
    
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

// MODIFICADO: Permitir cualquier combinación durante la construcción
function handleBuildingDrop(cartaId, slotIndex, slotType) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) {
        toast('Ya estás bajado, no puedes construir más jugadas');
        return;
    }
    
    const carta = me.mano.find(c => c.id === cartaId);
    if (!carta) return;
    
    // Verificar que la carta no esté ya en otro slot
    let cartaEnOtroSlot = false;
    buildingCards.forEach((cards, idx) => {
        if (cards.includes(cartaId)) cartaEnOtroSlot = true;
    });
    
    if (cartaEnOtroSlot) {
        toast('Esta carta ya está en otra jugada');
        return;
    }
    
    // Obtener el slot
    const slot = document.querySelector(`.building-slot[data-slot-index="${slotIndex}"]`);
    if (!slot) return;
    
    // NO validamos aquí - permitimos cualquier combinación durante la construcción
    // Las validaciones se harán solo al hacer clic en "Bajarme"
    
    // Obtener o crear el array para este slot
    if (!buildingCards.has(slotIndex)) {
        buildingCards.set(slotIndex, []);
    }
    
    const slotCards = buildingCards.get(slotIndex);
    slotCards.push(cartaId);
    
    // Actualizar UI del slot
    updateSlotUI(slotIndex, slotCards);
    
    // Remover la carta de discard zone
    const cartaEl = document.querySelector(`.card[data-id="${cartaId}"]`);
    if (cartaEl) cartaEl.remove();
    
    selId = null;
    toast(`Carta agregada a ${slotType}`, 'green');
}

// MODIFICAR: Actualizar UI del slot (usar createCardElement con fromSlot)
function updateSlotUI(slotIndex, cards) {
    const slot = document.querySelector(`.building-slot[data-slot-index="${slotIndex}"]`);
    if (!slot) return;
    
    const cardsContainer = document.getElementById(`slot-${slotIndex}-cards`);
    if (!cardsContainer) return;
    
    const me = G.jugadores[myIdx];
    
    cardsContainer.innerHTML = ''; // Limpiar
    
    // Crear elementos para cada carta en el slot
    cards.forEach(cardId => {
        const carta = me.mano.find(c => c.id === cardId);
        if (carta) {
            const cardEl = createCardElement(carta, slotIndex);
            cardsContainer.appendChild(cardEl);
        }
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

// MODIFICADO: Manejar cuando se arrastra una carta desde un slot
function handleRemoveFromSlot(cartaId, slotIndex) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) {
        toast('Ya estás bajado, no puedes modificar jugadas');
        return;
    }
    
    // Verificar que la carta existe en el slot
    const slotCards = buildingCards.get(slotIndex);
    if (!slotCards || !slotCards.includes(cartaId)) return;
    
    // Remover la carta del slot
    const index = slotCards.indexOf(cartaId);
    if (index > -1) {
        slotCards.splice(index, 1);
        
        // Si el slot queda vacío, eliminarlo del mapa
        if (slotCards.length === 0) {
            buildingCards.delete(slotIndex);
        }
        
        // Actualizar UI del slot (esto elimina la carta visualmente del slot)
        updateSlotUI(slotIndex, slotCards);
        
        // IMPORTANTE: Renderizar la mano completa para que la carta
        // reaparezca en discard-zone
        renderHand();
        
        toast('Carta removida de la jugada', 'green');
    }
}

// NUEVA FUNCIÓN: Mover carta entre slots
function handleMoveBetweenSlots(cartaId, fromSlotIndex, toSlotIndex, toSlotType) {
    const me = G.jugadores[myIdx];
    if (!me || me.bajado) {
        toast('Ya estás bajado, no puedes modificar jugadas');
        return;
    }
    
    // Verificar que la carta existe en el slot de origen
    const fromSlotCards = buildingCards.get(fromSlotIndex);
    if (!fromSlotCards || !fromSlotCards.includes(cartaId)) return;
    
    // Remover del slot origen
    const index = fromSlotCards.indexOf(cartaId);
    if (index > -1) {
        fromSlotCards.splice(index, 1);
        
        // Si el slot origen queda vacío, eliminarlo
        if (fromSlotCards.length === 0) {
            buildingCards.delete(fromSlotIndex);
        }
        
        // Actualizar UI del slot origen
        updateSlotUI(fromSlotIndex, fromSlotCards);
    }
    
    // Agregar al slot destino
    if (!buildingCards.has(toSlotIndex)) {
        buildingCards.set(toSlotIndex, []);
    }
    
    const toSlotCards = buildingCards.get(toSlotIndex);
    toSlotCards.push(cartaId);
    
    // Actualizar UI del slot destino
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
    
    // Botón para cancelar modo intercambio si está activo
    if (intercambioMode) {
        if (instr) instr.textContent = '🔄 Selecciona una carta de tu mano para intercambiar por el comodín';
        add('❌ Cancelar Intercambio', 'abtn-red', cancelIntercambio);
        return;
    }
    
    // Función para verificar si hay destinos para acomodar
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
    
    // Función para verificar si hay comodines intercambiables
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
                if (!me?.bajado) add('🔥 Bajarme', 'abtn-gold', acBajar);
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