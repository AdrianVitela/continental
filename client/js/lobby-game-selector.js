        // ── Selector de juego ──────────────────────────────
        // Maneja solo UI; la lógica de qué WS enviar vive en lobby.js
        function elegirJuego(game) {
            document.getElementById('gsb-continental').classList.toggle('active', game === 'continental');
            document.getElementById('gsb-pesca').classList.toggle('active', game === 'pesca');

            const titleEl = document.getElementById('lobby-title');
            const subtEl  = document.getElementById('lobby-subtitle');
            if (game === 'pesca') {
                titleEl.textContent = 'Pesca';
                subtEl.textContent  = '¿Tienes un...?';
            } else {
                titleEl.textContent = 'Continental';
                subtEl.textContent  = 'Juego de cartas multijugador';
            }

            // Modo async solo aplica a Continental
            const modeGroup = document.getElementById('mode-group');
            if (modeGroup) modeGroup.style.display = game === 'pesca' ? 'none' : '';

            // Delegar a lobby.js
            if (typeof window._setCurrentGame === 'function') window._setCurrentGame(game);
        }

        // Botones del formulario llaman a lobby.js directamente
        function crearSalaActual() {
            if (typeof window._crearSalaActual === 'function') window._crearSalaActual();
        }
        function unirseActual() {
            if (typeof window._unirseActual === 'function') window._unirseActual();
        }


document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-game-select]').forEach(function (el) {
    el.addEventListener('click', function () { elegirJuego(el.dataset.gameSelect); });
  });

  document.querySelectorAll('[data-tab-target]').forEach(function (el) {
    el.addEventListener('click', function () { switchTab(el.dataset.tabTarget); });
  });

  document.querySelectorAll('[data-sanitize="name"]').forEach(function (el) {
    el.addEventListener('input', function () { sanitizeName(el); });
  });

  document.querySelectorAll('[data-sanitize="code"]').forEach(function (el) {
    el.addEventListener('input', function () { sanitizeCode(el); });
  });

  document.querySelectorAll('[data-open-names]').forEach(function (el) {
    el.addEventListener('click', function () { openNamesModal(el.dataset.openNames); });
  });

  document.querySelectorAll('.mode-btn[data-mode]').forEach(function (el) {
    el.addEventListener('click', function () { setMode(el); });
  });

  document.querySelectorAll('[data-max-delta]').forEach(function (el) {
    el.addEventListener('click', function () { chgMax(Number(el.dataset.maxDelta)); });
  });

  document.querySelector('[data-action="crear-sala"]')?.addEventListener('click', crearSalaActual);
  document.querySelector('[data-action="unirse-sala"]')?.addEventListener('click', unirseActual);
  document.querySelector('[data-action="copy-code"]')?.addEventListener('click', copyCode);
  document.querySelector('[data-action="iniciar-juego"]')?.addEventListener('click', iniciarJuego);
  document.querySelector('[data-action="close-names-modal"]')?.addEventListener('click', closeNamesModal);
  document.querySelector('[data-action="shuffle-names"]')?.addEventListener('click', shuffleNames);

  document.getElementById('names-modal')?.addEventListener('click', closeNamesModalOutside);
});
