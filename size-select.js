/*!
 * size-select.js — premium minimal Size picker for admin.html (vanilla JS, no dependencies)
 *
 * Upgrades an existing <select> in place. The original <select> stays in the page
 * (hidden) and remains the source of truth, so your current save / edit / load code
 * keeps working unchanged: sel.value = "7" updates the picker, and picking a size
 * fires a normal "change" event.
 *
 * Usage:
 *   <script src="size-select.js"></script>
 *   <script> VieSizeSelect.enhance(document.getElementById('productSize')); </script>
 *
 * If the <select> uses <optgroup label="Ring"> / "Bangle" etc., each group becomes a tab.
 * If your code rebuilds the options (e.g. when Jewelry Type changes), call:
 *   VieSizeSelect.refresh(select)       // or just let it auto-detect option changes
 */
(function () {
  var CSS = [
    '.vsz{--ink:#1f1f1f;--muted:#8a8780;--line:#e7e4de;--gold:#a8864f;--wash:#faf9f7;position:relative;display:block;width:100%;max-width:320px;font-family:"Inter","Helvetica Neue",Arial,sans-serif;color:var(--ink)}',
    '.vsz *{box-sizing:border-box}',
    '.vsz-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;background:#fff;border:1px solid var(--line);border-radius:2px;font:inherit;font-size:14px;text-align:left;cursor:pointer;color:var(--ink);transition:border-color .15s}',
    '.vsz-trigger:hover{border-color:#cfcac0}',
    '.vsz-trigger:focus-visible,.vsz-open .vsz-trigger{outline:none;border-color:var(--gold)}',
    '.vsz-trigger[disabled]{opacity:.5;cursor:not-allowed}',
    '.vsz-ph{color:var(--muted)}',
    '.vsz-chev{width:10px;height:10px;flex:none;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink);transform:rotate(45deg) translate(-2px,-2px);transition:transform .2s}',
    '.vsz-open .vsz-chev{transform:rotate(-135deg) translate(-2px,-2px)}',
    '.vsz-panel{position:absolute;z-index:1000;top:calc(100% + 6px);left:0;width:max(100%,320px);background:#fff;border:1px solid var(--line);border-radius:2px;box-shadow:0 18px 40px -20px rgba(31,31,31,.28);padding:16px 16px 14px;animation:vsz-in .14s ease-out}',
    '@keyframes vsz-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){.vsz-panel{animation:none}.vsz-chev{transition:none}}',
    '.vsz-tabs{display:flex;gap:18px;border-bottom:1px solid var(--line);margin-bottom:14px;overflow-x:auto}',
    '.vsz-tab{background:none;border:0;border-bottom:1px solid transparent;padding:0 0 9px;margin-bottom:-1px;font:inherit;font-size:13px;color:var(--muted);cursor:pointer;white-space:nowrap}',
    '.vsz-tab:hover{color:var(--ink)}',
    '.vsz-tab[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--gold)}',
    '.vsz-tab:focus-visible,.vsz-cell:focus-visible,.vsz-clear:focus-visible{outline:1px solid var(--gold);outline-offset:2px}',
    '.vsz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px;max-height:208px;overflow-y:auto;padding:1px}',
    '.vsz-cell{min-height:38px;padding:0 6px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid var(--line);border-radius:2px;font:inherit;font-size:13px;font-variant-numeric:tabular-nums;color:var(--ink);cursor:pointer;transition:border-color .12s,background .12s}',
    '.vsz-cell:hover{border-color:#bdb7ab;background:var(--wash)}',
    '.vsz-cell[aria-selected="true"]{background:var(--ink);border-color:var(--ink);color:#fff}',
    '.vsz-cell[disabled]{opacity:.35;cursor:not-allowed}',
    '.vsz-foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}',
    '.vsz-clear{background:none;border:0;padding:0;font:inherit;font-size:12px;color:var(--ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
    '.vsz-clear:disabled{color:var(--muted);text-decoration:none;cursor:default}',
    '.vsz-empty{font-size:13px;color:var(--muted);margin:0}'
  ].join('\n');

  var cssInjected = false;
  function injectCss() {
    if (cssInjected) return;
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    cssInjected = true;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function enhance(sel) {
    if (!sel || sel._vsz) return sel && sel._vsz;
    injectCss();

    var multiple = sel.multiple;
    var open = false;
    var activeTab = null;

    var root = el('div', 'vsz');
    var trigger = el('button', 'vsz-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'listbox');
    var label = el('span');
    trigger.appendChild(label);
    trigger.appendChild(el('i', 'vsz-chev'));
    var panel = null;

    sel.parentNode.insertBefore(root, sel.nextSibling);
    root.appendChild(trigger);
    sel.style.display = 'none';
    sel.setAttribute('aria-hidden', 'true');
    sel.tabIndex = -1;

    function readGroups() {
      var groups = [];
      var optgroups = sel.querySelectorAll('optgroup');
      function real(list) {
        return Array.prototype.filter.call(list, function (o) { return o.value !== ''; });
      }
      if (optgroups.length) {
        var loose = real(Array.prototype.filter.call(sel.children, function (c) { return c.tagName === 'OPTION'; }));
        if (loose.length) groups.push({ name: '', opts: loose });
        Array.prototype.forEach.call(optgroups, function (g) {
          groups.push({ name: g.label, opts: real(g.querySelectorAll('option')) });
        });
      } else {
        groups.push({ name: '', opts: real(sel.options) });
      }
      return groups.filter(function (g) { return g.opts.length; });
    }

    function placeholder() {
      var first = sel.options[0];
      return first && first.value === '' && first.textContent.trim() ? first.textContent.trim() : 'Select size';
    }

    function selectedOpts() {
      return Array.prototype.filter.call(sel.options, function (o) { return o.selected && o.value !== ''; });
    }

    function renderLabel() {
      var s = selectedOpts().map(function (o) { return o.textContent.trim(); });
      var text = !s.length ? placeholder() : s.length <= 3 ? s.join(', ') : s.slice(0, 2).join(', ') + ' +' + (s.length - 2);
      label.textContent = text;
      label.className = s.length ? '' : 'vsz-ph';
      trigger.disabled = sel.disabled;
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function pick(opt) {
      if (multiple) {
        opt.selected = !opt.selected;
      } else {
        sel.selectedIndex = opt.index;
        close();
      }
      fire();
      renderLabel();
      if (open) renderPanel();
    }

    function fire() {
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function renderPanel() {
      var groups = readGroups();
      if (!panel) {
        panel = el('div', 'vsz-panel');
        root.appendChild(panel);
      }
      panel.innerHTML = '';

      if (!groups.length) {
        panel.appendChild(el('p', 'vsz-empty', 'No sizes available for this jewelry type.'));
        return;
      }

      var sel0 = selectedOpts()[0];
      var names = groups.map(function (g) { return g.name; });
      if (activeTab == null || names.indexOf(activeTab) < 0) {
        var withSel = sel0 && groups.filter(function (g) { return g.opts.indexOf(sel0) > -1; })[0];
        activeTab = (withSel || groups[0]).name;
      }

      if (groups.length > 1) {
        var tabs = el('div', 'vsz-tabs');
        tabs.setAttribute('role', 'tablist');
        groups.forEach(function (g) {
          var t = el('button', 'vsz-tab', g.name || 'Other');
          t.type = 'button';
          t.setAttribute('role', 'tab');
          t.setAttribute('aria-selected', g.name === activeTab ? 'true' : 'false');
          t.addEventListener('click', function () { activeTab = g.name; renderPanel(); });
          tabs.appendChild(t);
        });
        panel.appendChild(tabs);
      }

      var current = groups.filter(function (g) { return g.name === activeTab; })[0] || groups[0];
      var grid = el('div', 'vsz-grid');
      grid.setAttribute('role', 'listbox');
      if (multiple) grid.setAttribute('aria-multiselectable', 'true');
      current.opts.forEach(function (o) {
        var c = el('button', 'vsz-cell', o.textContent.trim());
        c.type = 'button';
        c.setAttribute('role', 'option');
        c.setAttribute('aria-selected', o.selected ? 'true' : 'false');
        c.disabled = o.disabled;
        c.addEventListener('click', function () { pick(o); });
        grid.appendChild(c);
      });
      panel.appendChild(grid);

      if (multiple) {
        var foot = el('div', 'vsz-foot');
        var n = selectedOpts().length;
        foot.appendChild(el('span', '', n + ' selected'));
        var clear = el('button', 'vsz-clear', 'Clear');
        clear.type = 'button';
        clear.disabled = !n;
        clear.addEventListener('click', function () {
          Array.prototype.forEach.call(sel.options, function (o) { o.selected = false; });
          fire(); renderLabel(); renderPanel();
        });
        foot.appendChild(clear);
        panel.appendChild(foot);
      }
    }

    function openPanel() {
      if (sel.disabled) return;
      open = true;
      root.classList.add('vsz-open');
      renderPanel();
      renderLabel();
    }
    function close() {
      open = false;
      root.classList.remove('vsz-open');
      if (panel) { panel.remove(); panel = null; }
      renderLabel();
    }

    trigger.addEventListener('click', function () { open ? close() : openPanel(); });
    document.addEventListener('mousedown', function (e) { if (open && !root.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') { close(); trigger.focus(); } });

    // Keep the picker in sync when your code sets sel.value / sel.selectedIndex directly.
    ['value', 'selectedIndex'].forEach(function (prop) {
      var d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
      if (!d) return;
      Object.defineProperty(sel, prop, {
        configurable: true,
        get: function () { return d.get.call(sel); },
        set: function (v) { d.set.call(sel, v); renderLabel(); if (open) renderPanel(); }
      });
    });

    // Re-render when options are rebuilt or the select is enabled/disabled.
    new MutationObserver(function () { renderLabel(); if (open) renderPanel(); })
      .observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    sel.addEventListener('change', renderLabel);

    var api = { refresh: function () { renderLabel(); if (open) renderPanel(); } };
    sel._vsz = api;
    renderLabel();
    return api;
  }

  window.VieSizeSelect = {
    enhance: enhance,
    refresh: function (sel) { if (sel && sel._vsz) sel._vsz.refresh(); }
  };
})();
