// ════════════════════════════════════════════════════════════════
// VIE JEWELS ADMIN — Version badge
// Shows which build of admin.html is live, and updates by itself every time
// admin.html is re-uploaded (no number to edit by hand).
//
// How the number is worked out (first one available wins):
//   1. admin.html's Last-Modified header from the server   → "v2026.10.07 14:32"
//   2. admin.html's ETag header (hosts that don't send a date) → "build 3f9a1c2"
//   3. No headers at all: a fingerprint of the page itself   → "build 3f9a1c2"
//   4. Opened from a local file (file://)                  → file's modified date
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

  // Small stable hash of the page text (used when the server sends no date / ETag)
  function hashText(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0").slice(0, 7);
  }

  function fromHeaders(res) {
    const lm = res.headers.get("Last-Modified");
    if (lm) {
      const d = new Date(lm);
      if (!isNaN(d)) return { label: "v" + fmtDate(d), key: lm, title: "admin.html last uploaded " + d.toString() };
    }
    const et = res.headers.get("ETag");
    if (et) return { label: "build " + shortHash(et), key: et, title: "admin.html build id (ETag) " + et };
    return null;
  }

  // Returns { label, key, title } describing the admin.html currently on the server
  async function readServerVersion() {
    if (location.protocol === "file:") {
      const d = new Date(document.lastModified);
      return { label: "v" + fmtDate(d), key: String(d.getTime()), title: "Local file — modified " + d.toString() };
    }
    const url = location.pathname + location.search;
    // 1. cheap: headers only
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      const v = res.ok && fromHeaders(res);
      if (v) return v;
    } catch (e) { /* fall through to full download */ }
    // 2. fallback: download the page and fingerprint it (changes exactly when admin.html changes)
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status + " reading " + url);
    const v = fromHeaders(res);
    if (v) return v;
    const h = hashText(await res.text());
    return { label: "build " + h, key: h, title: "admin.html fingerprint " + h + " (server sends no date; this changes whenever the file changes)" };
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
