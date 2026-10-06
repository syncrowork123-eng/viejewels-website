// ════════════════════════════════════════════════════════════════
// VIE JEWELS ADMIN — Version badge + changelog
// Add ONE line to admin.html, just before </body> (put it LAST, after the
// other admin-*.js scripts):
//     <script src="admin-version.js?v=1.1"></script>
//
// VERSIONING RULE
//   Each admin update raises the number by one step:
//   1.0 → 1.1 → 1.2 … 1.9 → 2.0 → 2.1 … 2.9 → 3.0 and so on.
//   To release an update: change ADMIN_VERSION below, add a new entry at the
//   TOP of CHANGELOG, and change the ?v= number in the script tag so browsers
//   don't serve a cached copy.
// ════════════════════════════════════════════════════════════════
(function () {
  const ADMIN_VERSION = "1.1";

  const CHANGELOG = [
    {
      version: "1.1",
      note: "Duplicate Design Name warning now also works when editing a name directly in the Products table (Change Name / Save Anyway)."
    },
    {
      version: "1.0",
      note: "Baseline release. Products, Enquiries, Masters, Cost Calculator, Bulk Upload, Pages & Design, Members & Orders (client order tracking), and the duplicate Design Name check."
    }
  ];

  /* ── Styles ──────────────────────────────────────────────── */
  const style = document.createElement("style");
  style.textContent = `
    .vj-ver { display:inline-block; margin-left:10px; padding:2px 8px; font-size:10px; font-weight:700;
      letter-spacing:.08em; color:var(--accent); border:1px solid var(--accent); border-radius:20px;
      cursor:pointer; vertical-align:middle; text-transform:none; background:transparent; font-family:var(--font); }
    .vj-ver:hover { background:var(--accent); color:#0f0f0f; }
    .vj-ver-login { display:block; margin:-20px auto 20px; width:max-content; }
    .vj-cl-item { padding:12px 0; border-bottom:1px solid var(--border); }
    .vj-cl-item:last-child { border-bottom:none; }
    .vj-cl-item b { font-size:13px; color:var(--accent); }
    .vj-cl-item p { font-size:13px; color:var(--text-muted); line-height:1.6; margin-top:4px; }
  `;
  document.head.appendChild(style);

  /* ── Changelog popup ─────────────────────────────────────── */
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.zIndex = "500";
  modal.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header"><h2>Admin version history</h2><button class="modal-close" type="button">×</button></div>
      <div class="modal-body">${CHANGELOG.map(c =>
        `<div class="vj-cl-item"><b>v${c.version}</b><p>${c.note}</p></div>`).join("")}</div>
      <div class="modal-footer"><button class="btn btn-secondary" type="button">Close</button></div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.classList.remove("open");
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector(".modal-footer button").addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  function makeBadge(extraClass) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "vj-ver" + (extraClass ? " " + extraClass : "");
    b.textContent = "v" + ADMIN_VERSION;
    b.title = "View version history";
    b.addEventListener("click", () => modal.classList.add("open"));
    return b;
  }

  /* ── Badge in the admin header (next to "VIE JEWELS — Admin") ── */
  const headerBrand = document.querySelector(".admin-header .brand");
  if (headerBrand) headerBrand.appendChild(makeBadge());

  /* ── Badge on the login screen, under "Admin Panel" ──────────── */
  const loginTitle = document.querySelector(".login-card h1");
  if (loginTitle) loginTitle.insertAdjacentElement("afterend", makeBadge("vj-ver-login"));

  window.ADMIN_VERSION = ADMIN_VERSION;
})();
