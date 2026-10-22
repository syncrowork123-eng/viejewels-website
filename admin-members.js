// ════════════════════════════════════════════════════════════════
// VIE JEWELS ADMIN — "Members & Orders" tab
// Add ONE line to admin.html, just before </body>:
//     <script src="admin-members.js"></script>
// Everything (tab button, panel, modal) is injected by this file.
// It relies on globals already in admin.html: SUPABASE_URL, SUPABASE_KEY,
// toast(), esc(), openConfirm().
// VIE JEWELS ADMIN — Duplicate "Design Name" warning
// Add ONE line to admin.html, just before </body> (after admin-members.js):
//     <script src="admin-duplicate-name.js"></script>
//
// Covers two places:
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
// ════════════════════════════════════════════════════════════════
(function () {
  const STATUSES = ["Order Received", "In Design", "In Production", "Quality Check", "Shipped", "Delivered", "Cancelled"];
  const TOKEN_KEY = "vj_admin_sb_token";
  const nameInput = document.getElementById("f-name");
  if (!nameInput || typeof saveProduct !== "function") return;

  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  let orders = [];
  let editing = null; // order row being edited, or null for new

  /* ── Styles ──────────────────────────────────────────────── */
  const style = document.createElement("style");
  style.textContent = `
    .mo-login { max-width: 420px; margin: 40px auto; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 32px; }
    .mo-login h3 { font-size: 15px; margin-bottom: 6px; }
    .mo-login p { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin-bottom: 18px; }
    .mo-login .form-group { margin-bottom: 14px; }
    .mo-status { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; background:var(--surface2); border:1px solid var(--border); }
    .mo-status.s-Delivered { background:rgba(39,174,96,.15); color:#27ae60; border-color:transparent; }
    .mo-status.s-Cancelled { background:rgba(192,57,43,.15); color:#e74c3c; border-color:transparent; }
    .mo-status.s-Shipped { background:rgba(184,146,42,.18); color:var(--accent); border-color:transparent; }
    .mo-timeline { list-style:none; border-left:1px solid var(--border); margin:6px 0 0 6px; }
    .mo-timeline li { position:relative; padding:0 0 10px 16px; font-size:12px; color:var(--text-muted); }
    .mo-timeline li::before { content:""; position:absolute; left:-4px; top:5px; width:7px; height:7px; border-radius:50%; background:var(--accent); }
    .mo-timeline li b { color:var(--text); }
    .mo-hint { font-size:11px; color:var(--text-muted); margin-top:2px; }
  `;
  document.head.appendChild(style);

  /* ── Inject tab button + panel + modal ───────────────────── */
  const tabs = document.querySelector(".admin-tabs");
  const app = document.getElementById("app");
  if (!tabs || !app) return;

  const btn = document.createElement("button");
  btn.className = "tab-btn";
  btn.dataset.tab = "members";
  btn.textContent = "Members & Orders";
  tabs.appendChild(btn);

  const panel = document.createElement("div");
  panel.className = "tab-panel";
  panel.id = "tab-members";
  panel.innerHTML = `
    <div id="mo-login" class="mo-login" style="display:none">
      <h3>Admin sign-in required</h3>
      <p>Client orders are protected by Supabase login (not the panel password). Sign in with the admin account you added to the <b>admins</b> table.</p>
      <div class="form-group"><label>Admin email</label><input type="email" id="mo-email" autocomplete="username" /></div>
      <div class="form-group"><label>Password</label><input type="password" id="mo-pass" autocomplete="current-password" /></div>
      <div class="login-error" id="mo-login-err" style="color:var(--danger);font-size:13px;min-height:18px;margin-bottom:8px"></div>
      <button class="btn btn-primary btn-full" id="mo-login-btn">Sign In</button>
    </div>

    <div id="mo-main" style="display:none">
      <div class="toolbar">
        <div class="toolbar-left">
          <input class="search-input" id="mo-search" placeholder="Search ref, name, email, tracking..." />
          <select class="filter-select" id="mo-status-filter"><option value="">All statuses</option>${STATUSES.map(s => `<option>${s}</option>`).join("")}</select>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="mo-refresh">↻ Refresh</button>
          <button class="btn btn-secondary" id="mo-signout">Sign out</button>
          <button class="btn btn-primary" id="mo-new">+ New Order</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Order Ref</th><th>Client</th><th>Status</th><th>Tracking</th><th>Est. Delivery</th><th>Total</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody id="mo-tbody"><tr><td colspan="8" class="state-msg">Loading…</td></tr></tbody>
      </table></div>
      <p class="mo-hint" style="margin-top:10px">Clients see an order once they sign up / log in with the <b>same email</b> entered here. You can create the order before they register.</p>
    </div>`;
  app.appendChild(panel);
  const norm = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const $ = id => document.getElementById(id);

  /* ── Shared popup ──────────────────────────────────────── */
const modal = document.createElement("div");
modal.className = "modal-overlay";
  modal.id = "mo-modal";
  modal.id = "dupname-modal";
  modal.style.zIndex = "400"; // above other modals
modal.innerHTML = `
    <div class="modal" style="max-width:760px">
      <div class="modal-header"><h2 id="mo-modal-title">New Order</h2><button class="modal-close" id="mo-modal-close">×</button></div>
    <div class="modal" style="max-width:460px">
      <div class="modal-header"><h2 id="dupname-title">Design name already exists</h2><button class="modal-close" id="dupname-x">×</button></div>
     <div class="modal-body">
        <p class="section-label">Order &amp; Client</p>
        <div class="form-grid">
          <div class="form-group"><label>Order Ref *</label><input type="text" id="mo-ref" /></div>
          <div class="form-group"><label>Status *</label><select id="mo-status">${STATUSES.map(s => `<option>${s}</option>`).join("")}</select></div>
          <div class="form-group"><label>Client Email * <span style="font-weight:400;text-transform:none;letter-spacing:0">— must match their login email</span></label><input type="email" id="mo-cemail" /></div>
          <div class="form-group"><label>Client Name</label><input type="text" id="mo-cname" /></div>
        </div>

        <div class="divider"></div>
        <p class="section-label">Items &amp; Total</p>
        <div class="form-grid">
          <div class="form-group full"><label>Items <span style="font-weight:400;text-transform:none;letter-spacing:0">— one per line: Name | SKU | Qty</span></label><textarea id="mo-items" placeholder="Petralia Bangle | VB1002 | 1"></textarea></div>
          <div class="form-group"><label>Order Total</label><input type="number" id="mo-total" step="0.01" /></div>
          <div class="form-group"><label>Currency</label><select id="mo-currency"><option>USD</option><option>INR</option><option>AED</option></select></div>
        </div>

        <div class="divider"></div>
        <p class="section-label">Shipping &amp; Tracking</p>
        <div class="form-grid">
          <div class="form-group"><label>Carrier</label><input type="text" id="mo-carrier" placeholder="e.g. DHL, FedEx, BlueDart" /></div>
          <div class="form-group"><label>Tracking Number</label><input type="text" id="mo-tnum" /></div>
          <div class="form-group"><label>Tracking Link</label><input type="text" id="mo-turl" placeholder="https://..." /></div>
          <div class="form-group"><label>Estimated Delivery</label><input type="date" id="mo-eta" /></div>
        </div>

        <div class="divider"></div>
        <p class="section-label">Details Shown to Client</p>
        <div class="form-grid">
          <div class="form-group full"><label>Message / Notes <span style="font-weight:400;text-transform:none;letter-spacing:0">— appears on the client's order card</span></label><textarea id="mo-notes"></textarea></div>
          <div class="form-group full"><label>Documents <span style="font-weight:400;text-transform:none;letter-spacing:0">— one per line: Title | URL (invoice, certificate, etc.)</span></label><textarea id="mo-docs" placeholder="Invoice | https://..."></textarea></div>
        </div>

        <div class="divider"></div>
        <p class="section-label">Timeline Update</p>
        <div class="form-group"><label>Update message <span style="font-weight:400;text-transform:none;letter-spacing:0">— optional. A timeline entry is added automatically when the status changes.</span></label><input type="text" id="mo-update-msg" placeholder="e.g. Your piece has entered production" /></div>
        <ul class="mo-timeline" id="mo-timeline"></ul>
        <p id="dupname-msg" style="font-size:14px;line-height:1.6;margin-bottom:12px"></p>
        <div id="dupname-list" style="font-size:13px;color:var(--text-muted);line-height:1.8;max-height:220px;overflow-y:auto"></div>
     </div>
     <div class="modal-footer">
        <button class="btn btn-secondary" id="mo-cancel">Cancel</button>
        <button class="btn btn-primary" id="mo-save">Save Order</button>
        <button class="btn btn-secondary" id="dupname-change">Change Name</button>
        <button class="btn btn-primary" id="dupname-continue">Continue Anyway</button>
     </div>
   </div>`;
document.body.appendChild(modal);

  const $ = id => document.getElementById(id);

  /* ── Tab switching (mirrors admin.html's own handler) ───── */
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    panel.classList.add("active");
    refreshView();
  });

  /* ── REST helper (uses the admin's Supabase login token) ── */
  async function api(path, method = "GET", body = null) {
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) { signOut(); throw new Error("Session expired — please sign in again."); }
    if (!res.ok) throw new Error(await res.text());
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  }
  let onChange = null, onContinue = null;

  /* ── Sign in / out ───────────────────────────────────────── */
  async function signIn() {
    const email = $("mo-email").value.trim(), password = $("mo-pass").value;
    $("mo-login-err").textContent = "";
    if (!email || !password) { $("mo-login-err").textContent = "Enter email and password."; return; }
    $("mo-login-btn").disabled = true;
    try {
      const r = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error_description || j.msg || "Sign-in failed.");
      token = j.access_token;
      // Confirm this account is actually in the admins table
      const chk = await fetch(SUPABASE_URL + "/rest/v1/rpc/is_admin", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: "{}"
      });
      if (!chk.ok || (await chk.json()) !== true) { token = ""; throw new Error("This account is not listed in the admins table."); }
      sessionStorage.setItem(TOKEN_KEY, token);
      $("mo-pass").value = "";
      refreshView();
    } catch (e) {
      $("mo-login-err").textContent = e.message;
    } finally { $("mo-login-btn").disabled = false; }
  function openPopup(o) {
    $("dupname-title").textContent = o.title;
    $("dupname-msg").innerHTML = o.msg;
    $("dupname-list").innerHTML = o.list;
    $("dupname-change").textContent = o.changeLabel;
    $("dupname-continue").textContent = o.continueLabel;
    onChange = o.onChange || null;
    onContinue = o.onContinue || null;
    modal.classList.add("open");
}
  function signOut() {
    token = ""; sessionStorage.removeItem(TOKEN_KEY); orders = [];
    refreshView();
  function closePopup() { modal.classList.remove("open"); }

  const doChange = () => { const cb = onChange; closePopup(); if (cb) cb(); };
  $("dupname-change").addEventListener("click", doChange);
  $("dupname-x").addEventListener("click", doChange);
  $("dupname-continue").addEventListener("click", () => { const cb = onContinue; closePopup(); if (cb) cb(); });

  /* ════════════════════════════════════════════════════════
     1. ADD / EDIT PRODUCT FORM
     ════════════════════════════════════════════════════════ */
  let ackName = ""; // normalised name the admin has already chosen to keep

  function findDups(name) {
    const n = norm(name);
    if (!n) return [];
    return allProducts.filter(p =>
      String(p.id) !== String(editingProductId) && norm(p.name) === n
    );
}
  $("mo-login-btn").addEventListener("click", signIn);
  $("mo-pass").addEventListener("keydown", e => { if (e.key === "Enter") signIn(); });
  $("mo-signout").addEventListener("click", signOut);

  function refreshView() {
    $("mo-login").style.display = token ? "none" : "block";
    $("mo-main").style.display = token ? "block" : "none";
    if (token) load();
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

  /* ── List ────────────────────────────────────────────────── */
  async function load() {
    try {
      orders = await api("member_orders?select=*,member_order_updates(*)&order=created_at.desc");
      render();
    } catch (e) { toast("Failed to load orders: " + e.message, "error"); }
  }
  // Check as soon as the name field is filled in
  nameInput.addEventListener("change", () => {
    const dups = findDups(nameInput.value);
    if (dups.length && norm(nameInput.value) !== ackName) askFormDuplicate(nameInput.value, dups, null);
  });

  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
  // Reset acknowledgement whenever the editor opens (an edited product's
  // existing name counts as accepted)
  const origOpen = window.openProductModal;
  window.openProductModal = function (id) {
    const r = origOpen.apply(this, arguments);
    ackName = id ? norm(nameInput.value) : "";
    return r;
  };

  function render() {
    const q = $("mo-search").value.trim().toLowerCase();
    const sf = $("mo-status-filter").value;
    const rows = orders.filter(o => {
      const hay = [o.order_ref, o.customer_name, o.member_email, o.tracking_number, o.carrier].filter(Boolean).join(" ").toLowerCase();
      return (!q || hay.includes(q)) && (!sf || o.status === sf);
    });
    $("mo-tbody").innerHTML = rows.length ? rows.map(o => `<tr>
      <td><strong>${esc(o.order_ref)}</strong></td>
      <td>${esc(o.customer_name || "—")}<div style="font-size:12px;color:var(--text-muted)">${esc(o.member_email)}</div></td>
      <td><span class="mo-status s-${esc(o.status.replace(/\s+/g, ""))}">${esc(o.status)}</span></td>
      <td style="font-size:12px">${o.tracking_number ? esc((o.carrier ? o.carrier + " · " : "") + o.tracking_number) : "—"}</td>
      <td style="font-size:12px">${esc(fmtDate(o.est_delivery))}</td>
      <td style="font-size:12px">${o.total_amount != null ? esc((o.currency || "") + " " + Number(o.total_amount).toLocaleString()) : "—"}</td>
      <td style="font-size:12px;color:var(--text-muted)">${esc(fmtDate(o.updated_at))}</td>
      <td><div class="actions-cell">
        <button class="btn btn-secondary btn-sm" data-edit="${o.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-del="${o.id}">Delete</button>
      </div></td></tr>`).join("")
      : `<tr><td colspan="8" class="state-msg">No orders found.</td></tr>`;
  }
  $("mo-search").addEventListener("input", render);
  $("mo-status-filter").addEventListener("change", render);
  $("mo-refresh").addEventListener("click", load);
  $("mo-tbody").addEventListener("click", e => {
    const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
    if (ed) openModal(orders.find(o => String(o.id) === ed.dataset.edit));
    if (del) {
      const o = orders.find(x => String(x.id) === del.dataset.del);
      openConfirm(`Delete order "${o.order_ref}"? The client will no longer see it.`, async () => {
        try { await api("member_orders?id=eq." + o.id, "DELETE"); toast("Order deleted."); load(); }
        catch (err) { toast("Error: " + err.message, "error"); }
      });
  // Safety net on Save, in case the first popup was skipped
  const origSave = window.saveProduct;
  window.saveProduct = function () {
    const name = nameInput.value;
    const dups = findDups(name);
    if (gv("f-sku") && dups.length && norm(name) !== ackName) {
      askFormDuplicate(name, dups, () => origSave());
      return;
}
  });

  /* ── Modal ───────────────────────────────────────────────── */
  const genRef = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `VJ-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${Math.floor(100 + Math.random() * 900)}`;
    return origSave.apply(this, arguments);
};

  function openModal(o) {
    editing = o || null;
    $("mo-modal-title").textContent = o ? "Edit Order " + o.order_ref : "New Order";
    $("mo-ref").value = o ? o.order_ref : genRef();
    $("mo-status").value = o ? o.status : "Order Received";
    $("mo-cemail").value = o ? o.member_email : "";
    $("mo-cname").value = o ? (o.customer_name || "") : "";
    $("mo-items").value = o ? (o.items || []).map(i => [i.name, i.sku, i.qty].map(v => v ?? "").join(" | ")).join("\n") : "";
    $("mo-total").value = o && o.total_amount != null ? o.total_amount : "";
    $("mo-currency").value = o ? (o.currency || "USD") : "USD";
    $("mo-carrier").value = o ? (o.carrier || "") : "";
    $("mo-tnum").value = o ? (o.tracking_number || "") : "";
    $("mo-turl").value = o ? (o.tracking_url || "") : "";
    $("mo-eta").value = o ? (o.est_delivery || "") : "";
    $("mo-notes").value = o ? (o.notes || "") : "";
    $("mo-docs").value = o ? (o.documents || []).map(d => `${d.title || ""} | ${d.url || ""}`).join("\n") : "";
    $("mo-update-msg").value = "";
    const ups = o ? (o.member_order_updates || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : [];
    $("mo-timeline").innerHTML = ups.map(u =>
      `<li><b>${esc(u.status || "Update")}</b>${u.message ? " — " + esc(u.message) : ""}<br><span style="font-size:11px">${esc(new Date(u.created_at).toLocaleString("en-IN"))}</span></li>`).join("");
    modal.classList.add("open");
  }
  const closeModal = () => { modal.classList.remove("open"); editing = null; };
  $("mo-modal-close").addEventListener("click", closeModal);
  $("mo-cancel").addEventListener("click", closeModal);
  $("mo-new").addEventListener("click", () => openModal(null));
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

  const parseItems = txt => txt.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [name, sku, qty] = l.split("|").map(s => s.trim());
    return { name: name || "Item", sku: sku || "", qty: Math.max(1, parseInt(qty, 10) || 1) };
  });
  const parseDocs = txt => txt.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.lastIndexOf("|");
    return i === -1 ? { title: "Document", url: l } : { title: l.slice(0, i).trim() || "Document", url: l.slice(i + 1).trim() };
  }).filter(d => /^https?:\/\//i.test(d.url));
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

  $("mo-save").addEventListener("click", async () => {
    const ref = $("mo-ref").value.trim();
    const email = $("mo-cemail").value.trim().toLowerCase();
    if (!ref || !email) { toast("Order ref and client email are required.", "error"); return; }
    const status = $("mo-status").value;
    const tUrl = $("mo-turl").value.trim();
    if (tUrl && !/^https?:\/\//i.test(tUrl)) { toast("Tracking link must start with http:// or https://", "error"); return; }
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

    const payload = {
      order_ref: ref,
      member_email: email,
      customer_name: $("mo-cname").value.trim() || null,
      status,
      items: parseItems($("mo-items").value),
      total_amount: $("mo-total").value !== "" ? parseFloat($("mo-total").value) : null,
      currency: $("mo-currency").value,
      carrier: $("mo-carrier").value.trim() || null,
      tracking_number: $("mo-tnum").value.trim() || null,
      tracking_url: tUrl || null,
      est_delivery: $("mo-eta").value || null,
      notes: $("mo-notes").value.trim() || null,
      documents: parseDocs($("mo-docs").value),
      updated_at: new Date().toISOString()
    };
    const msg = $("mo-update-msg").value.trim();
    const saveBtn = $("mo-save");
    saveBtn.disabled = true;
    try {
      let orderId, statusChanged;
      if (editing) {
        await api("member_orders?id=eq." + editing.id, "PATCH", payload);
        orderId = editing.id;
        statusChanged = editing.status !== status;
      } else {
        const r = await api("member_orders", "POST", payload);
        orderId = r[0].id;
        statusChanged = true; // first timeline entry
      }
      if (statusChanged || msg) {
        await api("member_order_updates", "POST", { order_id: orderId, status, message: msg || null });
      }
      toast(editing ? "Order updated." : "Order created.");
      closeModal();
      load();
    } catch (e) {
      toast("Error: " + e.message, "error");
    } finally { saveBtn.disabled = false; }
  });
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
