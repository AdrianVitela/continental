'use strict';
// ═══════════════════════════════════════════════════
// CONTINENTAL — Game Engine (server-side source of truth)
// ═══════════════════════════════════════════════════

const PALOS  = ['♠','♥','♦','♣'];
const VALORES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const PUNTOS  = {A:20,J:10,Q:10,K:10,'10':10,'8':10,'9':10};
['2','3','4','5','6','7'].forEach(v => PUNTOS[v] = 5);
const VNUM = {A:1,J:11,Q:12,K:13};
for (let i = 2; i <= 10; i++) VNUM[String(i)] = i;

const REQ = {
  1:{t:2,c:0}, 2:{t:1,c:1}, 3:{t:0,c:2},
  4:{t:3,c:0}, 5:{t:2,c:1}, 6:{t:1,c:2}, 7:{t:0,c:3}
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

function mkMazo(n) {
  const num = n >= 3 ? 2 : 1, m = [];
  for (let k = 0; k < num; k++) {
    for (const p of PALOS) for (const v of VALORES) m.push(mkCard(v, p));
    m.push(mkCard('JOKER', null, true));
    m.push(mkCard('JOKER', null, true));
  }
  return shuffle(m);
}

// ── Rules ──────────────────────────────────────────
function tercias(mano) {
  const g = {}, coms = mano.filter(c => c.comodin);
  mano.filter(c => !c.comodin).forEach(c => (g[c.valor] = g[c.valor] || []).push(c));
  const out = []; let cr = coms.length;
  for (const v in g) {
    let cs = [...g[v]];
    while (cs.length >= 3) out.push(cs.splice(0, 3));
    if (cs.length === 2 && cr > 0) { out.push([...cs, coms[coms.length - cr]]); cr--; }
  }
  return out;
}

function corridas(mano) {
  const nats = mano.filter(c => !c.comodin), coms = mano.filter(c => c.comodin);
  const out = [], usados = new Set();
  for (const palo of PALOS) {
    const mp = {};
    nats.filter(c => c.palo === palo).forEach(c => {
      const v = VNUM[c.valor];
      if (v) { mp[v] = c; if (c.valor === 'A') mp[14] = c; }
    });
    const vals = [...new Set(Object.keys(mp).map(Number))].sort((a, b) => a - b);
    for (let si = 0; si < vals.length; si++) {
      const seq = [vals[si]]; let cu = 0;
      for (let v = vals[si] + 1; v <= 14; v++) {
        if (mp[v]) seq.push(v);
        else if (cu < coms.length) { seq.push('C' + v); cu++; }
        else break;
      }
      if (seq.length < 4) continue;
      const cards = []; const loc = new Set(); let ok = true; const cd = [...coms];
      for (const v of seq) {
        if (typeof v === 'string') {
          const c = cd.shift();
          if (!c || usados.has(c.id)) { ok = false; break; }
          cards.push(c); loc.add(c.id);
        } else {
          const c = mp[v];
          if (!c || usados.has(c.id) || loc.has(c.id)) { ok = false; break; }
          cards.push(c); loc.add(c.id);
        }
      }
      if (ok && cards.length >= 4) { out.push(cards); loc.forEach(id => usados.add(id)); break; }
    }
  }
  return out;
}

function puedeB(mano, r) {
  const q = REQ[r];
  return tercias(mano).length >= q.t && corridas(mano).length >= q.c;
}

function buildJugada(mano, r) {
  const q = REQ[r], ts = tercias(mano), cs = corridas(mano);
  if (ts.length < q.t || cs.length < q.c) return null;
  const tu = ts.slice(0, q.t), cu = cs.slice(0, q.c);
  const used = new Set();
  tu.forEach(t => t.forEach(c => used.add(c.id)));
  cu.forEach(co => co.forEach(c => used.add(c.id)));
  return { tercias: tu, corridas: cu, sobrantes: mano.filter(c => !used.has(c.id)) };
}

function canAcTercia(carta, cartas) {
  if (carta.comodin) return true;
  const vs = cartas.filter(c => !c.comodin).map(c => c.valor);
  return vs.length > 0 && carta.valor === vs[0];
}

function canAcCorrida(carta, cartas) {
  if (carta.comodin) return true;
  const nats = cartas.filter(c => !c.comodin);
  if (!nats.length) return false;
  if (carta.palo !== nats[0].palo) return false;
  const vs = nats.map(c => VNUM[c.valor]).filter(Boolean).sort((a, b) => a - b);
  const v = VNUM[carta.valor];
  return v === vs[0] - 1 || v === vs[vs.length - 1] + 1;
}

function canAc(carta, jug) {
  return jug.tipo === 'tercia'
    ? canAcTercia(carta, jug.cartas)
    : canAcCorrida(carta, jug.cartas);
}

// ── GameEngine class ───────────────────────────────
class GameEngine {
  constructor(jugadores) {
    // jugadores: [{id, nombre}]
    this.jugadores = jugadores.map(({ id, nombre }) => ({
      id, nombre,
      mano: [], bajado: false,
      pts_r: 0, pts_t: 0,
      jugadas: [],   // [{tipo, cartas}]
      conectado: true,
    }));
    this.ronda    = 1;
    this.dealer   = 0;
    this.turno    = 1 % jugadores.length;
    this.mazo     = [];
    this.fondo    = [];
    this.estado   = 'esperando_robo'; // game FSM state
    this.log      = [];
    this.castigo_idx = -1;
    // For async mode: save last action timestamp
    this.lastAction = Date.now();
  }

  // ── helpers ─────────────────────────────
  get jActivo() { return this.jugadores[this.turno]; }

  addLog(m) { this.log.push({ msg: m, ts: Date.now() }); if (this.log.length > 20) this.log.shift(); }

  chkMazo() {
    if (!this.mazo.length && this.fondo.length > 1) {
      const last = this.fondo.pop();
      this.mazo = shuffle([...this.fondo]);
      this.fondo = [last];
      this.addLog('♻️ Mazo rearmado.');
    }
  }

  repartir() {
    this.mazo = mkMazo(this.jugadores.length);
    this.fondo = [];
    this.jugadores.forEach(j => { j.mano = []; j.bajado = false; j.pts_r = 0; j.jugadas = []; });
    const n = 5 + this.ronda;
    for (let i = 0; i < n; i++) {
      this.jugadores.forEach(j => { this.chkMazo(); j.mano.push(this.mazo.pop()); });
    }
    this.chkMazo();
    this.fondo.push(this.mazo.pop());
    this.estado = 'esperando_robo';
    this.addLog(`🃏 Ronda ${this.ronda}. Dealer: ${this.jugadores[this.dealer].nombre}. Inicia: ${this.jActivo.nombre}.`);
  }

  // ── public actions ───────────────────────
  // Each returns { ok, error?, event, state }

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
    // find castigo candidate (first non-bajado clockwise)
    let idx = (this.turno + 1) % this.jugadores.length;
    while (this.jugadores[idx].bajado && idx !== this.turno)
      idx = (idx + 1) % this.jugadores.length;
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
      while (this.jugadores[sig].bajado && sig !== this.turno)
        sig = (sig + 1) % this.jugadores.length;
      if (sig === this.turno) this.estado = 'esperando_accion';
      else this.castigo_idx = sig;
      this.lastAction = Date.now();
      return this._ok('castigo_pasa', { nextCastigoIdx: this.estado === 'fase_castigo' ? sig : -1 });
    }
  }

  acBajar(playerId) {
    const err = this._checkTurn(playerId, 'esperando_accion');
    if (err) return err;
    if (this.jActivo.bajado) return this._err('Ya te bajaste.');
    const jugada = buildJugada(this.jActivo.mano, this.ronda);
    if (!jugada) return this._err('No cumples los requisitos.');
    jugada.tercias.forEach(t => this.jActivo.jugadas.push({ tipo: 'tercia', cartas: t }));
    jugada.corridas.forEach(c => this.jActivo.jugadas.push({ tipo: 'corrida', cartas: c }));
    this.jActivo.mano = jugada.sobrantes;
    this.jActivo.bajado = true;
    this.addLog(`🔥 ${this.jActivo.nombre} se bajó en ronda ${this.ronda}!`);
    this.lastAction = Date.now();
    if (this.jActivo.mano.length === 0) {
      return this._finRonda(this.turno, { tipo: 'bajar', jugadas: this.jActivo.jugadas });
    }
    this.estado = 'esperando_pago';
    return this._ok('bajar', { jugadorIdx: this.turno, jugadas: this.jActivo.jugadas, sobrantes: this.jActivo.mano });
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
    if (!canAc(carta, jug)) return this._err(`No puedes acomodar ${carta.valor}${carta.palo || ''} ahí.`);
    jug.cartas.push(carta);
    j.mano.splice(cidx, 1);
    this.addLog(`🃏 ${j.nombre} acomodó en jugada de ${dest.nombre}.`);
    this.lastAction = Date.now();
    if (j.mano.length === 0 && j.bajado) {
      return this._finRonda(tidx, { tipo: 'acomodar', carta });
    }
    return this._ok('acomodar', { carta, jugadorIdx: tidx, destJugadorIdx, destJugadaIdx });
  }

  acReordenarMano(playerId, newOrder) {
    // newOrder: array of card ids in desired order
    const j = this._findPlayer(playerId);
    if (!j) return this._err('Jugador no encontrado.');
    const reordered = newOrder.map(id => j.mano.find(c => c.id === id)).filter(Boolean);
    if (reordered.length !== j.mano.length) return this._err('Orden inválido.');
    j.mano = reordered;
    // no broadcast needed — only affects this player's view
    return this._ok('reordenar', { jugadorIdx: this.jugadores.indexOf(j) }, false);
  }

  // ── private ──────────────────────────────
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
      if (i === ganadorIdx) { j.pts_r = 0; }
      else { j.pts_r = j.mano.reduce((s, c) => s + (c.comodin ? 50 : (PUNTOS[c.valor] ?? 10)), 0); j.pts_t += j.pts_r; }
    });
    this.addLog(`🏆 ${this.jugadores[ganadorIdx].nombre} gana ronda ${this.ronda}!`);
    this.estado = 'fin_ronda';
    this.lastAction = Date.now();
    return this._ok('fin_ronda', { ganadorIdx, puntos: this.jugadores.map(j => ({ pts_r: j.pts_r, pts_t: j.pts_t })), ...extra });
  }

  finalizarRonda() {
    // Called by server after fin_ronda modal ack
    this.ronda++;
    if (this.ronda > 7) {
      this.estado = 'fin_juego';
      return this._ok('fin_juego', { jugadores: this.jugadores.map(j => ({ nombre: j.nombre, pts_t: j.pts_t })) });
    }
    this.dealer = (this.dealer + 1) % this.jugadores.length;
    this.turno  = (this.dealer + 1) % this.jugadores.length;
    this.repartir();
    return this._ok('nueva_ronda', { ronda: this.ronda });
  }

  // ── state projection ─────────────────────
  // Returns state visible to a specific player (hides other players' hands)
  stateFor(playerId) {
    const base = this.publicState();
    base.jugadores = this.jugadores.map(j => {
      const pub = { ...j, mano: j.id === playerId ? j.mano : j.mano.map(() => ({ hidden: true })) };
      return pub;
    });
    return base;
  }

  publicState() {
    return {
      ronda:      this.ronda,
      dealer:     this.dealer,
      turno:      this.turno,
      estado:     this.estado,
      fondo_top:  this.fondo.length ? this.fondo[this.fondo.length - 1] : null,
      mazo_count: this.mazo.length,
      castigo_idx: this.castigo_idx,
      jugadores:  this.jugadores.map(j => ({
        id: j.id, nombre: j.nombre,
        num_cartas: j.mano.length,
        bajado: j.bajado,
        pts_r: j.pts_r, pts_t: j.pts_t,
        jugadas: j.jugadas,
        conectado: j.conectado,
        mano: [],  // filled by stateFor per player
      })),
      log: this.log.slice(-6).map(l => l.msg),
      req: REQ[this.ronda],
    };
  }
}

module.exports = { GameEngine, REQ, PUNTOS };
