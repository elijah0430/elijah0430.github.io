(function () {
  'use strict';

  const storageKey = 'jongwon-blog-editor-layout-v1';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const defaults = () => ({ width: null, height: null, split: 50 });

  function create({ app, workspace, onWidthChange = () => {} }) {
    const widthInput = app.querySelector('[data-editor-width]');
    const heightInput = app.querySelector('[data-editor-height]');
    const divider = app.querySelector('[data-editor-divider]');
    const heightHandle = app.querySelector('[data-editor-height-handle]');
    const sizeMenu = app.querySelector('[data-editor-size]');
    let sizes = defaults();
    let drag = null;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved === 'object') {
        for (const key of ['width', 'height', 'split']) {
          if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) sizes[key] = saved[key];
        }
        if (sizes.width !== null) sizes.width = clamp(sizes.width, 320, 10000);
        if (sizes.height !== null) sizes.height = clamp(sizes.height, 320, 1600);
        sizes.split = clamp(sizes.split, 25, 75);
      }
    } catch (_) { /* A private session can still resize without saved settings. */ }

    const narrow = () => window.innerWidth <= 900;
    const minHeight = () => narrow() && workspace.dataset.mode === 'split' ? 640 : 320;
    const availableWidth = () => Math.max(1, window.innerWidth - (window.innerWidth <= 600 ? 24 : 48));
    const currentHeight = () => Math.round(workspace.getBoundingClientRect().height) || 480;
    const save = () => {
      try { localStorage.setItem(storageKey, JSON.stringify(sizes)); }
      catch (_) { /* Resizing itself does not depend on storage. */ }
    };

    function update() {
      app.style.setProperty('--editor-page-width', `${sizes.width ?? 1120}px`);
      app.toggleAttribute('data-custom-width', sizes.width !== null);
      workspace.style.setProperty('--editor-left', `${sizes.split}fr`);
      workspace.style.setProperty('--editor-right', `${100 - sizes.split}fr`);
      workspace.toggleAttribute('data-custom-height', sizes.height !== null);
      workspace.style.height = sizes.height === null ? '' : `${clamp(sizes.height, minHeight(), 1600)}px`;
      const height = sizes.height === null ? clamp(currentHeight(), minHeight(), 1600) : clamp(sizes.height, minHeight(), 1600);
      widthInput.min = String(Math.min(720, availableWidth()));
      widthInput.max = String(availableWidth());
      widthInput.value = String(clamp(sizes.width ?? 1120, Number(widthInput.min), Number(widthInput.max)));
      widthInput.disabled = availableWidth() <= 720;
      heightInput.min = String(minHeight());
      heightInput.value = String(height);
      app.querySelector('[data-editor-width-value]').textContent = `${Math.round(Number(widthInput.value))} px`;
      app.querySelector('[data-editor-height-value]').textContent = sizes.height === null ? 'Auto' : `${height} px`;
      divider.hidden = workspace.dataset.mode !== 'split' || narrow();
      divider.setAttribute('aria-valuenow', String(sizes.split));
      divider.setAttribute('aria-valuetext', `Editor ${sizes.split}%, preview ${100 - sizes.split}%`);
      heightHandle.setAttribute('aria-valuemin', String(minHeight()));
      heightHandle.setAttribute('aria-valuenow', String(height));
      heightHandle.setAttribute('aria-valuetext', `${height} pixels high`);
    }

    function endDrag() {
      if (!drag) return;
      const { handle, pointerId } = drag;
      drag = null;
      handle.classList.remove('is-resizing');
      document.documentElement.classList.remove('editor-resizing');
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      save();
    }

    function startDrag(event, kind, handle) {
      if (event.button !== 0 || event.isPrimary === false || kind === 'split' && divider.hidden) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      drag = { kind, handle, pointerId: event.pointerId, y: event.clientY, height: currentHeight(), rect: workspace.getBoundingClientRect() };
      handle.setPointerCapture?.(event.pointerId);
      handle.classList.add('is-resizing');
      document.documentElement.classList.add('editor-resizing');
    }

    function moveDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.kind === 'height') sizes.height = Math.round(clamp(drag.height + event.clientY - drag.y, minHeight(), 1600));
      else sizes.split = Math.round(clamp(100 * (event.clientX - drag.rect.left - 6) / Math.max(1, drag.rect.width - 12), 25, 75));
      update();
    }

    divider.addEventListener('pointerdown', event => startDrag(event, 'split', divider));
    heightHandle.addEventListener('pointerdown', event => startDrag(event, 'height', heightHandle));
    document.addEventListener('pointermove', moveDrag);
    const finishPointer = event => { if (event.pointerId === drag?.pointerId) endDrag(); };
    document.addEventListener('pointerup', finishPointer);
    document.addEventListener('pointercancel', finishPointer);
    divider.addEventListener('lostpointercapture', endDrag);
    heightHandle.addEventListener('lostpointercapture', endDrag);
    window.addEventListener('blur', endDrag);
    window.addEventListener('resize', () => { endDrag(); update(); });

    function resizeWithKeys(event, kind) {
      const increase = kind === 'split' ? 'ArrowRight' : 'ArrowDown';
      const decrease = kind === 'split' ? 'ArrowLeft' : 'ArrowUp';
      if (![increase, decrease, 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const min = kind === 'split' ? 25 : minHeight();
      const max = kind === 'split' ? 75 : 1600;
      const step = (kind === 'split' ? 2 : 40) * (event.shiftKey ? 5 : 1);
      const current = kind === 'split' ? sizes.split : sizes.height ?? currentHeight();
      sizes[kind] = event.key === 'Home' ? min : event.key === 'End' ? max : clamp(current + (event.key === increase ? step : -step), min, max);
      update(); save();
    }
    divider.addEventListener('keydown', event => resizeWithKeys(event, 'split'));
    heightHandle.addEventListener('keydown', event => resizeWithKeys(event, 'height'));
    divider.addEventListener('dblclick', () => { sizes.split = 50; update(); save(); });
    heightHandle.addEventListener('dblclick', () => { sizes.height = null; update(); save(); });
    widthInput.addEventListener('input', () => { sizes.width = Number(widthInput.value); update(); onWidthChange(); save(); });
    heightInput.addEventListener('input', () => { sizes.height = Number(heightInput.value); update(); save(); });
    sizeMenu.addEventListener('toggle', () => { if (sizeMenu.open) update(); });
    app.querySelector('[data-editor-size-reset]').addEventListener('click', () => { endDrag(); sizes = defaults(); update(); onWidthChange(); save(); });
    update();
    return { update };
  }

  window.BlogLayout = Object.freeze({ create });
}());
