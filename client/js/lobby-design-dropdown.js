        // Dropdown de diseño de cartas
function toggleDesignMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('design-dropdown-menu');
    if (!menu) return;
    
    // Cerrar si está abierto, abrir si está cerrado
    if (menu.classList.contains('show')) {
        menu.classList.remove('show');
    } else {
        // Cerrar cualquier otro dropdown abierto
        document.querySelectorAll('.design-dropdown-menu.show').forEach(m => {
            if (m !== menu) m.classList.remove('show');
        });
        menu.classList.add('show');
        
        // Opcional: asegurar que el menú sea visible (scroll si es necesario)
        const rect = menu.getBoundingClientRect();
        if (rect.top < 0) {
            // Si se sale por arriba, ajustar posición
            menu.style.bottom = 'auto';
            menu.style.top = 'calc(100% + 5px)';
        } else {
            menu.style.bottom = 'calc(100% + 5px)';
            menu.style.top = 'auto';
        }
    }
}

function selectDesign(design, icon, name) {
    // Cerrar menú
    const menu = document.getElementById('design-dropdown-menu');
    if (menu) menu.classList.remove('show');
    
    // Actualizar botón
    const iconSpan = document.getElementById('current-design-icon');
    const nameSpan = document.getElementById('current-design-name');
    if (iconSpan) iconSpan.textContent = icon;
    if (nameSpan) nameSpan.textContent = name;
    
    // Marcar opción activa
    document.querySelectorAll('.design-option').forEach(opt => {
        opt.classList.remove('active');
    });
    const activeOpt = document.querySelector(`.design-option[data-design="${design}"]`);
    if (activeOpt) activeOpt.classList.add('active');
    
    // Guardar en localStorage
    localStorage.setItem('cardDesign', design);
    
    // Llamar a la función de lobby.js si existe
    if (typeof window.setDesign === 'function') {
        window.setDesign(design);
    }
    
    // Mostrar notificación
    if (typeof Notify !== 'undefined') {
        Notify.success(`Diseño cambiado a ${name}`);
    }
}

// Cerrar dropdown al hacer clic fuera
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('design-dropdown-menu');
    const btn = document.getElementById('design-dropdown-btn');
    if (dropdown && dropdown.classList.contains('show')) {
        if (!btn?.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    }
});

// Inicializar diseño guardado al cargar
document.addEventListener('DOMContentLoaded', function() {
    const saved = localStorage.getItem('cardDesign');
    let icon = '💀', name = 'México (Día de Muertos)';
    
    if (!saved || saved === 'mexico') {
        // Migrar o default
        localStorage.setItem('cardDesign', 'mexico_dm');
    }
    
    const currentDesign = localStorage.getItem('cardDesign') || 'mexico_dm';
    
    switch(currentDesign) {
        case 'default': icon = '🃏'; name = 'Predeterminado'; break;
        case 'usa': icon = '🇺🇸'; name = 'Estados Unidos'; break;
        case 'mexico_dm': icon = '💀'; name = 'México (Día de Muertos)'; break;
        case 'mexico_mundial': icon = '🌎'; name = 'México (Mundial)'; break;
    }
    
    const iconSpan = document.getElementById('current-design-icon');
    const nameSpan = document.getElementById('current-design-name');
    if (iconSpan) iconSpan.textContent = icon;
    if (nameSpan) nameSpan.textContent = name;
    
    const activeOpt = document.querySelector(`.design-option[data-design="${currentDesign}"]`);
    if (activeOpt) activeOpt.classList.add('active');
});


document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('design-dropdown-btn')?.addEventListener('click', toggleDesignMenu);

  document.querySelectorAll('.design-option[data-design]').forEach(function (option) {
    option.addEventListener('click', function () {
      const icon = option.querySelector('span:first-child')?.textContent || '';
      const name = Array.from(option.childNodes)
        .filter(function (node) { return node.nodeType === Node.TEXT_NODE; })
        .map(function (node) { return node.textContent; })
        .join(' ')
        .trim();
      selectDesign(option.dataset.design, icon, name);
    });
  });
});
