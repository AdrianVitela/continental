// ═══════════════════════════════════════════════════════════════
// pesca.js — Cliente del juego Pesca
//
// REGLAS DE INTERACCIÓN:
//   DRAG (arrastrar > 6px / swipe > 8px):
//     → Siempre disponible — mover cartas entre mano y slots
//     → Funciona en tu turno Y fuera de tu turno
//
//   CLICK / TAP (sin movimiento):
//     → En tu turno: selecciona la carta para preguntar a un rival
//     → Fuera de tu turno: devuelve la carta del slot a la mano
//       (porque si clickeas en un slot fuera de turno = "quiero sacarla")
//
//   SLOTS:
//     → Click en área vacía del slot: mueve la carta seleccionada ahí
//     → Funciona siempre (no requiere turno)
//
//   BAJAR:
//     → Botón aparece cuando ≥1 slot tiene exactamente 4 cartas del mismo valor
//     → Joker solo agrupa con jokers
//     → Bajada en falso = penalización 2 turnos del servidor
// ═══════════════════════════════════════════════════════════════

'use strict';

/* ─── Estado ────────────────────────────────── */
let G        = null;
let myIdx    = -1;
let myId     = null;

// Selección para preguntar (solo activa en tu turno)
let selId    = null;   // id de carta seleccionada
let selValor = null;   // valor de esa carta
let selFrom  = null;   // 'hand' | 'slot'
let selSlot  = null;   // índice slot si selFrom === 'slot'
let selTarget= null;   // índice rival seleccionado

// Slots de construcción — siempre disponibles, independiente del turno
let slotCards = [[], [], []];

// Timer del box de petición
let _timerInterval = null;
let _timerEnd      = 0;
let _timerFor      = null;
let _othersTimeout = null;

// Hint "dame tus X"
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
        WS.send({ type: 'join_pesca', nombre: _getSavedName(), code: roomCode, playerId: myId });
    }
});

WS.on('state_update', ({ event, data, state }) => {
    if (!state) return;
    G = state;
    if (myIdx === -1) myIdx = G.jugadores.findIndex(j => j.id === myId);

    // Dame-hint: cuando yo robo y tengo la carta que el anterior pedía
    if (event === 'respuesta_no' && data?.cartaRobada === null && data?.valor) {
        const nuevoTurno = G.jugadores[G.turno];
        if (nuevoTurno && nuevoTurno.mano.some(c => c.valor === data.valor)) {
            _dameHintValor = data.valor;
        } else {
            _dameHintValor = null;
        }
    } else if (['respuesta_si', 'game_started', 'peticion', 'bajar_manual'].includes(event)) {
        _dameHintValor = null;
    }

    // Al avanzar el turno, limpiar selección de preguntar
    if (['respuesta_si', 'respuesta_no', 'bajar_manual'].includes(event)) {
        selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    }

    handlePeticionUI(event, data);
    render();
    if (G.estado === 'fin_juego') renderFinModal();
});

WS.on('error', (data) => {
    const msg = data.msg || data || 'Error';
    showToast(typeof msg === 'string' ? msg : JSON.stringify(msg), 'red');
    // Si fue bajada en falso, el servidor ya actualizó el estado vía broadcastState
    // Solo refrescamos la UI
    if (typeof msg === 'string' && msg.includes('BAJADA EN FALSO')) {
        render();
    }
});

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
    tp.textContent = myTurn ? '✨ Tu turno — pide una carta' : `Turno: ${jt?.nombre || '—'}`;
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

        const isSelectable = myTurn && selValor !== null && j.activo;
        const isSelected   = selTarget === ji;
        const isBeingAsked = pet && pet.aIdx === ji && G.estado === 'esperando_respuesta';
        const isTurno      = ji === G.turno && G.estado !== 'fin_juego';

        const cls = ['rival-card',
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
        const p     = G.peticionActiva;
        const quien = G.jugadores[p.pidx]?.nombre || '?';
        const aQ    = G.jugadores[p.aIdx]?.nombre || '?';
        const soyElPreguntado = p.aIdx === myIdx;

        txt.innerHTML = `<strong>${quien}</strong> le pregunta a <strong>${aQ}</strong>:<br>
            "¿Tienes ${p.valor === 'JOKER' ? 'un <span class="v-hi">🃏 Comodín</span>' : `un <span class="v-hi">${p.valor}</span>`}?"`;

        box.classList.add('show');
        btnConf.style.display = soyElPreguntado ? 'inline-block' : 'none';

        if (soyElPreguntado) {
            startTimer(5, 'me');
        } else {
            startTimer(3, 'others');
            _othersTimeout = setTimeout(() => { box.classList.remove('show'); stopTimer(); }, 3100);
        }
    } else {
        box.classList.remove('show');
        stopTimer();
    }
}

/* ─── Log ───────────────────────────────────── */
function renderLog() {
    const area = document.getElementById('log-area');
    if (!area) return;
    const msgs = G.log || [];
    area.innerHTML = [...msgs].reverse().slice(0, 4).map((m, i) =>
        `<div class="log-item${i === 0 ? ' fresh' : ''}">${m}</div>`
    ).join('');
}

/* ─── Slots ─────────────────────────────────── */
function renderSlots() {
    for (let i = 0; i < 3; i++) {
        const cards     = slotCards[i];
        const container = document.getElementById(`slot-cards-${i}`);
        const countEl   = document.getElementById(`slot-count-${i}`);
        const slotEl    = document.querySelector(`.building-slot[data-slot="${i}"]`);
        if (!container) continue;

        container.innerHTML = '';
        cards.forEach(c => container.appendChild(mkCardEl(c, { fromSlot: i })));

        const isComplete = slotCompleto(cards);
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

// Un slot está completo si tiene exactamente 4 cartas del mismo valor
function slotCompleto(cards) {
    if (cards.length < 4) return false;
    const primerValor = cards[0].valor;
    return cards.length === 4 && cards.every(c => c.valor === primerValor);
}

// ¿Hay al menos un slot listo para bajar?
function haySlotListo() {
    return slotCards.some(cards => slotCompleto(cards));
}

/* ─── Mi área ───────────────────────────────── */
function renderMyArea() {
    const me = G.jugadores[myIdx];
    if (!me) return;

    const nameEl = document.getElementById('my-name-lbl');
    if (nameEl) nameEl.textContent = `${me.nombre} · ${me.mano.length} carta(s)`;
    const jugEl = document.getElementById('my-jugadas-lbl');
    if (jugEl) jugEl.textContent = `🏆 ${me.jugadas.length} jugada(s)`;

    const jugadasEl = document.getElementById('my-jugadas');
    if (jugadasEl) {
        jugadasEl.innerHTML = me.jugadas.map(j => `
            <div class="my-jugada-pill">
                ${j.valor}×4 <span class="pill-sub">${j.cartas.map(c => c.palo || '★').join('')}</span>
            </div>`
        ).join('');
    }

    // Penalización
    const penEl = document.getElementById('penalizacion-banner');
    if (penEl) {
        if (me.penalizacion?.activa) {
            penEl.textContent = `⚠️ Bajada en falso — ${me.penalizacion.turnosRestantes} turno(s) sin bajar`;
            penEl.style.display = 'block';
        } else {
            penEl.style.display = 'none';
        }
    }

    const cardsEnSlot = new Set();
    slotCards.forEach(arr => arr.forEach(c => cardsEnSlot.add(c.id)));

    const handEl = document.getElementById('my-hand');
    if (!handEl) return;

    handEl.innerHTML = '';
    me.mano.forEach(c => {
        if (cardsEnSlot.has(c.id)) return;
        handEl.appendChild(mkCardEl(c, { fromHand: true }));
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
    const hintEl = document.getElementById('hint-line');
    const btnsEl = document.getElementById('action-btns');
    if (!hintEl || !btnsEl) return;

    btnsEl.innerHTML = '';
    hintEl.textContent = '';

    const me     = G.jugadores[myIdx];
    const myTurn = G.turno === myIdx && G.estado === 'esperando_peticion';

    // ── Botón bajar — siempre visible si hay slot listo Y no hay penalización
    const puedebajar = haySlotListo() && !me?.penalizacion?.activa;
    if (puedebajar || haySlotListo()) {
        const btnBajar = mkBtn(
            puedebajar ? '🏆 Bajar jugada(s)' : '⛔ Bajar (penalizado)',
            puedebajar ? 'abtn-green' : 'abtn-cancel',
            puedebajar ? acBajar : () => showToast(`Penalizado: ${me?.penalizacion?.turnosRestantes} turno(s) sin bajar`, 'red')
        );
        btnsEl.appendChild(btnBajar);
    }

    if (!myTurn) {
        if (!haySlotListo()) {
            hintEl.textContent = 'Acomoda tus cartas en los slots para preparar jugadas';
        }
        return;
    }

    // Es mi turno
    if (selId === null) {
        hintEl.textContent = 'Elige una carta para preguntar a un rival';
        return;
    }

    if (selTarget === null) {
        hintEl.textContent = `Vas a pedir "${selValor}" — elige a quién preguntarle`;
        btnsEl.appendChild(mkBtn('✕ Cancelar', 'abtn-cancel', deselect));
        return;
    }

    const rival = G.jugadores[selTarget];
    btnsEl.appendChild(mkBtn(
        `🙋 Preguntar a ${rival.nombre}: ¿tienes un ${selValor}?`,
        'abtn-primary',
        enviarPeticion
    ));
    btnsEl.appendChild(mkBtn('✕ Cancelar', 'abtn-cancel', deselect));
}

/* ─── Crear elemento carta ──────────────────── */
// REGLA CLAVE:
//   drag  → siempre disponible (mover carta)
//   click → en tu turno: seleccionar para preguntar
//            fuera de turno (solo slots): devolver a mano
function mkCardEl(c, opts = {}) {
    const { fromHand = false, fromSlot = null } = opts;
    const isJoker = c.valor === 'JOKER';
    const isRed   = ['♥','♦'].includes(c.palo);
    const isSel   = selId === c.id;
    const myTurn  = G && G.turno === myIdx && G.estado === 'esperando_peticion';

    const el = document.createElement('div');
    const cls = ['p-card'];
    if (isJoker)  cls.push('joker');
    else if (isRed) cls.push('red');
    if (myTurn)   cls.push('selectable');
    if (isSel)    cls.push('selected');
    el.className = cls.join(' ');

    if (isJoker) {
        el.innerHTML = `<span class="cv">🃏</span><span class="cp" style="font-size:.6rem">COMODÍN</span>`;
    } else {
        el.innerHTML = `<span class="cv">${c.valor}</span><span class="cp">${c.palo || ''}</span>`;
    }

    // ── MOUSE: umbral 6px para distinguir drag de click ──
    el.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        const startX = e.clientX, startY = e.clientY;
        let dragStarted = false;

        const onMove = moveE => {
            const dx = moveE.clientX - startX;
            const dy = moveE.clientY - startY;
            if (!dragStarted && Math.hypot(dx, dy) > 6) {
                dragStarted = true;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                // DRAG — mover carta (sin restricción de turno)
                if (typeof window._pescaDragStart === 'function') {
                    window._pescaDragStart(e, c.id, fromSlot, el);
                }
            }
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!dragStarted) {
                // CLICK — distinguir por contexto
                _handleCardClick(c, fromHand, fromSlot, myTurn);
            }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // ── TOUCH: umbral 8px para distinguir tap de swipe ──
    el.addEventListener('touchstart', e => {
        const startX = e.touches[0].clientX, startY = e.touches[0].clientY;
        let swiped = false;

        const onMove = moveE => {
            const dx = moveE.touches[0].clientX - startX;
            const dy = moveE.touches[0].clientY - startY;
            if (!swiped && Math.hypot(dx, dy) > 8) {
                swiped = true;
                el.removeEventListener('touchmove', onMove);
                el.removeEventListener('touchend', onEnd);
                // SWIPE — drag
                if (typeof window._pescaDragStart === 'function') {
                    window._pescaDragStart(e, c.id, fromSlot, el);
                }
            }
        };

        const onEnd = () => {
            el.removeEventListener('touchmove', onMove);
            el.removeEventListener('touchend', onEnd);
            if (!swiped) {
                // TAP — click
                _handleCardClick(c, fromHand, fromSlot, myTurn);
            }
        };

        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd);
    }, { passive: true });

    return el;
}

// Lógica de click unificada
function _handleCardClick(c, fromHand, fromSlot, myTurn) {
    if (fromHand) {
        // Carta de mano:
        if (myTurn) clickCardFromHand(c);
        // fuera de turno: no hace nada en mano (drag la mueve al slot)
    } else if (fromSlot !== null) {
        // Carta de slot:
        if (myTurn) {
            // En turno: seleccionar para preguntar (o deseleccionar → devolver)
            clickCardFromSlot(c, fromSlot);
        } else {
            // Fuera de turno: click en slot = devolver a mano
            devolverAMano(c, fromSlot);
        }
    }
}

/* ─── Selecciones (solo activas en tu turno) ── */
function clickCardFromHand(c) {
    if (selId === c.id) { deselect(); return; }
    selId    = c.id;
    selValor = c.valor;
    selFrom  = 'hand';
    selSlot  = null;
    selTarget = null;
    renderSlots(); renderMyArea(); renderActions();
}

function clickCardFromSlot(c, slotIdx) {
    if (selId === c.id) {
        // Misma carta: deseleccionar (sin devolver)
        selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
        renderSlots(); renderMyArea(); renderActions();
        return;
    }
    // Seleccionar esta carta del slot para preguntar
    selId    = c.id;
    selValor = c.valor;
    selFrom  = 'slot';
    selSlot  = slotIdx;
    selTarget = null;
    renderSlots(); renderMyArea(); renderActions();
}

/* ─── Click en slot (área vacía del slot) ────── */
// Mueve la carta seleccionada al slot. Sin restricción de turno.
function clickSlot(slotIdx) {
    if (selFrom === 'hand' && selId !== null) {
        _pescaMoveToSlot(selId, slotIdx);
        return;
    }
    if (selFrom === 'slot' && selSlot !== null && selSlot !== slotIdx) {
        _pescaMoveSlotToSlot(selId, selSlot, slotIdx);
        return;
    }
}

/* ─── Devolver carta del slot a la mano ─────── */
function devolverAMano(c, slotIdx) {
    const idx = slotCards[slotIdx].findIndex(sc => sc.id === c.id);
    if (idx === -1) return;
    slotCards[slotIdx].splice(idx, 1);
    // Si esa era la carta seleccionada, limpiar selección
    if (selId === c.id) {
        selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    }
    renderSlots(); renderMyArea(); renderActions();
    showToast('Carta devuelta a la mano', 'green');
}

/* ─── Mover mano → slot (drag y click de slot) ── */
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

/* ─── Mover slot → mano (drag) ──────────────── */
window._pescaMoveToHand = function(cardId, fromSlot) {
    const arr = slotCards[fromSlot];
    const idx = arr.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const [removed] = arr.splice(idx, 1);
    if (selId === cardId) {
        selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    }
    renderSlots(); renderMyArea(); renderActions();
};

/* ─── Mover slot → slot (drag y click) ──────── */
window._pescaMoveSlotToSlot = function(cardId, fromSlot, toSlot) {
    const arr = slotCards[fromSlot];
    const idx = arr.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const [moved] = arr.splice(idx, 1);
    slotCards[toSlot].push(moved);
    if (selId === cardId) {
        selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    }
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

/* ─── Deseleccionar ─────────────────────────── */
function deselect() {
    selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    renderSlots(); renderMyArea(); renderRivals(); renderActions();
}

/* ─── Enviar petición ───────────────────────── */
function enviarPeticion() {
    if (!selId || selTarget === null || !selValor) return;
    WS.send({ type: 'pedir', aIdx: selTarget, valor: selValor });
    deselect();
}

/* ─── Confirmar respuesta ───────────────────── */
function confirmarRespuesta() {
    WS.send({ type: 'responder' });
}

/* ─── Bajar jugadas de los slots ────────────── */
function acBajar() {
    const me = G?.jugadores?.[myIdx];
    if (!me) return;

    if (me.penalizacion?.activa) {
        showToast(`Penalizado: ${me.penalizacion.turnosRestantes} turno(s) sin bajar`, 'red');
        return;
    }

    // Recopilar solo los slots completos (4 cartas mismo valor)
    const slotsABajar = slotCards
        .map((cards, i) => ({ cards, i }))
        .filter(({ cards }) => slotCompleto(cards))
        .map(({ cards }) => ({ cartas: cards.map(c => ({ id: c.id, valor: c.valor, palo: c.palo })) }));

    if (slotsABajar.length === 0) {
        showToast('Ningún slot tiene 4 cartas del mismo valor', 'red');
        return;
    }

    WS.send({ type: 'bajar', slots: slotsABajar });

    // Optimista: quitar de los slots localmente los que enviamos
    // El servidor confirmará con state_update
    const idsEnviados = new Set(slotsABajar.flatMap(s => s.cartas.map(c => c.id)));
    slotCards = slotCards.map(arr => arr.filter(c => !idsEnviados.has(c.id)));
    selId = null; selValor = null; selFrom = null; selSlot = null; selTarget = null;
    renderSlots(); renderMyArea(); renderActions();
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
    el.className = 'pet-timer' + (left <= 2 ? ' urgent' : '');
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
function mkBtn(label, cls, fn) {
    const btn = document.createElement('button');
    btn.className = 'abtn ' + cls;
    btn.textContent = label;
    btn.onclick = fn;
    return btn;
}

function showToast(msg, type = 'red') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show' + (type === 'green' ? ' green' : type === 'fish' ? ' fish' : '');
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.className = ''), 2800);
}

/* ─── Exponer globales ──────────────────────── */
window.clickSlot          = clickSlot;
window.clickRival         = clickRival;
window.confirmarRespuesta = confirmarRespuesta;
window.acBajar            = acBajar;

/* ─── Arranque ──────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    WS.connect();
});