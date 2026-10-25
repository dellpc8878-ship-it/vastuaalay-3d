/* Devotional welcome and lightweight page micro-interactions.
 * Independent of the 3D module: graceful even on a slow/offline connection.
 * Sound is intentionally not autoplayed. */
(() => {
  'use strict';
  const intro = document.getElementById('blessingIntro');
  const skip = document.getElementById('skipIntro');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let closed = false;
  function finishIntro() {
    if (closed || !intro) return;
    closed = true;
    intro.classList.add('blessing-out');
    window.setTimeout(() => {intro.classList.add('hidden');intro.setAttribute('aria-hidden','true');}, reduced ? 10 : 530);
  }
  skip?.addEventListener('click', finishIntro);
  window.setTimeout(finishIntro, reduced ? 180 : 2900);
  // Never trap someone on the intro if an animation or external resource fails.
  window.addEventListener('pageshow', e => {if (e.persisted) finishIntro();});

  if (!reduced && 'IntersectionObserver' in window) {
    document.body.classList.add('has-reveal');
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          reveal.unobserve(entry.target);
        }
      });
    }, {threshold:.07, rootMargin:'0px 0px 40px 0px'});
    document.querySelectorAll('.upload-card,.result-topline,.viewer-card,.insight-card,.info-strip').forEach((el,index)=>{
      el.classList.add('reveal-item');
      el.style.setProperty('--reveal-order', String(index%3));
      reveal.observe(el);
    });
  }
  // Make user actions feel tactile without altering their established workflows.
  document.addEventListener('pointerdown', event => {
    if (reduced) return;
    const btn = event.target.closest('button,.dropzone');
    if (!btn || btn.closest('.blessing-intro')) return;
    btn.classList.remove('tap-pop');
    void btn.offsetWidth;
    btn.classList.add('tap-pop');
  }, {passive:true});
})();
