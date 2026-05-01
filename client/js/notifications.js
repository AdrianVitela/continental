// client/js/notifications.js
'use strict';

console.log('NOTIFICATIONS.JS - INICIO');

const NotificationSystem = (() => {
  let container = null;
  let defaultDuration = 4000;

  function getContainer() {
    if (!container) {
      container = document.getElementById('notification-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
      }
    }
    return container;
  }

  const ICONS = {
  success: `<svg width="24" height="24" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="64" cy="64" r="64" fill="white"/>
              <path fill="#3EBD61" d="M54.3,97.2L24.8,67.7c-0.4-0.4-0.4-1,0-1.4l8.5-8.5c0.4-0.4,1-0.4,1.4,0L55,78.1l38.2-38.2c0.4-0.4,1-0.4,1.4,0l8.5,8.5c0.4,0.4,0.4,1,0,1.4L55.7,97.2C55.3,97.6,54.7,97.6,54.3,97.2z"/>
            </svg>`,
  info: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
           <circle cx="12" cy="12" r="12" fill="white"/>
           <path d="M11 7H13V9H11V7Z" fill="#006CE3"/>
           <rect x="11" y="10" width="2" height="7" fill="#006CE3"/>
         </svg>`,
  warning: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="12" fill="white"/>
              <path d="M12 6L2 18H22L12 6Z" fill="#EF9400"/>
              <rect x="11" y="10" width="2" height="4" fill="white"/>
              <circle cx="12" cy="15.5" r="1" fill="white"/>
            </svg>`,
  danger: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
             <circle cx="12" cy="12" r="12" fill="white"/>
             <path d="M12 6L2 18H22L12 6Z" fill="#EC4D2B"/>
             <rect x="11" y="10" width="2" height="4" fill="white"/>
             <circle cx="12" cy="15.5" r="1" fill="white"/>
           </svg>`
};

  function show(message, type = 'info', duration = defaultDuration) {
    console.log('📢 Mostrando notificación:', message, type);
    const container = getContainer();
    const notification = document.createElement('div');
    notification.className = `notif-alert ${type}`;

    notification.innerHTML = `
      <div class="notif-content">
        <div class="notif-icon">
          ${ICONS[type] || ICONS.info}
        </div>
        <p>${escapeHtml(message)}</p>
      </div>
      <button class="notif-close" onclick="this.closest('.notif-alert').remove()">
        <svg height="18px" viewBox="0 0 512 512" width="18px" xmlns="http://www.w3.org/2000/svg">
          <path fill="#69727D" d="M437.5,386.6L306.9,256l130.6-130.6c14.1-14.1,14.1-36.8,0-50.9c-14.1-14.1-36.8-14.1-50.9,0L256,205.1L125.4,74.5c-14.1-14.1-36.8-14.1-50.9,0c-14.1,14.1-14.1,36.8,0,50.9L205.1,256L74.5,386.6c-14.1,14.1-14.1,36.8,0,50.9c14.1,14.1,36.8,14.1,50.9,0L256,306.9l130.6,130.6c14.1,14.1,36.8,14.1,50.9,0C451.5,423.4,451.5,400.6,437.5,386.6z"/>
        </svg>
      </button>
    `;

    container.appendChild(notification);

    const timeout = setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('hiding');
        setTimeout(() => {
          if (notification.parentNode) notification.remove();
        }, 300);
      }
    }, duration);

    notification._timeout = timeout;
    return notification;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Función para el diálogo de castigo - DESACTIVADA (usamos banner en HTML)
  // Se mantiene para no romper referencias en game.js, pero no crea ningún overlay
  function showCastigoDialog(card, onYes, onNo, options = {}) {
    // DIALOGO DESACTIVADO - Usamos el banner de castigo en el HTML
    // Esta función no hace nada para evitar el diálogo flotante
    console.log('showCastigoDialog llamado pero DESACTIVADO - usando banner de castigo');
    
    // No creamos ningún overlay ni elemento visual
    // Simplemente ignoramos la llamada
  }

  function success(message, duration) { return show(message, 'success', duration); }
  function info(message, duration)    { return show(message, 'info', duration); }
  function warning(message, duration) { return show(message, 'warning', duration); }
  function danger(message, duration)  { return show(message, 'danger', duration); }

  return {
    show: show,
    success: success,
    info: info,
    warning: warning,
    danger: danger,
    showCastigoDialog: showCastigoDialog  // Se mantiene pero está vacía
  };
})();

window.Notify = NotificationSystem;

console.log('✅ notifications.js cargado correctamente');
console.log('Notify.showCastigoDialog existe (desactivada):', typeof window.Notify.showCastigoDialog);