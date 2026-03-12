// ═══════════════════════════════════════════════════════════════
// pesca.js — Cliente del juego Pesca
// ═══════════════════════════════════════════════════════════════

'use strict';

/* ─── Estado ────────────────────────────────── */
let G        = null;
let myIdx    = -1;
let myId     = null;

let selId    = null;
let selValor = null;
let selFrom  = null;
let selSlot  = null;
let selTarget= null;

let slotCards = [[], [], []];

let _timerInterval = null;
let _timerEnd      = 0;
let _timerFor      = null;
let _othersTimeout = null;

let _dameHintValor = null;

/* ─── Init ──────────────────────────────────── */
const params = new URLSearchParams(location.search);
myId = params.get('pid');
const roomCode = params.get('room');

function _getSavedName() {
    const m = document.cookie.match(/(?:^|; )continental_nombre=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : 'Jugador';
}

WS.on('_connected', () => {
    if (myId && roomCode) {
        const nombre = _getSavedName();
        WS.send({ type: 'join_pesca', nombre, code: roomCode, playerId: myId });
    }
});

WS.on('state_update', ({ event, data, state }) => {
    if (!state) return;
    G = state;
    if (myIdx === -1) myIdx = G.jugadores.findIndex(j => j.id === myId);

    if (event === 'respuesta_no' && data?.cartaRobada === null && data?.valor) {
        const nuevoTurno = G.jugadores[G.turno];
        if (nuevoTurno && nuevoTurno.mano.some(c => c.valor === data.valor)) {
            _dameHintValor = data.valor;
        } else {
            _dameHintValor = null;
        }
    } else if (event === 'respuesta_si' || event === 'game_started' || event === 'peticion') {
        _dameHintValor = null;
    }

    handlePeticionUI(event, data);
    render();
    if (G.estado === 'fin_juego') renderFinModal();
});

WS.on('error', (data) => showToast(data.msg || 'Error', 'red'));

/* ─── Render principal ──────────────────────── */
function render() {
    if (!G) return;
    renderHeader();
    renderRivals();
    renderSlots();
    renderLog();
    renderMyArea();
    renderDameHint();
    renderActions();
}

function renderHeader() {
    const mc = document.getElementById('mazo-count');
    if (mc) mc.textContent = G.mazo_count;

    const tp = document.getElementById('turn-pill');
    if (!tp) return;
    const myTurn = G.turno === myIdx && G.estado === 'esperando_peticion';
    const jt = G.jugadores[G.turno];
    tp.textContent = myTurn
        ? '✨ Tu turno — pide una carta'
        : `Turno: ${jt?.nombre || '—'}`;
    tp.className = 'turn-pill' + (myTurn ? ' my-turn' : '');
    tp.id = 'turn-pill';
}

/* ─── Rivales ───────────────────────────────── */
function renderRivals() {
    const area = document.getElementById('rivals-area');
    if (!area) return;

    const myTurn = G.turno === myIdx && G.estado === 'esperando_peticion';
    const pet    = G.peticionActiva;

    area.innerHTML = G.jugadores.map((j, ji) => {
        if (ji === myIdx) return '';

        const isSelectable  = myTurn && selValor !== null && j.activo;
        const isSelected    = selTarget === ji;
        const isBeingAsked  = pet && pet.aIdx === ji && G.estado === 'esperando_respuesta';
        const isTurno       = ji === G.turno && G.estado !== 'fin_juego';

        const cls = [
            'rival-card',
            !j.activo    ? 'inactive'    : '',
            isSelectable ? 'selectable'  : '',
            isSelected   ? 'selected'    : '',
            isBeingAsked ? 'being-asked' : '',
        ].filter(Boolean).join(' ');

        const jugadasHtml = j.jugadas.map(jg =>
            `<span class="r-jugada-badge">${jg.valor}×4</span>`
        ).join('');

        return `
        <div class="${cls}" onclick="clickRival(${ji})">
            ${isTurno ? '<div class="rival-turno-dot"></div>' : ''}
            <div class="r-name">
                <span class="r-dot${j.conectado ? '' : ' away'}"></span>
                ${j.nombre}
            </div>
            <div class="r-stats">
                <span>🃏 ${j.num_cartas}</span>
                <span>🏆 ${j.jugadas.length}</span>
                ${!j.activo ? '<span style="color:#666">sin cartas</span>' : ''}
            </div>
            ${jugadasHtml ? `<div class="r-jugadas">${jugadasHtml}</div>` : ''}
        </div>`;
    }).join('');
}

/* ─── Petición box + timers ─────────────────── */
function handlePeticionUI(event, data) {
    const box     = document.getElementById('peticion-box');
    const txt     = document.getElementById('pet-texto');
    const btnConf = document.getElementById('btn-confirmar');
    if (!box || !txt || !btnConf) return;

    stopTimer();
    clearTimeout(_othersTimeout);

    if (G.estado === 'esperando_respuesta' && G.peticionActiva) {
        const p    = G.peticionActiva;
        const quien = G.jugadores[p.pidx]?.nombre || '?';
        const aQuien= G.jugadores[p.aIdx]?.nombre || '?';
        const soyElPreguntado = p.aIdx === myIdx;

        txt.innerHTML = `<strong>${quien}</strong> le pregunta a <strong>${aQuien}</strong>:<br>
            "¿Tienes ${p.valor === 'JOKER' ? 'un <span class="v-hi">🃏 Comodín</span>' : `un <span class="v-hi">${p.valor}</span>`}?"`;

        box.classList.add('show');
        btnConf.style.display = soyElPreguntado ? 'inline-block' : 'none';

        if (soyElPreguntado) {
            startTimer(5, 'me');
        } else {
            startTimer(3, 'others');
            _othersTimeout = setTimeout(() => {
                box.classList.remove('show');
                stopTimer();
            }, 3100);
        }
    } else {
        box.classList.remove('show');
        stopTimer();
    }
}

/* ─── Log (oculto visualmente, mantenido en memoria) ── */
function renderLog() {
    // El #log-area está con display:none en el HTML
    // Se mantiene la función para no romper nada
    const area = document.getElementById('log-area');
    if (!area) return;
    const msgs = G.log || [];
    area.innerHTML = [...msgs].reverse().slice(0, 4).map((m, i) =>
        `<div class="log-item${i === 0 ? ' fresh' : ''}">${m}</div>`
    ).join('');
}

/* ─── Slots (3 fijos, cliente) ──────────────── */
function renderSlots() {
    for (let i = 0; i < 3; i++) {
        const cards = slotCards[i];
        const container = document.getElementById(`slot-cards-${i}`);
        const countEl   = document.getElementById(`slot-count-${i}`);
        const slotEl    = document.querySelector(`.building-slot[data-slot="${i}"]`);
        if (!container) continue;

        container.innerHTML = '';
        cards.forEach(c => {
            const el = mkCardEl(c, { fromSlot: i });
            container.appendChild(el);
        });

        const isComplete = cards.length >= 4 && cards.every(c => c.valor === cards[0].valor);
        if (countEl) {
            countEl.textContent = `${cards.length}/4`;
            countEl.className   = 'slot-count' + (isComplete ? ' valid' : '');
        }
        if (slotEl) {
            slotEl.classList.toggle('complete', isComplete);
            slotEl.classList.toggle('sel-slot', selFrom === 'slot' && selSlot === i);
        }
    }
}

/* ─── Mi área ───────────────────────────────── */
function renderMyArea() {
    const me = G.jugadores[myIdx];
    if (!me) return;

    const nameEl = document.getElementById('my-name-lbl');
    if (nameEl) nameEl.textContent = `${me.nombre} · ${me.mano.length} carta(s)`;
    const jugEl  = document.getElementById('my-jugadas-lbl');
    if (jugEl)  jugEl.textContent  = `🏆 ${me.jugadas.length} jugada(s)`;

    const jugadasEl = document.getElementById('my-jugadas');
    if (jugadasEl) {
        jugadasEl.innerHTML = me.jugadas.map(j => `
            <div class="my-jugada-pill">
                ${j.valor}×4 <span class="pill-sub">${j.cartas.map(c => c.palo).join('')}</span>
            </div>`
        ).join('');
    }

    const cardsEnSlot = new Set();
    slotCards.forEach(arr => arr.forEach(c => cardsEnSlot.add(c.id)));

    const handEl = document.getElementById('my-hand');
    if (!handEl) return;
    const myTurn = G.turno === myIdx && G.estado === 'esperando_peticion';

    handEl.innerHTML = '';
    me.mano.forEach(c => {
        if (cardsEnSlot.has(c.id)) return;
        const el = mkCardEl(c, { fromHand: true, selectable: myTurn });
        handEl.appendChild(el);
    });
}

/* ─── Dame-hint ─────────────────────────────── */
function renderDameHint() {
    const el = document.getElementById('dame-hint');
    if (!el) return;
    const myTurn = G.turno === myIdx && G.estado === 'esperando_peticion';
    if (myTurn && _dameHintValor) {
        el.textContent = `💬 El jugador anterior tiene ${_dameHintValor === 'JOKER' ? 'Comodines' : `"${_dameHintValor}"`} — ¡pídelos si quieres!`;
        el.classList.add('show');
    } else {
        el.classList.remove('show');
    }
}

/* ─── Acciones ──────────────────────────────── */
function renderActions() {
    const hintEl   = document.getElementById('hint-line');
    const btnsEl   = document.getElementById('action-btns');
    if (!hintEl || !btnsEl) return;

    btnsEl.innerHTML = '';
    hintEl.textContent = '';

    const me     = G.jugadores[myIdx];
    const myTurn = G.turno === myIdx && G.estado === 'esperando_peticion';

    if (!myTurn) return;

    if (selId === null) {
        hintEl.textContent = 'Elige una carta de tu mano o de tus jugadas para pedir';
        return;
    }

    if (selTarget === null) {
        hintEl.textContent = `Vas a pedir "${selValor}" — elige a quién preguntarle`;
        const btn = mkBtn('✕ Cancelar', 'abtn-cancel', deselect);
        btnsEl.appendChild(btn);
        return;
    }

    const rival = G.jugadores[selTarget];
    const btnPedir = mkBtn(
        `🙋 Preguntar a ${rival.nombre}: ¿tienes un ${selValor}?`,
        'abtn-primary',
        enviarPeticion
    );
    btnsEl.appendChild(btnPedir);
    const btnCancelar = mkBtn('✕ Cancelar', 'abtn-cancel', deselect);
    btnsEl.appendChild(btnCancelar);
}

/* ─── Crear elemento carta ──────────────────── */
function mkCardEl(c, opts = {}) {
    const { fromHand = false, fromSlot = null, selectable = true } = opts;
    const isJoker = c.valor === 'JOKER';
    const isRed   = ['♥','♦'].includes(c.palo);
    const isSel   = selId === c.id;
    const myTurn  = G.turno === myIdx && G.estado === 'esperando_peticion';

    const el = document.createElement('div');
    const cls = ['p-card'];
    if (isJoker)                   cls.push('joker');
    else if (isRed)                cls.push('red');
    if (myTurn && selectable)      cls.push('selectable');
    if (isSel)                     cls.push('selected');
    el.className = cls.join(' ');

    if (isJoker) {
        el.innerHTML = `<span class="cv">🃏</span><span class="cp" style="font-size:.6rem">COMODÍN</span>`;
    } else {
        el.innerHTML = `<span class="cv">${c.valor}</span><span class="cp">${c.palo || ''}</span>`;
    }

    // Click + Drag — mouse
    // El drag solo se activa si el usuario mueve el mouse más de 6px
    // Si no hay movimiento, se trata como click normal
    el.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const startX = e.clientX;
        const startY = e.clientY;
        let dragStarted = false;

        const onMove = (moveE) => {
            const dx = moveE.clientX - startX;
            const dy = moveE.clientY - startY;
            if (!dragStarted && Math.sqrt(dx*dx + dy*dy) > 6) {
                dragStarted = true;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (typeof window._pescaDragStart === 'function') {
                    window._pescaDragStart(e, c.id, fromSlot, el);
                }
            }
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!dragStarted) {
                // Fue un click simple
                if (!myTurn) return;
                if (fromSlot !== null) clickCardFromSlot(c, fromSlot);
                else clickCardFromHand(c);
            }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // Drag — touch (touch naturalmente distingue tap de swipe)
    let touchMoved = false;
    el.addEventListener('touchstart', e => {
        touchMoved = false;
        const startX = e.touches[0].clientX;
        const startY = e.touches[0].clientY;

        const onTouchMove = (moveE) => {
            const dx = moveE.touches[0].clientX - startX;
            const dy = moveE.touches[0].clientY - startY;
            if (Math.sqrt(dx*dx + dy*dy) > 8) {
                touchMoved = true;
                el.removeEventListener('touchmove', onTouchMove);
                if (typeof window._pescaDragStart === 'function') {
                    window._pescaDragStart(e, c.id, fromSlot, el);
                }
            }
        };

        const onTouchEnd = () => {
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            if (!touchMoved) {
                // Fue un tap simple
                if (!myTurn) return;
                if (fromSlot !== null) clickCardFromSlot(c, fromSlot);
                else clickCardFromHand(c);
            }
        };

        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd);
    }, { passive: true });

    return el;
}

/* ─── Click en carta de mano ────────────────── */
function clickCardFromHand(c) {
    if (selId === c.id) { deselect(); return; }
    selId    = c.id;
    selValor = c.valor;
    selFrom  = 'hand';
    selSlot  = null;
    selTarget = null;
    renderSlots(); renderMyArea(); renderActions();
}

/* ─── Click en carta de slot ────────────────── */
function clickCardFromSlot(c, slotIdx) {
    if (selId === c.id) { devolverAMano(c, slotIdx); return; }
    const myTurn = G.turno === myIdx && G.estado === 'esperando_peticion';
    if (myTurn) {
        selId    = c.id;
        selValor = c.valor;
        selFrom  = 'slot';
        selSlot  = slotIdx;
        selTarget = null;
        renderSlots(); renderMyArea(); renderActions();
    }
}

/* ─── Click en slot (área vacía) ───────────── */
function clickSlot(slotIdx) {
    const me = G.jugadores[myIdx];
    if (!me) return;

    if (selFrom === 'hand' && selId !== null) {
        _pescaMoveToSlot(selId, slotIdx);
        return;
    }

    if (selFrom === 'slot' && selSlot !== null && selSlot !== slotIdx) {
        _pescaMoveSlotToSlot(selId, selSlot, slotIdx);
        return;
    }
}

/* ─── Devolver carta de slot a mano ────────── */
function devolverAMano(c, slotIdx) {
    const me = G.jugadores[myIdx];
    if (!me) return;
    const idx = slotCards[slotIdx].findIndex(sc => sc.id === c.id);
    if (idx === -1) return;
    slotCards[slotIdx].splice(idx, 1);
    selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    renderSlots(); renderMyArea(); renderActions();
    showToast('Carta devuelta a la mano', 'green');
}

/* ─── Mover mano → slot (también usada por drag) ── */
window._pescaMoveToSlot = function(cardId, toSlot) {
    const me = G?.jugadores?.[myIdx];
    if (!me) return;

    const yaEnSlot = slotCards.some(arr => arr.some(c => c.id === cardId));
    if (yaEnSlot) { showToast('La carta ya está en un slot', 'red'); return; }

    const carta = me.mano.find(c => c.id === cardId);
    if (!carta) return;

    slotCards[toSlot].push(carta);
    selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    renderSlots(); renderMyArea(); renderActions();
};

/* ─── Mover slot → mano (también usada por drag) ── */
window._pescaMoveToHand = function(cardId, fromSlot) {
    const arr = slotCards[fromSlot];
    const idx = arr.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    arr.splice(idx, 1);
    selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    renderSlots(); renderMyArea(); renderActions();
    showToast('Carta devuelta a la mano', 'green');
};

/* ─── Mover slot → slot (también usada por drag) ── */
window._pescaMoveSlotToSlot = function(cardId, fromSlot, toSlot) {
    const arr = slotCards[fromSlot];
    const idx = arr.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const [moved] = arr.splice(idx, 1);
    slotCards[toSlot].push(moved);
    selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    renderSlots(); renderMyArea(); renderActions();
};

/* ─── Click en rival ────────────────────────── */
function clickRival(ji) {
    const myTurn = G.turno === myIdx && G.estado === 'esperando_peticion';
    if (!myTurn) return;
    if (selId === null) { showToast('Primero elige una carta', 'red'); return; }
    const j = G.jugadores[ji];
    if (!j || !j.activo) return;
    selTarget = (selTarget === ji) ? null : ji;
    renderRivals(); renderActions();
}

/* ─── Deseleccionar todo ────────────────────── */
function deselect() {
    selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    renderSlots(); renderMyArea(); renderRivals(); renderActions();
}

/* ─── Enviar petición ───────────────────────── */
function enviarPeticion() {
    if (selId === null || selTarget === null || !selValor) return;
    WS.send({ type: 'pedir', aIdx: selTarget, valor: selValor });
    deselect();
}

/* ─── Confirmar respuesta ─────────────────── */
function confirmarRespuesta() {
    WS.send({ type: 'responder' });
}

/* ─── Timer visual ──────────────────────────── */
function startTimer(segundos, forWhom) {
    stopTimer();
    _timerFor = forWhom;
    _timerEnd = Date.now() + segundos * 1000;
    _tick();
    _timerInterval = setInterval(_tick, 250);
}

function _tick() {
    const el = document.getElementById('pet-timer');
    if (!el) return;
    const left = Math.max(0, Math.ceil((_timerEnd - Date.now()) / 1000));
    el.textContent = left;
    el.className   = 'pet-timer' + (left <= 2 ? ' urgent' : '');
    el.id = 'pet-timer';
    if (left <= 0) stopTimer();
}

function stopTimer() {
    if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

/* ─── Modal fin ─────────────────────────────── */
function renderFinModal() {
    const modal    = document.getElementById('fin-modal');
    const resultsEl = document.getElementById('fin-results');
    if (!modal || !resultsEl || !G.resultados) return;
    resultsEl.innerHTML = G.resultados.map((r, i) => `
        <div class="result-row ${i === 0 ? 'winner' : ''}">
            <div class="result-rank">${['🥇','🥈','🥉'][i] || (i+1)+'.'}</div>
            <div class="result-name">${r.nombre}</div>
            <div class="result-score">${r.jugadas} jugada(s)</div>
        </div>`
    ).join('');
    modal.classList.add('show');
}

/* ─── Helpers ───────────────────────────────── */
function mkBtn(label, cls, onclick) {
    const btn = document.createElement('button');
    btn.className = 'abtn ' + cls;
    btn.textContent = label;
    btn.onclick = onclick;
    return btn;
}

function showToast(msg, type = 'red') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className   = 'show ' + (type === 'green' ? 'green' : type === 'fish' ? 'fish' : '');
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.className = ''), 2800);
}

/* ─── Exponer globales ──────────────────────── */
window.clickSlot          = clickSlot;
window.clickRival         = clickRival;
window.confirmarRespuesta = confirmarRespuesta;

/* ─── Arranque ──────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    WS.connect();
});