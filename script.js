/* Vie Jewels — Frontend <-> Supabase connector
   Powers: index.html, collections.html, product.html
   Reads the same Supabase tables that admin.html writes to.
*/

const SUPABASE_URL = "https://efiajmmxlrvyppdwwfug.supabase.co";
const SUPABASE_KEY = "sb_publishable_-VEloc-EI4CfRx4K9_si3g_E7QDIpfk";

const PLACEHOLDER_IMG = "https://res.cloudinary.com/demo/image/upload/w_500,h_500,c_fill,b_rgb:f0ece5/sample.jpg";

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
    },
  });
  if (!res.ok) throw new Error("Supabase error " + res.status);
  return res.json();
}

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── DISPLAY CURRENCY (set via top filter bar) ───────────────────────────
let _displayCurrency = null; // {code, symbol, rate_to_inr} or null = use product's native currency

function getBaseUSD(p) {
  if (p.price_usd != null && p.price_usd !== "") return Number(p.price_usd);
  if (p.currency === "USD" && p.price != null) return Number(p.price);
  if (p.price != null && p.currency === "INR") {
    const inrPerUsd = _inrPerUsd();
    if (inrPerUsd) return Number(p.price) / inrPerUsd;
  }
  return null;
}

function fmtPrice(p) {
  // Prefer live-computed price from the pricing engine (metal + stone + labour),
  // using whichever currency is currently selected in the top filter bar.
  if (_pmMetals) {
    const currencyCode = _displayCurrency?.code || "INR";
    const costs = computeLivePriceCosts(p, currencyCode);
    if (costs && costs.total > 0) return costs.fmtTotal;
  }

  // Fallback: static price fields on the product record (legacy / manual pricing)
  if (_displayCurrency) {
    const usd = getBaseUSD(p);
    if (usd == null) return "Price on request";
    if (_displayCurrency.code === "USD") {
      return "$ " + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (_displayCurrency.code === "INR") {
      const inrPerUsd = _inrPerUsd();
      if (inrPerUsd) {
        const inr = usd * inrPerUsd;
        return "₹ " + inr.toLocaleString("en-IN", { maximumFractionDigits: 0 });
      }
    } else if (_displayCurrency.rate_to_inr) {
      const inrPerUsd = _inrPerUsd();
      if (inrPerUsd) {
        const inr = usd * inrPerUsd;
        const converted = inr * _displayCurrency.rate_to_inr;
        return esc(_displayCurrency.symbol) + " " + converted.toLocaleString("en-US", { maximumFractionDigits: 2 });
      }
    }
    return "Price on request";
  }
  if (p.price_usd != null && p.price_usd !== "") {
    return "$ " + Number(p.price_usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (p.currency === "USD" && p.price != null) {
    return "$ " + Number(p.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (p.price != null) {
    const sym = p.currency === "AED" ? "AED " : p.currency === "INR" || !p.currency ? "₹ " : (p.currency + " ");
    return sym + Number(p.price).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  return "Price on request";
}

// Selected metal color (from top filter bar) — applies to product tile images only,
// never affects pricing or technical details.
let _selectedMetalColor = null;

// Maps Metal Color dropdown values to URL filename suffixes (e.g. SKU-W.jpg for White).
const METAL_COLOR_SUFFIXES = {
  "white":          ["-w"],
  "yellow":         ["-y"],
  "rose":           ["-r", "-rose"],
  "model showcase": ["-model"],
  "spotlight view": ["-spot"],
};

function _imageMatchesColor(url, colorKey) {
  if (!url || !colorKey) return false;
  const suffixes = METAL_COLOR_SUFFIXES[colorKey.toLowerCase()] || [];
  // Strip query-string and extension, compare end of path case-insensitively
  const base = url.split("?")[0].toLowerCase().replace(/\.[a-z0-9]+$/, "");
  return suffixes.some((s) => base.endsWith(s));
}

function primaryImage(product) {
  const media = (product.product_media || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const images = media.filter((m) => m.media_type !== "video");

  // If a metal color is selected, match first by DB field then by URL suffix convention
  if (_selectedMetalColor) {
    const colorKey = _selectedMetalColor.toLowerCase();
    const colorMatch =
      images.find((m) => (m.metal_color || "").toLowerCase() === colorKey) ||
      images.find((m) => _imageMatchesColor(m.url, colorKey));
    if (colorMatch) return colorMatch.url;
  }

  const primary = images.find((m) => m.is_primary) || images[0] || media[0];
  return primary?.url || PLACEHOLDER_IMG;
}

function categoryLabel(p) {
  const jc = (p.product_jewel_cats || [])[0];
  if (jc) return [jc.jewel_type, jc.sub_type1, jc.sub_type2].filter(Boolean).join(" › ");
  return p.categories?.name || [p.metal, p.stone].filter(Boolean).join(" · ") || "Vie Jewels";
}

function productJewelType(p) {
  return (p.product_jewel_cats || [])[0]?.jewel_type || null;
}

// ── PRODUCT SELECT (shared) ────────────────────────────────────────────
const PRODUCT_SELECT =
  "*,categories(id,name,slug),product_media(id,url,media_type,is_primary,alt_text,sort_order,metal_color),product_tags(tags(id,name,slug)),product_jewel_cats(jewel_type,sub_type1,sub_type2),product_stones(stone_type,setting_type,shape,pcs,length_mm,width_mm),product_size_variants(id,size_label,net_weight_18k,net_weight_14k,net_weight_10k,net_weight_silver,sort_order,product_size_variant_stones(stone_type,setting_type,shape,pcs,length_mm,width_mm))";

let _allProducts = null;
async function getAllProducts() {
  if (_allProducts) return _allProducts;
  try {
    _allProducts = await sbGet(
      `products?select=${PRODUCT_SELECT}&is_active=eq.true&order=sort_order.asc,name.asc`
    );
  } catch (e) {
    console.error("Failed to load products", e);
    _allProducts = [];
  }
  return _allProducts;
}

let _allCategories = null;
async function getAllCategories() {
  if (_allCategories) return _allCategories;
  try {
    _allCategories = await sbGet("categories?select=id,name,slug&order=name.asc");
  } catch (e) {
    console.error("Failed to load categories", e);
    _allCategories = [];
  }
  return _allCategories;
}

let _allMetalTypes = null;
async function getAllMetalTypes() {
  if (_allMetalTypes) return _allMetalTypes;
  try {
    _allMetalTypes = await sbGet("metal_types?select=id,name,quality&order=name.asc");
  } catch (e) {
    console.error("Failed to load metal types", e);
    _allMetalTypes = [];
  }
  return _allMetalTypes;
}

// Derive the "color" portion of a metal name, e.g. "18K Yellow Gold" -> "Yellow Gold"
function metalColorFromName(name) {
  if (!name) return null;
  const stripped = name.replace(/\b(\d{1,2}K|925|999|Platinum|PT950)\b/gi, "").trim().replace(/\s+/g, " ");
  return stripped || null;
}

let _allCurrencies = null;
async function getAllCurrencies() {
  if (_allCurrencies) return _allCurrencies;
  try {
    _allCurrencies = await sbGet("currencies?select=id,code,symbol,rate_to_inr&order=code.asc");
  } catch (e) {
    console.error("Failed to load currencies", e);
    _allCurrencies = [];
  }
  return _allCurrencies;
}

// ── SIZE DATA ───────────────────────────────────────────────────────────
let _ringSizes = null, _bangleSizes = null;
async function getRingSizes() {
  if (_ringSizes) return _ringSizes;
  try { _ringSizes = await sbGet("ring_sizes?order=diameter_mm.asc"); }
  catch (e) { console.error("Failed to load ring sizes", e); _ringSizes = []; }
  return _ringSizes;
}
async function getBangleSizes() {
  if (_bangleSizes) return _bangleSizes;
  try { _bangleSizes = await sbGet("bangle_sizes?order=size_mm.asc"); }
  catch (e) { console.error("Failed to load bangle sizes", e); _bangleSizes = []; }
  return _bangleSizes;
}
async function getJewelCategory(jewel_cat_id) {
  if (!jewel_cat_id) return null;
  try {
    const rows = await sbGet("jewel_categories?id=eq." + jewel_cat_id + "&select=jewel_type,sub_type1,sub_type2");
    return rows[0] || null;
  } catch (e) { return null; }
}

// Returns "ring", "bangle", or null based on jewel category
function sizeTypeFromJewelCat(jc) {
  if (!jc) return null;
  const t = (jc.jewel_type || "").toLowerCase();
  if (t.includes("ring") || t.includes("band")) return "ring";
  if (t.includes("bangle") || t.includes("bracelet")) return "bangle";
  return null;
}

// ── SELECTED SIZE (shared across cart actions) ─────────────────
let _selectedSize = null;

// The admin-defined size variant currently selected on the product page
// (holds its own net weights + stone rows, so price is specific to size).
let _selectedSizeVariant = null;

// Returns a shallow-cloned product with metal net weights and stone rows
// swapped for the currently selected size variant's own data (if any),
// so the existing pricing engine (calcProductPrice / getAvailableMetalQualities)
// can be reused unchanged to price a specific size without any other code
// needing to know size variants exist.
function _effectiveProductForPricing(product) {
  if (!_selectedSizeVariant || !product) return product;
  const v = _selectedSizeVariant;
  return {
    ...product,
    net_weight_18k: v.net_weight_18k || 0,
    net_weight_14k: v.net_weight_14k || 0,
    net_weight_10k: v.net_weight_10k || 0,
    net_weight_silver: v.net_weight_silver || 0,
    product_stones: v.product_size_variant_stones || [],
  };
}


// ── CATEGORY GRID ───────────────────────────────────────────────────────
async function renderCategoryGrid() {
  const el = document.querySelector("[data-category-grid]");
  if (!el) return;
  const products = await getAllProducts();

  // Build distinct jewel types from product_jewel_cats, with counts + sample image
  const typeMap = new Map();
  products.forEach((p) => {
    const t = productJewelType(p);
    if (!t) return;
    if (!typeMap.has(t)) typeMap.set(t, { count: 0, sample: null });
    const entry = typeMap.get(t);
    entry.count++;
    if (!entry.sample) entry.sample = p;
  });

  if (!typeMap.size) {
    // Fallback to old categories table if no jewel categories exist yet
    const cats = await getAllCategories();
    if (!cats.length) {
      el.innerHTML = "<p>No categories yet.</p>";
      return;
    }
    el.innerHTML = cats
      .map((c) => {
        const count = products.filter((p) => p.category_id === c.id).length;
        const sample = products.find((p) => p.category_id === c.id);
        const img = sample ? primaryImage(sample) : PLACEHOLDER_IMG;
        return `<a class="category-card" href="collections.html?category=${encodeURIComponent(c.slug)}">
          <div class="category-card-media"><img src="${esc(img)}" alt="${esc(c.name)}" loading="lazy" /></div>
          <h3>${esc(c.name)}</h3>
          <p>${count} ${count === 1 ? "piece" : "pieces"}</p>
        </a>`;
      })
      .join("");
    return;
  }

  el.innerHTML = [...typeMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, entry]) => {
      const img = entry.sample ? primaryImage(entry.sample) : PLACEHOLDER_IMG;
      return `<a class="category-card" href="collections.html?jewelcat=${encodeURIComponent(type)}">
        <div class="category-card-media"><img src="${esc(img)}" alt="${esc(type)}" loading="lazy" /></div>
        <h3>${esc(type)}</h3>
        <p>${entry.count} ${entry.count === 1 ? "piece" : "pieces"}</p>
      </a>`;
    })
    .join("");
}

// ── PRODUCT GRID ────────────────────────────────────────────────────────
function productCardHtml(p) {
  return `<a class="product-card" href="product.html?id=${encodeURIComponent(p.id)}">
    <div class="product-card-media"><img src="${esc(primaryImage(p))}" alt="${esc(p.name)}" loading="lazy" /></div>
    <div class="product-card-body">
      <h3 class="product-card-name">${esc(p.name || "Untitled")}</h3>
      ${p.sku ? `<p class="product-card-sku">${esc(p.sku)}</p>` : ""}
      ${p.short_description ? `<p class="product-card-desc">${esc(p.short_description)}</p>` : ""}
      <p class="product-card-price">${fmtPrice(p)}</p>
    </div>
  </a>`;
}

let _currentCategorySlug = null;
let _currentJewelCat = null;
let _checkedJewelCats = new Set();
let _checkedJewelSubCats = new Set(); // "jewel_type||sub_type1" keys
let _checkedJewelSubCats2 = new Set(); // "jewel_type||sub_type1||sub_type2" keys
let _allProductsCache = null;
let _currentSort = "newest";
let _selectedTags = new Set();

function getPriceUSD(p) {
  const live = getLivePriceUSD(p);
  if (live != null) return live;
  if (p.price_usd != null && p.price_usd !== "") return Number(p.price_usd);
  if (p.currency === "USD" && p.price != null) return Number(p.price);
  return null;
}

function numOrNull(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function productStoneFields(p) {
  const stones = p.product_stones || [];
  return {
    types: stones.map((s) => s.stone_type).filter(Boolean),
    shapes: stones.map((s) => s.shape).filter(Boolean),
    settings: stones.map((s) => s.setting_type).filter(Boolean),
  };
}

// ── METAL TYPE / QUALITY FILTER HELPERS ─────────────────────────────────
// Maps each karat/purity code to its broad "Metal Type" used in the top
// filter bar (Gold vs Silver).
const METAL_QUALITY_TYPE = { "18K": "Gold", "14K": "Gold", "10K": "Gold", "925": "Silver" };

// Which karat/purity qualities a product is actually available in, based on
// its "Metal Net Weights" fields (net_weight_18k/14k/10k/silver).
function productMetalQualities(p) {
  const out = [];
  if (Number(p.net_weight_18k)    > 0) out.push("18K");
  if (Number(p.net_weight_14k)    > 0) out.push("14K");
  if (Number(p.net_weight_10k)    > 0) out.push("10K");
  if (Number(p.net_weight_silver) > 0) out.push("925");
  return out;
}

// Resolves the set of {types, qualities} a product matches for the
// "Metal Type" (Gold/Silver) and "Metal Quality" (18K/14K/10K/925) filters.
// Prefers the structured net-weight fields; falls back to parsing the
// free-text `metal` field (e.g. "18K Yellow Gold", "925 Silver") for older
// records that don't have net-weight columns populated.
function parseMetal(p) {
  const qualities = productMetalQualities(p);
  if (qualities.length) {
    return {
      types: [...new Set(qualities.map((q) => METAL_QUALITY_TYPE[q]))],
      qualities,
    };
  }
  const s = String(p.metal || "");
  const qMatch = s.match(/\b(18K|14K|10K|22K|24K|925|999)\b/i);
  const quality = qMatch ? qMatch[0].toUpperCase() : null;
  let type = null;
  if (/silver/i.test(s)) type = "Silver";
  else if (/gold/i.test(s) || quality) type = "Gold";
  return { types: type ? [type] : [], qualities: quality ? [quality] : [] };
}

async function renderProductGrid() {
  const el = document.querySelector("[data-product-grid]");
  if (!el) return;
  await loadPricingMasters(); // needed for live price computation on tiles
  const products = await getAllProducts();
  _allProductsCache = products;
  const params = new URLSearchParams(location.search);
  _currentCategorySlug = params.get("category");
  _currentJewelCat = params.get("jewelcat");
  if (_currentJewelCat) _checkedJewelCats.add(_currentJewelCat);

  // Build jewel category sidebar tree (only on pages that have the sidebar)
  const sidebarEl = document.querySelector("[data-jewelcat-filters]");
  if (sidebarEl) {
    // Build a hierarchy: jewel_type → { count, subs: Map<sub_type1, { pids, subs2: Map<sub_type2, pids> }> }
    const typeTree = new Map(); // type → { count, subs: Map<sub_type1, {...}> }
    products.forEach((p) => {
      (p.product_jewel_cats || []).forEach((jc) => {
        const t = jc.jewel_type;
        if (!t) return;
        if (!typeTree.has(t)) typeTree.set(t, { count: 0, subs: new Map() });
        const entry = typeTree.get(t);
        // Only count this product once per type
        if (!entry._seen) { entry._seen = new Set(); }
        if (!entry._seen.has(p.id)) { entry._seen.add(p.id); entry.count++; }
        const sub = jc.sub_type1;
        if (sub) {
          if (!entry.subs.has(sub)) entry.subs.set(sub, { pids: new Set(), subs2: new Map() });
          const subEntry = entry.subs.get(sub);
          subEntry.pids.add(p.id);
          const sub2 = jc.sub_type2;
          if (sub2) {
            if (!subEntry.subs2.has(sub2)) subEntry.subs2.set(sub2, new Set());
            subEntry.subs2.get(sub2).add(p.id);
          }
        }
      });
    });

    const renderTree = () => {
      sidebarEl.innerHTML = [...typeTree.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([type, entry]) => {
          const isTypeChecked = _checkedJewelCats.has(type);
          const hasSubs = entry.subs.size > 0;
          const anySubChecked = hasSubs && [...entry.subs.keys()].some(s => _checkedJewelSubCats.has(type + "||" + s));
          const anySub2Checked = hasSubs && [...entry.subs.entries()].some(([s, subEntry]) =>
            [...subEntry.subs2.keys()].some(s2 => _checkedJewelSubCats2.has(type + "||" + s + "||" + s2))
          );
          const isOpen = isTypeChecked || anySubChecked || anySub2Checked || _currentJewelCat === type;

          const subHtml = hasSubs ? [...entry.subs.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([sub, subEntry]) => {
              const key = type + "||" + sub;
              const isSubChecked = _checkedJewelSubCats.has(key);
              const hasSubs2 = subEntry.subs2.size > 0;

              const sub2Html = hasSubs2 ? [...subEntry.subs2.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([sub2, pids2]) => {
                  const key2 = key + "||" + sub2;
                  const isSub2Checked = _checkedJewelSubCats2.has(key2);
                  return `<label class="filter-tree-sub-label filter-tree-sub2-label">
                    <input type="checkbox" data-jewelcat-sub2-cb data-type="${esc(type)}" data-sub1="${esc(sub)}" data-sub2="${esc(sub2)}" ${isSub2Checked ? "checked" : ""} />
                    <span>${esc(sub2)}</span>
                    <span class="filter-count">${pids2.size}</span>
                  </label>`;
                }).join("") : "";

              return `<div class="filter-tree-node">
                <div class="filter-tree-row">
                  <label class="filter-tree-sub-label">
                    <input type="checkbox" data-jewelcat-sub-cb data-type="${esc(type)}" data-sub="${esc(sub)}" ${isSubChecked ? "checked" : ""} />
                    <span>${esc(sub)}</span>
                    <span class="filter-count">${subEntry.pids.size}</span>
                  </label>
                </div>
                ${hasSubs2 ? `<div class="filter-tree-children" data-tree-children2="${esc(key)}">${sub2Html}</div>` : ""}
              </div>`;
            }).join("") : "";

          return `<div class="filter-tree-node">
            <div class="filter-tree-row">
              <label class="filter-tree-label">
                <input type="checkbox" data-jewelcat-cb value="${esc(type)}" ${isTypeChecked ? "checked" : ""} />
                <span class="filter-tree-name">${esc(type)}</span>
                <span class="filter-count">${entry.count}</span>
              </label>
              ${hasSubs ? `<button class="filter-tree-toggle" data-tree-toggle="${esc(type)}" aria-expanded="${isOpen}" type="button">${isOpen ? "▾" : "▸"}</button>` : ""}
            </div>
            ${hasSubs ? `<div class="filter-tree-children" data-tree-children="${esc(type)}" style="${isOpen ? "" : "display:none"}">${subHtml}</div>` : ""}
          </div>`;
        }).join("");

      // Wire top-level checkboxes
      sidebarEl.querySelectorAll("[data-jewelcat-cb]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const type = cb.value;
          if (cb.checked) {
            _checkedJewelCats.add(type);
            // Clear any sub-selections for this type (both levels)
            [..._checkedJewelSubCats].forEach(k => { if (k.startsWith(type + "||")) _checkedJewelSubCats.delete(k); });
            [..._checkedJewelSubCats2].forEach(k => { if (k.startsWith(type + "||")) _checkedJewelSubCats2.delete(k); });
            // Uncheck all sub-checkboxes visually
            sidebarEl.querySelectorAll(`[data-jewelcat-sub-cb][data-type="${CSS.escape(type)}"]`).forEach(s => s.checked = false);
            sidebarEl.querySelectorAll(`[data-jewelcat-sub2-cb][data-type="${CSS.escape(type)}"]`).forEach(s => s.checked = false);
          } else {
            _checkedJewelCats.delete(type);
          }
          applyFilters();
        });
      });

      // Wire sub-type-1 checkboxes
      sidebarEl.querySelectorAll("[data-jewelcat-sub-cb]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const key = cb.dataset.type + "||" + cb.dataset.sub;
          if (cb.checked) {
            _checkedJewelSubCats.add(key);
            // Uncheck parent type if a sub is selected
            const parentCb = sidebarEl.querySelector(`[data-jewelcat-cb][value="${CSS.escape(cb.dataset.type)}"]`);
            if (parentCb && parentCb.checked) { parentCb.checked = false; _checkedJewelCats.delete(cb.dataset.type); }
            // Clear any sub-type-2 selections nested under this sub-type-1
            [..._checkedJewelSubCats2].forEach(k => { if (k.startsWith(key + "||")) _checkedJewelSubCats2.delete(k); });
            sidebarEl.querySelectorAll(`[data-jewelcat-sub2-cb][data-type="${CSS.escape(cb.dataset.type)}"][data-sub1="${CSS.escape(cb.dataset.sub)}"]`).forEach(s => s.checked = false);
          } else {
            _checkedJewelSubCats.delete(key);
          }
          applyFilters();
        });
      });

      // Wire sub-type-2 checkboxes
      sidebarEl.querySelectorAll("[data-jewelcat-sub2-cb]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const key1 = cb.dataset.type + "||" + cb.dataset.sub1;
          const key2 = key1 + "||" + cb.dataset.sub2;
          if (cb.checked) {
            _checkedJewelSubCats2.add(key2);
            // Uncheck parent type and parent sub-type-1 if this sub-type-2 is selected
            const parentCb = sidebarEl.querySelector(`[data-jewelcat-cb][value="${CSS.escape(cb.dataset.type)}"]`);
            if (parentCb && parentCb.checked) { parentCb.checked = false; _checkedJewelCats.delete(cb.dataset.type); }
            const parentSubCb = sidebarEl.querySelector(`[data-jewelcat-sub-cb][data-type="${CSS.escape(cb.dataset.type)}"][data-sub="${CSS.escape(cb.dataset.sub1)}"]`);
            if (parentSubCb && parentSubCb.checked) { parentSubCb.checked = false; _checkedJewelSubCats.delete(key1); }
          } else {
            _checkedJewelSubCats2.delete(key2);
          }
          applyFilters();
        });
      });

      // Wire expand/collapse toggles
      sidebarEl.querySelectorAll("[data-tree-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const type = btn.dataset.treeToggle;
          const children = sidebarEl.querySelector(`[data-tree-children="${CSS.escape(type)}"]`);
          const isOpen = btn.getAttribute("aria-expanded") === "true";
          btn.setAttribute("aria-expanded", String(!isOpen));
          btn.textContent = isOpen ? "▸" : "▾";
          if (children) children.style.display = isOpen ? "none" : "";
        });
      });
    };

    renderTree();
  }

  // Build tag / theme chips in sidebar
  const tagFilterEl = document.querySelector("[data-tag-filters]");
  if (tagFilterEl) {
    const tagCounts = new Map();
    products.forEach((p) => {
      (p.product_tags || []).forEach((t) => {
        const name = t.tags?.name;
        if (name) tagCounts.set(name, (tagCounts.get(name) || 0) + 1);
      });
    });
    tagFilterEl.innerHTML = [...tagCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name]) => `<button class="filter-tag-chip${_selectedTags.has(name) ? " active" : ""}" data-tag="${esc(name)}" type="button">${esc(name)}</button>`)
      .join("");
    tagFilterEl.querySelectorAll("[data-tag]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const tag = chip.dataset.tag;
        if (_selectedTags.has(tag)) {
          _selectedTags.delete(tag);
          chip.classList.remove("active");
        } else {
          _selectedTags.add(tag);
          chip.classList.add("active");
        }
        applyFilters();
      });
    });
  }

  if (_currentJewelCat && !sidebarEl) {
    const heading = document.querySelector("[data-products-heading]");
    if (heading) heading.textContent = _currentJewelCat;
  } else if (_currentCategorySlug) {
    const cats = await getAllCategories();
    const cat = cats.find((c) => c.slug === _currentCategorySlug);
    const heading = document.querySelector("[data-products-heading]");
    if (heading && cat) heading.textContent = cat.name;
  }

  // Wire range filter inputs
  ["[data-price-min]", "[data-price-max]", "[data-weight-min]", "[data-weight-max]", "[data-diamond-min]", "[data-diamond-max]"].forEach((sel) => {
    const input = document.querySelector(sel);
    if (input) input.addEventListener("input", applyFilters);
  });

  const clearBtn = document.querySelector("[data-clear-filters]");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      _checkedJewelCats.clear();
      _checkedJewelSubCats.clear();
      _checkedJewelSubCats2.clear();
      document.querySelectorAll("[data-jewelcat-cb]").forEach((cb) => (cb.checked = false));
      document.querySelectorAll("[data-jewelcat-sub-cb]").forEach((cb) => (cb.checked = false));
      document.querySelectorAll("[data-jewelcat-sub2-cb]").forEach((cb) => (cb.checked = false));
      _selectedTags.clear();
      document.querySelectorAll("[data-tag]").forEach((chip) => chip.classList.remove("active"));
      ["[data-price-min]", "[data-price-max]", "[data-weight-min]", "[data-weight-max]", "[data-diamond-min]", "[data-diamond-max]"].forEach((sel) => {
        const input = document.querySelector(sel);
        if (input) input.value = "";
      });
      ["[data-filter-metal-quality]", "[data-filter-stone-type]", "[data-filter-diamond-color]", "[data-filter-diamond-quality]"].forEach((sel) => {
        const dd = document.querySelector(sel);
        if (dd) dd.value = "";
      });
      _selectedCatalogMetalQuality = null;
      try { localStorage.removeItem("vj_metal_quality"); } catch (e) {}
      _selectedCatalogDiamondColor = null;
      _selectedCatalogDiamondQuality = null;
      _selectedCatalogStoneType = null;
      _livePriceCache.clear();
      populateDiamondFilters(); // rebuild Diamond Quality options for the cleared color
      const search = document.querySelector("[data-product-search]");
      if (search) search.value = "";
      applyFilters();
    });
  }

  applyFilters();

  const search = document.querySelector("[data-product-search]");
  if (search) {
    search.addEventListener("input", applyFilters);
  }

  // ── SORT BUTTONS ──────────────────────────────────────────────────────
   document.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      _currentSort = btn.dataset.sort;
      document.querySelectorAll("[data-sort]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyFilters();
    });
  });
}

// ── SHARED TOP FILTER BAR ────────────────────────────────────────────────
// Metal Type / Metal Quality / Metal Color / Stone Type / Currency live in
// the shared header used across index.html, collections.html, and
// product.html. Populates those dropdowns from product + pricing data and
// wires their change handlers. Previously this only ran inside
// renderProductGrid(), so on product.html (which has no [data-product-grid])
// these controls were never populated or wired — meaning a "Stone Type"
// selection (e.g. "Lab Grown") on the product page had no effect at all.
// Running it independently of the grid fixes that, and onCatalogFilterChange()
// below makes sure a change re-renders whichever of (grid / product detail)
// is present on the current page.
async function setupCatalogFilterBar() {
  const metalQualitySel = document.querySelector("[data-filter-metal-quality]");
  const metalColorSel = document.querySelector("[data-filter-metal-color]");
  const stoneTypeSel = document.querySelector("[data-filter-stone-type]");
  const currencySel = document.querySelector("[data-filter-currency]");
  const metalTypeSel = document.querySelector("[data-filter-metal-type]");

  if (!(metalQualitySel || metalColorSel || stoneTypeSel || currencySel || metalTypeSel)) {
    // No shared filter bar on this page — still let Diamond Color/Quality
    // (if present on their own) populate.
    populateDiamondFilters();
    return;
  }

  await loadPricingMasters();

  // Stone types sourced from the Stone Prices master (_pmStoneTypes.type),
  // so any type added in admin automatically appears here.
  const stoneTypesSet = new Set(
    (_pmStoneTypes || []).map(s => s.type).filter(Boolean)
  );

  const fillSelect = (sel, values, placeholder) => {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">${esc(placeholder)}</option>` +
      [...values].sort().map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    sel.value = cur;
    sel.addEventListener("change", onCatalogFilterChange);
  };

  fillSelect(stoneTypeSel, stoneTypesSet, "Stone Type");
  if (stoneTypeSel) {
    stoneTypeSel.addEventListener("change", () => {
      _selectedCatalogStoneType = stoneTypeSel.value || null;
      _livePriceCache.clear();
      onCatalogFilterChange();
    });
  }

  // ── METAL TYPE: hardcoded Gold / Silver ──────────────────────────────
  if (metalTypeSel) {
    const cur = metalTypeSel.value;
    metalTypeSel.innerHTML = `<option value="">Metal Type</option>` +
      ["Gold", "Silver"].map(t => `<option value="${esc(t)}"${t === cur ? " selected" : ""}>${esc(t)}</option>`).join("");
  }

  // ── METAL QUALITY: drives live price calculation on tiles + product page ──
  // Options cascade based on the selected Metal Type:
  //   Gold   -> 18K Gold, 14K Gold, 10K Gold
  //   Silver -> 925 Silver
  //   (none) -> all qualities
  const ALL_QUALITIES = [
    { quality: "18K", label: "18K Gold",   type: "Gold" },
    { quality: "14K", label: "14K Gold",   type: "Gold" },
    { quality: "10K", label: "10K Gold",   type: "Gold" },
    { quality: "925", label: "925 Silver", type: "Silver" },
  ];

  const populateMetalQuality = (preferredValue) => {
    if (!metalQualitySel) return;
    const typeFilter = metalTypeSel?.value || "";
    const options = ALL_QUALITIES.filter(q => !typeFilter || q.type === typeFilter);

    metalQualitySel.innerHTML = `<option value="">Metal Quality</option>` +
      options.map(({ quality, label }) => `<option value="${esc(quality)}">${esc(label)}</option>`).join("");

    // Keep the preferred value only if it's still valid for this type
    const valid = options.some(o => o.quality === preferredValue);
    metalQualitySel.value = valid ? preferredValue : "";
    _selectedCatalogMetalQuality = metalQualitySel.value || null;
    try { localStorage.setItem("vj_metal_quality", _selectedCatalogMetalQuality || ""); } catch (e) {}
  };

  if (metalTypeSel) {
    metalTypeSel.addEventListener("change", () => {
      populateMetalQuality(_selectedCatalogMetalQuality || "");
      onCatalogFilterChange();
    });
  }

  if (metalQualitySel) {
    const cur = metalQualitySel.value;

    // Restore last-used quality (persisted across pages) if nothing else is set yet
    let storedQuality = null;
    try { storedQuality = localStorage.getItem("vj_metal_quality"); } catch (e) {}

    const preferredValue = cur || _selectedCatalogMetalQuality || storedQuality || "";

    // If we have a preferred quality but no Metal Type selected yet, infer
    // the Metal Type from it so the dropdown opens already filtered.
    if (preferredValue && metalTypeSel && !metalTypeSel.value) {
      const match = ALL_QUALITIES.find(q => q.quality === preferredValue);
      if (match) metalTypeSel.value = match.type;
    }

    populateMetalQuality(preferredValue);

    metalQualitySel.addEventListener("change", () => {
      _selectedCatalogMetalQuality = metalQualitySel.value || null;
      try { localStorage.setItem("vj_metal_quality", _selectedCatalogMetalQuality || ""); } catch (e) {}
      onCatalogFilterChange();
    });
  }

  if (currencySel) {
    const currencies = await getAllCurrencies();
    const cur = currencySel.value;
    // INR is the base currency — always listed first, then all others from DB
    const inrFirst = [
      { code: "INR", symbol: "₹" },
      ...currencies.filter(c => c.code !== "INR"),
    ];
    currencySel.innerHTML = inrFirst
      .map(c => `<option value="${esc(c.code)}">${esc(c.symbol)} ${esc(c.code)}</option>`)
      .join("");
    currencySel.value = cur || "INR";
    const findCur = code => currencies.find(c => c.code === code) || { code: "INR", symbol: "₹", rate_to_inr: 1 };
    _displayCurrency = findCur(currencySel.value);
    currencySel.addEventListener("change", () => {
      _displayCurrency = findCur(currencySel.value);
      onCatalogFilterChange();
    });
  }

  // ── METAL COLOR: display-only — selects which tagged product image to show ──
  // Does NOT affect pricing or technical details.
  if (metalColorSel) {
    const cur = metalColorSel.value;
    metalColorSel.innerHTML = `<option value="">Metal Color</option>` +
      ["White", "Yellow", "Rose", "Model Showcase", "Spotlight View"]
        .map(c => `<option value="${esc(c)}"${c === cur ? " selected" : ""}>${esc(c)}</option>`).join("");
    _selectedMetalColor = metalColorSel.value || null;
    metalColorSel.addEventListener("change", () => {
      _selectedMetalColor = metalColorSel.value || null;
      onCatalogFilterChange();
    });
  }

  // ── DIAMOND COLOR / QUALITY: drive live price calculation (stone rate lookup) ──
  // Sourced from stone_types (Stone Price List), so every option corresponds to
  // a real pricing row. Quality options cascade from the selected Color.
  populateDiamondFilters();
}

// Called whenever any shared top-filter-bar control changes. Refreshes the
// catalog grid (if this page has one) and the product detail price
// breakdown (if this page has one) so the same selections drive pricing
// everywhere — e.g. picking "Lab Grown" updates Stone Charges on the
// product detail page too, not just collection tile prices.
function onCatalogFilterChange() {
  if (document.querySelector("[data-product-grid]")) applyFilters();
  if (document.querySelector("[data-product-detail]") && _lastLoadedProduct) {
    const effProduct = _effectiveProductForPricing(_lastLoadedProduct);
    const available = getAvailableMetalQualities(effProduct);
    renderProductPricingForSelection(effProduct, available);
    if (_updateProductGalleryColor) _updateProductGalleryColor();
  }
}

// ── DIAMOND COLOR / QUALITY FILTERS ─────────────────────────────────────
// Populates "Diamond Color" and "Diamond Quality" from stone_types (Stone
// Price List in admin). Diamond Quality cascades from the selected Color.
// Both are price-display selectors (like Metal Quality) — they influence
// calcProductPrice()'s stone-rate lookup but never hide products that don't
// have a matching stone (graceful fallback to type+shape rate).
let _diamondFiltersWired = false;
function populateDiamondFilters() {
  const colorSel = document.querySelector("[data-filter-diamond-color]");
  const qualitySel = document.querySelector("[data-filter-diamond-quality]");
  if (!colorSel && !qualitySel) return;

  const stoneTypes = _pmStoneTypes || [];

  const refreshQualities = () => {
    if (!qualitySel) return;
    const colorFilter = colorSel?.value || "";
    const qualities = [...new Set(
      stoneTypes
        .filter((s) => !colorFilter || s.color === colorFilter)
        .map((s) => s.quality)
        .filter(Boolean)
    )].sort();
    const cur = qualitySel.value;
    qualitySel.innerHTML = `<option value="">Diamond Quality</option>` +
      qualities.map((q) => `<option value="${esc(q)}">${esc(q)}</option>`).join("");
    qualitySel.value = qualities.includes(cur) ? cur : "";
    _selectedCatalogDiamondQuality = qualitySel.value || null;
  };

  if (colorSel) {
    const colors = [...new Set(stoneTypes.map((s) => s.color).filter(Boolean))].sort();
    const cur = colorSel.value;
    colorSel.innerHTML = `<option value="">Diamond Color</option>` +
      colors.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    colorSel.value = colors.includes(cur) ? cur : "";
    _selectedCatalogDiamondColor = colorSel.value || null;
  }

  refreshQualities();

  if (!_diamondFiltersWired) {
    if (colorSel) {
      colorSel.addEventListener("change", () => {
        _selectedCatalogDiamondColor = colorSel.value || null;
        _livePriceCache.clear();
        refreshQualities();
        onCatalogFilterChange();
      });
    }
    if (qualitySel) {
      qualitySel.addEventListener("change", () => {
        _selectedCatalogDiamondQuality = qualitySel.value || null;
        _livePriceCache.clear();
        onCatalogFilterChange();
      });
    }
    _diamondFiltersWired = true;
  }
}

function updateProductsHeading() {
  const heading = document.querySelector("[data-products-heading]");
  if (!heading) return;
  if (_checkedJewelSubCats2.size === 1) {
    const [key] = [..._checkedJewelSubCats2];
    const [type, sub1, sub2] = key.split("||");
    heading.textContent = [type, sub1, sub2].filter(Boolean).join(" › ");
  } else if (_checkedJewelSubCats2.size > 1) {
    heading.textContent = "Selected Categories";
  } else if (_checkedJewelSubCats.size === 1) {
    const [key] = [..._checkedJewelSubCats];
    const [type, sub1] = key.split("||");
    heading.textContent = [type, sub1].filter(Boolean).join(" › ");
  } else if (_checkedJewelSubCats.size > 1) {
    heading.textContent = "Selected Categories";
  } else if (_checkedJewelCats.size === 1) {
    heading.textContent = [..._checkedJewelCats][0];
  } else if (_checkedJewelCats.size > 1) {
    heading.textContent = "Selected Categories";
  } else if (_currentJewelCat) {
    heading.textContent = _currentJewelCat;
  } else if (!_currentCategorySlug) {
    heading.textContent = "All Products";
  }
}

function applyFilters() {
  updateProductsHeading();
  const products = _allProductsCache || [];
  const term = (document.querySelector("[data-product-search]")?.value || "").toLowerCase().trim();

  const priceMin = numOrNull(document.querySelector("[data-price-min]")?.value);
  const priceMax = numOrNull(document.querySelector("[data-price-max]")?.value);
  const weightMin = numOrNull(document.querySelector("[data-weight-min]")?.value);
  const weightMax = numOrNull(document.querySelector("[data-weight-max]")?.value);
  const diamondMin = numOrNull(document.querySelector("[data-diamond-min]")?.value);
  const diamondMax = numOrNull(document.querySelector("[data-diamond-max]")?.value);

  let list = products;

  if (_checkedJewelSubCats2.size) {
    // Sub-type-2 filtering: match products whose jewel_cats include any checked sub2
    list = list.filter((p) => {
      const jcats = p.product_jewel_cats || [];
      return jcats.some(jc => {
        const key = (jc.jewel_type || "") + "||" + (jc.sub_type1 || "") + "||" + (jc.sub_type2 || "");
        return _checkedJewelSubCats2.has(key);
      });
    });
  } else if (_checkedJewelSubCats.size) {
    // Sub-type filtering: match products whose jewel_cats include any checked sub
    list = list.filter((p) => {
      const jcats = p.product_jewel_cats || [];
      return jcats.some(jc => {
        const key = (jc.jewel_type || "") + "||" + (jc.sub_type1 || "");
        return _checkedJewelSubCats.has(key);
      });
    });
  } else if (_checkedJewelCats.size) {
    list = list.filter((p) => _checkedJewelCats.has(productJewelType(p)));
  } else if (_currentJewelCat) {
    list = list.filter((p) => productJewelType(p) === _currentJewelCat);
  } else if (_currentCategorySlug) {
    list = list.filter((p) => p.categories?.slug === _currentCategorySlug);
  }

  const metalType = document.querySelector("[data-filter-metal-type]")?.value;
  const metalQuality = document.querySelector("[data-filter-metal-quality]")?.value;
  if (metalType || metalQuality) {
    list = list.filter((p) => {
      const { types, qualities } = parseMetal(p);
      if (metalType && !types.includes(metalType)) return false;
      if (metalQuality && !qualities.includes(metalQuality)) return false;
      return true;
    });
  }

  // [data-filter-stone-type] is a pricing selector only — never hides products.
  const stoneShape = document.querySelector("[data-filter-stone-shape]")?.value;
  const stoneSetting = document.querySelector("[data-filter-stone-setting]")?.value;
  if (stoneShape || stoneSetting) {
    list = list.filter((p) => {
      const sf = productStoneFields(p);
      if (stoneShape && !sf.shapes.includes(stoneShape)) return false;
      if (stoneSetting && !sf.settings.includes(stoneSetting)) return false;
      return true;
    });
  }

  if (priceMin != null || priceMax != null) {
    list = list.filter((p) => {
      const price = getPriceUSD(p);
      if (price == null) return false;
      if (priceMin != null && price < priceMin) return false;
      if (priceMax != null && price > priceMax) return false;
      return true;
    });
  }

  if (weightMin != null || weightMax != null) {
    list = list.filter((p) => {
      const w = p.metal_weight;
      if (w == null) return false;
      if (weightMin != null && w < weightMin) return false;
      if (weightMax != null && w > weightMax) return false;
      return true;
    });
  }

  if (diamondMin != null || diamondMax != null) {
    list = list.filter((p) => {
      const w = p.stone_weight;
      if (w == null) return false;
      if (diamondMin != null && w < diamondMin) return false;
      if (diamondMax != null && w > diamondMax) return false;
      return true;
    });
  }

  if (term) {
    list = list.filter((p) => {
      const hay = [p.name, p.sku, p.metal, p.stone, p.short_description, p.categories?.name, productJewelType(p)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }

  // Tag / theme filter
  if (_selectedTags.size) {
    list = list.filter((p) => {
      const pTags = (p.product_tags || []).map((t) => t.tags?.name).filter(Boolean);
      return [..._selectedTags].every((tag) => pTags.includes(tag));
    });
  }

  // Index page: only show a handful of highlights (no sidebar/search present)
  if (!document.querySelector("[data-product-search]")) {
    list = list.slice(0, 8);
  }

  // ── SORT ──────────────────────────────────────────────────────────────
  if (_currentSort === "sku") {
    list = list.slice().sort((a, b) => (a.sku || "").localeCompare(b.sku || ""));
  } else if (_currentSort === "price-asc") {
    list = list.slice().sort((a, b) => (getPriceUSD(a) ?? Infinity) - (getPriceUSD(b) ?? Infinity));
  } else if (_currentSort === "price-desc") {
    list = list.slice().sort((a, b) => (getPriceUSD(b) ?? -Infinity) - (getPriceUSD(a) ?? -Infinity));
  }

  applyProductList(list);
}

function applyProductList(list) {
  const el = document.querySelector("[data-product-grid]");
  const countEl = document.querySelector("[data-product-count]");
  if (countEl) countEl.textContent = list.length + (list.length === 1 ? " style" : " styles");
  if (!list.length) {
    el.innerHTML = "<p>No products found.</p>";
    return;
  }
  el.innerHTML = list.map(productCardHtml).join("");
}

// ── SIZE SELECTOR ───────────────────────────────────────────────────────
async function renderSizeSelector(product) {
  const section = document.querySelector("[data-product-sizes]");
  const optionsEl = document.querySelector("[data-size-options]");
  if (!section || !optionsEl) return;

  // ── PRIORITY: admin-defined size variants ────────────────────────────
  // These are ADDITIONAL sizes on top of the product's own default
  // details — not a replacement for them. Each carries its own metal net
  // weights + stone rows, so picking one actually changes the computed
  // price (see _effectiveProductForPricing / runProductPricing). Falls
  // through to the generic ring/bangle chart below only if the product
  // has no extra sizes added at all.
  const extraVariants = (product.product_size_variants || [])
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  if (extraVariants.length) {
    // The product's own default size/metal/stone details (entered on the
    // main product form) are always shown first — the "Sizes" button in
    // admin only adds MORE sizes alongside this default, it never hides it.
    const masterOption = { isMaster: true, size_label: product.size || "Default" };
    const options = [masterOption, ...extraVariants];

    section.style.display = "";
    optionsEl.innerHTML = options
      .map((v, i) => `<button class="size-btn" data-variant-index="${i}" type="button">${esc(v.size_label || "—")}</button>`)
      .join("");

    const buttons = [...optionsEl.querySelectorAll(".size-btn")];
    buttons.forEach((btn, i) => {
      btn.addEventListener("click", async () => {
        buttons.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        const opt = options[i];
        _selectedSize = opt.size_label;
        // Master option → no override (null tells _effectiveProductForPricing
        // to use the product's own net weights/stones, unchanged).
        _selectedSizeVariant = opt.isMaster ? null : opt;
        if (_lastLoadedProduct) await runProductPricing(_lastLoadedProduct);
      });
    });

    // Auto-select the master (default) option so it — not an admin-added
    // extra size — is what shows first on page load.
    if (buttons[0]) {
      buttons[0].classList.add("selected");
      _selectedSize = options[0].size_label;
      _selectedSizeVariant = null;
    }
    return;
  }

  // ── FALLBACK: generic ring/bangle size chart (labels only — no per-size
  // price data, since the product has no size variants defined in admin) ──
  const firstJc = (product.product_jewel_cats || [])[0];
  const sizeType = sizeTypeFromJewelCat(firstJc);
  if (!sizeType) return; // not a ring or bangle — hide the section

  let sizes = [];
  let renderOption;

  if (sizeType === "ring") {
    sizes = await getRingSizes();
    renderOption = (s) => {
      const label = [
        s.diameter_mm != null && "ID " + s.diameter_mm + "mm",
        s.india       && "IND " + s.india,
        s.us          && "US "  + s.us,
        s.europe      && "EU "  + s.europe,
        s.uk          && "UK "  + s.uk,
      ].filter(Boolean).join(" / ");
      return `<button class="size-btn" data-size="${esc(label)}" type="button">${esc(label || "—")}</button>`;
    };
  } else {
    sizes = await getBangleSizes();
    renderOption = (s) => {
      const btnLabel  = (s.label || "") + (s.label ? '"(IN)' : "");
      const annaLabel = s.size_mm != null ? "ID " + s.size_mm + "mm" : "";
      const fullLabel = [btnLabel, annaLabel].filter(Boolean).join(" / ");
      return `<button class="size-btn" data-size="${esc(fullLabel)}" type="button">${esc(fullLabel || "—")}</button>`;
    };
  }

  if (!sizes.length) return;

  section.style.display = "";
  optionsEl.innerHTML = sizes.map(renderOption).join("");

  optionsEl.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      optionsEl.querySelectorAll(".size-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      _selectedSize = btn.dataset.size;
    });
  });
}

// ── PRODUCT DETAIL PAGE ─────────────────────────────────────────────────
async function _renderProductDetailBase() {
  const root = document.querySelector("[data-product-detail]");
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || params.get("slug");
  if (!id) {
    root.innerHTML = "<p>Product not found.</p>";
    return;
  }

  let product;
  try {
    const filter = params.get("id") ? `id=eq.${encodeURIComponent(id)}` : `slug=eq.${encodeURIComponent(id)}`;
    const rows = await sbGet(`products?select=${PRODUCT_SELECT}&${filter}`);
    product = rows[0];
  } catch (e) {
    console.error(e);
  }

  if (!product) {
    root.innerHTML = "<p>Sorry, we couldn't find that product.</p>";
    return;
  }

  _lastLoadedProduct = product;
  document.title = `${product.name || "Product"} | Vie Jewels`;

  // Category / eyebrow
  const catEl = document.querySelector("[data-product-category]");
  if (catEl) catEl.textContent = categoryLabel(product);

  // Name
  const nameEl = document.querySelector("[data-product-name]");
  if (nameEl) nameEl.textContent = product.name || "Untitled Design";

  // Price
  const priceEl = document.querySelector("[data-product-price]");
  if (priceEl) priceEl.textContent = fmtPrice(product);

  // Description
  const descEl = document.querySelector("[data-product-description]");
  if (descEl) descEl.textContent = product.description || product.short_description || "";

  // Gallery
  const media = (product.product_media || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const images = media.filter((m) => m.media_type !== "video");
  const mediaEl = document.querySelector("[data-product-media]");
  const thumbsEl = document.querySelector("[data-product-thumbnails]");

  const showImage = (url, activeBtn) => {
    if (mediaEl) mediaEl.innerHTML = `<img src="${esc(url)}" alt="${esc(product.name || "")}" />`;
    if (thumbsEl && activeBtn) {
      thumbsEl.querySelectorAll(".thumb").forEach((t) => t.classList.remove("active"));
      activeBtn.classList.add("active");
    }
  };

  const bestImageForColor = () => {
    if (!images.length) return null;
    if (_selectedMetalColor) {
      const colorKey = _selectedMetalColor.toLowerCase();
      return (
        images.find((m) => (m.metal_color || "").toLowerCase() === colorKey) ||
        images.find((m) => _imageMatchesColor(m.url, colorKey)) ||
        images.find((m) => m.is_primary) ||
        images[0]
      );
    }
    return images.find((m) => m.is_primary) || images[0];
  };

  if (images.length) {
    if (thumbsEl) {
      thumbsEl.innerHTML = images
        .map(
          (m, i) =>
            `<button class="thumb${i === 0 ? " active" : ""}" data-thumb data-url="${esc(m.url)}" data-url-key="${esc(m.url)}">
              <img src="${esc(m.url)}" alt="" />
            </button>`
        )
        .join("");
      thumbsEl.querySelectorAll("[data-thumb]").forEach((btn) => {
        btn.addEventListener("click", () => {
          showImage(btn.dataset.url, btn);
        });
      });
    }

    const best = bestImageForColor();
    const bestBtn = thumbsEl?.querySelector(`[data-url-key="${CSS.escape(best?.url || "")}"]`) || thumbsEl?.querySelector(".thumb");
    showImage(best?.url || images[0].url, bestBtn);

    // Called by onCatalogFilterChange when Metal Color dropdown changes
    _updateProductGalleryColor = () => {
      if (!images.length) return;
      const best = bestImageForColor();
      const bestBtn = thumbsEl?.querySelector(`[data-url-key="${CSS.escape(best?.url || "")}"]`);
      showImage(best?.url || images[0].url, bestBtn || thumbsEl?.querySelector(".thumb"));
    };
  } else {
    showImage(PLACEHOLDER_IMG, null);
  }

  // Specs
  const specsEl = document.querySelector("[data-product-specs]");
  if (specsEl) {
    const specs = [
      ["SKU", product.sku],
      ["Metal", product.metal],
      ["Stone", product.stone],
      ["Size", product.size],
      ["Gross Weight", product.gross_weight],
      ["Dimensions", product.dimensions],
      ["Availability", product.stock_status],
    ].filter(([, v]) => v);
    const tags = (product.product_tags || []).map((t) => t.tags?.name).filter(Boolean);
    if (tags.length) specs.push(["Tags", tags.join(", ")]);
    const jewelCats = (product.product_jewel_cats || [])
      .map((c) => [c.jewel_type, c.sub_type1, c.sub_type2].filter(Boolean).join(" › "))
      .filter(Boolean);
    if (jewelCats.length) specs.push(["Category", jewelCats.join(", ")]);
    const stoneDetails = (product.product_stones || [])
      .map((s) => {
        const parts = [s.stone_type, s.shape, s.setting_type].filter(Boolean);
        const dims = [s.pcs ? s.pcs + " pcs" : null, s.length_mm && s.width_mm ? `${s.length_mm}×${s.width_mm}mm` : null].filter(Boolean);
        return [parts.join(" "), dims.join(", ")].filter(Boolean).join(" — ");
      })
      .filter(Boolean);
    if (stoneDetails.length) specs.push(["Stone Details", stoneDetails.join("; ")]);
    specsEl.innerHTML = specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  }

  // Size selector
  await renderSizeSelector(product);

  // Actions — inquiry cart
  const cartBtn = document.querySelector("[data-add-cart]");
  if (cartBtn) {
    refreshCartBtn(cartBtn, product.id);
    cartBtn.addEventListener("click", () => {
      const notesEl = document.querySelector("[data-product-notes]");
      const notes = notesEl ? notesEl.value.trim() : "";
      toggleStored("vj_cart", product, "cart", notes);
      refreshCartBtn(cartBtn, product.id);
      updateNavBadges();
    });
  }
}

function refreshCartBtn(btn, id) {
  const list = getStored("vj_cart");
  btn.textContent = list.some((x) => String(x.id) === String(id)) ? "Added to Enquiry" : "Add to Enquiry";
}

// ── LOCAL STORAGE: INQUIRY CART ────────────────────────────────
function getStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function setStored(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

// Splits a formatted price string like "$ 1,234.56" or "₹ 12,345" into a
// leading currency symbol/code and a numeric value, so cart line totals and
// the grand total can be computed. Returns value:null for non-numeric
// strings such as "Price on request".
function parseCartPrice(str) {
  const s = String(str || "").trim();
  const m = s.match(/^([^\d]*)([\d,]+(?:\.\d+)?)/);
  if (!m) return { symbol: "", value: null };
  const value = parseFloat(m[2].replace(/,/g, ""));
  return { symbol: m[1].trim(), value: isNaN(value) ? null : value };
}

function toggleStored(key, product, label, notes, options) {
  let list = getStored(key);
  const exists = list.some((x) => String(x.id) === String(product.id));
  if (exists) {
    list = list.filter((x) => String(x.id) !== String(product.id));
  } else {
    const priceDisplay = fmtPrice(product);
    const { symbol, value } = parseCartPrice(priceDisplay);
    list.push({
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: priceDisplay,       // formatted unit rate, e.g. "$ 1,234.56"
      priceValue: value,         // numeric unit rate, or null if "Price on request"
      priceSymbol: symbol,       // currency symbol/code as shown
      image: primaryImage(product),
      size: _selectedSize || null,
      notes: notes || null,
      qty: 1,
      options: options || null,  // selected metal/color/stone/diamond/size summary
    });
  }
  setStored(key, list);
}

function updateNavBadges() {
  const cartItems = getStored("vj_cart");
  const cartCount = cartItems.reduce((sum, i) => sum + (parseInt(i.qty, 10) || 1), 0);
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = cartCount;
    el.style.display = cartCount ? "" : "none";
  });
}

// ── CART PAGE ────────────────────────────────────────────────────────
function updateCartItemQty(id, qty) {
  qty = Math.max(1, parseInt(qty, 10) || 1);
  const list = getStored("vj_cart");
  const item = list.find((x) => String(x.id) === String(id));
  if (item) {
    item.qty = qty;
    setStored("vj_cart", list);
  }
  updateNavBadges();
  renderCartPage();
}

function cartItemRowHtml(item) {
  const qty = Math.max(1, parseInt(item.qty, 10) || 1);
  const hasRate = item.priceValue != null;
  const lineTotal = hasRate ? item.priceValue * qty : null;
  const sym = item.priceSymbol || "";
  const fmtAmt = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const opts = item.options || {};
  const summaryParts = [
    opts.metalQuality,
    opts.metalColor,
    opts.stoneType,
    opts.diamond,
    opts.size || item.size ? "Size: " + (opts.size || item.size) : null,
  ].filter(Boolean);
  const summaryLine = summaryParts.length
    ? `<p class="cart-row-options">${summaryParts.map(esc).join(" &middot; ")}</p>`
    : "";

  return `<div class="cart-row" data-cart-item="${esc(item.id)}">
    <div class="cart-row-media">
      <img src="${esc(item.image || PLACEHOLDER_IMG)}" alt="${esc(item.name || '')}" loading="lazy" />
    </div>

    <div class="cart-row-info">
      <span class="cart-row-name">${esc(item.name || "Untitled")}</span>
      <p class="cart-row-meta">${esc(item.sku || "")}</p>
      ${summaryLine}
      ${item.notes ? `<p class="cart-row-notes">${esc(item.notes)}</p>` : ""}
      <div class="cart-row-actions">
        <a class="cart-row-modify" href="product.html?id=${encodeURIComponent(item.id)}">Modify</a>
        <button class="cart-row-remove" type="button" data-remove-cart-item="${esc(item.id)}">Remove</button>
      </div>
    </div>

    <div class="cart-row-col cart-row-rate">
      <span class="cart-row-col-label">Rate</span>
      <span class="cart-row-col-value">${hasRate ? esc(item.price) : "Price on request"}</span>
    </div>

    <div class="cart-row-col cart-row-qty">
      <span class="cart-row-col-label">Qty</span>
      <div class="qty-stepper">
        <button type="button" class="qty-btn" data-qty-decrease="${esc(item.id)}" aria-label="Decrease quantity">&minus;</button>
        <input type="number" min="1" step="1" class="qty-input" value="${qty}" data-qty-input="${esc(item.id)}" aria-label="Quantity" />
        <button type="button" class="qty-btn" data-qty-increase="${esc(item.id)}" aria-label="Increase quantity">+</button>
      </div>
    </div>

    <div class="cart-row-col cart-row-total">
      <span class="cart-row-col-label">Total</span>
      <span class="cart-row-col-value cart-row-total-value">${hasRate ? esc(sym + " " + fmtAmt(lineTotal)) : "&mdash;"}</span>
    </div>
  </div>`;
}

function renderCartPage() {
  const grid = document.querySelector("[data-cart-grid]");
  if (!grid) return; // not on cart.html

  const items = getStored("vj_cart").map((i) => ({ ...i, qty: Math.max(1, parseInt(i.qty, 10) || 1) }));

  grid.innerHTML = items.length
    ? items.map(cartItemRowHtml).join("")
    : `<p style="padding:48px;color:var(--text-light);font-size:13px;">
        Your enquiry list is empty. <a href="collections.html" style="text-decoration:underline;color:var(--text);">Browse Collections</a>
      </p>`;

  grid.querySelectorAll("[data-remove-cart-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.removeCartItem;
      const list = getStored("vj_cart").filter((x) => String(x.id) !== String(id));
      setStored("vj_cart", list);
      updateNavBadges();
      renderCartPage();
    });
  });

  grid.querySelectorAll("[data-qty-increase]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.qtyIncrease;
      const item = items.find((x) => String(x.id) === String(id));
      updateCartItemQty(id, (item?.qty || 1) + 1);
    });
  });
  grid.querySelectorAll("[data-qty-decrease]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.qtyDecrease;
      const item = items.find((x) => String(x.id) === String(id));
      updateCartItemQty(id, (item?.qty || 1) - 1);
    });
  });
  grid.querySelectorAll("[data-qty-input]").forEach((input) => {
    input.addEventListener("change", () => {
      updateCartItemQty(input.dataset.qtyInput, input.value);
    });
  });

  renderCartSummary(items);
  renderCartActions(items);
}

function renderCartSummary(items) {
  const summaryEl = document.querySelector("[data-cart-summary]");
  if (!summaryEl) return;

  if (!items.length) {
    summaryEl.innerHTML = "";
    return;
  }

  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);
  const fmtAmt = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Group priced items by currency symbol so mixed-currency carts (rare,
  // e.g. items added while a different currency was selected) still total
  // correctly instead of silently mixing amounts.
  const totalsBySymbol = {};
  let unpricedCount = 0;
  items.forEach((i) => {
    if (i.priceValue == null) { unpricedCount++; return; }
    const sym = i.priceSymbol || "";
    totalsBySymbol[sym] = (totalsBySymbol[sym] || 0) + i.priceValue * i.qty;
  });
  const symbols = Object.keys(totalsBySymbol);

  const totalLines = symbols.length
    ? symbols.map((sym) => `
        <div class="cart-summary-row cart-summary-grand">
          <span>Grand Total${symbols.length > 1 ? " (" + esc(sym) + ")" : ""}</span>
          <span>${esc(sym)} ${fmtAmt(totalsBySymbol[sym])}</span>
        </div>`).join("")
    : `<div class="cart-summary-row cart-summary-grand"><span>Grand Total</span><span>Price on request</span></div>`;

  summaryEl.innerHTML = `
    <div class="cart-summary-row">
      <span>Items (${itemCount})</span>
      <span></span>
    </div>
    ${totalLines}
    ${unpricedCount ? `<p class="cart-summary-note">${unpricedCount} item${unpricedCount > 1 ? "s" : ""} priced on request &mdash; final total confirmed at checkout.</p>` : ""}
  `;
}

function renderCartActions(items) {
  const actionsEl = document.querySelector("[data-cart-actions]");
  if (!actionsEl) return;

  if (!items.length) {
    actionsEl.innerHTML = `<a class="primary-btn" href="collections.html">Continue Shopping</a>`;
    return;
  }

  actionsEl.innerHTML = `
    <button class="secondary-btn" type="button" data-clear-cart>Clear All</button>
    <a class="secondary-btn" href="collections.html" data-continue-shopping>Continue Shopping</a>
    <a class="primary-btn" href="checkout.html" data-checkout>Proceed to Checkout</a>
  `;

  actionsEl.querySelector("[data-clear-cart]")?.addEventListener("click", () => {
    setStored("vj_cart", []);
    updateNavBadges();
    renderCartPage();
  });
}

// ── PRICING ENGINE ─────────────────────────────────────────────────────
// Caches for pricing master data (only loaded on product detail page)
let _pmMetals      = null;  // metal_types rows
let _pmDiamSizes   = null;  // diamond_sizes rows
let _pmStoneTypes  = null;  // stone_types rows
let _pmLabour      = null;  // labour_charges rows
let _pmDiamQuality = null;  // diamond_quality rows
// currencies already cached in _allCurrencies

async function loadPricingMasters() {
  const [metals, diamSizes, stoneTypes, labour, diamQuality, currencies] = await Promise.all([
    _pmMetals      || sbGet("metal_types?select=id,name,quality,price_per_gram,currency&order=name.asc"),
    _pmDiamSizes   || sbGet("diamond_sizes?select=id,stone_type,shape,mm_length,mm_width,avg_weight_ct,size_basis&order=stone_type.asc,shape.asc"),
    _pmStoneTypes  || sbGet("stone_types?select=id,type,shape,color,quality,size_basis,rate_inr,price_inr,rate_usd,price_usd&order=type.asc"),
    _pmLabour      || sbGet("labour_charges?select=id,category,description,charge,currency&order=category.asc"),
    _pmDiamQuality || sbGet("diamond_quality?select=id,color,label,sort_order&order=sort_order.asc,label.asc"),
    getAllCurrencies(),
  ]);
  _pmMetals      = metals;
  _pmDiamSizes   = diamSizes;
  _pmStoneTypes  = stoneTypes;
  _pmLabour      = labour;
  _pmDiamQuality = diamQuality;
}

// Return the USD→INR exchange rate (how many INR per 1 USD)
function _inrPerUsd() {
  const usdRec = (_allCurrencies || []).find(c => c.code === "USD");
  // USD's rate_to_inr is entered directly as "how many INR per 1 USD" (e.g. 90)
  return usdRec?.rate_to_inr ? Number(usdRec.rate_to_inr) : 83;
}

// Convert a USD amount to the selected display currency
// Returns { amount, symbol, formatted }
function _convertFromUsd(usdAmount, currencyCode) {
  const currencies = _allCurrencies || [];
  if (currencyCode === "USD") {
    return { amount: usdAmount, symbol: "$", formatted: _fmtNum(usdAmount, "en-US", 2) };
  }
  const inrPerUSD = _inrPerUsd();
  const inrAmount = usdAmount * inrPerUSD;
  if (currencyCode === "INR") {
    return { amount: inrAmount, symbol: "₹", formatted: _fmtNum(inrAmount, "en-IN", 0) };
  }
  const rec = currencies.find(c => c.code === currencyCode);
  if (rec?.rate_to_inr) {
    // rate_to_inr = how many currencyCode per 1 INR → converted = inrAmount × rate_to_inr
    const converted = inrAmount * rec.rate_to_inr;
    return { amount: converted, symbol: rec.symbol || currencyCode, formatted: _fmtNum(converted, "en-US", 2) };
  }
  return { amount: inrAmount, symbol: "₹", formatted: _fmtNum(inrAmount, "en-IN", 0) };
}

// Convert an INR amount to the selected display currency
function _convertFromInr(inrAmount, currencyCode) {
  const currencies = _allCurrencies || [];
  if (currencyCode === "INR") {
    return { amount: inrAmount, symbol: "₹", formatted: _fmtNum(inrAmount, "en-IN", 0) };
  }
  const inrPerUSD = _inrPerUsd();
  const usdAmount = inrAmount / inrPerUSD;
  if (currencyCode === "USD") {
    return { amount: usdAmount, symbol: "$", formatted: _fmtNum(usdAmount, "en-US", 2) };
  }
  const rec = currencies.find(c => c.code === currencyCode);
  if (rec?.rate_to_inr) {
    const converted = inrAmount * rec.rate_to_inr;
    return { amount: converted, symbol: rec.symbol || currencyCode, formatted: _fmtNum(converted, "en-US", 2) };
  }
  return { amount: usdAmount, symbol: "$", formatted: _fmtNum(usdAmount, "en-US", 2) };
}

function _fmtNum(n, locale, decimals) {
  return Number(n || 0).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── CORE CALCULATION ────────────────────────────────────────────────────
// selectedMetal:   { type, quality }   e.g. { type: "Yellow Gold", quality: "18K" }
// selectedDiamond: { color, quality }  e.g. { color: "D-G", quality: "VVS-VS" }
// currencyCode:    "INR" | "USD" | "AED" etc.
// product must include product_stones[], net_weight_18k/14k/10k/silver

function calcProductPrice(product, selectedMetal, selectedDiamond, currencyCode) {
  const metals     = _pmMetals     || [];
  const diamSizes  = _pmDiamSizes  || [];
  const stoneTypes = _pmStoneTypes || [];
  const labour     = _pmLabour     || [];
  const inrPerUSD  = _inrPerUsd();
  const cur        = currencyCode || "INR";

  // ── 1. METAL COST ─────────────────────────────────────────────────────
  let metalCostNative = 0;  // in metal_types.currency (USD)
  let netWeightG = 0;

  if (selectedMetal?.quality) {
    // Primary: match by quality field exactly
    const metalRec = metals.find(m =>
      (m.quality || "").trim().toUpperCase() === selectedMetal.quality.toUpperCase()
    ) || metals.find(m =>
      // Fallback: quality keyword appears anywhere in name
      (m.name || "").toUpperCase().includes(selectedMetal.quality.toUpperCase())
    );

    // Pick the right net weight field by quality keyword
    const q = selectedMetal.quality.toLowerCase();
    if (q.includes("18k"))                              netWeightG = Number(product.net_weight_18k    || 0);
    else if (q.includes("14k"))                         netWeightG = Number(product.net_weight_14k    || 0);
    else if (q.includes("10k"))                         netWeightG = Number(product.net_weight_10k    || 0);
    else if (q.includes("925") || q.includes("silver")) netWeightG = Number(product.net_weight_silver || 0);

    if (metalRec?.price_per_gram && netWeightG) {
      metalCostNative = Number(metalRec.price_per_gram) * netWeightG; // USD
    }
  }

  // ── 2. STONE COST ─────────────────────────────────────────────────────
  let stoneCostINR = 0;
  let totalStoneCtWt = 0;

  const stoneRows = product.product_stones || [];
  stoneRows.forEach(row => {
    const pcs       = Number(row.pcs || 0);
    const lenMm     = Number(row.length_mm || 0);
    const widMm     = Number(row.width_mm  || 0);
    const shape     = (row.shape || "").toLowerCase();
    const stoneType = row.stone_type || "";

    if (!pcs || !stoneType) return;

    // Step 1+2: Find avg weight from diamond_sizes (match shape + dims)
    let avgWtCt = 0;
    let sizeBasis = "";
    const dimMatch = diamSizes.find(d =>
      (d.shape || "").toLowerCase() === shape &&
      (lenMm ? Math.abs(Number(d.mm_length || 0) - lenMm) < 0.05 : true) &&
      (widMm ? Math.abs(Number(d.mm_width  || 0) - widMm) < 0.05 : true)
    );
    if (dimMatch) {
      avgWtCt   = Number(dimMatch.avg_weight_ct || 0);
      sizeBasis = dimMatch.size_basis || "";
    }

    const totalWtCt = pcs * avgWtCt;
    totalStoneCtWt += totalWtCt;

    if (!totalWtCt) return;

    // Step 3+4: Find price from stone_types (match type + shape + color + quality + size_basis)
    // "Natural" and "Lab Grown" are separate rows in stone_types with their own rates.
    // Technical details (avg wt, size basis) come from diamond_sizes which is shared (matched by shape+dims only).
    // If the user has selected a stone type override (e.g. "Lab Grown"), use that instead of
    // the product's stored stone_type so the price reflects the chosen material.
    const selStoneType = (selectedDiamond?.stoneType || "").toLowerCase();
    const lookupType = selStoneType || stoneType.toLowerCase();

    const selColor   = (selectedDiamond?.color   || "").toLowerCase();
    const selQuality = (selectedDiamond?.quality || "").toLowerCase();

    const stoneRec = stoneTypes.find(s =>
      (s.type  || "").toLowerCase() === lookupType &&
      (s.shape || "").toLowerCase() === shape &&
      (!sizeBasis || (s.size_basis || "").toLowerCase() === sizeBasis.toLowerCase()) &&
      (!selColor   || (s.color   || "").toLowerCase() === selColor) &&
      (!selQuality || (s.quality || "").toLowerCase() === selQuality)
    ) || stoneTypes.find(s =>
      // Fallback: match type + shape only
      (s.type  || "").toLowerCase() === lookupType &&
      (s.shape || "").toLowerCase() === shape
    );

    if (stoneRec) {
      // Use price_inr / price_usd (margin-included) not rate_inr / rate_usd (base rate)
      stoneCostINR += totalWtCt * Number(stoneRec.price_inr || stoneRec.rate_inr || 0);
    }
  });

  // ── 3. LABOUR COST ────────────────────────────────────────────────────
  // 3a. Stone setting: PCS × rate matched by setting_type = labour description
  let settingCostUSD = 0;
  stoneRows.forEach(row => {
    const pcs         = Number(row.pcs || 0);
    const settingType = (row.setting_type || "").toLowerCase();
    if (!pcs || !settingType) return;
    const labRec = labour.find(l =>
      (l.description || l.category || "").toLowerCase() === settingType
    );
    if (labRec) settingCostUSD += pcs * Number(labRec.charge || 0);
  });

  // 3b. Making charges: MAX(netWeight × rate, minFlat)
  // Use Gold rate for 18K/14K/10K, Silver rate for 925 Silver
  const qualityLower = (selectedMetal?.quality || "").toLowerCase();
  const metalIsSilver = qualityLower.includes("925") || qualityLower.includes("silver");
  const makingRateRec = metalIsSilver
    ? (labour.find(l => l.category === "__making_rate_silver__") || labour.find(l => l.category === "__making_rate__"))
    : (labour.find(l => l.category === "__making_rate_gold__")   || labour.find(l => l.category === "__making_rate__"));
  const makingMinRec  = metalIsSilver
    ? (labour.find(l => l.category === "__making_min_silver__")  || labour.find(l => l.category === "__making_min__"))
    : (labour.find(l => l.category === "__making_min_gold__")    || labour.find(l => l.category === "__making_min__"));
  const makingRateUSD = Number(makingRateRec?.charge || 0);
  const makingMinUSD  = Number(makingMinRec?.charge  || 0);
  const makingCalc    = makingRateUSD * netWeightG;
  const makingCostUSD = makingCalc > 0 ? Math.max(makingCalc, makingMinUSD) : 0;

  // 3c. Certification: rate × total diamond ct weight
  const certRateRec  = labour.find(l => l.category === "__cert_rate__");
  const certRateUSD  = Number(certRateRec?.charge || 0);
  const certCostUSD  = certRateUSD * totalStoneCtWt;

  const labourCostUSD = settingCostUSD + makingCostUSD + certCostUSD;

  // ── 4. TOTALS (convert everything to display currency) ─────────────────
  const metalOut   = _convertFromUsd(metalCostNative, cur);
  const stoneOut   = _convertFromInr(stoneCostINR, cur);
  const labourOut  = _convertFromUsd(labourCostUSD, cur);
  const totalAmt   = metalOut.amount + stoneOut.amount + labourOut.amount;
  const sym        = metalOut.symbol;
  const locale     = cur === "INR" ? "en-IN" : "en-US";
  const decimals   = cur === "INR" ? 0 : 2;

  return {
    metalCost:   metalOut.amount,
    stoneCost:   stoneOut.amount,
    labourCost:  labourOut.amount,
    total:       totalAmt,
    symbol:      sym,
    currency:    cur,
    // formatted strings
    fmtMetal:   sym + " " + _fmtNum(metalOut.amount, locale, decimals),
    fmtStone:   sym + " " + _fmtNum(stoneOut.amount, locale, decimals),
    fmtLabour:  sym + " " + _fmtNum(labourOut.amount, locale, decimals),
    fmtTotal:   sym + " " + _fmtNum(totalAmt, locale, decimals),
    // raw data for detail display
    netWeightG,
    totalStoneCtWt,
  };
}

// ── AVAILABLE METAL QUALITIES FOR A PRODUCT ─────────────────────────────
// Returns an array of { quality, label, netWeightG, ratePerGram } for every
// karat/alloy the product actually has a net weight for, AND for which a
// matching metal_types record (with price_per_gram) exists in pricing masters.
// Order: 18K, 14K, 10K, 925 Silver.
const METAL_QUALITY_DEFS = [
  { quality: "18K", field: "net_weight_18k",    displayLabel: "18K Gold",   defaultType: "Gold"   },
  { quality: "14K", field: "net_weight_14k",    displayLabel: "14K Gold",   defaultType: "Gold"   },
  { quality: "10K", field: "net_weight_10k",    displayLabel: "10K Gold",   defaultType: "Gold"   },
  { quality: "925", field: "net_weight_silver", displayLabel: "925 Silver", defaultType: "Silver" },
];

function getAvailableMetalQualities(product) {
  const metals = _pmMetals || [];
  const out = [];
  METAL_QUALITY_DEFS.forEach(def => {
    const netWeightG = Number(product?.[def.field] || 0);
    if (!netWeightG) return;
    const metalRec = metals.find(m => (m.quality || "").trim().toUpperCase() === def.quality)
      || metals.find(m => (m.name || "").toUpperCase().includes(def.quality));
    // Include even without price_per_gram — dropdown must show; metal cost will be 0 until rate is set
    const ratePerGram = metalRec?.price_per_gram ? Number(metalRec.price_per_gram) : 0;
    out.push({
      quality: def.quality,
      type: def.defaultType,
      label: def.displayLabel,
      netWeightG,
      ratePerGram,
    });
  });
  return out;
}

// ── LIVE PRICE FOR CATALOG TILES ────────────────────────────────────────
// Globally selected metal quality on the collections page (e.g. "18K"), or
// null to use each product's first available quality.
let _selectedCatalogMetalQuality = null;

// Globally selected diamond color/quality (from stone_types.color / .quality
// via the "Diamond Color" / "Diamond Quality" filters), or null to use each
// product's stone rate without a color/quality match (type+shape fallback).
let _selectedCatalogDiamondColor = null;
let _selectedCatalogDiamondQuality = null;

// Globally selected stone type override (e.g. "Natural", "Lab Grown").
// When set, substitutes product_stones.stone_type in the pricing lookup so
// users can see what the same piece costs in Natural vs Lab Grown stones.
let _selectedCatalogStoneType = null;

// Computes the full price breakdown for a product using calcProductPrice,
// selecting the metal quality from the global catalog dropdown if available
// for this product, else falling back to the product's first available quality.
// Returns null if the product has no usable metal weight/rate at all.
// Memoized per (product, quality selection, currency) to avoid recomputing
// the full pricing engine repeatedly during render/sort/filter passes.
const _livePriceCache = new Map();
function computeLivePriceCosts(product, currencyCode) {
  const cur = currencyCode || "USD";
  const cacheKey = `${product.id}|${cur}|${_selectedCatalogMetalQuality || ""}|${_selectedCatalogDiamondColor || ""}|${_selectedCatalogDiamondQuality || ""}|${_selectedCatalogStoneType || ""}`;
  if (_livePriceCache.has(cacheKey)) return _livePriceCache.get(cacheKey);

  const available = getAvailableMetalQualities(product);
  if (!available.length) {
    _livePriceCache.set(cacheKey, null);
    return null;
  }

  let selected = _selectedCatalogMetalQuality
    ? available.find(a => a.quality === _selectedCatalogMetalQuality)
    : null;
  if (!selected) selected = available[0];

  const selectedMetal = { quality: selected.quality, type: selected.type };
  const selectedDiamond = {
    color: _selectedCatalogDiamondColor || "",
    quality: _selectedCatalogDiamondQuality || "",
    stoneType: _selectedCatalogStoneType || "",
  };

  const result = calcProductPrice(product, selectedMetal, selectedDiamond, cur);
  _livePriceCache.set(cacheKey, result);
  return result;
}
// Returns the live total price in USD for sorting/filtering, or null if unavailable.
function getLivePriceUSD(product) {
  if (!_pmMetals) return null; // pricing masters not loaded yet
  const costs = computeLivePriceCosts(product, "USD");
  return costs ? costs.total : null;
}


async function runProductPricing(rawProduct) {
  await loadPricingMasters();

  // Substitute in the selected size variant's own metal weights + stones
  // (if one is selected) so the metal-quality dropdown and price both
  // reflect that specific size rather than the master product's defaults.
  const product = _effectiveProductForPricing(rawProduct);

  const available = getAvailableMetalQualities(product);

  // Carry over the metal quality selected on the Collections page (if this
  // product is available in that quality). Only applies on first render.
  if (_selectedProductMetalQuality === null) {
    let storedQuality = null;
    try { storedQuality = localStorage.getItem("vj_metal_quality"); } catch (e) {}
    if (storedQuality && available.some(a => a.quality === storedQuality)) {
      _selectedProductMetalQuality = storedQuality;
    }
  }

  const wrap = document.querySelector("[data-metal-quality-wrap]");
  const typeSel    = document.querySelector("[data-metal-type-select]");
  const qualitySel = document.querySelector("[data-metal-quality-select]");
  const qualityLabel = document.querySelector("[data-metal-quality-label]");

  if (!typeSel || !qualitySel) {
    // Fallback: page has no cascade selectors
    if (available.length) _selectedProductMetalQuality = available[0].quality;
    renderProductPricingForSelection(product, available);
    return;
  }

  if (!available.length) {
    wrap?.style.setProperty("display", "none");
    renderProductPricingForSelection(product, available);
    return;
  }

  wrap?.style.removeProperty("display");

  // Derive the Metal Type options from available qualities
  // Gold covers 18K / 14K / 10K; Silver covers 925
  const typeMap = { "18K": "Gold", "14K": "Gold", "10K": "Gold", "925": "Silver" };
  const availableTypes = [...new Set(available.map(a => typeMap[a.quality]).filter(Boolean))];

  // Determine initial selected type from persisted quality
  const qualityToType = q => typeMap[q] || "Gold";
  let selectedType = qualityToType(_selectedProductMetalQuality || available[0].quality);
  if (!availableTypes.includes(selectedType)) selectedType = availableTypes[0];

  // Helper: populate quality dropdown filtered by current type selection
  const populateQualities = (type) => {
    const filtered = available.filter(a => typeMap[a.quality] === type);
    // Ensure selected quality is valid for this type; if not, pick first
    if (!filtered.some(a => a.quality === _selectedProductMetalQuality)) {
      _selectedProductMetalQuality = filtered[0]?.quality || null;
    }
    qualitySel.innerHTML = filtered.map(a =>
      `<option value="${esc(a.quality)}"${a.quality === _selectedProductMetalQuality ? " selected" : ""}>${esc(a.label)}</option>`
    ).join("");
    // Show/hide quality row — only needed when multiple qualities exist for this type
    const showQuality = filtered.length > 1;
    qualitySel.style.display = showQuality ? "" : "none";
    if (qualityLabel) qualityLabel.style.display = showQuality ? "" : "none";
    // If only one quality, auto-select it silently
    if (!showQuality && filtered.length === 1) {
      _selectedProductMetalQuality = filtered[0].quality;
    }
  };

  // Populate Metal Type dropdown
  typeSel.innerHTML = availableTypes.map(t =>
    `<option value="${esc(t)}"${t === selectedType ? " selected" : ""}>${esc(t)}</option>`
  ).join("");

  populateQualities(selectedType);
  renderProductPricingForSelection(product, available);

  // Wire Metal Type change → repopulate quality + reprice
  typeSel.onchange = () => {
    selectedType = typeSel.value;
    populateQualities(selectedType);
    renderProductPricingForSelection(product, available);
  };

  // Wire Metal Quality change → reprice
  qualitySel.onchange = () => {
    _selectedProductMetalQuality = qualitySel.value;
    try { localStorage.setItem("vj_metal_quality", _selectedProductMetalQuality || ""); } catch (e) {}
    renderProductPricingForSelection(product, available);
  };
}

function renderProductPricingForSelection(product, available) {
  const selected = available.find(a => a.quality === _selectedProductMetalQuality) || available[0] || null;
  const selectedMetal = selected ? { quality: selected.quality, type: selected.type } : null;

  // Diamond color / quality / stone-type come from the shared top filter
  // bar (Diamond Color, Diamond Quality, Stone Type dropdowns — same ones
  // used on the collections page). This lets a "Lab Grown" stone-type
  // selection (or a Diamond Color/Quality selection) update the Stone
  // Charges line here too, not just catalog tile prices.
  const selectedDiamond = {
    color: _selectedCatalogDiamondColor || "",
    quality: _selectedCatalogDiamondQuality || "",
    stoneType: _selectedCatalogStoneType || "",
  };

  const currency = _displayCurrency?.code || "INR";

  const costs = calcProductPrice(product, selectedMetal, selectedDiamond, currency);
  renderPriceBreakdown(costs);
  renderProductDetailsGrid(product, selectedMetal, selectedDiamond, costs);
}

// ── RENDER: PRICE BREAKDOWN ────────────────────────────────────────────
function renderPriceBreakdown(costs) {
  const el = document.querySelector("[data-price-breakdown]");
  if (!el) return;

  if (!costs || costs.total === 0) {
    el.innerHTML = `<p class="price-breakdown-loading">Price on request — contact us for details.</p>`;
    return;
  }

  const dot = `<span class="price-line-dots"></span>`;

  el.innerHTML = `
    <div class="price-line">
      <span class="price-line-label">Metal Charges</span>${dot}
      <span class="price-line-value">${esc(costs.fmtMetal)}</span>
    </div>
    <div class="price-line">
      <span class="price-line-label">Stone Charges</span>${dot}
      <span class="price-line-value">${esc(costs.fmtStone)}</span>
    </div>
    <div class="price-line">
      <span class="price-line-label">Labour Charges</span>${dot}
      <span class="price-line-value">${esc(costs.fmtLabour)}</span>
    </div>
    <div class="price-total-row">
      <span class="price-total-label">Total Price</span>
      <span class="price-total-value">${esc(costs.fmtTotal)}</span>
    </div>`;
}

// ── RENDER: PRODUCT DETAILS GRID ───────────────────────────────────────
function renderProductDetailsGrid(product, selectedMetal, selectedDiamond, costs) {
  const section = document.querySelector("[data-product-details-section]");
  if (!section) return;
  section.style.display = "";

  // Category
  const catEl = document.querySelector("[data-pd-category]");
  if (catEl) {
    const jc = (product.product_jewel_cats || [])[0];
    catEl.textContent = jc
      ? [jc.jewel_type, jc.sub_type1, jc.sub_type2].filter(Boolean).join(" › ")
      : "—";
  }

  // SKU
  const skuEl = document.querySelector("[data-pd-sku]");
  if (skuEl) skuEl.textContent = product.sku || "—";

  // Metal display: "18K Gold · 3.50g"  (no color word)
  const metalEl = document.querySelector("[data-pd-metal-display]");
  if (metalEl) {
    if (selectedMetal?.quality) {
      const def = METAL_QUALITY_DEFS.find(d => d.quality === selectedMetal.quality);
      const baseLabel = def?.displayLabel || selectedMetal.quality;
      const wt = costs?.netWeightG ? ` · ${Number(costs.netWeightG).toFixed(2)}g` : "";
      metalEl.textContent = `${baseLabel}${wt}`;
    } else {
      metalEl.textContent = product.metal || "—";
    }
  }

  // Diamond display: "D-G · VVS-VS · 0.50ct"
  const diamEl = document.querySelector("[data-pd-diamond-display]");
  if (diamEl) {
    const parts = [selectedDiamond?.color, selectedDiamond?.quality].filter(Boolean);
    const ctWt  = costs?.totalStoneCtWt;
    if (ctWt) parts.push(Number(ctWt).toFixed(3) + " ct");
    diamEl.textContent = parts.length ? parts.join(" · ") : (product.stone || "—");
  }

  // Size
  const sizeRow = document.querySelector("[data-pd-size-row]");
  const sizeEl  = document.querySelector("[data-pd-size-display]");
  const sizeVal = _selectedSize || product.size;
  if (sizeRow) sizeRow.style.display = sizeVal ? "" : "none";
  if (sizeEl)  sizeEl.textContent = sizeVal || "—";

  // SKU + size line under title
  const skuSizeLine = document.querySelector("[data-product-sku-size]");
  if (skuSizeLine) {
    const parts = [product.sku, sizeVal].filter(Boolean);
    skuSizeLine.textContent = parts.join(" · ");
  }

  // Short description box
  const shortDescEl = document.querySelector("[data-product-short-desc]");
  if (shortDescEl) {
    if (product.short_description) {
      shortDescEl.textContent = product.short_description;
      shortDescEl.style.display = "";
    } else {
      shortDescEl.style.display = "none";
    }
  }

  // Product story
  const storySection = document.querySelector("[data-product-story-section]");
  const storyText    = document.querySelector("[data-product-description]");
  if (storyText) storyText.textContent = product.description || product.short_description || "";
  if (storySection) storySection.style.display = (product.description || product.short_description) ? "" : "none";
}

// ── HOOK INTO renderProductDetail ──────────────────────────────────────
let _lastLoadedProduct = null;

// Metal quality currently selected on THIS product page (e.g. "18K").
let _selectedProductMetalQuality = null;

// Set by _renderProductDetailBase() once the gallery is built.
// Switches main image + active thumb when Metal Color changes.
let _updateProductGalleryColor = null;

async function renderProductDetail() {
  await _renderProductDetailBase();

  // Only run pricing on product detail page
  if (!document.querySelector("[data-product-detail]")) return;
  if (!_lastLoadedProduct) return;

  await runProductPricing(_lastLoadedProduct);
}

// ── INIT ───────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  updateNavBadges();
  await setupCatalogFilterBar();
  renderCategoryGrid();
  renderProductGrid();
  renderProductDetail();
  renderCartPage();
  initHeroCarousel();
  initHeaderScrollState();
});

// ── HERO CAROUSEL (fade in/out, images + video) ──────────────────────────
function initHeroCarousel() {
  const hero = document.querySelector("[data-hero-carousel]");
  if (!hero) return;
  const slides = [...hero.querySelectorAll(".hero-slide")];
  const dots = [...hero.querySelectorAll(".hero-dots button")];
  if (slides.length < 2) return;

  let current = Math.max(0, slides.findIndex((s) => s.classList.contains("active")));
  const DURATION = 6500;
  let timer = null;

  const playVideo = (slide) => {
    const v = slide.querySelector("video");
    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
  };
  const pauseVideo = (slide) => {
    const v = slide.querySelector("video");
    if (v) v.pause();
  };

  function goTo(index) {
    slides[current].classList.remove("active");
    pauseVideo(slides[current]);
    dots[current]?.classList.remove("active");
    current = (index + slides.length) % slides.length;
    slides[current].classList.add("active");
    dots[current]?.classList.add("active");
    playVideo(slides[current]);
  }

  const next = () => goTo(current + 1);
  const start = () => { stop(); timer = setInterval(next, DURATION); };
  const stop = () => { if (timer) clearInterval(timer); };

  dots.forEach((dot, i) => dot.addEventListener("click", () => { goTo(i); start(); }));

  playVideo(slides[current]);
  start();
}

// ── OVERLAY HEADER: transparent over hero, solid after scrolling past it ──
function initHeaderScrollState() {
  const header = document.querySelector(".site-header.header-overlay");
  if (!header) return;
  const hero = document.querySelector(".hero-fullscreen");

  const update = () => {
    const threshold = hero ? hero.offsetHeight - 90 : 80;
    header.classList.toggle("scrolled", window.scrollY > threshold);
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
}