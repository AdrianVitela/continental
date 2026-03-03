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

let G = null;
let myIdx = -1;
let selId = null;
let ackSent = false;
let pendingReorderIdx = -1;
let intercambioMode = false;
let selectedComodinInfo = null; // { jugadorIdx, jugadaIdx, cartaId }

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
    
    const mazoEl = document.getElementById('mazo-wrap');
    await Anim.shuffleAnim(mazoEl);
    
    const hz = document.getElementById('hand-zone');
    if (hz && G.jugadores[myIdx]) {
        await Anim.dealAnim(mazoEl, hz, G.jugadores[myIdx].mano || [], 0);
    }
}

async function handleTomarMazo(data) {
    if (data.jugadorIdx === myIdx) {
        const mazoEl = document.getElementById('mazo-wrap');
        const hz = document.getElementById('hand-zone');
        await new Promise(r => setTimeout(r, 20));
        const newCardEl = hz?.querySelector(`.card[data-id="${data.carta?.id}"]`);
        if (mazoEl && hz && newCardEl) {
            await Anim.flyToHand(mazoEl, hz, hz.querySelectorAll('.card').length - 1, newCardEl);
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
        const hz = document.getElementById('hand-zone');
        const bajadas = document.getElementById('table-bajadas');
        const cardEls = [...(hz?.querySelectorAll('.card') || [])];
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
    WS.send({ type: 'bajar' });
    cancelIntercambio();
}

function acPagar(cartaId) {
    const id = cartaId || selId;
    if (!id) {
        toast('Selecciona una carta para pagar.');
        return;
    }
    WS.send({ type: 'pagar', cartaId: id });
    selId = null;
    cancelIntercambio();
}

function acAcomodar(cartaId, destJugadorIdx, destJugadaIdx) {
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
    
    if (G.estado !== 'esperando_accion' && G.estado !== 'esperando_pago') {
        toast('No puedes intercambiar comodines ahora.');
        return;
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
    
    if (!selId) {
        toast('Primero selecciona una carta de tu mano para intercambiar.');
        return;
    }
    
    intercambioMode = true;
    selectedComodinInfo = { jugadorIdx, jugadaIdx, comodinId };
    
    toast('Selecciona una carta de tu mano para intercambiar por el comodín', 'green');
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
    
    const fromIdx = me.mano.findIndex(c => c.id === draggedId);
    if (fromIdx < 0) return;
    
    let toIdx = beforeId === Infinity
        ? me.mano.length - 1
        : me.mano.findIndex(c => c.id === beforeId);
    if (toIdx < 0) toIdx = me.mano.length - 1;
    
    const newOrder = [...me.mano];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx < fromIdx ? toIdx : toIdx - 1, 0, moved);
    
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
                    if (intercambioMode && isMyTurn() && ji !== myIdx) {
                        return `<div class="card-sm joker-sm comodin-intercambiable" 
                                     data-comodin-id="${c.id}"
                                     data-jugador="${ji}"
                                     data-jugada="${jugi}"
                                     onclick="event.stopPropagation(); window.activarModoIntercambio(${ji}, ${jugi}, '${c.id}')">
                                     🃏
                                </div>`;
                    } else {
                        return `<div class="card-sm joker-sm">🃏</div>`;
                    }
                } else {
                    return cSm(c);
                }
            }).join('');
            
            pile.innerHTML = `
                <div class="bajada-pile-label">${jug.tipo}</div>
                <div class="bajada-pile-cards">${cardsHtml}</div>
            `;
            
            if (!intercambioMode) {
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
    dot.style.display = isMyTurn() ? 'inline-block' : 'none';
    
    document.getElementById('turn-tag').textContent = isMyTurn() ? '' :
        `Turno de ${G.jugadores[G.turno]?.nombre || '…'}`;
}

function renderHand() {
    if (!G || myIdx < 0) return;
    
    const me = G.jugadores[myIdx];
    const hz = document.getElementById('hand-zone');
    
    if (!hz || !me?.mano) return;
    
    hz.innerHTML = '';
    
    me.mano.forEach((c, i) => {
        const el = document.createElement('div');
        el.className = 'card' + (c.id === selId ? ' selected' : '');
        if (intercambioMode && selId && c.id === selId) {
            el.classList.add('pending-intercambio');
        }
        el.dataset.id = c.id;
        el.dataset.idx = i;
        
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
        
        el.addEventListener('click', () => selCard(c.id));
        
        const dragCallbacks = {
            isPayable,
            onPagar: id => acPagar(id),
            onAcomodar: (id, pi, ji) => acAcomodar(id, pi, ji),
            onReorder: (id, beforeId) => acReorder(id, beforeId),
        };
        
        el.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            DragDrop.startHandDrag(e, el, c.id, dragCallbacks);
        });
        
        el.addEventListener('touchstart', e => {
            DragDrop.startHandDrag(e, el, c.id, dragCallbacks);
        }, { passive: false });
        
        hz.appendChild(el);
    });
    
    if (intercambioMode) {
        const instr = document.createElement('div');
        instr.className = 'intercambio-instr';
        instr.innerHTML = '🔄 Modo intercambio: Selecciona una carta de tu mano para intercambiar';
        hz.appendChild(instr);
    }
}

function renderActions() {
    if (!G || myIdx < 0) return;
    
    const me = G.jugadores[myIdx];
    const myTurn = isMyTurn();
    const btns = document.getElementById('action-btns');
    const instr = document.getElementById('instr');
    const cb = document.getElementById('castigo-banner');
    
    cb.style.display = 'none';
    btns.innerHTML = '';
    
    const add = (txt, cls, fn, dis = false) => {
        const b = document.createElement('button');
        b.className = `abtn ${cls}`;
        b.textContent = txt;
        b.disabled = dis;
        b.onclick = fn;
        btns.appendChild(b);
    };
    
    if (intercambioMode) {
        instr.textContent = '🔄 Selecciona una carta de tu mano para intercambiar por el comodín';
        add('❌ Cancelar Intercambio', 'abtn-red', cancelIntercambio);
        return;
    }
    
    const hasDest = () => {
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
    
    if (!myTurn) {
        instr.textContent = `Turno de ${G.jugadores[G.turno]?.nombre || '…'}`;
        
        if (G.estado === 'fase_castigo' && G.castigo_idx === myIdx) {
            const top = G.fondo_top;
            cb.style.display = 'block';
            cb.textContent = `⚡ ¿Te castigas el ${top?.valor}${top?.palo || ''}?`;
            instr.textContent = 'Tienes prioridad de castigo.';
            add('✅ Sí, castigarme', 'abtn-green', () => acCastigo(true));
            add('❌ No', 'abtn-red', () => acCastigo(false));
        }
        return;
    }
    
    switch (G.estado) {
        case 'esperando_robo':
            instr.textContent = me?.bajado
                ? `${me.nombre} (bajado) — roba del mazo.`
                : `Tu turno — toma del fondo o roba del mazo.`;
            if (!me?.bajado) add('📥 Tomar Fondo', 'abtn-gold', acFondo, !G.fondo_top);
            add('🎴 Robar Mazo', me?.bajado ? 'abtn-gold' : 'abtn-outline', acMazo);
            break;
            
        case 'fase_castigo': {
            const jc = G.jugadores[G.castigo_idx];
            const top = G.fondo_top;
            
            if (G.castigo_idx === myIdx) {
                cb.style.display = 'block';
                cb.textContent = `⚡ ¿Te castigas el ${top?.valor}${top?.palo || ''}? (carta extra del mazo)`;
                instr.textContent = 'Tienes prioridad de castigo.';
                add('✅ Sí', 'abtn-green', () => acCastigo(true));
                add('❌ No', 'abtn-red', () => acCastigo(false));
            } else {
                instr.textContent = `Esperando que ${jc?.nombre} decida el castigo…`;
            }
            break;
        }
        
        case 'esperando_accion':
            instr.textContent = selId ? 'Carta seleccionada — págala, acomódala o intercambia por comodín' : 'Selecciona una carta para pagar o bájate.';
            if (!me?.bajado) add('🔥 Bajarme', 'abtn-gold', acBajar);
            add('💳 Pagar', selId ? 'abtn-outline' : 'abtn-outline', () => acPagar(selId), !selId);
            if (hasDest()) add('🃏 Acomodar → clic en jugada', 'abtn-green', () => { });
            if (selId) {
                add('🔄 Intercambiar por comodín', 'abtn-outline', () => {
                    toast('Haz clic en un comodín de las jugadas de otros jugadores', 'green');
                    intercambioMode = true;
                    render();
                });
            }
            break;
            
        case 'esperando_pago':
            instr.textContent = G.ronda === 7 && me?.bajado
                ? 'Ronda 7 — acomoda todas tus cartas.'
                : 'Selecciona una carta para pagar al fondo.';
            add('💳 Pagar', selId ? 'abtn-gold' : 'abtn-outline', () => acPagar(selId), !selId);
            if (hasDest()) add('🃏 Acomodar → clic en jugada', 'abtn-green', () => { });
            if (selId && me?.bajado) {
                add('🔄 Intercambiar por comodín', 'abtn-outline', () => {
                    toast('Haz clic en un comodín de las jugadas de otros jugadores', 'green');
                    intercambioMode = true;
                    render();
                });
            }
            break;
    }
    
    document.getElementById('log-line').textContent = G.log?.[G.log.length - 1] || '';
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
    document.getElementById('mr-title').textContent = `🏆 Ronda ${G.ronda} — ${G.jugadores[ganadorIdx]?.nombre} gana!`;
    document.getElementById('mr-msg').textContent = G.ronda < 7 ? `Siguiente: ronda ${G.ronda + 1}.` : '¡Última ronda!';
    document.getElementById('mr-scores').innerHTML = G.jugadores.map((j, i) => `
        <div class="srow ${i === ganadorIdx ? 'winner' : ''}">
            <span>${j.nombre}${i === ganadorIdx ? ' 🏆' : ''}</span>
            <span class="srow-pts">+${puntos?.[i]?.pts_r ?? 0} · Total: ${j.pts_t}</span>
        </div>
    `).join('');
    
    ackSent = false;
    document.getElementById('modal-ronda').classList.add('show');
}

function showModalJuego(jugadores) {
    const sorted = [...jugadores].sort((a, b) => a.pts_t - b.pts_t);
    
    document.getElementById('mj-scores').innerHTML = sorted.map((j, i) => `
        <div class="srow ${i === 0 ? 'winner' : ''}">
            <span>${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]} ${j.nombre}</span>
            <span class="srow-pts">${j.pts_t} pts</span>
        </div>
    `).join('');
    
    document.getElementById('modal-juego').classList.add('show');
}

function toast(msg, type = 'red') {
    const t = document.getElementById('toast');
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