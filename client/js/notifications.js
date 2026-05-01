// client/js/notifications.js
'use strict';

console.log('🚀 NOTIFICATIONS.JS - INICIO');

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
    info: `<svg width="24" height="24" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="50" height="50" rx="25" fill="white"/>
            <path d="M27 22H23V40H27V22Z" fill="#006CE3"/>
            <path d="M25 18C24.2089 18 23.4355 17.7654 22.7777 17.3259C22.1199 16.8864 21.6072 16.2616 21.3045 15.5307C21.0017 14.7998 20.9225 13.9956 21.0769 13.2196C21.2312 12.4437 21.6122 11.731 22.1716 11.1716C22.731 10.6122 23.4437 10.2312 24.2196 10.0769C24.9956 9.92252 25.7998 10.0017 26.5307 10.3045C27.2616 10.6072 27.8864 11.1199 28.3259 11.7777C28.7654 12.4355 29 13.2089 29 14C29 15.0609 28.5786 16.0783 27.8284 16.8284C27.0783 17.5786 26.0609 18 25 18V18Z" fill="#006CE3"/>
          </svg>`,
    warning: `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill="#EF9400" d="M449.07,399.08,278.64,82.58c-12.08-22.44-44.26-22.44-56.35,0L51.87,399.08A32,32,0,0,0,80,446.25H420.89A32,32,0,0,0,449.07,399.08Zm-198.6-1.83a20,20,0,1,1,20-20A20,20,0,0,1,250.47,397.25ZM272.19,196.1l-5.74,122a16,16,0,0,1-32,0l-5.74-121.95v0a21.73,21.73,0,0,1,21.5-22.69h.21a21.74,21.74,0,0,1,21.73,22.7Z"/>
              </svg>`,
    danger: `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
               <path fill="#EC4D2B" d="M449.07,399.08,278.64,82.58c-12.08-22.44-44.26-22.44-56.35,0L51.87,399.08A32,32,0,0,0,80,446.25H420.89A32,32,0,0,0,449.07,399.08Zm-198.6-1.83a20,20,0,1,1,20-20A20,20,0,0,1,250.47,397.25ZM272.19,196.1l-5.74,122a16,16,0,0,1-32,0l-5.74-121.95v0a21.73,21.73,0,0,1,21.5-22.69h.21a21.74,21.74,0,0,1,21.73,22.7Z"/>
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

  function showCastigoDialog(card, onYes, onNo, options = {}) {
  const {
    confirmText = 'SÍ, CASTIGARME',
    cancelText = 'NO',
    type = 'warning'  // usa 'warning' para amarillo, 'danger' para rojo, 'success' para verde
  } = options;

  let cardPreviewHtml = '';
  if (card) {
    const cardValue = card.valor;
    const cardSuit = card.palo || '';
    const isRed = cardSuit === '♥' || cardSuit === '♦';
    cardPreviewHtml = `
      <div style="text-align:center;margin:0 0 0.5rem 0;">
        <div style="
          background: linear-gradient(160deg, #fffbf2, #f5ead8);
          color: ${isRed ? '#b83030' : '#111'};
          font-size: 1rem;
          font-weight: bold;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 14px;
          min-width: 70px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          border: 1px solid rgba(200,160,69,0.2);
        ">
          ${cardValue}<span style="font-size:1.2rem">${cardSuit}</span>
        </div>
      </div>
    `;
  }

  // Crear el contenedor del diálogo
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 10001;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
  `;

  // Usar la misma estructura .alert del diseño original
  overlay.innerHTML = `
    <div class="alert ${type}" style="
      flex-direction: column;
      min-width: 320px;
      max-width: 380px;
      background-color: ${type === 'warning' ? 'rgba(239, 148, 0, 0.2)' : 
                         type === 'danger' ? 'rgba(236, 77, 43, 0.2)' : 
                         'rgba(62, 189, 97, 0.2)'};
      border: 2px solid ${type === 'warning' ? '#EF9400' : 
                         type === 'danger' ? '#EC4D2B' : '#3ebd61'};
      margin: 0;
      animation: dialogPopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    ">
      <div class="content" style="width: 100%; justify-content: center; margin-bottom: 12px;">
        <div class="icon" style="
          background-color: ${type === 'warning' ? '#EF9400' : 
                           type === 'danger' ? '#EC4D2B' : '#3ebd61'};
        ">
          ${type === 'success' ? `<svg width="40" height="40" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><circle fill="#fff" cx="64" cy="64" r="64"/><path fill="#3EBD61" d="M54.3,97.2L24.8,67.7c-0.4-0.4-0.4-1,0-1.4l8.5-8.5c0.4-0.4,1-0.4,1.4,0L55,78.1l38.2-38.2c0.4-0.4,1-0.4,1.4,0l8.5,8.5c0.4,0.4,0.4,1,0,1.4L55.7,97.2C55.3,97.6,54.7,97.6,54.3,97.2z"/></svg>` :
           type === 'info' ? `<svg width="40" height="40" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="50" height="50" rx="25" fill="white"/><path d="M27 22H23V40H27V22Z" fill="#006CE3"/><path d="M25 18C24.2089 18 23.4355 17.7654 22.7777 17.3259C22.1199 16.8864 21.6072 16.2616 21.3045 15.5307C21.0017 14.7998 20.9225 13.9956 21.0769 13.2196C21.2312 12.4437 21.6122 11.731 22.1716 11.1716C22.731 10.6122 23.4437 10.2312 24.2196 10.0769C24.9956 9.92252 25.7998 10.0017 26.5307 10.3045C27.2616 10.6072 27.8864 11.1199 28.3259 11.7777C28.7654 12.4355 29 13.2089 29 14C29 15.0609 28.5786 16.0783 27.8284 16.8284C27.0783 17.5786 26.0609 18 25 18V18Z" fill="#006CE3"/></svg>` :
           type === 'warning' ? `<svg height="40" viewBox="0 0 512 512" width="40" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M449.07,399.08,278.64,82.58c-12.08-22.44-44.26-22.44-56.35,0L51.87,399.08A32,32,0,0,0,80,446.25H420.89A32,32,0,0,0,449.07,399.08Zm-198.6-1.83a20,20,0,1,1,20-20A20,20,0,0,1,250.47,397.25ZM272.19,196.1l-5.74,122a16,16,0,0,1-32,0l-5.74-121.95v0a21.73,21.73,0,0,1,21.5-22.69h.21a21.74,21.74,0,0,1,21.73,22.7Z"/></svg>` :
           `<svg height="40" viewBox="0 0 512 512" width="40" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M449.07,399.08,278.64,82.58c-12.08-22.44-44.26-22.44-56.35,0L51.87,399.08A32,32,0,0,0,80,446.25H420.89A32,32,0,0,0,449.07,399.08Zm-198.6-1.83a20,20,0,1,1,20-20A20,20,0,0,1,250.47,397.25ZM272.19,196.1l-5.74,122a16,16,0,0,1-32,0l-5.74-121.95v0a21.73,21.73,0,0,1,21.5-22.69h.21a21.74,21.74,0,0,1,21.73,22.7Z"/></svg>`}
        </div>
        <div style="text-align: center;">
          <p style="font-weight: 600; margin-bottom: 4px;">¿Te castigas?</p>
          <p style="font-size: 0.8rem;">Recibirás la carta del fondo y robarás una extra</p>
          ${cardPreviewHtml}
        </div>
      </div>
      <div style="display: flex; gap: 12px; width: 100%; justify-content: center; margin-top: 8px;">
        <button class="action-btn action-btn-warning" data-value="yes" style="padding: 8px 20px;">${confirmText}</button>
        <button class="action-btn action-btn-danger" data-value="no" style="padding: 8px 20px;">${cancelText}</button>
      </div>
      <button class="close" style="position: absolute; top: 8px; right: 8px;" data-value="close">
        <svg height="16px" viewBox="0 0 512 512" width="16px" xmlns="http://www.w3.org/2000/svg">
          <path fill="#69727D" d="M437.5,386.6L306.9,256l130.6-130.6c14.1-14.1,14.1-36.8,0-50.9c-14.1-14.1-36.8-14.1-50.9,0L256,205.1L125.4,74.5c-14.1-14.1-36.8-14.1-50.9,0c-14.1,14.1-14.1,36.8,0,50.9L205.1,256L74.5,386.6c-14.1,14.1-14.1,36.8,0,50.9c14.1,14.1,36.8,14.1,50.9,0L256,306.9l130.6,130.6c14.1,14.1,36.8,14.1,50.9,0C451.5,423.4,451.5,400.6,437.5,386.6z"/>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  const handleClick = (e) => {
    const value = e.currentTarget.getAttribute('data-value');
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s';
    setTimeout(() => overlay.remove(), 200);
    if (value === 'yes' && onYes) onYes();
    if (value === 'no' && onNo) onNo();
  };

  overlay.querySelectorAll('[data-value]').forEach(btn => btn.addEventListener('click', handleClick));
}

  // 🎯 Diálogo genérico con dos botones (para cualquier confirmación)
  function showConfirmDialog(message, onConfirm, onCancel, options = {}) {
    const {
      confirmText = 'Confirmar',
      cancelText = 'Cancelar',
      confirmColor = 'warning',
      cancelColor = 'secondary',
      title = 'Confirmar acción',
      icon = 'warning'
    } = options;

    const confirmBtnClass = confirmColor === 'warning' ? 'btn-dialog-warning' : 
                           (confirmColor === 'success' ? 'btn-dialog-success' : 
                           (confirmColor === 'danger' ? 'btn-dialog-danger' : 'btn-dialog-primary'));
    const cancelBtnClass = cancelColor === 'danger' ? 'btn-dialog-danger' : 
                          (cancelColor === 'warning' ? 'btn-dialog-warning' : 'btn-dialog-secondary');

    const overlay = document.createElement('div');
    overlay.className = 'modern-dialog-overlay';
    overlay.innerHTML = `
      <div class="modern-dialog">
        <div class="modern-dialog-header">
          <div class="dialog-icon">${ICONS[icon] || ICONS.warning}</div>
          <h3>${title}</h3>
        </div>
        <div class="modern-dialog-content">
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="modern-dialog-buttons">
          <button class="${confirmBtnClass}" data-value="confirm">${confirmText}</button>
          <button class="${cancelBtnClass}" data-value="cancel">${cancelText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 10);

    const handleClick = (e) => {
      const value = e.currentTarget.getAttribute('data-value');
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      if (value === 'confirm' && onConfirm) onConfirm();
      if (value === 'cancel' && onCancel) onCancel();
    };

    overlay.querySelectorAll('button').forEach(btn => btn.addEventListener('click', handleClick));
  }

  function success(message, duration) { return show(message, 'success', duration); }
  function info(message, duration)    { return show(message, 'info',    duration); }
  function warning(message, duration) { return show(message, 'warning', duration); }
  function danger(message, duration)  { return show(message, 'danger',  duration); }

  return {
    show, success, info, warning, danger,
    showCastigoDialog,
    showConfirmDialog
  };
})();

window.Notify = NotificationSystem;

console.log('✅ notifications.js cargado correctamente');