// socket.js — WebSocket client with auto-reconnect and event emitter
'use strict';
(function () {
  const handlers = {};
  let ws = null;
  let reconnectDelay = 1000;
  let intentionalClose = false;
  let isConnecting = false;
  let socketSeq = 0;
  const clientTabId = sessionStorage.getItem('continental_tab_id') || `tab-${Math.random().toString(36).slice(2, 8)}`;

  sessionStorage.setItem('continental_tab_id', clientTabId);

  function logWs(level, ...args) {
    const method = console[level] || console.log;
    method('[WS]', `[${clientTabId}]`, ...args);
  }

  const WS = {
    get ws() { return ws; },

    connect() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        console.warn('[WS] Ya hay conexión activa');
        return;
      }

      if (isConnecting) return;
      isConnecting = true;

      intentionalClose = false;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const socketId = ++socketSeq;
      logWs('log', `🟢 socket#${socketId} intentando conectar`, {
        url: `${proto}://${location.host}`,
        online: navigator.onLine,
        visible: document.visibilityState,
      });
      ws = new WebSocket(`${proto}://${location.host}`);
      WS._socketId = socketId;

      ws.onopen = () => {
        logWs('log', `✅ socket#${socketId} conectado`);
        isConnecting = false;
        reconnectDelay = 1000;
        WS.send({ type: 'auth', token: localStorage.getItem('token') || null });
        WS.emit('_connected');
        // Restore session if mid-game
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const pid  = params.get('pid');
        const seat = params.get('seat') || '';
        if (code && pid) {
          const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
          const nombre  = usuario.nombre || localStorage.getItem('nombre_' + pid) || 'Jugador';
          logWs('log', `↩️ socket#${socketId} rejoin automático`, { code, pid, nombre });
        WS.send({
          type: 'join_room',
          code,
          nombre,
          playerId: pid,
          seatToken: seat,
          userId: usuario.id || null
        });
        }
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'pong') {
            WS._lastPongAt = Date.now();
            logWs('log', `✅ pong recibido socket#${socketId}`, {
              msSincePing: WS._lastPingAt ? Date.now() - WS._lastPingAt : null,
            });
            clearTimeout(WS._pongTimeout);
            return;
          }
          logWs('log', `📩 socket#${socketId} mensaje`, msg);
          if (msg.type === 'auth_denied') {
            WS._handleAuthDenied();
            return;
          }
          WS.emit(msg.type, msg);
          WS.emit('*', msg); // wildcard
        } catch (_) {}
      };

      ws.onclose = (e) => {
        isConnecting = false;
        clearInterval(WS._pingInterval);
        clearTimeout(WS._pongTimeout);
        WS._heartbeatStarted = false;
        logWs('warn', `🔴 socket#${socketId} cerrado`, {
          code: e.code,
          reason: e.reason || '(sin razón)',
          clean: e.wasClean,
          online: navigator.onLine,
          visible: document.visibilityState,
          msSincePong: WS._lastPongAt ? Date.now() - WS._lastPongAt : null,
        });
        WS.emit('_disconnected');
        if (!intentionalClose) {
          logWs('log', `⏳ socket#${socketId} reconectando en ${reconnectDelay}ms`);
          setTimeout(() => { reconnectDelay = Math.min(reconnectDelay * 1.5, 10000); WS.connect(); }, reconnectDelay);
        }
      };

      ws.onerror = (e) => {
        logWs('error', `💥 socket#${socketId} error`, e);
      };
    },

    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) {
        logWs('log', `📤 socket#${WS._socketId || '?'} send`, msg);
        ws.send(JSON.stringify(msg));
      } else {
        logWs('warn', `🚫 socket#${WS._socketId || '?'} send con socket cerrado`, {
          readyState: ws?.readyState,
          msg,
        });
      }
    },

    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    off(type, fn) { handlers[type] = (handlers[type] || []).filter(h => h !== fn); },

    emit(type, data) { (handlers[type] || []).forEach(h => { try { h(data); } catch (e) { console.error(e); } }); },

    disconnect() { intentionalClose = true; ws?.close(); },

    _handleAuthDenied() {
      const oldToken = localStorage.getItem('token');
      const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        if (!/login|register/.test(location.pathname)) location.href = '/login';
      };
      if (!oldToken) { logout(); return; }
      fetch('/api/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + oldToken },
      })
        .then(r => r.json())
        .then(data => {
          if (data.token) {
            localStorage.setItem('token', data.token);
            if (data.usuario) {
              const stored = JSON.parse(localStorage.getItem('usuario') || '{}');
              localStorage.setItem('usuario', JSON.stringify({ ...stored, ...data.usuario }));
            }
            logWs('log', '🔑 token renovado por refresh');
            WS.send({ type: 'auth', token: data.token });
            return;
          }
          logout();
        })
        .catch(logout);
    },
  };

  window.addEventListener('online', () => logWs('log', '🌐 navegador online'));
  window.addEventListener('offline', () => logWs('warn', '📴 navegador offline'));
  document.addEventListener('visibilitychange', () => {
    logWs('log', `👁️ visibility=${document.visibilityState}`);
  });

  window.WS = WS;
})();