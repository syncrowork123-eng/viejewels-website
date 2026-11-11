// ════════════════════════════════════════════════════════════════
// VIE JEWELS ADMIN — Version badge
// Shows the admin version number (1.1, 1.2 … 1.9, 2.0, 2.1 …) in the bottom-right corner.
//
// The number lives in ONE place: the <meta name="vj-admin-version"> tag in admin.html's <head>.
// Every time admin.html is changed, that number goes up by 0.1 (after x.9 comes the next whole
// number: 1.9 → 2.0). This file never needs editing.
//
// While the page stays open it re-reads admin.html from the server every 5 minutes. If the
// version number there is different from the one this page loaded with, the badge turns gold:
// "New version 1.4 — click to refresh".
//
// In admin.html, just before </body>:
//     <script src="admin-version.js?v=4"></script>
// ════════════════════════════════════════════════════════════════
(function () {
  if (window.__vjVersionLoaded) return;
  window.__vjVersionLoaded = true;

  const CHECK_EVERY_MS = 5 * 60 * 1000;
  const META_RE = /<meta[^>]+name=["']vj-admin-version["'][^>]*content=["']([^"']+)["']/i;
  const pad = n => String(n).padStart(2, "0");
  const fmtDate = d => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  // Small stable fingerprint of the page text (only used by very old admin.html files with no version tag)
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

  // The version this page was loaded with
  const meta = document.querySelector('meta[name="vj-admin-version"]');
  const loadedVersion = meta ? (meta.getAttribute("content") || "").trim() : "";

  const badge = document.createElement("div");
  badge.id = "vj-version-badge";
  badge.style.cssText =
    "position:fixed;right:10px;bottom:8px;z-index:60;font:11px/1.4 system-ui,sans-serif;" +
    "padding:3px 9px;border-radius:999px;background:rgba(0,0,0,.06);color:#777;cursor:default;" +
    "user-select:none;backdrop-filter:blur(2px)";
  badge.textContent = loadedVersion ? "v" + loadedVersion : "version …";
  badge.title = loadedVersion ? "Admin version " + loadedVersion : "No version number found in admin.html";
  document.body.appendChild(badge);
  if (loadedVersion) console.info("[admin] version " + loadedVersion);

  // Reads the admin.html currently on the server: its version number (and a change stamp as a fallback)
  async function readServer() {
    const res = await fetch(location.pathname + location.search, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const m = text.match(META_RE);
    const lm = res.headers.get("Last-Modified");
    return {
      version: m ? m[1].trim() : "",
      stamp: lm || res.headers.get("ETag") || hashText(text),
      modified: lm ? new Date(lm) : null,
    };
  }

  let loadedStamp = null;

  async function check(first) {
    if (location.protocol === "file:") return;           // can't re-read a local file; the number above is enough
    try {
      const s = await readServer();
      if (first) {
        loadedStamp = s.stamp;
        if (s.modified && !isNaN(s.modified) && loadedVersion) badge.title = "Admin version " + loadedVersion + " — uploaded " + fmtDate(s.modified);
        if (!loadedVersion && s.version) { badge.textContent = "v" + s.version; }
        return;
      }
      // Newer file on the server? Compare version numbers; if this page has none, compare the change stamp.
      const changed = loadedVersion ? (s.version && s.version !== loadedVersion)
                                    : (loadedStamp && s.stamp !== loadedStamp);
      if (changed) {
        badge.textContent = "New version" + (s.version ? " " + s.version : "") + " — click to refresh";
        badge.title = "A newer admin.html has been uploaded. Click to reload.";
        badge.style.cssText += ";background:#b8922a;color:#fff;cursor:pointer";
        badge.onclick = () => location.reload();
      }
    } catch (e) {
      console.warn("[admin] version check failed", e);
    }
  }

  check(true);
  setInterval(() => check(false), CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(false); });
})();
