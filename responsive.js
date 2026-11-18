/* Vie Jewels — mobile menu + collapsible filters. Works with the existing markup; no HTML changes needed. */
(function(){
  function initMenu(){
    var nav=document.querySelector('.main-nav');
    var links=nav&&nav.querySelector('.nav-links');
    if(!nav||!links||nav.querySelector('.nav-toggle'))return;
    if(!links.id)links.id='site-nav-links';
    var b=document.createElement('button');
    b.type='button';b.className='nav-toggle';
    b.setAttribute('aria-label','Menu');b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls',links.id);
    b.innerHTML='<span></span><span></span><span></span>';
    nav.appendChild(b);nav.classList.add('nav-ready');
    function set(open){nav.classList.toggle('nav-open',open);b.setAttribute('aria-expanded',open?'true':'false');}
    b.addEventListener('click',function(){set(!nav.classList.contains('nav-open'));});
    links.addEventListener('click',function(e){if(e.target.closest('a'))set(false);});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false);});
    document.addEventListener('click',function(e){if(!nav.contains(e.target))set(false);});
    window.addEventListener('resize',function(){if(window.innerWidth>860)set(false);});
  }
  function initFilters(){
    var sb=document.querySelector('.catalog-sidebar');
    if(!sb||!sb.parentNode||document.querySelector('.filter-toggle'))return;
    var btn=document.createElement('button');
    btn.type='button';btn.className='filter-toggle';btn.setAttribute('aria-expanded','false');
    btn.innerHTML='<span>Filters</span><span class="ft-icon" aria-hidden="true">+</span>';
    sb.parentNode.insertBefore(btn,sb);sb.classList.add('filters-ready');
    btn.addEventListener('click',function(){
      var open=sb.classList.toggle('filters-open');
      btn.setAttribute('aria-expanded',open?'true':'false');
      btn.querySelector('.ft-icon').textContent=open?'\u2212':'+';
    });
  }
  function init(){initMenu();initFilters();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
