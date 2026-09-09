/* UI-only tabs and interruptible mobile sheets. Never serializes into a document. */
(() => {
  const mobile = matchMedia('(max-width: 760px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const panels = [...document.querySelectorAll('.panel')];
  const dock = document.querySelector('.mobile-dock');
  const backdrop = document.createElement('button');
  backdrop.id = 'sheetBackdrop'; backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', '关闭工具面板'); backdrop.setAttribute('aria-hidden', 'true');
  document.body.append(backdrop);
  let active = null, detent = 'half', phase = 'closed', animation = null, revision = 0;
  let returnFocus = null, drag = null, suppressClickUntil = 0, closingRestoreFocus = true;
  let fullHeight = 0, halfHeight = 0;
  let activeEntry = null;
  const entries = {elements:'showElements',templates:'showTemplates',backgrounds:'showBackgrounds',properties:'showProperties'};
  function syncEntries(){
    for(const [key,action] of Object.entries(entries)){
      const button=dock.querySelector('[data-action="'+action+'"]');
      const selected=!!active&&phase!=='closing'&&activeEntry===key;
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-expanded',String(selected));
      button.setAttribute('aria-controls',key==='properties'?'propertiesPanel':'assetsPanel');
    }
  }
  function toggle(id,entry){
    if(!mobile.matches)return;
    if(activeEntry===entry&&active&&phase!=='closing'){close();return;}
    activeEntry=entry;
    open(id,dock.querySelector('[data-action="'+entries[entry]+'"]'));
    syncEntries();
  }

  function inspectorTab(name, focus = false) {
    for (const tab of document.querySelectorAll('[data-inspector-tab]')) {
      const selected = tab.dataset.inspectorTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      if (selected && focus) tab.focus({preventScroll: true});
    }
    window.TooltipUI.close();
  }
  document.querySelectorAll('[data-inspector-tab]').forEach(tab => {
    tab.addEventListener('click', () => inspectorTab(tab.dataset.inspectorTab));
    tab.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const next = e.key === 'Home' ? 'attributes' : e.key === 'End' ? 'layers' :
        tab.dataset.inspectorTab === 'attributes' ? 'layers' : 'attributes';
      inspectorTab(next, true);
    });
  });

  function offset() { return detent === 'half' ? fullHeight - halfHeight : 0; }
  function transformAt(y) { return 'translateY(' + y + 'px)'; }
  function currentTransform() { return active ? getComputedStyle(active).transform : transformAt(0); }
  function stopAnimation() {
    const current = currentTransform();
    if (animation) { animation.cancel(); animation = null; }
    return current;
  }
  function availability(blocked) {
    document.querySelector('.studio').inert = blocked;
    document.querySelector('.topbar').inert = blocked;
    panels.forEach(panel => { panel.inert = mobile.matches && panel !== active; });
  }
  function sizes() {
    const vv = visualViewport;
    const viewportHeight = vv?.height || innerHeight;
    const keyboard = Math.max(0, innerHeight - viewportHeight - (vv?.offsetTop || 0));
    document.documentElement.style.setProperty('--keyboard-offset', keyboard + 'px');
    const room = Math.max(120, viewportHeight - dock.getBoundingClientRect().height - 8);
    fullHeight = Math.round(room * .85);
    halfHeight = Math.round(room * .5);
  }
  function layout() {
    if (!active) return;
    active.style.setProperty('--sheet-full-height', fullHeight + 'px');
    active.style.setProperty('--sheet-hidden-height', offset() + 'px');
    active.dataset.detent = detent;
    const grabber = active.querySelector('.sheet-grabber');
    grabber.setAttribute('aria-label', detent === 'half' ? '展开工具面板' : '收起至半屏');
    grabber.setAttribute('aria-expanded', String(detent === 'expanded'));
  }
  function tween(from, to, duration, finished) {
    const token = ++revision;
    active.style.transform = to;
    if (reduced.matches) { finished?.(); return; }
    animation = active.animate([{transform: from}, {transform: to}], {
      duration, easing: phase === 'closing' ? 'cubic-bezier(.4,0,1,1)' : 'cubic-bezier(.2,.85,.25,1.04)'
    });
    animation.finished.then(() => {
      if (token !== revision) return;
      animation = null; finished?.();
    }).catch(() => {}); // Cancellation is an expected transition, not a failed action.
  }
  function unmount(panel) {
    panel.classList.remove('open', 'sheet-mounted');
    panel.style.removeProperty('transform');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-labelledby');
    panel.inert = mobile.matches;
  }
  function open(id, trigger = document.activeElement) {
    if (!mobile.matches) return;
    const next = document.getElementById(id);
    if (!next) return;
    window.TooltipUI.close();
    const wasActive = active, wasClosing = phase === 'closing', wasOpening = phase === 'opening';
    const from = stopAnimation();
    ++revision; drag = null;
    if (!wasActive) {
      detent = 'half'; returnFocus = trigger;
    } else if (trigger && !wasActive.contains(trigger) && trigger !== document.body) {
      returnFocus = trigger;
    }
    if (wasActive && wasActive !== next) unmount(wasActive);
    active = next; phase = 'opening'; sizes();
    active.classList.add('open', 'sheet-mounted');
    active.setAttribute('role', 'dialog');
    active.setAttribute('aria-labelledby', active.querySelector('h2').id);
    active.inert = false; layout(); availability(true);
    backdrop.classList.add('visible');
    backdrop.setAttribute('aria-hidden', 'false');
    const target = transformAt(offset());
    if (wasActive && !wasClosing && !wasOpening) {
      active.style.transform = target; phase = 'open';
    } else {
      tween(wasActive ? from : transformAt(fullHeight + 24), target, 280, () => { phase = 'open'; });
    }
    // When editing text, leave its caret intact for formatting in the property sheet.
    if (!document.activeElement?.matches('textarea[data-fabric="textarea"]')) {
      active.querySelector('.sheet-grabber').focus({preventScroll: true});
    }
  }
  function close({restoreFocus = true, immediate = false} = {}) {
    window.TooltipUI.close();
    if (!active) return;
    const panel = active, from = stopAnimation();
    ++revision; drag = null; phase = 'closing'; closingRestoreFocus = restoreFocus; panel.classList.remove('open');
    syncEntries();
    backdrop.classList.remove('visible'); backdrop.setAttribute('aria-hidden', 'true');
    const finish = () => {
      unmount(panel); active = null; activeEntry=null; phase = 'closed'; availability(false);syncEntries();
      if (restoreFocus && returnFocus?.isConnected && !returnFocus.closest('.panel')) returnFocus.focus({preventScroll: true});
      returnFocus = null;
    };
    if (immediate || !mobile.matches) finish();
    else tween(from, transformAt(fullHeight + 24), 220, finish);
  }
  function settle(next) {
    if (!active) return;
    const from = stopAnimation();
    ++revision; detent = next; layout(); phase = 'opening';
    tween(from, transformAt(offset()), 280, () => { phase = 'open'; });
  }
  function resize() {
    if (!mobile.matches) {
      close({restoreFocus: false, immediate: true});
      panels.forEach(panel => { panel.inert = false; });
      document.documentElement.style.removeProperty('--keyboard-offset');
      return;
    }
    sizes();
    if (!active) { availability(false); return; }
    if (phase === 'closing') { close({restoreFocus: closingRestoreFocus, immediate: true}); return; }
    stopAnimation(); ++revision; drag = null; layout();
    active.style.transform = transformAt(offset()); phase = 'open';
  }
  function dragStart(e, panel) {
    if (!mobile.matches || active !== panel || phase === 'closing' || e.button !== 0) return;
    if (e.target.closest('button') && !e.target.closest('.sheet-grabber')) return;
    const from = stopAnimation(); active.style.transform = from; ++revision;
    drag = {id: e.pointerId, target: e.currentTarget, y: e.clientY, lastY: e.clientY, lastTime: performance.now(), velocity: 0, base: new DOMMatrixReadOnly(from).m42, moved: false};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function dragMove(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const delta = e.clientY - drag.y, now = performance.now();
    drag.velocity = (e.clientY - drag.lastY) / Math.max(1, now - drag.lastTime);
    drag.lastY = e.clientY; drag.lastTime = now;
    if (Math.abs(delta) > 6) drag.moved = true;
    if (!drag.moved) return;
    e.preventDefault();
    const y = drag.base + delta;
    active.style.transform = transformAt(y < 0 ? Math.max(-16, y * .15) : Math.min(fullHeight + 24, y));
  }
  function dragEnd(e, canceled = false) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    if (d.target.hasPointerCapture(e.pointerId)) d.target.releasePointerCapture(e.pointerId);
    if (!d.moved || canceled) { settle(detent); return; }
    suppressClickUntil = performance.now() + 400;
    const delta = e.clientY - d.y;
    const fast = performance.now() - d.lastTime < 100 && Math.abs(d.velocity) > .5 && Math.abs(delta) > 16;
    if (delta < -45 || (fast && delta < 0)) settle('expanded');
    else if (delta > 60 || (fast && delta > 0)) detent === 'expanded' ? settle('half') : close();
    else settle(detent);
  }
  panels.forEach(panel => {
    const heading = panel.querySelector('h2'); heading.id ||= panel.id + 'Title';
    const grabber = document.createElement('button');
    grabber.className = 'sheet-grabber'; grabber.type = 'button';
    grabber.setAttribute('aria-label', '展开工具面板');
    grabber.addEventListener('click', () => {
      if (performance.now() >= suppressClickUntil) settle(detent === 'half' ? 'expanded' : 'half');
    });
    panel.prepend(grabber);
    for (const handle of [grabber, panel.querySelector('.panel-head')]) {
      handle.addEventListener('pointerdown', e => dragStart(e, panel));
      handle.addEventListener('pointermove', dragMove);
      handle.addEventListener('pointerup', e => dragEnd(e));
      handle.addEventListener('pointercancel', e => dragEnd(e, true));
      handle.addEventListener('lostpointercapture', e => { if (drag?.id === e.pointerId) dragEnd(e, true); });
    }
  });
  // After a touch drag, browsers can suppress the compatibility click. Handle a
  // stationary pointer release directly, while ignoring swipes on the backdrop.
  let backdropPointer = null;
  backdrop.addEventListener('pointerdown', e => { backdropPointer = {id:e.pointerId,x:e.clientX,y:e.clientY}; });
  backdrop.addEventListener('pointerup', e => {
    const start = backdropPointer; backdropPointer = null;
    if (start?.id === e.pointerId && Math.hypot(e.clientX-start.x,e.clientY-start.y)<10) close();
  });
  backdrop.addEventListener('pointercancel', () => { backdropPointer = null; });
  backdrop.addEventListener('click', () => { if (phase !== 'closing') close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && active && !document.querySelector('dialog[open]')) {
      e.preventDefault(); e.stopImmediatePropagation(); close();
    }
  }, true);
  mobile.addEventListener('change', resize);
  reduced.addEventListener('change', resize);
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  resize();
  syncEntries();
  // Native scrollbars vary across platforms; share their reserved width with tabs.
  const inspectorViews=[...document.querySelectorAll('.inspector-view')];
  const inspectorResize=new ResizeObserver(()=>{
    const visible=inspectorViews.find(view=>view.getClientRects().length);
    if(visible)document.getElementById('propertiesPanel').style.setProperty('--inspector-scrollbar',(visible.offsetWidth-visible.clientWidth)+'px');
  });
  inspectorViews.forEach(view=>inspectorResize.observe(view));
  window.SheetUI = {open, toggle, close, inspectorTab, setEntry(entry){if(active?.id==='assetsPanel'){activeEntry=entry;syncEntries();}}};
})();
