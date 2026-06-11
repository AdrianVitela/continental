'use strict';

const CARD_DESIGNS = [
  {
    id: 'mexico_dm',
    name: 'México (Día de Muertos)',
    tag: 'Edición especial',
    cards: ['A', 'K', 'Q'],
    accent: '#f05a28',
    secondary: '#18a999',
    ink: '#fff6e8',
    surface: '#24111b',
    theme: {
      primary: '#168447',
      secondary: '#d12b3a',
      bright: '#52d884',
      background: '#020d08',
      panel: '#062113'
    }
  },
  {
    id: 'mexico_mundial',
    name: 'México (Mundial)',
    tag: 'Rumbo al torneo',
    cards: ['10', 'J', 'A'],
    accent: '#12a150',
    secondary: '#d3222a',
    ink: '#ffffff',
    surface: '#0f3022',
    theme: {
      primary: '#168447',
      secondary: '#d12b3a',
      bright: '#52d884',
      background: '#020d08',
      panel: '#062113'
    }
  },
  {
    id: 'canada',
    name: 'Canada',
    tag: 'Mundial 2026',
    cards: ['A', 'Q', '10'],
    accent: '#d71920',
    secondary: '#ffffff',
    ink: '#1d1d1f',
    surface: '#f7f7f5',
    theme: {
      primary: '#d52b3a',
      secondary: '#f4f4f1',
      bright: '#ff6974',
      background: '#160507',
      panel: '#2a0a0e'
    }
  },
  {
    id: 'usa',
    name: 'Estados Unidos',
    tag: 'Nueva edición',
    cards: ['K', 'J', '9'],
    accent: '#1f4fa3',
    secondary: '#c62838',
    ink: '#ffffff',
    surface: '#14213d',
    theme: {
      primary: '#2f69bf',
      secondary: '#c83246',
      bright: '#73a9f4',
      background: '#050b18',
      panel: '#0c1c38'
    }
  },
  {
    id: 'default',
    name: 'Clásico',
    tag: 'Mesa tradicional',
    cards: ['A', '7', 'J'],
    accent: '#198754',
    secondary: '#ce2b37',
    ink: '#17301f',
    surface: '#f7f7f2',
    theme: {
      primary: '#198754',
      secondary: '#ce2b37',
      bright: '#58d58b',
      background: '#031109',
      panel: '#0a2818'
    }
  }
];

window.CARD_DESIGNS = CARD_DESIGNS;

function normalizeDesign(design) {
  if (!design || design === 'mexico') return 'mexico_dm';
  return CARD_DESIGNS.some(item => item.id === design) ? design : 'mexico_dm';
}

function getDesignMeta(design) {
  const normalized = normalizeDesign(design);
  return CARD_DESIGNS.find(item => item.id === normalized) || CARD_DESIGNS[0];
}

function setPreviewVars(el, meta) {
  if (!el || !meta) return;
  el.style.setProperty('--design-accent', meta.accent);
  el.style.setProperty('--design-secondary', meta.secondary);
  el.style.setProperty('--design-ink', meta.ink);
  el.style.setProperty('--design-surface', meta.surface);
}

function applyLobbyTheme(meta) {
  if (!meta?.theme) return;
  const root = document.documentElement;
  root.dataset.cardTheme = meta.id;
  root.style.setProperty('--theme-primary', meta.theme.primary);
  root.style.setProperty('--theme-secondary', meta.theme.secondary);
  root.style.setProperty('--theme-bright', meta.theme.bright);
  root.style.setProperty('--theme-bg', meta.theme.background);
  root.style.setProperty('--theme-panel', meta.theme.panel);
}

function previewHTML(meta) {
  return `
    <span class="design-mini-card c1">${meta.cards[0]}</span>
    <span class="design-mini-card c2">${meta.cards[1]}</span>
    <span class="design-mini-card c3">${meta.cards[2]}</span>
  `;
}

function renderDesignOptions() {
  const menu = document.getElementById('design-dropdown-menu');
  if (!menu) return;

  menu.innerHTML = CARD_DESIGNS.map(meta => `
    <button class="design-option" type="button" data-design="${meta.id}">
      <span class="design-option-preview">${previewHTML(meta)}</span>
      <span class="design-option-copy">
        <span class="design-option-name">${meta.name}</span>
        <span class="design-option-tag">${meta.tag}</span>
      </span>
      <span class="design-check" aria-hidden="true">OK</span>
    </button>
  `).join('');

  CARD_DESIGNS.forEach(meta => {
    document.querySelectorAll(`[data-design="${meta.id}"]`).forEach(option => setPreviewVars(option, meta));
  });

  document.querySelectorAll('.design-option[data-design]').forEach(option => {
    option.addEventListener('click', () => selectDesign(option.dataset.design));
  });
}

function prepareCurrentButtonDOM() {
  const btn = document.getElementById('design-dropdown-btn');
  const preview = document.getElementById('current-design-preview');
  const name = document.getElementById('current-design-name');
  const tag = document.getElementById('current-design-tag');
  const arrow = btn?.querySelector('.design-dropdown-arrow');
  if (!btn || !preview || !name || !tag || !arrow) return;

  let copy = btn.querySelector('.design-current-copy');
  if (!copy) {
    copy = document.createElement('span');
    copy.className = 'design-current-copy';
  }

  copy.appendChild(name);
  copy.appendChild(tag);
  btn.insertBefore(copy, arrow);
  arrow.textContent = 'v';
  btn.appendChild(arrow);
}

function applyDesignToSelector(design) {
  const meta = getDesignMeta(design);
  const currentDesign = meta.id;
  const nameSpan = document.getElementById('current-design-name');
  const tagSpan = document.getElementById('current-design-tag');
  const preview = document.getElementById('current-design-preview');
  const btn = document.getElementById('design-dropdown-btn');

  if (nameSpan) nameSpan.textContent = meta.name;
  if (tagSpan) tagSpan.textContent = meta.tag;
  if (preview) {
    preview.innerHTML = previewHTML(meta);
    setPreviewVars(preview, meta);
  }
  if (btn) setPreviewVars(btn, meta);
  applyLobbyTheme(meta);

  document.querySelectorAll('.design-option[data-design]').forEach(option => {
    option.classList.toggle('active', option.dataset.design === currentDesign);
  });

  return meta;
}

function toggleDesignMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('design-dropdown-menu');
  const btn = document.getElementById('design-dropdown-btn');
  if (!menu || !btn) return;

  const willOpen = !menu.classList.contains('show');
  document.querySelectorAll('.design-dropdown-menu.show').forEach(openMenu => {
    if (openMenu !== menu) openMenu.classList.remove('show');
  });

  menu.classList.toggle('show', willOpen);
  btn.classList.toggle('open', willOpen);
  btn.setAttribute('aria-expanded', String(willOpen));

  if (willOpen) {
    const rect = menu.getBoundingClientRect();
    if (rect.top < 8) {
      menu.style.bottom = 'auto';
      menu.style.top = 'calc(100% + 8px)';
    } else {
      menu.style.bottom = 'calc(100% + 8px)';
      menu.style.top = 'auto';
    }
  }
}

function selectDesign(design) {
  const normalized = normalizeDesign(design);
  localStorage.setItem('cardDesign', normalized);
  const meta = applyDesignToSelector(normalized);

  const menu = document.getElementById('design-dropdown-menu');
  const btn = document.getElementById('design-dropdown-btn');
  if (menu) menu.classList.remove('show');
  if (btn) {
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  if (typeof window.setDesign === 'function') {
    window.setDesign(normalized, { silent: true });
  }

  if (typeof Notify !== 'undefined') {
    Notify.success(`Diseño cambiado a ${meta.name}`);
  }
}

document.addEventListener('click', event => {
  const dropdown = document.getElementById('design-dropdown-menu');
  const btn = document.getElementById('design-dropdown-btn');
  if (dropdown && dropdown.classList.contains('show')) {
    if (!btn?.contains(event.target) && !dropdown.contains(event.target)) {
      dropdown.classList.remove('show');
      btn?.classList.remove('open');
      btn?.setAttribute('aria-expanded', 'false');
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  prepareCurrentButtonDOM();
  renderDesignOptions();

  const saved = normalizeDesign(localStorage.getItem('cardDesign'));
  localStorage.setItem('cardDesign', saved);
  applyDesignToSelector(saved);

  document.getElementById('design-dropdown-btn')?.addEventListener('click', toggleDesignMenu);
});

window.applyCardDesign = applyDesignToSelector;
window.selectDesign = selectDesign;
