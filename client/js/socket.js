// socket.js — WebSocket client with auto-reconnect and event emitter
'use strict';
(function () {
  const handlers = {};
  let ws = null;
  let reconnectDelay = 1000;
  let intentionalClose = false;

  const WS = {
    connect() {
      intentionalClose = false;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}`);

      ws.onopen = () => {
        reconnectDelay = 1000;
        WS.emit('_connected');
        // Restore session if mid-game
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const pid  = params.get('pid');
        if (code && pid) {
          const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
          const nombre  = usuario.nombre || localStorage.getItem('nombre_' + pid) || 'Jugador';
          WS.send({ type: 'join_room', code, nombre, playerId: pid, userId: usuario.id || null });
        }
        // Heartbeat — ping cada 20s para mantener conexión viva
        clearInterval(WS._pingInterval);
        clearTimeout(WS._pongTimeout);
        WS._pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
            // Si no llega pong en 5s, forzar reconexión
            WS._pongTimeout = setTimeout(() => {
              console.warn('[WS] pong timeout, reconnecting...');
              ws.close();
            }, 5000);
          }
        }, 20000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'pong') {
            clearTimeout(WS._pongTimeout);
            return;
          }
          WS.emit(msg.type, msg);
          WS.emit('*', msg); // wildcard
        } catch (_) {}
      };

      ws.onclose = (e) => {
        clearInterval(WS._pingInterval);
        clearTimeout(WS._pongTimeout);
        console.warn('[WS] Conexión cerrada — code:', e.code, '| reason:', e.reason || '(sin razón)', '| clean:', e.wasClean);
        WS.emit('_disconnected');
        if (!intentionalClose) {
          console.log('[WS] Reconectando en', reconnectDelay, 'ms...');
          setTimeout(() => { reconnectDelay = Math.min(reconnectDelay * 1.5, 10000); WS.connect(); }, reconnectDelay);
        }
      };

      ws.onerror = (e) => {
        console.error('[WS] Error de socket:', e);
        ws.close();
      };
    },

    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      else console.warn('WS not open, queuing...', msg);
    },

    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    off(type, fn) { handlers[type] = (handlers[type] || []).filter(h => h !== fn); },

    emit(type, data) { (handlers[type] || []).forEach(h => { try { h(data); } catch (e) { console.error(e); } }); },

    disconnect() { intentionalClose = true; ws?.close(); },
  };

  window.WS = WS;
})();