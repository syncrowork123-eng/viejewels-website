// ════════════════════════════════════════════════════════════════
// VIE JEWELS ADMIN — Version badge
// Shows which build of admin.html is live, and updates by itself every time
// admin.html is re-uploaded (no number to edit by hand).
//
// How the number is worked out (first one available wins):
//   1. admin.html's Last-Modified header from the server   → "v2026.10.07 14:32"
//   2. admin.html's ETag header (hosts that don't send a date) → "build 3f9a1c2"
//   3. Opened from a local file (file://)                  → file's modified date
//
// While the page stays open it re-checks every 5 minutes. If a newer
// admin.html has been uploaded, the badge turns gold: "New version — click to refresh".
//
// In admin.html, just before </body> (keep this file separate from
// admin-duplicate-name.js):
//     <script src="admin-version.js?v=2"></script>
// ════════════════════════════════════════════════════════════════
(function () {
  if (window.__vjVersionLoaded) return;
  window.__vjVersionLoaded = true;

  const CHECK_EVERY_MS = 5 * 60 * 1000;
  const pad = n => String(n).padStart(2, "0");

  function fmtDate(d) {
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function shortHash(s) {
    s = String(s).replace(/^W\//, "").replace(/["']/g, "");
    return s.replace(/[^a-zA-Z0-9]/g, "").slice(0, 7) || "unknown";
  }

  // Returns { label, key, title } describing the admin.html currently on the server
  async function readServerVersion() {
    if (location.protocol === "file:") {
      const d = new Date(document.lastModified);
      return { label: "v" + fmtDate(d), key: String(d.getTime()), title: "Local file — modified " + d.toString() };
    }
    const res = await fetch(location.pathname + location.search, { method: "HEAD", cache: "no-store" });
    const lm = res.headers.get("Last-Modified");
    if (lm) {
      const d = new Date(lm);
      if (!isNaN(d)) return { label: "v" + fmtDate(d), key: lm, title: "admin.html last uploaded " + d.toString() };
    }
    const et = res.headers.get("ETag");
    if (et) return { label: "build " + shortHash(et), key: et, title: "admin.html build id (ETag) " + et };
    return { label: "version n/a", key: "", title: "The server did not send Last-Modified or ETag for admin.html" };
  }

  const badge = document.createElement("div");
  badge.id = "vj-version-badge";
  badge.style.cssText =
    "position:fixed;right:10px;bottom:8px;z-index:60;font:11px/1.4 system-ui,sans-serif;" +
    "padding:3px 9px;border-radius:999px;background:rgba(0,0,0,.06);color:#777;cursor:default;" +
    "user-select:none;backdrop-filter:blur(2px)";
  badge.textContent = "version …";
  document.body.appendChild(badge);

  let loadedKey = null;

  async function check(first) {
    try {
      const v = await readServerVersion();
      if (first) {
        loadedKey = v.key;
        badge.textContent = v.label;
        badge.title = v.title;
        console.info("[admin] " + v.label);
      } else if (v.key && loadedKey && v.key !== loadedKey) {
        badge.textContent = "New version — click to refresh";
        badge.title = "A newer admin.html has been uploaded (now " + v.label + "). Click to reload.";
        badge.style.cssText += ";background:#b8922a;color:#fff;cursor:pointer";
        badge.onclick = () => location.reload();
      }
    } catch (e) {
      if (first) { badge.textContent = "version n/a"; badge.title = "Could not read version: " + e.message; }
      console.warn("[admin] version check failed", e);
    }
  }

  check(true);
  setInterval(() => check(false), CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(false); });
})();
