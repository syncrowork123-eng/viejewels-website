/* Vie Jewels — Storefront stone pricing (drop-in replacement code)
   ─────────────────────────────────────────────────────────────────────────
   Replaces the old stone charges / rates / calculation in script.js and product.html
   WITHOUT editing those files. Load order on every page that shows prices
   (index.html, collections.html, product.html):

       <script src="stone-pricing.js"></script>     <- engine + classification
       <script src="script.js"></script>
       ... (product.html: its inline <script> block stays here) ...
       <script src="stone-storefront.js"></script>  <- THIS FILE, always LAST, just before </body>

   What it does
     1. calcProductPrice()      full replacement — stone block rewritten, certification = diamonds only
     2. fmtPrice() / getLivePriceUSD() / renderPriceBreakdown()
                                "Price on request" instead of a partial price when a stone cannot be
                                sized (Diamond Sizes) or priced (Stone Prices)
     3. populateDiamondFilters()  full replacement — Diamond Color/Quality and Gem Color/Quality cascade
                                  from the real price list
     4. Stone Type dropdown     only Natural / Lab Grown that actually have prices
     5. product.html            adds the "Gem Stone Configuration" card, shows each card only when the
                                product has that kind of stone, and validates it before "Add to Enquiry"
   Category is derived from the stone type, so no extra database column is needed by the website.
*/

/* ═════════════════════════════════════════════════════════════════════════
   0. Stone Master lists (admin: Masters > Stone Master) are loaded together with the pricing
      masters, so types / shapes / colours / qualities added in the admin work here with no code edit.
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  if (typeof loadPricingMasters !== "function" || typeof VJ_STONE === "undefined") return;
  const _origLoadPricingMasters = loadPricingMasters;
  let _taxLoaded = false;
  loadPricingMasters = async function () {
    const loadTax = async () => {
      if (_taxLoaded) return;
      try {
        const r = await sbGet("site_settings?select=value&key=eq." + VJ_STONE.TAXONOMY_SETTING_KEY);
        if (r && r[0] && r[0].value) {
          let v = r[0].value; if (typeof v === "string") v = JSON.parse(v);
          VJ_STONE.configure(v);
        }
      } catch (e) { /* no saved list (or not readable): built-in defaults stay in force */ }
      _taxLoaded = true;
    };
    await Promise.all([_origLoadPricingMasters.apply(this, arguments), loadTax()]);
  };
})();

// ── Gem Stone selections (new) ───────────────────────────────────────────
let _selectedCatalogGemColor = null;
let _selectedCatalogGemQuality = null;

/* ═════════════════════════════════════════════════════════════════════════
   1. calcProductPrice — FULL REPLACEMENT
   ═════════════════════════════════════════════════════════════════════════ */
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
    const metalRec = metals.find(m =>
      (m.quality || "").trim().toUpperCase() === selectedMetal.quality.toUpperCase()
    ) || metals.find(m =>
      (m.name || "").toUpperCase().includes(selectedMetal.quality.toUpperCase())
    );

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
  // For every stone on the product (pcs, type, shape, length, width):
  //   Diamond Sizes  : category [+ type] + shape + mm  -> average weight (ct) + Size Basis
  //   Stone Prices   : category + type + shape + Size Basis + color + quality -> price per ct
  //   cost           : pcs × average weight × price per ct
  // Natural <-> Lab Grown (Stone Type dropdown) only swaps DIAMOND rows. Gem stone rows keep their
  // own type and use the Gem Color / Gem Quality selections. A stone that cannot be sized or priced
  // is reported in stoneMissing and flips stoneIncomplete (the site then shows "Price on request").
  const stoneRows = product.product_stones || [];
  const stone = VJ_STONE.calcStoneCharges(stoneRows, {
    diamSizes,
    stoneTypes,
    overrideType: selectedDiamond?.stoneType,
    color:        selectedDiamond?.color,
    quality:      selectedDiamond?.quality,
    gemColor:     selectedDiamond?.gemColor   ?? _selectedCatalogGemColor   ?? "",
    gemQuality:   selectedDiamond?.gemQuality ?? _selectedCatalogGemQuality ?? "",
  });
  const stoneCostINR   = stone.costINR;     // margin-inclusive price_inr × carats
  const totalStoneCtWt = stone.totalCt;

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

  // 3b. Making charges: MAX(netWeight × rate, minFlat) — Gold rate for 18K/14K/10K, Silver for 925
  const qualityLower = (selectedMetal?.quality || "").toLowerCase();
  const metalIsSilver = qualityLower.includes("925") || qualityLower.includes("silver");
  const makingRateRec = metalIsSilver
    ? (labour.find(l => l.category === "__making_rate_silver__") || labour.find(l => l.category === "__making_rate__"))
    : (labour.find(l => l.category === "__making_rate_gold__")   || labour.find(l => l.category === "__making_rate__"));
  const makingMinRec  = metalIsSilver
    ? (labour.find(l => l.category === "__making_min_silver__")  || labour.find(l => l.category === "__making_min__"))
    : (labour.find(l => l.category === "__making_min_gold__")    || labour.find(l => l.category === "__making_min__"));
  const makingRateInrRec = labour.find(l => l.category === "__making_rate_inr__");
  const makingMinInrRec  = labour.find(l => l.category === "__making_min_inr__");
  const makingRateUSD = makingRateInrRec
    ? Number(makingRateInrRec.charge || 0) / inrPerUSD
    : Number(makingRateRec?.charge || 0);
  const makingMinUSD  = makingMinInrRec
    ? Number(makingMinInrRec.charge || 0) / inrPerUSD
    : Number(makingMinRec?.charge  || 0);
  const makingCalc    = makingRateUSD * netWeightG;
  const makingCostUSD = makingCalc > 0 ? Math.max(makingCalc, makingMinUSD) : 0;

  // 3c. Certification (EGL) — optional add-on, diamonds only (gem stones are not EGL-certified here).
  // Rate and minimum are stored in INR; cost = rate × diamond carats, raised to the minimum if lower.
  const certRateInr = Number(labour.find(l => l.category === "__cert_rate_inr__")?.charge || 0);
  const certMinInr  = Number(labour.find(l => l.category === "__cert_min_inr__")?.charge  || 0);
  const certCalcUSD = (certRateInr / inrPerUSD) * stone.diamondCt;
  const certCostUSD = certCalcUSD > 0 ? Math.max(certCalcUSD, certMinInr / inrPerUSD) : 0;

  const labourCostUSD = settingCostUSD + makingCostUSD;

  // ── 4. TOTALS (convert everything to display currency) ─────────────────
  const metalOut   = _convertFromUsd(metalCostNative, cur);
  const stoneOut   = _convertFromInr(stoneCostINR, cur);
  const labourOut  = _convertFromUsd(labourCostUSD, cur);
  const certOut    = _convertFromUsd(certCostUSD, cur);
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
    fmtMetal:   sym + " " + _fmtNum(metalOut.amount, locale, decimals),
    fmtStone:   sym + " " + _fmtNum(stoneOut.amount, locale, decimals),
    fmtLabour:  sym + " " + _fmtNum(labourOut.amount, locale, decimals),
    certAvailable: certCostUSD > 0,
    certCost:      certOut.amount,
    fmtCert:       sym + " " + _fmtNum(certOut.amount, locale, decimals),
    locale, decimals,
    fmtTotal:   sym + " " + _fmtNum(totalAmt, locale, decimals),
    netWeightG,
    totalStoneCtWt,
    // new: stone pricing status
    stoneIncomplete: stone.incomplete,   // a stone could not be sized or priced
    stoneMissing:    stone.missing,      // [{ shape, type, category, status: "no-size" | "no-rate" }]
    stoneLines:      stone.lines,        // per-stone detail (weight, Size Basis, price/ct, cost)
  };
}

/* ═════════════════════════════════════════════════════════════════════════
   2. "Price on request" instead of a partial price
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  const _origFmtPrice = fmtPrice;
  fmtPrice = function (p) {
    if (_pmMetals) {
      const costs = computeLivePriceCosts(p, _displayCurrency?.code || "INR");
      if (costs && costs.stoneIncomplete) return "Price on request";
    }
    return _origFmtPrice(p);
  };

  const _origLiveUSD = getLivePriceUSD;
  getLivePriceUSD = function (product) {
    if (!_pmMetals) return null;
    const costs = computeLivePriceCosts(product, "USD");
    if (costs && costs.stoneIncomplete) return null;
    return _origLiveUSD(product);
  };

  // Both the script.js and product.html versions show "Price on request" when total is 0
  const _origBreakdown = renderPriceBreakdown;
  renderPriceBreakdown = function (costs) {
    if (costs && costs.stoneIncomplete) costs = Object.assign({}, costs, { total: 0 });
    return _origBreakdown(costs);
  };
})();

/* ═════════════════════════════════════════════════════════════════════════
   3. Diamond / Gem Stone Color + Quality filters — FULL REPLACEMENT
      Options come from the real Stone Prices rows, per category, in classification order.
   ═════════════════════════════════════════════════════════════════════════ */
function populateDiamondFilters() {
  const rows = _pmStoneTypes || [];
  const groups = [
    { category: "Diamond",
      color: "[data-filter-diamond-color]", quality: "[data-filter-diamond-quality]",
      cLabel: "Diamond Color", qLabel: "Diamond Quality",
      setColor:   v => { _selectedCatalogDiamondColor   = v; },
      setQuality: v => { _selectedCatalogDiamondQuality = v; } },
    { category: "Gem Stone",
      color: "[data-filter-gem-color]", quality: "[data-filter-gem-quality]",
      cLabel: "Gem Color", qLabel: "Gem Quality",
      setColor:   v => { _selectedCatalogGemColor   = v; },
      setQuality: v => { _selectedCatalogGemQuality = v; } },
  ];

  groups.forEach(g => {
    const colorSel = document.querySelector(g.color), qualitySel = document.querySelector(g.quality);
    if (!colorSel && !qualitySel) return;
    const inCat = rows.filter(s => VJ_STONE.rowCategory(s) === g.category && Number(s.price_inr || s.rate_inr) > 0);

    const refreshQualities = () => {
      if (!qualitySel) return;
      const c = colorSel?.value || "";
      const have = new Set(inCat.filter(s => !c || s.color === c).map(s => s.quality).filter(Boolean));
      const qualities = VJ_STONE.QUALITIES.filter(q => have.has(q));
      const cur = qualitySel.value;
      qualitySel.innerHTML = `<option value="">${g.qLabel}</option>` +
        qualities.map(q => `<option value="${esc(q)}">${esc(q)}</option>`).join("");
      qualitySel.value = qualities.includes(cur) ? cur : "";
      g.setQuality(qualitySel.value || null);
    };

    if (colorSel) {
      const have = new Set(inCat.map(s => s.color).filter(Boolean));
      const colors = VJ_STONE.colorsOf(g.category).filter(c => have.has(c));
      const cur = colorSel.value;
      colorSel.innerHTML = `<option value="">${g.cLabel}</option>` +
        colors.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
      colorSel.value = colors.includes(cur) ? cur : "";
      g.setColor(colorSel.value || null);
    }
    refreshQualities();

    if (colorSel && !colorSel.dataset.vjWired) {
      colorSel.dataset.vjWired = "1";
      colorSel.addEventListener("change", () => {
        g.setColor(colorSel.value || null);
        _livePriceCache.clear();
        refreshQualities();
        onCatalogFilterChange();
      });
    }
    if (qualitySel && !qualitySel.dataset.vjWired) {
      qualitySel.dataset.vjWired = "1";
      qualitySel.addEventListener("change", () => {
        g.setQuality(qualitySel.value || null);
        _livePriceCache.clear();
        onCatalogFilterChange();
      });
    }
  });
}

/* ═════════════════════════════════════════════════════════════════════════
   4. Stone Type dropdown = diamond types that actually have prices
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  const _origSetupBar = setupCatalogFilterBar;
  setupCatalogFilterBar = async function () {
    await _origSetupBar.apply(this, arguments);
    const sel = document.querySelector("[data-filter-stone-type]");
    if (!sel) return;
    const priced = _pmStoneTypes || [];
    const types = VJ_STONE.typesOf("Diamond")
      .filter(t => priced.some(s => VJ_STONE.typeKey(s.type) === VJ_STONE.typeKey(t) && Number(s.price_inr || s.rate_inr) > 0));
    const cur = sel.value;
    sel.innerHTML = `<option value="">Stone Type</option>` +
      types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
    sel.value = types.includes(cur) ? cur : "";
    _selectedCatalogStoneType = sel.value || null;
  };

  // Collections "Clear" button: also reset the Gem Stone selections (runs before script.js's own handler)
  document.addEventListener("click", e => {
    if (!e.target.closest || !e.target.closest("[data-clear-filters]")) return;
    _selectedCatalogGemColor = null;
    _selectedCatalogGemQuality = null;
    ["[data-filter-gem-color]", "[data-filter-gem-quality]"].forEach(sel => {
      const dd = document.querySelector(sel);
      if (dd) dd.value = "";
    });
  }, true);
})();

/* ═════════════════════════════════════════════════════════════════════════
   5. product.html — Gem Stone card, card visibility, validation
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  if (!document.querySelector("[data-product-detail]")) return;   // product page only

  // 5a. Inject the Gem Stone Configuration card right after the Diamond Configuration card.
  //     (Done now, while the page is parsed, so the selects exist when the filters are populated.)
  const diamondCard = document.querySelector("[data-filter-diamond-color]")?.closest(".pd-card");
  if (diamondCard && !document.querySelector("[data-pd-gem-card]")) {
    diamondCard.insertAdjacentHTML("afterend", `
      <div class="pd-card" data-pd-gem-card style="display:none">
        <div class="pd-card-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 4h12l3 5-9 11L3 9l3-5z"/><path d="M3 9h18M9 4l-2 5 5 11M15 4l2 5-5 11"/></svg>
          <span>Gem Stone Configuration</span>
        </div>
        <div class="pd-card-row">
          <div class="pd-field"><label>Gem Color</label><select data-filter-gem-color></select></div>
          <div class="pd-field"><label>Gem Quality</label><select data-filter-gem-quality></select></div>
        </div>
      </div>`);
  }

  const hasStoneOfCategory = (product, cat) =>
    (product?.product_stones || []).some(r => VJ_STONE.rowCategory({ stone_type: r.stone_type }) === cat);

  // 5b. Required-option check: each stone card only matters when the product has that kind of stone.
  if (typeof pdRequiredFieldsStatus === "function") {
    pdRequiredFieldsStatus = function (product) {
      const missing = [];
      const hasOptions = (sel) => !!sel && sel.options.length > 1;

      const metalWrap = document.querySelector("[data-metal-quality-wrap]");
      if (metalWrap && metalWrap.style.display !== "none") {
        const typeSel = document.querySelector("[data-metal-type-select]");
        const qualitySel = document.querySelector("[data-metal-quality-select]");
        if (hasOptions(typeSel) && !typeSel.value) missing.push({ label: "Metal Type", els: [typeSel] });
        if (qualitySel && qualitySel.style.display !== "none" && hasOptions(qualitySel) && !qualitySel.value) {
          missing.push({ label: "Metal Quality", els: [qualitySel] });
        }
      }

      const metalColorSel = document.querySelector("[data-filter-metal-color]");
      const swatchWrap = document.querySelector("[data-metal-color-swatches]");
      if (metalColorSel && hasOptions(metalColorSel) && !metalColorSel.value) {
        missing.push({ label: "Metal Color", els: swatchWrap ? [swatchWrap] : [metalColorSel] });
      }

      const need = (sel, label) => { if (hasOptions(sel) && !sel.value) missing.push({ label, els: [sel] }); };
      if (hasStoneOfCategory(product, "Diamond")) {
        need(document.querySelector("[data-filter-stone-type]"), "Stone Type");
        need(document.querySelector("[data-filter-diamond-color]"), "Diamond Color");
        need(document.querySelector("[data-filter-diamond-quality]"), "Diamond Quality");
      }
      if (hasStoneOfCategory(product, "Gem Stone")) {
        need(document.querySelector("[data-filter-gem-color]"), "Gem Color");
        need(document.querySelector("[data-filter-gem-quality]"), "Gem Quality");
      }

      const sizeSection = document.querySelector("[data-product-sizes]");
      if (sizeSection && sizeSection.style.display !== "none") {
        if (!_selectedSize) missing.push({ label: "Size", els: [document.querySelector("[data-size-options]")] });
      }
      return missing;
    };
  }

  // 5c. After the page has rendered: show each stone card only when it applies, and re-check the
  //     "Add to Enquiry" button whenever a gem option changes.
  if (typeof renderProductDetail === "function") {
    const _origRenderDetail = renderProductDetail;
    renderProductDetail = async function () {
      await _origRenderDetail.apply(this, arguments);
      const product = _lastLoadedProduct;
      if (!product) return;

      document.querySelector("[data-filter-diamond-color]")?.closest(".pd-card")
        ?.style.setProperty("display", hasStoneOfCategory(product, "Diamond") ? "" : "none");
      document.querySelector("[data-pd-gem-card]")
        ?.style.setProperty("display", hasStoneOfCategory(product, "Gem Stone") ? "" : "none");

      ["[data-filter-gem-color]", "[data-filter-gem-quality]"].forEach(sel => {
        const el = document.querySelector(sel);
        if (el && !el.dataset.pdValidateWired) {
          el.dataset.pdValidateWired = "1";
          el.addEventListener("change", () => {
            if (typeof pdRefreshCartButtonState === "function") pdRefreshCartButtonState(product);
          });
        }
      });
      if (typeof pdRefreshCartButtonState === "function") pdRefreshCartButtonState(product);
    };
  }
})();
