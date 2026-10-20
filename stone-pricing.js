/* Vie Jewels — Stone pricing engine  (single source of truth)
   Taxonomy, size lookup, rate lookup and stone charges live ONLY here.
   Used by admin.html (masters, Stone Report) and by script.js (storefront price).
   Load this file BEFORE script.js / the admin script.

   CLASSIFICATION  (this file only holds the DEFAULTS)
     The live lists are edited by the admin in  Masters -> Stone Master  and stored in the
     database (site_settings key "stone_taxonomy"). They are applied at runtime through
     VJ_STONE.configure(...), so nothing in this file has to be edited to add a type, shape,
     colour or quality. If the database has no saved list, the defaults below are used.
     Category : Diamond | Gem Stone
     Type     : Diamond   -> Natural, Lab Grown
                Gem Stone -> Emerald, Ruby, Sapphire, Pearl
     Shape    : Round, Emerald, Princess, Pear, Marquise, Bugget, Taper, Heart, Cushion, Oval
     Color    : Diamond   -> D-F, G-H, I-J
                Gem Stone -> Black, Blue, Green, Yellow, Pink
     Quality  : IF, VVS-VS, SI, I

   PRICING FLOW for every stone on a product
     product stone (type, shape, length, width, pcs)
       -> Diamond Sizes master (category [+type] + shape + mm -> avg weight ct + Size Basis)
       -> Stone Prices master  (category + type + shape + Size Basis + color + quality -> price / ct)
       -> cost = pcs x avg weight x price per ct
   A stone that cannot be sized or priced is reported as MISSING — it is never silently
   priced at zero, and never priced from a different shape, size or type.
*/
const VJ_STONE = (() => {
  // ── TAXONOMY (edit here to add a value everywhere) ─────────────────────
  // Gem Stone type "Pearl" is the stone; "Pear" is only a SHAPE.
  const DEFAULT_TAXONOMY = {
    types: {
      "Diamond":   ["Natural", "Lab Grown"],
      "Gem Stone": ["Emerald", "Ruby", "Sapphire", "Pearl"],
    },
    colors: {
      "Diamond":   ["D-F", "G-H", "I-J"],
      "Gem Stone": ["Black", "Blue", "Green", "Yellow", "Pink"],
    },
    shapes:    ["Round", "Emerald", "Princess", "Pear", "Marquise", "Bugget", "Taper", "Heart", "Cushion", "Oval"],
    qualities: ["IF", "VVS-VS", "SI", "I"],
  };
  const CATEGORY_NAMES = ["Diamond", "Gem Stone"];   // fixed: the pricing rules treat these two differently

  // Live lists (same object / array identities forever; configure() rewrites their contents in place)
  const CATEGORIES = {};
  const COLORS     = {};
  const SHAPES     = [];
  const QUALITIES  = [];

  const SIZE_TOLERANCE_MM = 0.05;

  // Spacing, hyphens, en/em dashes, slashes and underscores are ignored when comparing, so
  // "Lab-Grown", "lab grown", "D–F", "VVS/VS" and "VVS-VS" all match the stored spelling.
  const norm = v => String(v == null ? "" : v).toLowerCase().replace(/[\s\-\u2010-\u2015_\/]+/g, "").replace("½", "1/2");
  const num  = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  // Old / misspelt STONE TYPE values -> the type they mean ("Pear" as a stone type is the gem "Pearl").
  const TYPE_ALIASES = { pear:"Pearl", pearls:"Pearl", naturaldiamond:"Natural", labgrowndiamond:"Lab Grown", lab:"Lab Grown",
    emeralds:"Emerald", rubies:"Ruby", sapphires:"Sapphire" };
  const typeKey = t => { const n = norm(t); return TYPE_ALIASES[n] ? norm(TYPE_ALIASES[n]) : n; };

  function clean(list) {            // trim, drop blanks and case/spacing duplicates, keep order
    const seen = new Set(), out = [];
    (Array.isArray(list) ? list : []).forEach(v => { const s = String(v == null ? "" : v).trim(), k = norm(s); if (s && !seen.has(k)) { seen.add(k); out.push(s); } });
    return out;
  }
  const getTaxonomy = () => ({
    types:  Object.fromEntries(CATEGORY_NAMES.map(c => [c, [...(CATEGORIES[c] || [])]])),
    colors: Object.fromEntries(CATEGORY_NAMES.map(c => [c, [...(COLORS[c] || [])]])),
    shapes: [...SHAPES], qualities: [...QUALITIES],
  });
  // Replace the live lists (admin Stone Master / saved database copy). Missing or empty parts fall back to the defaults.
  function configure(tax) {
    const t = tax && typeof tax === "object" ? tax : {};
    CATEGORY_NAMES.forEach(c => {
      const ty = clean(t.types && t.types[c]), co = clean(t.colors && t.colors[c]);
      CATEGORIES[c] = ty.length ? ty : [...DEFAULT_TAXONOMY.types[c]];
      COLORS[c]     = co.length ? co : [...DEFAULT_TAXONOMY.colors[c]];
    });
    const sh = clean(t.shapes), qu = clean(t.qualities);
    SHAPES.splice(0, SHAPES.length, ...(sh.length ? sh : DEFAULT_TAXONOMY.shapes));
    QUALITIES.splice(0, QUALITIES.length, ...(qu.length ? qu : DEFAULT_TAXONOMY.qualities));
  }
  configure(DEFAULT_TAXONOMY);

  const categoryNames = () => [...CATEGORY_NAMES];
  const typesOf   = cat => CATEGORIES[cat] ? [...CATEGORIES[cat]] : categoryNames().flatMap(c => CATEGORIES[c]);
  const colorsOf  = cat => COLORS[cat] ? [...COLORS[cat]] : categoryNames().flatMap(c => COLORS[c]);

  // Stone type -> category ("" if the type is not part of the classification)
  function categoryOf(type) {
    const t = typeKey(type);
    if (!t) return "";
    for (const [cat, types] of Object.entries(CATEGORIES)) if (types.some(x => norm(x) === t)) return cat;
    return "";
  }
  // A master row's category: its own `category` column, else derived from its type,
  // else the legacy word "Diamond"/"Gem Stone" typed in the type column.
  function rowCategory(row) {
    if (!row) return "";
    const direct = categoryNames().find(c => norm(c) === norm(row.category));
    if (direct) return direct;
    return categoryOf(row.type != null ? row.type : row.stone_type) ||
           categoryNames().find(c => norm(c) === norm(row.type != null ? row.type : row.stone_type)) || "";
  }
  // Is this master row specific to one stone type? (Diamond Sizes rows may be shared by the whole category.)
  function rowType(row) {
    const t = row.type != null ? row.type : row.stone_type;
    return categoryOf(t) ? t : "";          // "", "Diamond" or "Gem Stone" => not type-specific
  }

  // Common alternative spellings accepted when importing sheets
  const SHAPE_ALIASES = { baguette:"Bugget", buguette:"Bugget", bagutte:"Bugget", baggette:"Bugget", tapered:"Taper", taperedbaguette:"Taper",
    emeraldcut:"Emerald", cushioncut:"Cushion", princesscut:"Princess", marquis:"Marquise", pearshape:"Pear", roundbrilliant:"Round", heartshape:"Heart" };

  // Canonical spelling for a value of a field, or "" if it is not in the classification.
  function canon(field, value, category) {
    const n = norm(value); if (!n) return "";
    if (field === "shape" && SHAPE_ALIASES[n] && SHAPES.includes(SHAPE_ALIASES[n])) return SHAPE_ALIASES[n];
    const list = field === "category" ? categoryNames()
      : field === "type"    ? typesOf(category)
      : field === "shape"   ? SHAPES
      : field === "color"   ? colorsOf(category)
      : field === "quality" ? QUALITIES : [];
    return list.find(x => norm(x) === (field === "type" ? typeKey(value) : n)) || "";
  }

  // ── SIZE: Diamond Sizes master ─────────────────────────────────────────
  // Rows must be the same category (a row with no category info applies to any), then
  // shape and mm length (+ width when given) within tolerance. A row for the exact stone
  // type wins over a category-wide row; then the closest size wins.
  function findSize(diamSizes, { category, type, shape, length, width }) {
    const cat = category || categoryOf(type);
    const len = num(length), wid = num(width);
    const hits = (diamSizes || []).filter(d => {
      const rc = rowCategory(d);
      if (cat && rc && rc !== cat) return false;
      const rt = rowType(d);
      if (rt && type && typeKey(rt) !== typeKey(type)) return false;
      return norm(d.shape) === norm(shape) &&
        (len ? Math.abs(num(d.mm_length) - len) < SIZE_TOLERANCE_MM : true) &&
        (wid ? Math.abs(num(d.mm_width)  - wid) < SIZE_TOLERANCE_MM : true);
    });
    if (!hits.length) return null;
    const dist = d => Math.abs(num(d.mm_length) - len) + Math.abs(num(d.mm_width) - wid);
    const exact = hits.filter(d => rowType(d));
    const pool = exact.length ? exact : hits;
    pool.sort((a, b) => dist(a) - dist(b));
    return { avgWtCt: num(pool[0].avg_weight_ct), sizeBasis: pool[0].size_basis || "", row: pool[0] };
  }

  // ── RATE: Stone Prices master ──────────────────────────────────────────
  const priceOf = s => num(s.price_inr) || num(s.rate_inr);   // margin-inclusive price first

  // Every priced row for category + type + shape + Size Basis (all four must match exactly)
  function rateCandidates(stoneTypes, { type, shape, sizeBasis }) {
    if (!sizeBasis) return [];
    const cat = categoryOf(type);
    return (stoneTypes || []).filter(s =>
      typeKey(s.type) === typeKey(type) && (!cat || !rowCategory(s) || rowCategory(s) === cat) &&
      norm(s.shape) === norm(shape) && norm(s.size_basis) === norm(sizeBasis) && priceOf(s) > 0);
  }

  // Picks one row. Color / quality only ever narrow the choice — they never switch type, shape or size.
  //   tier 3: color + quality both match   tier 2: color matches, row has no quality
  //   tier 1: quality matches, row no color   tier 0: row has neither (generic)
  // Rows naming a different color/quality than the one selected are rejected.
  // If nothing is selected, the lowest price is used and flagged `assumed` ("from" price).
  function findRate(stoneTypes, { type, shape, sizeBasis, color, quality }) {
    const cands = rateCandidates(stoneTypes, { type, shape, sizeBasis });
    if (!cands.length) return null;
    const c = norm(color), q = norm(quality);
    const scored = [];
    cands.forEach(s => {
      const sc = norm(s.color), sq = norm(s.quality);
      if (c && sc && sc !== c) return;
      if (q && sq && sq !== q) return;
      const tier = (c && sc ? 2 : 0) + (q && sq ? 1 : 0);
      scored.push({ s, tier });
    });
    if (!scored.length) return null;
    const best = Math.max(...scored.map(x => x.tier));
    const top = scored.filter(x => x.tier === best).map(x => x.s).sort((a, b) => priceOf(a) - priceOf(b));
    const assumed = !(c && q) && top.length > 1;
    return { row: top[0], priceINR: priceOf(top[0]), assumed };
  }

  // ── STONE CHARGES ──────────────────────────────────────────────────────
  // stoneRows: product_stones[]
  // ctx: { diamSizes, stoneTypes,
  //        overrideType,               // storefront "Stone Type" (Natural / Lab Grown) — diamond rows only
  //        color, quality,             // Diamond Color / Quality selections  -> diamond rows
  //        gemColor, gemQuality }      // Gem Stone Color / Quality selections -> gem stone rows
  function calcStoneCharges(stoneRows, ctx) {
    const { diamSizes, stoneTypes, overrideType, color, quality, gemColor, gemQuality } = ctx || {};
    const overrideIsDiamond = categoryOf(overrideType) === "Diamond";
    const lines = [];
    let costINR = 0, totalCt = 0, diamondCt = 0, gemCt = 0;

    (stoneRows || []).forEach(row => {
      const pcs = num(row.pcs);
      if (!pcs || !row.stone_type) return;
      const category = rowCategory({ stone_type: row.stone_type });
      // Legacy rows may hold only the category word ("Diamond"/"Gem Stone") as type:
      // use the storefront choice, else the category's first type, so price rows can match.
      let type = canon("type", row.stone_type, category) || row.stone_type;
      if (category === "Diamond" && overrideIsDiamond) type = overrideType;
      else if (!categoryOf(type) && category) type = CATEGORIES[category][0];
      const sel = category === "Gem Stone" ? { color: gemColor, quality: gemQuality } : { color, quality };
      const line = { stone: row, type, category, pcs, shape: row.shape, avgWtCt: 0, sizeBasis: "", totalCt: 0, priceINR: 0, cost: 0, status: "ok" };

      const size = findSize(diamSizes, { category, type, shape: row.shape, length: row.length_mm, width: row.width_mm });
      if (!size || !size.avgWtCt) { line.status = "no-size"; lines.push(line); return; }
      line.avgWtCt = size.avgWtCt; line.sizeBasis = size.sizeBasis;
      line.totalCt = pcs * size.avgWtCt;
      totalCt += line.totalCt;
      if (category === "Diamond") diamondCt += line.totalCt; else gemCt += line.totalCt;

      const rate = findRate(stoneTypes, { type, shape: row.shape, sizeBasis: size.sizeBasis, color: sel.color, quality: sel.quality });
      if (!rate) { line.status = "no-rate"; lines.push(line); return; }
      line.priceINR = rate.priceINR;
      line.cost = line.totalCt * rate.priceINR;
      if (rate.assumed) line.status = "assumed";
      costINR += line.cost;
      lines.push(line);
    });

    const missing = lines.filter(l => l.status === "no-size" || l.status === "no-rate");
    return { costINR, totalCt, diamondCt, gemCt, lines, missing, incomplete: missing.length > 0 };
  }

  // ── MASTER DATA CHECKS (used by the admin) ─────────────────────────────
  // Problems in a Stone Prices row against the classification ("" = fine)
  function checkPriceRow(s) {
    const cat = rowCategory(s);
    if (!cat) return "Type is not in the classification";
    if (!canon("type", s.type, cat)) return "Type does not belong to " + cat;
    if (!canon("shape", s.shape)) return "Unknown shape";
    if (s.color && !canon("color", s.color, cat)) return "Color not valid for " + cat;
    if (s.quality && !canon("quality", s.quality)) return "Unknown quality";
    if (!s.size_basis) return "Size Basis missing";
    if (Object.keys(normalizePriceRow(s)).length) return "Spelling differs from the Stone Master (use Auto-fix)";
    return "";
  }
  // Canonical spelling of a Stone Prices row: returns only the fields that must change ({} = already clean)
  function normalizePriceRow(s) {
    const cat = rowCategory(s), out = {};
    if (!cat) return out;
    const type = canon("type", s.type, cat), shape = canon("shape", s.shape);
    const color = s.color ? canon("color", s.color, cat) : "", quality = s.quality ? canon("quality", s.quality) : "";
    if (type && type !== s.type) out.type = type;
    if (shape && shape !== s.shape) out.shape = shape;
    if (color && color !== s.color) out.color = color;
    if (quality && quality !== s.quality) out.quality = quality;
    if (s.category !== undefined && cat !== s.category) out.category = cat;
    return out;
  }
  const priceKey = s => [rowCategory(s), typeKey(s.type), norm(s.shape), norm(s.color), norm(s.quality), norm(s.size_basis)].join("|");

  return { CATEGORIES, SHAPES, COLORS, QUALITIES, SIZE_TOLERANCE_MM, DEFAULT_TAXONOMY, TAXONOMY_SETTING_KEY: "stone_taxonomy",
           configure, getTaxonomy, normalizePriceRow, typeKey,
           norm, categoryNames, typesOf, colorsOf, categoryOf, rowCategory, rowType, canon,
           findSize, rateCandidates, findRate, calcStoneCharges, checkPriceRow, priceKey };
})();
if (typeof module !== "undefined") module.exports = VJ_STONE;
