/* Vie Jewels — Admin → Masters → Collection Themes
   Uses admin.html's own sign-in (sb / sbUpsert), so no extra login or keys are needed. */
(function () {
  const FIELDS = ["title","intro","hero_image","hero_color","hero_overlay","grid_image","grid_color"];
  const $ = (s, r) => (r || document).querySelector(s);
  const E = (v) => String(v == null ? "" : v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const css = `
  .ct{font-size:13px;color:var(--text)}
  .ct-intro{font-size:12px;color:var(--text-muted);margin:0 0 16px;max-width:760px;line-height:1.6}
  .ct-grid{display:grid;grid-template-columns:240px 1fr;gap:20px;align-items:start}
  .ct-list{border:1px solid var(--border);border-radius:var(--radius);max-height:560px;overflow:auto;background:var(--surface)}
  .ct-item{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;font-weight:600}
  .ct-item:last-child{border-bottom:none}.ct-item:hover{background:var(--surface2)}.ct-item.on{background:rgba(184,146,42,.14);color:var(--accent)}
  .ct-dot{width:8px;height:8px;border-radius:50%;background:var(--success)}
  .ct-form{border:1px solid var(--border);border-radius:var(--radius);padding:18px;background:var(--surface)}
  .ct-form h3{font-size:15px;margin-bottom:4px}
  .ct-form label.l{display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:14px 0 5px}
  .ct-form input[type=text],.ct-form textarea{width:100%;padding:9px 11px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:13px;outline:none}
  .ct-form input:focus,.ct-form textarea:focus{border-color:var(--accent)}
  .ct-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .ct-color{display:flex;gap:8px;align-items:center}.ct-color input[type=color]{width:40px;height:36px;padding:0;border:1px solid var(--border);border-radius:6px;background:none;flex:none}
  .ct-check{display:flex;gap:8px;align-items:center;margin-top:14px;font-size:13px}
  .ct-btns{display:flex;gap:10px;margin-top:18px;align-items:center;flex-wrap:wrap}
  .ct-msg{font-size:12px;color:var(--success)}.ct-msg.err{color:var(--danger)}
  .ct-prev{margin-top:18px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface)}
  .ct-prev-hero{padding:26px 22px;background-size:cover;background-position:center;min-height:96px}
  .ct-prev-hero h4{margin:0 0 6px;font-size:20px;font-weight:300;line-height:1.2}.ct-prev-hero p{margin:0;font-size:12px;max-width:420px;line-height:1.6}
  .ct-prev-grid{padding:16px 22px;background-size:cover;background-position:center;font-size:11px;color:var(--text-muted);letter-spacing:.1em;text-transform:uppercase}
  .ct-gal{display:flex;gap:6px;flex-wrap:wrap;padding:0 22px 12px}.ct-gal img{height:44px;border-radius:3px}
  @media(max-width:760px){.ct-grid{grid-template-columns:1fr}}`;

  let tags = [], themes = {}, current = null, ready = false;

  function mount(){
    const host = $("#collection-themes-section"); if(!host || ready) return;
    ready = true;
    try{
    if(!$("#ct-css")){ const s=document.createElement("style"); s.id="ct-css"; s.textContent=css; document.head.appendChild(s); }
    host.innerHTML = '<div class="ct"><p class="ct-intro">Choose a <b>Themes &amp; Collections</b> tag and set the look the Collections page takes on when a visitor selects only that tag: hero heading and text, hero and catalog backgrounds (colour or image), and an optional gallery strip. Saved themes go live immediately.</p><div class="ct-grid"><div class="ct-list" data-ct-list>Loading…</div><div data-ct-form><p class="ct-intro">Select a collection on the left.</p></div></div></div>';
    load();
    }catch(e){ host.innerHTML='<p style="padding:14px;color:#c0392b;font-size:13px">Collection Themes failed to start: '+E(e.message)+'</p>'; }
  }

  async function load(){
    try{
      const [t, th] = await Promise.all([sb("tags?select=name&order=name.asc"), sb("collection_themes?select=*")]);
      tags = t.map(x=>x.name).filter(Boolean);
      themes = {}; (th||[]).forEach(r=>{ themes[r.tag_name.toLowerCase()] = r; });
      (th||[]).forEach(r=>{ if(!tags.some(n=>n.toLowerCase()===r.tag_name.toLowerCase())) tags.push(r.tag_name); });
      renderList(); if(current) renderForm(current);
    }catch(e){
      $("[data-ct-list]").innerHTML = '<div style="padding:14px;color:var(--danger)">Could not load: '+E(e.message)+'<br><br>Run <b>1-collection-themes.sql</b> in the Supabase SQL Editor first.</div>';
    }
  }
  function renderList(){
    const el = $("[data-ct-list]");
    el.innerHTML = tags.map(n=>`<div class="ct-item${current===n?" on":""}" data-tag="${E(n)}"><span>${E(n)}</span>${themes[n.toLowerCase()]?'<span class="ct-dot" title="Theme applied"></span>':""}</div>`).join("") || '<div style="padding:14px;color:var(--text-muted)">No tags yet. Add tags under Masters → Tags.</div>';
    el.querySelectorAll(".ct-item").forEach(i=>i.addEventListener("click",()=>{ current=i.dataset.tag; renderList(); renderForm(current); }));
  }
  const colorField = (name,val,label)=>`<div><label class="l">${label}</label><div class="ct-color"><input type="color" data-picker="${name}" value="${/^#[0-9a-f]{6}$/i.test(val||"")?val:"#ffffff"}"><input type="text" data-f="${name}" value="${E(val)}" placeholder="#f3e9e2"></div></div>`;

  function renderForm(name){
    const r = themes[name.toLowerCase()] || {};
    const gal = Array.isArray(r.gallery) ? r.gallery.join("\n") : "";
    const host = $("[data-ct-form]");
    host.innerHTML = `<div class="ct-form"><h3>${E(name)}</h3>
      <label class="l">Hero heading (HTML allowed, e.g. Bridal&lt;br /&gt;&lt;em&gt;Collection&lt;/em&gt;)</label><input type="text" data-f="title" value="${E(r.title)}">
      <label class="l">Hero paragraph</label><textarea rows="3" data-f="intro">${E(r.intro)}</textarea>
      <div class="ct-row">${colorField("hero_color",r.hero_color,"Hero background colour")}<div><label class="l">Hero overlay (e.g. rgba(0,0,0,.35))</label><input type="text" data-f="hero_overlay" value="${E(r.hero_overlay)}"></div></div>
      <label class="l">Hero background image URL</label><input type="text" data-f="hero_image" value="${E(r.hero_image)}" placeholder="https://ik.imagekit.io/...">
      <label class="ct-check"><input type="checkbox" data-f="dark" ${r.dark?"checked":""}> White text on hero (use with dark backgrounds)</label>
      <div class="ct-row">${colorField("grid_color",r.grid_color,"Catalog background colour")}<div><label class="l">Catalog background image URL</label><input type="text" data-f="grid_image" value="${E(r.grid_image)}"></div></div>
      <label class="l">Gallery strip images (one URL per line, optional)</label><textarea rows="3" data-f="gallery">${E(gal)}</textarea>
      <div class="ct-prev"><div class="ct-prev-hero" data-prev-hero><h4 data-prev-title></h4><p data-prev-intro></p></div><div class="ct-prev-grid" data-prev-grid>Catalog area preview</div><div class="ct-gal" data-prev-gal></div></div>
      <div class="ct-btns"><button type="button" class="btn btn-primary" data-save>Save theme</button><button type="button" class="btn btn-secondary" data-clear>Clear fields</button>${themes[name.toLowerCase()]?'<button type="button" class="btn btn-danger" data-del>Remove theme</button>':""}<span class="ct-msg" data-msg></span></div></div>`;
    host.querySelectorAll("[data-picker]").forEach(p=>p.addEventListener("input",()=>{ host.querySelector(`[data-f="${p.dataset.picker}"]`).value=p.value; preview(); }));
    host.querySelectorAll("[data-f]").forEach(el=>el.addEventListener("input",preview));
    $("[data-save]").addEventListener("click",save);
    $("[data-clear]").addEventListener("click",()=>{ host.querySelectorAll("[data-f]").forEach(el=>{ if(el.type==="checkbox") el.checked=false; else el.value=""; }); preview(); });
    const d=$("[data-del]"); if(d) d.addEventListener("click",remove);
    preview();
  }
  const val = k => { const el=$(`[data-f="${k}"]`); return el ? (el.type==="checkbox" ? el.checked : el.value.trim()) : ""; };
  function preview(){
    const h=$("[data-prev-hero]"), g=$("[data-prev-grid]"); if(!h) return;
    const bg=(el,img,color,ov)=>{ el.style.backgroundColor=color||""; el.style.backgroundImage = img ? (ov?`linear-gradient(${ov},${ov}),url("${img}")`:`url("${img}")`) : ""; };
    bg(h,val("hero_image"),val("hero_color"),val("hero_overlay")); bg(g,val("grid_image"),val("grid_color"),"");
    h.style.color = val("dark") ? "#fff" : "#171717";
    $("[data-prev-title]").innerHTML = val("title") || E(current);
    $("[data-prev-intro]").textContent = val("intro");
    $("[data-prev-gal]").innerHTML = val("gallery").split("\n").map(u=>u.trim()).filter(Boolean).map(u=>`<img src="${E(u)}" alt="">`).join("");
  }
  function msg(t,err){ const m=$("[data-msg]"); if(m){ m.textContent=t; m.className="ct-msg"+(err?" err":""); } }
  async function save(){
    const row = { tag_name: current, dark: !!val("dark"), updated_at: new Date().toISOString(),
      gallery: val("gallery").split("\n").map(u=>u.trim()).filter(Boolean) };
    FIELDS.forEach(k=>row[k]=val(k)||null);
    try{ await sbUpsert("collection_themes","tag_name",[row]); await load(); msg("Saved — live on the Collections page."); try{ toast("Theme saved."); }catch(_){} }
    catch(e){ msg("Could not save: "+e.message,true); }
  }
  async function remove(){
    if(!confirm("Remove the theme for “"+current+"”?")) return;
    try{ await sb("collection_themes?tag_name=eq."+encodeURIComponent(current),"DELETE"); await load(); msg("Theme removed."); }
    catch(e){ msg("Could not remove: "+e.message,true); }
  }

  // Mount whenever the Collection Themes panel becomes visible, however it got opened:
  // a click on the sub-tab, a page refresh that restores #masters/collectionthemes,
  // or the admin sign-in finishing after this script has already run.
  function check(){
    const panel = $("#sub-collectionthemes");
    if (panel && panel.classList.contains("active")) mount();
  }
  function init(){
    check();
    const panel = $("#sub-collectionthemes");
    if (panel) new MutationObserver(check).observe(panel, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("click", e => { if (e.target.closest('.sub-tab-btn[data-sub="collectionthemes"]')) setTimeout(check, 0); });
    window.addEventListener("hashchange", () => setTimeout(check, 0));
    let n = 0; const iv = setInterval(() => { check(); if (ready || ++n > 40) clearInterval(iv); }, 500); // safety net after sign-in
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
