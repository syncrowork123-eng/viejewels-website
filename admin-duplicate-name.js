// ════════════════════════════════════════════════════════════════
// VIE JEWELS ADMIN — Duplicate "Design Name" warning  (v4)
// In admin.html, just before </body>:
//     <script src="admin-duplicate-name.js?v=4"></script>
//
// Covers:
//  0/1b. Products table — inline Name cell edit warns on duplicate.
//  1.    Add / Edit Product form — popup when the Design Name already exists.
//  2.    Bulk Upload (Excel) — rows whose name clashes are flagged NAME EXISTS;
//        each flagged row has an "Intentional" checkbox. On import you can
//        Review, Skip the unmarked duplicates, or Import everything anyway.
//
// v4 changes:
//  - Stronger matching: ignores case, accents, punctuation, hyphen/space,
//    "&" vs "and", zero-width/hidden characters.
//  - Bulk preview compares against ALL products in the database (paged),
//    not just allProducts (which may be capped at 1000 rows).
//  - Same SKU repeated in the file under the same name is now flagged too.
//  - Flags are attached to rows by the "#" column, so sorting/filtering the
//    preview table can no longer put a badge on the wrong row.
//  - Per-row "Intentional" checkbox + "Skip unmarked & import rest" option.
// Relies on globals in admin.html: allProducts, editingProductId, bulkRows,
// sb(), gv(), esc(), openProductModal(), saveProduct(), renderBulkPreview(),
// importProducts().
// ════════════════════════════════════════════════════════════════
(function () {
  if (window.__vjDupNameLoaded) return;
  const nameInput = document.getElementById("f-name");
  if (!nameInput || typeof saveProduct !== "function") return;
  window.__vjDupNameLoaded = true;

  // Loose comparison key
  const norm = s => String(s == null ? "" : s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")            // accents
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "") // hidden chars
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");       // spaces, hyphens, punctuation
  const $ = id => document.getElementById(id);

  /* ── Shared popup ──────────────────────────────────────── */
  const stale = document.getElementById("dupname-modal");
  if (stale) stale.remove();

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "dupname-modal";
  modal.style.zIndex = "400";
  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header"><h2 id="dupname-title">Design name already exists</h2><button type="button" class="modal-close" id="dupname-x">×</button></div>
      <div class="modal-body">
        <p id="dupname-msg" style="font-size:14px;line-height:1.6;margin-bottom:12px"></p>
        <div id="dupname-list" style="font-size:13px;color:var(--text-muted);line-height:1.8;max-height:220px;overflow-y:auto"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="dupname-change">Change Name</button>
        <button type="button" class="btn btn-secondary" id="dupname-skip" style="display:none">Skip</button>
        <button type="button" class="btn btn-primary" id="dupname-continue">Continue Anyway</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const m = id => modal.querySelector("#" + id);

  let onChange = null, onContinue = null, onSkip = null;

  function openPopup(o) {
    m("dupname-title").textContent = o.title;
    m("dupname-msg").innerHTML = o.msg;
    m("dupname-list").innerHTML = o.list;
    m("dupname-change").textContent = o.changeLabel;
    m("dupname-continue").textContent = o.continueLabel;
    const skipBtn = m("dupname-skip");
    skipBtn.style.display = o.skipLabel ? "" : "none";
    if (o.skipLabel) skipBtn.textContent = o.skipLabel;
    onChange = o.onChange || null;
    onContinue = o.onContinue || null;
    onSkip = o.onSkip || null;
    modal.classList.add("open");
    m("dupname-change").focus();
  }
  function closePopup() { modal.classList.remove("open"); }

  const doChange = () => { const cb = onChange; closePopup(); if (cb) cb(); };
  m("dupname-change").addEventListener("click", doChange);
  m("dupname-x").addEventListener("click", doChange);
  m("dupname-skip").addEventListener("click", () => { const cb = onSkip; closePopup(); if (cb) cb(); });
  m("dupname-continue").addEventListener("click", () => { const cb = onContinue; closePopup(); if (cb) cb(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal.classList.contains("open")) { e.preventDefault(); e.stopPropagation(); doChange(); }
  }, true);

  /* ════════════════════════════════════════════════════════
     1. ADD / EDIT PRODUCT FORM
     ════════════════════════════════════════════════════════ */
  let ackName = "";

  function findDups(name, excludeId) {
    const n = norm(name);
    if (!n) return [];
    const skip = excludeId !== undefined ? excludeId : editingProductId;
    return allProducts.filter(p => String(p.id) !== String(skip) && norm(p.name) === n);
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

  nameInput.addEventListener("change", () => {
    const dups = findDups(nameInput.value);
    if (dups.length && norm(nameInput.value) !== ackName) askFormDuplicate(nameInput.value, dups, null);
  });

  const origOpen = window.openProductModal;
  window.openProductModal = function (id) {
    const r = origOpen.apply(this, arguments);
    ackName = id ? norm(nameInput.value) : "";
    return r;
  };

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
     1b. PRODUCTS TABLE — click-to-edit Name cell
     ════════════════════════════════════════════════════════ */
  if (typeof saveCellEditor === "function") {
    const origCellSave = window.saveCellEditor;
    const cellAck = {};

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
     2. BULK UPLOAD (Excel)
     ════════════════════════════════════════════════════════ */
  if (typeof renderBulkPreview !== "function" || typeof importProducts !== "function") return;

  const rowSku = r => String(r.sku || "").trim().toLowerCase();

  let bulkDb = null;                 // every product (id, name, sku) from the database
  const intentional = new Set();     // row indexes the admin marked as intentional
  let lastFlags = new Map();
  let bulkAck = false;

  // Fetch ALL products in pages so a server row cap can't hide existing names
  async function fetchAllProducts() {
    const out = [];
    const PAGE = 1000;
    for (let guard = 0; guard < 200; guard++) {
      const rows = await sb(`products?select=id,name,sku&order=id.asc&limit=${PAGE}&offset=${out.length}`);
      if (!rows || !rows.length) break;
      out.push(...rows);
    }
    return out;
  }

  // Map(rowIndex -> reason). Indexes refer to positions in `rows` (= bulkRows).
  function bulkFlags(rows) {
    const db = bulkDb || allProducts;
    const dbByName = new Map();
    db.forEach(p => {
      const k = norm(p.name);
      if (!k) return;
      if (!dbByName.has(k)) dbByName.set(k, []);
      dbByName.get(k).push(p);
    });

    const flags = new Map();
    const add = (i, why) => flags.set(i, flags.has(i) ? flags.get(i) + "; " + why : why);

    // (a) name used by an existing product with a different SKU
    rows.forEach((r, i) => {
      const k = norm(r.name);
      if (!k) return;
      const sku = rowSku(r);
      const hit = (dbByName.get(k) || []).find(p => !sku || String(p.sku || "").trim().toLowerCase() !== sku);
      if (hit) add(i, `Already used by existing product ${hit.sku || "(no SKU)"}`);
    });

    // (b) same name more than once inside the file
    const groups = new Map();
    rows.forEach((r, i) => {
      const k = norm(r.name);
      if (!k) return;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    });
    groups.forEach(idxs => {
      if (idxs.length < 2) return;
      const keys = new Set(idxs.map(i => rowSku(rows[i]) || "#" + i));
      const nums = idxs.map(i => i + 1).join(", ");
      const why = keys.size > 1
        ? `Same name on file rows ${nums} (different SKUs)`
        : `Same SKU listed on file rows ${nums} — later row overwrites earlier`;
      idxs.forEach(i => add(i, why));
    });
    return flags;
  }

  function refreshUnreviewed() {
    const el = $("dup-unrev");
    if (!el) return;
    let n = 0;
    lastFlags.forEach((_, i) => { if (!intentional.has(i)) n++; });
    el.textContent = n;
  }

  document.addEventListener("change", e => {
    const cb = e.target;
    if (!cb || !cb.matches || !cb.matches("input[data-dup-idx]")) return;
    const i = parseInt(cb.dataset.dupIdx, 10);
    if (cb.checked) intentional.add(i); else intentional.delete(i);
    const tr = cb.closest("tr");
    if (tr) tr.style.background = cb.checked ? "rgba(39,174,96,0.07)" : "rgba(192,57,43,0.06)";
    refreshUnreviewed();
  });

  const origPreview = window.renderBulkPreview;
  window.renderBulkPreview = async function (rows) {
    const r = await origPreview.apply(this, arguments);
    bulkAck = false;
    intentional.clear();
    try { bulkDb = await fetchAllProducts(); }
    catch (e) { bulkDb = null; console.warn("Duplicate check: could not load full product list, using loaded products only.", e); }

    const flags = bulkFlags(rows || []);
    lastFlags = flags;

    // attach by the "#" column so sorting/filtering the preview can't misplace badges
    const byNum = new Map();
    document.querySelectorAll("#preview-tbody tr").forEach(tr => {
      const n = parseInt(tr.cells[0] && tr.cells[0].textContent, 10);
      if (n) byNum.set(n, tr);
    });
    flags.forEach((reason, i) => {
      const tr = byNum.get(i + 1);
      if (!tr) return;
      const last = tr.lastElementChild;
      if (last) last.insertAdjacentHTML("beforeend",
        `<div style="margin-top:4px"><span class="badge badge-inactive" title="${esc(reason)}">NAME EXISTS</span></div>` +
        `<label style="display:flex;align-items:center;gap:4px;margin-top:4px;font-size:11px;color:var(--text-muted);cursor:pointer" title="${esc(reason)}">` +
        `<input type="checkbox" data-dup-idx="${i}" /> Intentional</label>`);
      tr.style.background = "rgba(192,57,43,0.06)";
      tr.title = reason;
    });
    if (flags.size) {
      const stats = $("preview-stats");
      if (stats) stats.insertAdjacentHTML("beforeend",
        `<div class="stat-card"><div class="stat-num" style="color:var(--danger)">${flags.size}</div><div class="stat-label">Name exists</div></div>` +
        `<div class="stat-card"><div class="stat-num" id="dup-unrev" style="color:var(--danger)">${flags.size}</div><div class="stat-label">Not yet marked intentional</div></div>`);
    }
    return r;
  };

  // Run the import directly (does not depend on whatever importProducts currently points to,
  // in case another script replaced or wrapped it).
  async function runImportDirect() {
    if (window.__importRunning) {
      console.warn("[bulk import] ignored: an import is already marked as running");
      try { toast("An import is already running. Refresh the page if it is stuck.", "error"); } catch (_) {}
      return;
    }
    window.__importRunning = true;
    window.__impFailures = []; window.__impWarnings = [];
    console.info("[bulk import] started");
    try { setImportStatus("run", "Import started…", ["Preparing " + (bulkRows || []).length + " rows"]); } catch (_) {}
    const btn = document.getElementById("import-btn");
    try { await importProductsCore(); }
    catch (e) {
      console.error("Import crashed:", e);
      try { hideImportProgress(); } catch (_) {}
      try { setImportStatus("err", "Import failed", ["The import stopped unexpectedly and may be incomplete.", (e && e.message) || String(e)]); } catch (_) {}
      try { showImportResult(false, "Import failed", ["The import stopped unexpectedly and may be incomplete.", "Error: " + ((e && e.message) || String(e))], []); } catch (_) {}
    } finally {
      window.__importRunning = false;
      try { hideImportProgress(); } catch (_) {}
      if (btn) { btn.disabled = false; btn.textContent = "Import All Products"; }
    }
  }
  const origImport = runImportDirect;
  window.importProducts = function () {
    const flags = bulkFlags(bulkRows);
    const pending = new Set([...flags.keys()].filter(i => !intentional.has(i)));
    if (pending.size && !bulkAck) {
      const items = [...pending].slice(0, 10).map(i =>
        `• Row ${i + 1}: ${esc(bulkRows[i].name)}${bulkRows[i].sku ? " (" + esc(bulkRows[i].sku) + ")" : ""} <span style="color:var(--text-light)">— ${esc(flags.get(i))}</span>`).join("<br>");
      if (window.setImportStatus) setImportStatus("warn", `Import NOT started yet — ${pending.size} row${pending.size > 1 ? "s have" : " has"} a duplicate design name`, ["Choose below (or in the popup): Import All Anyway, or Skip the flagged rows."]);
      const run = (label) => {
        console.info("[dup gate] user chose:", label, "| rows to import:", bulkRows.length);
        if (window.setImportStatus) setImportStatus("run", "Starting import…", [label + " — " + bulkRows.length + " rows"]);
        Promise.resolve().then(() => origImport()).catch(e => {
          console.error("[dup gate] importProducts threw:", e);
          if (window.setImportStatus) setImportStatus("err", "Import could not start", [(e && e.message) || String(e)]);
        });
      };
      const doSkip = () => { bulkRows = bulkRows.filter((r, i) => !pending.has(i)); bulkAck = true; run("Skip flagged rows"); };
      const doAll = () => { bulkAck = true; run("Import all anyway"); };
      // Same choices as inline buttons, in case the popup is missed or hidden
      try {
        const st = document.getElementById("import-status");
        if (st) {
          const bar = document.createElement("div");
          bar.style.cssText = "margin-top:10px;display:flex;gap:8px;flex-wrap:wrap";
          const mk = (label, primary, fn) => {
            const b = document.createElement("button");
            b.type = "button"; b.textContent = label;
            b.className = primary ? "btn btn-primary" : "btn btn-secondary";
            b.addEventListener("click", () => { closePopup(); fn(); });
            return b;
          };
          bar.appendChild(mk("Import All Anyway", true, doAll));
          bar.appendChild(mk(`Skip ${pending.size} & Import Rest`, false, doSkip));
          st.appendChild(bar);
          st.scrollIntoView({ block: "center" });
        }
      } catch (e) { console.warn("inline duplicate actions failed", e); }
      openPopup({
        title: "Duplicate design names not reviewed",
        msg: `<strong>${pending.size}</strong> row${pending.size > 1 ? "s have" : " has"} a design name that is already in use and ${pending.size > 1 ? "are" : "is"} not marked <em>Intentional</em>. Review them, skip them, or import everything as it is.`,
        list: items + (pending.size > 10 ? `<br>…and ${pending.size - 10} more` : ""),
        onChange: () => { if (window.setImportStatus) setImportStatus("warn", "Import paused — nothing has been imported", ["Tick “Intentional” on the flagged rows in the preview, then click Import All Products again (or use Skip / Import All Anyway)."]); },
        changeLabel: "Review Rows",
        skipLabel: `Skip ${pending.size} & Import Rest`,
        continueLabel: "Import All Anyway",
        onSkip: doSkip,
        onContinue: doAll
      });
      return;
    }
    return origImport.apply(this, arguments);
  };
})();
