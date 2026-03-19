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
          const nombre = localStorage.getItem('nombre_' + pid) || 'Jugador';
          WS.send({ type: 'join_room', code, nombre, playerId: pid });
        }
        // Heartbeat — ping cada 25s para mantener conexión viva
        clearInterval(WS._pingInterval);
        WS._pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          WS.emit(msg.type, msg);
          WS.emit('*', msg); // wildcard
        } catch (_) {}
      };

      ws.onclose = () => {
        clearInterval(WS._pingInterval);
        WS.emit('_disconnected');
        if (!intentionalClose) {
          setTimeout(() => { reconnectDelay = Math.min(reconnectDelay * 1.5, 10000); WS.connect(); }, reconnectDelay);
        }
      };

      ws.onerror = () => ws.close();
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