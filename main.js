async function loadPartial(id, file) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    const depth = (window.location.pathname.match(/\//g) || []).length - 1;
    const base = depth > 0 ? '../'.repeat(depth) : '';
    const res = await fetch(base + 'partials/' + file);
    if (!res.ok) throw new Error('not found');
    el.innerHTML = await res.text();
  } catch (e) {
    console.warn('Partial nicht geladen:', file);
  }
}

async function init() {
  await Promise.all([
    loadPartial('header-mount', 'header.html'),
    loadPartial('footer-mount', 'footer.html'),
  ]);

  // Cookie Banner
  const banner = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('cookie-accept');
  if (banner && !localStorage.getItem('cookie-accepted')) {
    banner.classList.add('show');
  }
  if (acceptBtn) {
    acceptBtn.addEventListener('click', function () {
      localStorage.setItem('cookie-accepted', 'true');
      banner.classList.remove('show');
    });
  }

  // Burger menu — muss NACH dem Laden der Partials initialisiert werden
  const burger = document.getElementById('burger');
  const nav = document.getElementById('main-nav');

  if (burger && nav) {
    burger.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
    document.querySelectorAll('.main-nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
      });
    });
  }

  // Formspree AJAX submit
  const form = document.getElementById('kontakt-form');
  const success = document.getElementById('form-success');

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.textContent = 'Wird gesendet…';
      btn.disabled = true;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          form.reset();
          if (success) success.style.display = 'block';
          btn.style.display = 'none';
        } else {
          btn.textContent = 'Fehler – bitte erneut versuchen';
          btn.disabled = false;
        }
      } catch {
        btn.textContent = 'Fehler – bitte erneut versuchen';
        btn.disabled = false;
      }
    });
  }

  // Scroll reveal
  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.card, .step, .kontakt-item, .foerderung-visual').forEach(function (el) {
    el.classList.add('reveal');
    observer.observe(el);
  });
}

document.addEventListener('DOMContentLoaded', init);