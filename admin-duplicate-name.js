// ════════════════════════════════════════════════════════════════
// VIE JEWELS ADMIN — Duplicate "Design Name" warning
// Add ONE line to admin.html, just before </body> (after admin-members.js):
//     <script src="admin-duplicate-name.js?v=3"></script>
//
// Covers three places:
//  0. Products table — click the Name cell to edit it inline; saving a name
//     that another product already has opens the same popup
//     (Change Name / Save Anyway).
//  1. Add / Edit Product form — popup when the Design Name already exists
//     on another product (Change Name / Continue Anyway).
//  2. Bulk Upload (table / Excel) — rows whose name already exists on a
//     product with a different SKU, or repeats inside the file under a
//     different SKU, are flagged "NAME EXISTS" in the preview and you are
//     asked to Review Rows or Continue Import before anything is saved.
// Matching ignores upper/lower case and extra spaces. A row that has the
// same SKU as an existing product is an update of that product, so it is
// never flagged. Relies on globals already in admin.html: allProducts,
// editingProductId, bulkRows, gv(), esc(), openProductModal(),
// saveProduct(), renderBulkPreview(), importProducts().
//
// v3 fixes: popup buttons dead when this file ended up loaded twice (two
// popups with the same ids → the visible one had no click handlers);
// keyboard focus stayed behind the popup so Enter/Esc acted on the editor
// underneath and could leave the popup orphaned.
// ════════════════════════════════════════════════════════════════
(function () {
  // Never wire the popup twice (a second load would leave duplicate ids and a visible popup with dead buttons)
  if (window.__vjDupNameLoaded) return;
  const nameInput = document.getElementById("f-name");
  if (!nameInput || typeof saveProduct !== "function") return;
  window.__vjDupNameLoaded = true;

  const norm = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const $ = id => document.getElementById(id);

  /* ── Shared popup ──────────────────────────────────────── */
  const stale = document.getElementById("dupname-modal");
  if (stale) stale.remove();

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "dupname-modal";
  modal.style.zIndex = "400"; // above other modals
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header"><h2 id="dupname-title">Design name already exists</h2><button type="button" class="modal-close" id="dupname-x">×</button></div>
      <div class="modal-body">
        <p id="dupname-msg" style="font-size:14px;line-height:1.6;margin-bottom:12px"></p>
        <div id="dupname-list" style="font-size:13px;color:var(--text-muted);line-height:1.8;max-height:220px;overflow-y:auto"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="dupname-change">Change Name</button>
        <button type="button" class="btn btn-primary" id="dupname-continue">Continue Anyway</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const m = id => modal.querySelector("#" + id); // always the popup's own elements

  let onChange = null, onContinue = null;

  function openPopup(o) {
    m("dupname-title").textContent = o.title;
    m("dupname-msg").innerHTML = o.msg;
    m("dupname-list").innerHTML = o.list;
    m("dupname-change").textContent = o.changeLabel;
    m("dupname-continue").textContent = o.continueLabel;
    onChange = o.onChange || null;
    onContinue = o.onContinue || null;
    modal.classList.add("open");
    m("dupname-change").focus(); // keep the keyboard inside the popup, not on the editor underneath
  }
  function closePopup() { modal.classList.remove("open"); }

  const doChange = () => { const cb = onChange; closePopup(); if (cb) cb(); };
  m("dupname-change").addEventListener("click", doChange);
  m("dupname-x").addEventListener("click", doChange);
  m("dupname-continue").addEventListener("click", () => { const cb = onContinue; closePopup(); if (cb) cb(); });
  // Esc = Change Name, handled before anything underneath can react to it
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal.classList.contains("open")) { e.preventDefault(); e.stopPropagation(); doChange(); }
  }, true);

  /* ════════════════════════════════════════════════════════
     1. ADD / EDIT PRODUCT FORM
     ════════════════════════════════════════════════════════ */
  let ackName = ""; // normalised name the admin has already chosen to keep

  function findDups(name, excludeId) {
    const n = norm(name);
    if (!n) return [];
    const skip = excludeId !== undefined ? excludeId : editingProductId;
    return allProducts.filter(p =>
      String(p.id) !== String(skip) && norm(p.name) === n
    );
  }

  function askFormDuplicate(name, dups, thenSave) {
    const shown = dups.slice(0, 5).map(p => `• ${esc(p.sku || "no SKU")} — ${esc(p.name || "")}`).join("<br>");
    openPopup({
      title: "Design name already exists",
      msg: `A product named <strong>“${esc(name.trim())}”</strong> already exists. Do you want to keep this name or change it?`,
      list: shown + (dups.length > 5 ? `<br>…and ${dups.length - 5} more` : ""),
      changeLabel: "Change Name",
      continueLabel: "Continue Anyway",
      onChange: () => { nameInput.focus(); nameInput.select(); },
      onContinue: () => { ackName = norm(nameInput.value); if (thenSave) thenSave(); }
    });
  }

  // Check as soon as the name field is filled in
  nameInput.addEventListener("change", () => {
    const dups = findDups(nameInput.value);
    if (dups.length && norm(nameInput.value) !== ackName) askFormDuplicate(nameInput.value, dups, null);
  });

  // Reset acknowledgement whenever the editor opens (an edited product's
  // existing name counts as accepted)
  const origOpen = window.openProductModal;
  window.openProductModal = function (id) {
    const r = origOpen.apply(this, arguments);
    ackName = id ? norm(nameInput.value) : "";
    return r;
  };

  // Safety net on Save, in case the first popup was skipped
  const origSave = window.saveProduct;
  window.saveProduct = function () {
    const name = nameInput.value;
    const dups = findDups(name);
    if (gv("f-sku") && dups.length && norm(name) !== ackName) {
      askFormDuplicate(name, dups, () => origSave());
      return;
    }
    return origSave.apply(this, arguments);
  };

  /* ════════════════════════════════════════════════════════
     1b. PRODUCTS TABLE — click-to-edit Name cell (inline editor)
     ════════════════════════════════════════════════════════ */
  if (typeof saveCellEditor === "function") {
    const origCellSave = window.saveCellEditor;
    const cellAck = {}; // product id -> normalised name already confirmed

    window.saveCellEditor = function () {
      if (typeof cellEd !== "undefined" && cellEd && cellEd.field === "name" && !cellEd.saving) {
        const input = document.getElementById("ce-input");
        const p = ceFind(cellEd.pid);
        if (input && p) {
          const name = input.value;
          const changed = norm(name) !== norm(p.name);
          const dups = changed ? findDups(name, p.id) : [];
          if (dups.length && cellAck[p.id] !== norm(name)) {
            const shown = dups.slice(0, 5).map(d => `• ${esc(d.sku || "no SKU")} — ${esc(d.name || "")}`).join("<br>");
            openPopup({
              title: "Design name already exists",
              msg: `A product named <strong>“${esc(name.trim())}”</strong> already exists. Do you want to save this name anyway, or change it?`,
              list: shown + (dups.length > 5 ? `<br>…and ${dups.length - 5} more` : ""),
              changeLabel: "Change Name",
              continueLabel: "Save Anyway",
              onChange: () => {
                const el = document.getElementById("ce-input");
                if (el) { el.focus(); el.select(); }
              },
              onContinue: () => {
                cellAck[p.id] = norm(name);
                // the editor may have been closed meanwhile; only save if it is still open for this product
                if (typeof cellEd !== "undefined" && cellEd && String(cellEd.pid) === String(p.id)) origCellSave();
              }
            });
            return;
          }
        }
      }
      return origCellSave.apply(this, arguments);
    };
  }

  /* ════════════════════════════════════════════════════════
     2. BULK UPLOAD (table / Excel)
     ════════════════════════════════════════════════════════ */
  if (typeof renderBulkPreview !== "function" || typeof importProducts !== "function") return;

  const rowSku = r => String(r.sku || "").trim().toLowerCase();

  // Returns Map(rowIndex -> reason text) for rows with a name clash
  function bulkFlags(rows) {
    const flags = new Map();

    // (a) name already used by an existing product with a different SKU
    rows.forEach((r, i) => {
      const n = norm(r.name);
      if (!n) return;
      const sku = rowSku(r);
      const hit = allProducts.find(p =>
        norm(p.name) === n && (!sku || String(p.sku || "").trim().toLowerCase() !== sku)
      );
      if (hit) flags.set(i, `Already used by existing product ${hit.sku || "(no SKU)"}`);
    });

    // (b) same name repeated in the file under different SKUs
    const groups = new Map();
    rows.forEach((r, i) => {
      const n = norm(r.name);
      if (!n) return;
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push(i);
    });
    groups.forEach(idxs => {
      const keys = new Set(idxs.map(i => rowSku(rows[i]) || "#" + i));
      if (keys.size > 1) {
        idxs.forEach(i => { if (!flags.has(i)) flags.set(i, "Same name appears more than once in this file"); });
      }
    });
    return flags;
  }

  let bulkAck = false;

  // After the preview renders, mark the flagged rows
  const origPreview = window.renderBulkPreview;
  window.renderBulkPreview = async function (rows) {
    const r = await origPreview.apply(this, arguments);
    bulkAck = false;
    const flags = bulkFlags(rows || []);
    const trs = document.querySelectorAll("#preview-tbody tr");
    flags.forEach((reason, i) => {
      const tr = trs[i];
      if (!tr) return;
      const last = tr.lastElementChild;
      if (last) last.insertAdjacentHTML("beforeend",
        `<div style="margin-top:4px"><span class="badge badge-inactive" title="${esc(reason)}">NAME EXISTS</span></div>`);
      tr.style.background = "rgba(192,57,43,0.06)";
      tr.title = reason;
    });
    if (flags.size) {
      const stats = $("preview-stats");
      if (stats) stats.insertAdjacentHTML("beforeend",
        `<div class="stat-card"><div class="stat-num" style="color:var(--danger)">${flags.size}</div><div class="stat-label">Name exists</div></div>`);
    }
    return r;
  };

  // Ask once before importing if any rows are flagged
  const origImport = window.importProducts;
  window.importProducts = function () {
    const rows = bulkRows.filter(r => String(r.name || "").trim());
    const flags = bulkFlags(rows);
    if (flags.size && !bulkAck) {
      const items = [...flags.entries()].slice(0, 10).map(([i, why]) =>
        `• ${esc(rows[i].name)}${rows[i].sku ? " (" + esc(rows[i].sku) + ")" : ""} <span style="color:var(--text-light)">— ${esc(why)}</span>`).join("<br>");
      openPopup({
        title: "Some design names already exist",
        msg: `<strong>${flags.size}</strong> row${flags.size > 1 ? "s use" : " uses"} a design name that already exists. Review those rows (marked NAME EXISTS), or continue and import them as they are.`,
        list: items + (flags.size > 10 ? `<br>…and ${flags.size - 10} more` : ""),
        changeLabel: "Review Rows",
        continueLabel: "Continue Import",
        onContinue: () => { bulkAck = true; origImport(); }
      });
      return;
    }
    return origImport.apply(this, arguments);
  };
})();
