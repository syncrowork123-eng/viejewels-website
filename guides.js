/* Vie Jewels — Knowledge Lounge connector
   Powers: knowledge-lounge.html (hub grid) and guide.html (single guide template)
   Reuses the same Supabase project + publishable key as script.js, but is kept
   in its own file so the Knowledge Lounge feature can be added/removed without
   touching the existing product/cart logic in script.js.
   Requires script.js to be loaded first (uses its sbGet + esc helpers).
*/

const GUIDE_SELECT = "id,slug,title,subtitle,eyebrow,hero_image,card_image,excerpt,sections,sort_order";

let _allGuides = null;
async function getAllGuides() {
  if (_allGuides) return _allGuides;
  try {
    _allGuides = await sbGet(`guides?select=${GUIDE_SELECT}&is_active=eq.true&order=sort_order.asc,title.asc`);
  } catch (e) {
    console.error("Failed to load guides", e);
    _allGuides = [];
  }
  return _allGuides;
}

// ── HUB GRID (knowledge-lounge.html) ────────────────────────────────────
function guideCardHtml(g) {
  const img = g.card_image || g.hero_image || PLACEHOLDER_IMG;
  return `<a class="guide-card" href="guide.html?slug=${encodeURIComponent(g.slug)}">
    <div class="guide-card-media"><img src="${esc(img)}" alt="${esc(g.title)}" loading="lazy" /></div>
    <div class="guide-card-body">
      <h3>${esc(g.title)}</h3>
      <p>${esc(g.subtitle || g.excerpt || "")}</p>
    </div>
  </a>`;
}

async function renderGuideHub() {
  const grid = document.querySelector("[data-guide-grid]");
  if (!grid) return; // not on knowledge-lounge.html
  const guides = await getAllGuides();
  if (!guides.length) {
    grid.innerHTML = `<p style="padding:32px;color:var(--text-light);font-size:13px;">Guides are being prepared &mdash; check back soon.</p>`;
    return;
  }
  grid.innerHTML = guides.map(guideCardHtml).join("");
}

// ── SECTION BLOCK RENDERERS (guide.html) ────────────────────────────────
// Each renderer takes a section object and returns an HTML string.
// Unknown block types are skipped silently so a malformed row never
// breaks the whole page.

function renderBlock_text(s) {
  return `<div class="guide-block guide-block-text">
    ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ""}
    ${s.body ? `<p>${esc(s.body)}</p>` : ""}
  </div>`;
}

function renderBlock_image_text(s) {
  return `<div class="guide-block guide-block-image-text${s.reverse ? " reverse" : ""}">
    <div class="guide-block-image">
      <img src="${esc(s.image || PLACEHOLDER_IMG)}" alt="${esc(s.heading || "")}" loading="lazy" />
    </div>
    <div class="guide-block-copy">
      ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ""}
      ${s.body ? `<p>${esc(s.body)}</p>` : ""}
    </div>
  </div>`;
}

function renderBlock_pull_quote(s) {
  return `<blockquote class="guide-block guide-pull-quote">
    <p>${esc(s.quote || "")}</p>
    ${s.attribution ? `<cite>${esc(s.attribution)}</cite>` : ""}
  </blockquote>`;
}

function renderBlock_stat_grid(s) {
  const items = (s.items || [])
    .map(
      (it) => `<div class="guide-stat">
        <span class="guide-stat-label">${esc(it.label || "")}</span>
        <span class="guide-stat-value">${esc(it.value || "")}</span>
        <span class="guide-stat-body">${esc(it.body || "")}</span>
      </div>`
    )
    .join("");
  return `<div class="guide-block guide-stat-grid-wrap">
    ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ""}
    <div class="guide-stat-grid">${items}</div>
  </div>`;
}

function renderBlock_accordion(s) {
  const items = (s.items || [])
    .map(
      (it, i) => `<div class="guide-accordion-item">
        <button class="guide-accordion-q" type="button" data-accordion-toggle="${i}">
          <span>${esc(it.q || "")}</span>
          <span class="guide-accordion-icon">+</span>
        </button>
        <div class="guide-accordion-a" data-accordion-panel="${i}">
          <p>${esc(it.a || "")}</p>
        </div>
      </div>`
    )
    .join("");
  return `<div class="guide-block guide-accordion-wrap">
    ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ""}
    <div class="guide-accordion">${items}</div>
  </div>`;
}

function renderBlock_gallery(s) {
  const imgs = (s.images || [])
    .map((url) => `<div class="guide-gallery-item"><img src="${esc(url)}" alt="" loading="lazy" /></div>`)
    .join("");
  return `<div class="guide-block guide-gallery">${imgs}</div>`;
}

function renderBlock_divider() {
  return `<hr class="guide-divider" />`;
}

const GUIDE_BLOCK_RENDERERS = {
  text: renderBlock_text,
  image_text: renderBlock_image_text,
  pull_quote: renderBlock_pull_quote,
  stat_grid: renderBlock_stat_grid,
  accordion: renderBlock_accordion,
  gallery: renderBlock_gallery,
  divider: renderBlock_divider,
};

function wireAccordions(root) {
  root.querySelectorAll("[data-accordion-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = root.querySelector(`[data-accordion-panel="${btn.dataset.accordionToggle}"]`);
      const open = btn.classList.toggle("open");
      if (panel) panel.style.maxHeight = open ? panel.scrollHeight + "px" : null;
    });
  });
}

// ── SINGLE GUIDE PAGE (guide.html) ──────────────────────────────────────
async function renderGuideDetail() {
  const root = document.querySelector("[data-guide-detail]");
  if (!root) return; // not on guide.html

  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");
  if (!slug) {
    root.innerHTML = "<p>Guide not found.</p>";
    return;
  }

  let guide;
  try {
    const rows = await sbGet(`guides?select=${GUIDE_SELECT}&slug=eq.${encodeURIComponent(slug)}&is_active=eq.true`);
    guide = rows[0];
  } catch (e) {
    console.error(e);
  }

  if (!guide) {
    root.innerHTML = "<p>Sorry, we couldn't find that guide.</p>";
    return;
  }

  document.title = `${guide.title} | Vie Jewels`;

  const eyebrowEl = document.querySelector("[data-guide-eyebrow]");
  if (eyebrowEl) eyebrowEl.textContent = guide.eyebrow || "Knowledge Lounge";

  const titleEl = document.querySelector("[data-guide-title]");
  if (titleEl) titleEl.textContent = guide.title || "";

  const subtitleEl = document.querySelector("[data-guide-subtitle]");
  if (subtitleEl) subtitleEl.textContent = guide.subtitle || "";

  const heroEl = document.querySelector("[data-guide-hero]");
  if (heroEl) {
    if (guide.hero_image) {
      heroEl.style.backgroundImage = `url("${guide.hero_image}")`;
      heroEl.style.display = "";
    } else {
      heroEl.style.display = "none";
    }
  }

  const bodyEl = document.querySelector("[data-guide-body]");
  if (bodyEl) {
    const sections = Array.isArray(guide.sections) ? guide.sections : [];
    bodyEl.innerHTML = sections
      .map((s) => {
        const renderer = GUIDE_BLOCK_RENDERERS[s.type];
        return renderer ? renderer(s) : "";
      })
      .join("");
    wireAccordions(bodyEl);
  }

  // Related guides strip at the end of the page
  const relatedEl = document.querySelector("[data-guide-related]");
  if (relatedEl) {
    const all = await getAllGuides();
    const others = all.filter((g) => g.slug !== slug).slice(0, 3);
    relatedEl.innerHTML = others.map(guideCardHtml).join("");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderGuideHub();
  renderGuideDetail();
});
