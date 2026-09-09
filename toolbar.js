/* Local SVG controls: no network, fonts, framework, or document data changes. */
(() => {
  const icons = {
    duplicate: '<rect class="copy-back" x="4" y="4" width="12" height="12" rx="2"/><rect class="copy-front" x="8" y="8" width="12" height="12" rx="2"/>',
    lock: '<path class="lock-shackle" d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M12 15v2"/>',
    group: '<rect class="group-left" x="5" y="5" width="9" height="9" rx="1"/><rect class="group-right" x="10" y="10" width="9" height="9" rx="1"/><path class="group-frame" d="M3 7V3h4m10 0h4v4m0 10v4h-4M7 21H3v-4"/>',
    ungroup: '<rect class="ungroup-left" x="3" y="3" width="7" height="7" rx="1"/><rect class="ungroup-right" x="14" y="14" width="7" height="7" rx="1"/><path d="m14 9 5-5m-4 0h4v4M9 14l-5 5m0-4v4h4"/>',
    bold: '<path d="M6 12h7a4 4 0 0 1 0 8H6V4h6a4 4 0 0 1 0 8"/>',
    italic: '<path d="M10 4h9M5 20h9M15 4 9 20"/>',
    underline: '<path d="M6 4v7a6 6 0 0 0 12 0V4M4 21h16"/>',
    left: '<path d="M3 3v18"/><rect x="7" y="5" width="14" height="5" rx="1"/><rect x="7" y="14" width="9" height="5" rx="1"/>',
    center: '<path d="M12 2v20"/><rect x="3" y="5" width="18" height="5" rx="1"/><rect x="7" y="14" width="10" height="5" rx="1"/>',
    right: '<path d="M21 3v18"/><rect x="3" y="5" width="14" height="5" rx="1"/><rect x="8" y="14" width="9" height="5" rx="1"/>',
    top: '<path d="M3 3h18"/><rect x="5" y="7" width="5" height="14" rx="1"/><rect x="14" y="7" width="5" height="9" rx="1"/>',
    middle: '<path d="M2 12h20"/><rect x="5" y="3" width="5" height="18" rx="1"/><rect x="14" y="7" width="5" height="10" rx="1"/>',
    bottom: '<path d="M3 21h18"/><rect x="5" y="3" width="5" height="14" rx="1"/><rect x="14" y="8" width="5" height="9" rx="1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7" r=".8" fill="currentColor" stroke="none"/>',
    textLeft: '<path d="M4 5h16M4 10h10M4 15h16M4 20h10"/>',
    textCenter: '<path d="M4 5h16M7 10h10M4 15h16M7 20h10"/>',
    textRight: '<path d="M4 5h16M10 10h10M4 15h16M10 20h10"/>',
    editText: '<path d="M4 5h10M9 5v15M5 20h8m2-5 5-5 2 2-5 5-3 1z"/>',
    deleteSelection: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    crop: '<path d="M6 3v15h15M3 6h15v15"/>',
    flip: '<path d="M12 3v2m0 4v2m0 4v2m0 4v1M3 7l5 5-5 5zm18 0-5 5 5 5z"/>',
    raise: '<path d="m6 10 6-6 6 6M12 4v12M4 21h16"/>',
    lower: '<path d="m6 14 6 6 6-6M12 20V8M4 3h16"/>'
  };
  function icon(name) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('focusable', 'false');
    el.classList.add('control-icon');
    el.innerHTML = icons[name] || icons.group;
    return el;
  }
  function decorate(button, name, label, iconOnly = false) {
    button.classList.add('icon-control');
    button.dataset.icon = name;
    button.replaceChildren(icon(name));
    const text = document.createElement('span');
    text.className = 'control-label' + (iconOnly ? ' sr-only' : '');
    text.textContent = label;
    button.append(text);
    button.setAttribute('aria-label', label);
    if (iconOnly) { button.dataset.help = label; button.removeAttribute('title'); }
    else { delete button.dataset.help; button.removeAttribute('title'); }
  }
  document.querySelectorAll('.info-button').forEach(button => button.replaceChildren(icon('info')));
  const labels = {bold:'加粗',italic:'斜体',underline:'下划线',raise:'上移一层',lower:'下移一层',editText:'编辑文字'};
  document.querySelectorAll('#propertiesPanel [data-action]').forEach(button => {
    const action = button.dataset.action;
    if (icons[action]) decorate(button, action, labels[action] || button.textContent.trim(), (!!labels[action] && action !== 'editText'));
  });
  document.querySelectorAll('[data-align]').forEach(button => decorate(button, button.dataset.align, button.textContent.trim(), false));
  document.querySelectorAll('[data-text-align]').forEach(button => {
    const key = button.dataset.textAlign;
    decorate(button, 'text' + key[0].toUpperCase() + key.slice(1), button.getAttribute('aria-label'), true);
  });
  icons.pageLeft='<path d="m10 5-7 7 7 7M3 12h18"/>';
  icons.pageRight='<path d="m14 5 7 7-7 7M3 12h18"/>';
  const pageIcons={duplicatePage:['duplicate','复制页'],deletePage:['deleteSelection','删除页'],pageLeft:['pageLeft','页面前移'],pageRight:['pageRight','页面后移']};
  document.querySelectorAll('.page-actions [data-action]').forEach(button=>{
    const [name,label]=pageIcons[button.dataset.action];decorate(button,name,label,true);
  });
  const timers = new WeakMap();
  function feedback(button) {
    // Called only after a completed operation, never on pointer-down or rejection.
    if (!button || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    clearTimeout(timers.get(button));
    button.classList.remove('is-feedback');
    void button.offsetWidth;
    button.classList.add('is-feedback');
    timers.set(button, setTimeout(() => button.classList.remove('is-feedback'), 280));
  }
  function label(button, text) {
    button.querySelector('.control-label').textContent = text;
    button.setAttribute('aria-label', text);
    if(button.querySelector('.control-label').classList.contains('sr-only')) button.dataset.help = text;
    else delete button.dataset.help;
    button.removeAttribute('title');
  }
  // A viewport-level tooltip never gets clipped by the inspector's scroll area.
  const tooltip = document.createElement('div');
  tooltip.id = 'controlTooltip'; tooltip.role = 'tooltip'; tooltip.hidden = true;
  document.body.append(tooltip);
  let tooltipOwner = null, pinned = false, hoverTimer;
  function hideTooltip() {
    clearTimeout(hoverTimer);
    tooltipOwner?.removeAttribute('aria-describedby');
    tooltipOwner = null; pinned = false; tooltip.hidden = true;
  }
  function positionTooltip() {
    if (!tooltipOwner) return;
    const rect = tooltipOwner.getBoundingClientRect(), vv = window.visualViewport;
    const left = vv?.offsetLeft || 0, top = vv?.offsetTop || 0;
    const width = vv?.width || innerWidth, height = vv?.height || innerHeight;
    tooltip.style.maxWidth = Math.max(100, Math.min(280, width - 16)) + 'px';
    const tip = tooltip.getBoundingClientRect();
    let x = rect.left + rect.width / 2 - tip.width / 2;
    let y = rect.bottom + 8;
    const panel = tooltipOwner.closest('.panel')?.getBoundingClientRect();
    if (width > 760 && panel && panel.left >= tip.width + 16) {
      x = panel.left - tip.width - 8; y = rect.top + (rect.height - tip.height) / 2;
    }
    if (y + tip.height > top + height - 8) y = rect.top - tip.height - 8;
    tooltip.style.left = Math.max(left + 8, Math.min(x, left + width - tip.width - 8)) + 'px';
    tooltip.style.top = Math.max(top + 8, Math.min(y, top + height - tip.height - 8)) + 'px';
  }
  function showTooltip(owner) {
    if (!owner.dataset.help) return;
    if (tooltipOwner !== owner) hideTooltip();
    tooltipOwner = owner; tooltip.textContent = owner.dataset.help; tooltip.hidden = false;
    tooltip.style.pointerEvents = owner.classList.contains('info-button') ? 'auto' : 'none';
    owner.setAttribute('aria-describedby', tooltip.id); positionTooltip();
  }
  document.addEventListener('pointerover', e => {
    const owner = e.target.closest('[data-help]');
    if (!owner || e.pointerType !== 'mouse' || pinned) return;
    clearTimeout(hoverTimer); hoverTimer = setTimeout(() => showTooltip(owner), 130);
  });
  document.addEventListener('pointerout', e => {
    if (pinned || (e.relatedTarget && (tooltip.contains(e.relatedTarget) || tooltipOwner?.contains(e.relatedTarget)))) return;
    if (e.target.closest('[data-help]') || tooltip.contains(e.target)) {
      clearTimeout(hoverTimer); hoverTimer = setTimeout(hideTooltip, 100);
    }
  });
  tooltip.addEventListener('pointerenter', () => clearTimeout(hoverTimer));
  document.addEventListener('focusin', e => {
    const owner = e.target.closest('[data-help]');
    if (owner) showTooltip(owner); else hideTooltip();
  });
  document.addEventListener('pointerdown', e => {
    const owner = e.target.closest('[data-help]');
    if (!owner && !tooltip.contains(e.target)) hideTooltip();
    // Info/help is read-only: keep the current Fabric text selection and caret.
    if (owner?.classList.contains('info-button')) e.preventDefault();
  }, true);
  document.addEventListener('click', e => {
    const owner = e.target.closest('.info-button');
    if (!owner) return;
    if (e.pointerType === 'mouse' || (!e.pointerType && matchMedia('(hover: hover)').matches)) return;
    if (tooltipOwner === owner && pinned) hideTooltip();
    else { showTooltip(owner); pinned = true; }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && tooltipOwner) { hideTooltip(); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
  window.visualViewport?.addEventListener('resize', hideTooltip);
  window.TooltipUI = {close: hideTooltip};
  window.ToolbarUI = {icon, feedback, label};
})();
