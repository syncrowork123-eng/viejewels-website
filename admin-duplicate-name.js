// ════════════════════════════════════════════════════════════════
// VIE JEWELS ADMIN — Duplicate "Design Name" warning
// Add ONE line to admin.html, just before </body> (after admin-members.js):
//     <script src="admin-duplicate-name.js"></script>
//
// Behaviour:
//  • When you finish typing a Design Name that already exists on another
//    product, a popup says so and lets you "Change Name" or "Continue Anyway".
//  • If you continue, you are not asked again for that same name; if you
//    skip the popup and click Save, it asks once at that point instead.
//  • Matching ignores upper/lower case and extra spaces. The product you are
//    currently editing is never counted as a duplicate of itself.
// Relies on globals already in admin.html: allProducts, editingProductId,
// gv(), esc(), openProductModal(), saveProduct().
// ════════════════════════════════════════════════════════════════
(function () {
  const nameInput = document.getElementById("f-name");
  if (!nameInput || typeof saveProduct !== "function") return;

  let ackName = ""; // normalised name the admin has already chosen to keep

  const norm = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

  function findDups(name) {
    const n = norm(name);
    if (!n) return [];
    return allProducts.filter(p =>
      String(p.id) !== String(editingProductId) && norm(p.name) === n
    );
  }

  /* ── Popup ─────────────────────────────────────────────── */
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "dupname-modal";
  modal.style.zIndex = "400"; // above the product modal
  modal.innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="modal-header"><h2>Design name already exists</h2><button class="modal-close" id="dupname-x">×</button></div>
      <div class="modal-body">
        <p id="dupname-msg" style="font-size:14px;line-height:1.6;margin-bottom:12px"></p>
        <div id="dupname-list" style="font-size:13px;color:var(--text-muted);line-height:1.8"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="dupname-change">Change Name</button>
        <button class="btn btn-primary" id="dupname-continue">Continue Anyway</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const $ = id => document.getElementById(id);
  let pendingContinue = null;

  function ask(name, dups, onContinue) {
    pendingContinue = onContinue;
    $("dupname-msg").innerHTML =
      `A product named <strong>“${esc(name.trim())}”</strong> already exists. ` +
      `Do you want to keep this name or change it?`;
    const shown = dups.slice(0, 5).map(p =>
      `• ${esc(p.sku || "no SKU")} — ${esc(p.name || "")}`).join("<br>");
    $("dupname-list").innerHTML = shown + (dups.length > 5 ? `<br>…and ${dups.length - 5} more` : "");
    modal.classList.add("open");
  }

  function close() { modal.classList.remove("open"); pendingContinue = null; }

  function changeName() {
    close();
    nameInput.focus();
    nameInput.select();
  }

  $("dupname-change").addEventListener("click", changeName);
  $("dupname-x").addEventListener("click", changeName);
  $("dupname-continue").addEventListener("click", () => {
    ackName = norm(nameInput.value);
    const cb = pendingContinue;
    close();
    if (cb) cb();
  });

  /* ── 1. Check as soon as the name field is filled in ───── */
  nameInput.addEventListener("change", () => {
    const name = nameInput.value;
    const dups = findDups(name);
    if (dups.length && norm(name) !== ackName) ask(name, dups, null);
  });

  /* ── 2. Reset the acknowledgement whenever the editor opens ─
        (when editing, the product's existing name counts as accepted) */
  const origOpen = window.openProductModal;
  window.openProductModal = function (id) {
    const r = origOpen.apply(this, arguments);
    ackName = id ? norm(nameInput.value) : "";
    return r;
  };

  /* ── 3. Safety net on Save, in case the first popup was skipped ─ */
  const origSave = window.saveProduct;
  window.saveProduct = function () {
    const name = nameInput.value;
    if (gv("f-sku") && findDups(name).length && norm(name) !== ackName) {
      ask(name, findDups(name), () => origSave());
      return;
    }
    return origSave.apply(this, arguments);
  };
})();
