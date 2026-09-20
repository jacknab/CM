/* Certxa — Main JS */

// ── Background video autoplay fix (iOS Safari / Low Power Mode) ──
// The video element has autoplay+muted+playsinline which *should* work,
// but iOS can silently suppress it. This handler:
//   1. Calls .play() programmatically so the browser can't ignore it
//   2. Marks the container so CSS fades the fallback image out
//   3. Retries on visibility-change (user switches back to tab)
(function () {
  const video    = document.querySelector('.hero-bg-video');
  const videoBg  = video && video.closest('.hero-video-bg');
  if (!video || !videoBg) return;

  function markPlaying () {
    videoBg.classList.add('video-playing');
  }

  function tryPlay () {
    if (!video.paused) { markPlaying(); return; }
    const p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(markPlaying).catch(function () {
        // Autoplay blocked — fallback image remains visible, no error thrown
      });
    } else {
      // Older browsers return undefined from .play()
      markPlaying();
    }
  }

  // Try immediately if media is already buffered enough
  if (video.readyState >= 3) {
    tryPlay();
  } else {
    video.addEventListener('canplay', tryPlay, { once: true });
  }

  // Retry when user returns to the page (tab switch / iPhone home button)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && video.paused) tryPlay();
  });

  // Retry on first user interaction as a final safety net
  var interactionEvents = ['touchstart', 'pointerdown', 'click'];
  function onInteraction () {
    tryPlay();
    interactionEvents.forEach(function (ev) {
      document.removeEventListener(ev, onInteraction);
    });
  }
  interactionEvents.forEach(function (ev) {
    document.addEventListener(ev, onInteraction, { once: true, passive: true });
  });
}());

// ── Accordion ──────────────────────────────────────────────
document.querySelectorAll('.accordion-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const body   = btn.nextElementSibling;
    const isOpen = btn.classList.contains('active');

    document.querySelectorAll('.accordion-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-expanded', 'false');
      if (b.nextElementSibling) b.nextElementSibling.classList.remove('open');
    });

    if (!isOpen) {
      btn.classList.add('active');
      btn.setAttribute('aria-expanded', 'true');
      body.classList.add('open');
    }
  });
});

// Set initial aria-expanded on accordion buttons
document.querySelectorAll('.accordion-btn').forEach(btn => {
  if (!btn.hasAttribute('aria-expanded')) btn.setAttribute('aria-expanded', 'false');
  const body = btn.nextElementSibling;
  if (body) btn.setAttribute('aria-controls', body.id || '');
});

// ── Nav scroll shadow ──────────────────────────────────────
const nav = document.getElementById('main-nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });
}

// ── Reveal on scroll ───────────────────────────────────────
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.card, .testimonial, .step, .pricing-card').forEach((el, i) => {
  el.classList.add('reveal');
  const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
  const idx = siblings.indexOf(el);
  if (idx > 0 && idx <= 3) el.classList.add(`reveal-delay-${idx}`);
  revealObserver.observe(el);
});
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ── Desktop dropdown — hover with grace-period timer ───────
(function () {
  const isMobile = () => window.innerWidth < 900;

  document.querySelectorAll('.has-dropdown').forEach(item => {
    let closeTimer = null;
    const trigger = item.querySelector('a');
    if (trigger) {
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    }

    const open = () => {
      if (isMobile()) return;
      clearTimeout(closeTimer);
      document.querySelectorAll('.has-dropdown').forEach(other => {
        if (other !== item) {
          other.classList.remove('open');
          const t = other.querySelector('a');
          if (t) t.setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.add('open');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    };

    const scheduleClose = () => {
      if (isMobile()) return;
      closeTimer = setTimeout(() => {
        item.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }, 150);
    };

    item.addEventListener('mouseenter', open);
    item.addEventListener('mouseleave', scheduleClose);

    const dropdown = item.querySelector('.dropdown');
    if (dropdown) {
      dropdown.addEventListener('mouseenter', () => clearTimeout(closeTimer));
      dropdown.addEventListener('mouseleave', scheduleClose);
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.has-dropdown')) {
      document.querySelectorAll('.has-dropdown').forEach(d => {
        d.classList.remove('open');
        const t = d.querySelector('a');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
    }
  });
})();

// ── Mobile dropdown — tap parent link to toggle ────────────
document.querySelectorAll('.has-dropdown > a').forEach(link => {
  link.addEventListener('click', e => {
    if (window.innerWidth >= 900) return;
    e.preventDefault();
    const item = link.closest('.has-dropdown');
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.has-dropdown').forEach(d => {
      d.classList.remove('open');
      const t = d.querySelector('a');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
    if (!wasOpen) {
      item.classList.add('open');
      link.setAttribute('aria-expanded', 'true');
    }
  });
});

// ── Mobile menu — class-based (no inline styles) ───────────
const menuBtn    = document.querySelector('.mobile-menu-btn');

if (menuBtn && nav) {
  let menuOpen = false;

  const openMenu = () => {
    menuOpen = true;
    nav.classList.add('is-open');
    menuBtn.classList.add('is-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Close menu');
    document.body.style.overflow = '';
  };

  const closeMenu = () => {
    menuOpen = false;
    nav.classList.remove('is-open');
    menuBtn.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Open menu');
    document.body.style.overflow = '';
    // Close any open mobile dropdowns
    document.querySelectorAll('.has-dropdown').forEach(d => {
      d.classList.remove('open');
      const t = d.querySelector('a');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  };

  menuBtn.addEventListener('click', () => {
    if (menuOpen) closeMenu(); else openMenu();
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (menuOpen && !e.target.closest('#main-nav')) closeMenu();
  });

  // Close on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768 && menuOpen) closeMenu();
  }, { passive: true });

  // Close when a non-dropdown nav link is clicked
  document.querySelectorAll('.nav-links a:not(.has-dropdown > a), .nav-actions a').forEach(link => {
    link.addEventListener('click', () => {
      if (menuOpen) closeMenu();
    });
  });
}

// ── Pricing toggle ─────────────────────────────────────────
const toggleInput = document.getElementById('billing-toggle');
if (toggleInput) {
  const monthlyPrices = document.querySelectorAll('.price-monthly');
  const annualPrices  = document.querySelectorAll('.price-annual');
  const saveBadges    = document.querySelectorAll('.pricing-save');

  function updatePricing(isAnnual) {
    monthlyPrices.forEach(el => el.style.display = isAnnual ? 'none' : 'inline');
    annualPrices.forEach(el  => el.style.display = isAnnual ? 'inline' : 'none');
    saveBadges.forEach(el    => el.style.display = isAnnual ? 'block' : 'none');
  }
  updatePricing(false);
  toggleInput.addEventListener('change', () => updatePricing(toggleInput.checked));
}

// ── Active nav link ────────────────────────────────────────
const currentPath = window.location.pathname;
document.querySelectorAll('.nav-links a, .dropdown a').forEach(link => {
  if (link.getAttribute('href') === currentPath) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
});

// ── Subtle card tilt on desktop ────────────────────────────
if (window.matchMedia('(hover: hover) and (min-width: 768px)').matches) {
  document.querySelectorAll('.glass-card, .hero-mockup').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width  - 0.5;
      const y = (e.clientY - r.top)  / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${-y * 3.5}deg) rotateY(${x * 3.5}deg) translateZ(8px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

// ── Animated counters ───────────────────────────────────────
(function () {
  const counterObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target   = parseFloat(el.dataset.count);
      const suffix   = el.dataset.suffix  || '';
      const prefix   = el.dataset.prefix  || '';
      const isFloat  = String(target).includes('.');
      const duration = 1600;
      const steps    = 55;
      let   current  = 0;
      const inc      = target / steps;
      const interval = setInterval(() => {
        current += inc;
        if (current >= target) {
          current = target;
          clearInterval(interval);
          el.classList.add('counter-done');
        }
        const val = isFloat
          ? current.toFixed(1)
          : Math.floor(current).toLocaleString();
        el.textContent = prefix + val + suffix;
      }, duration / steps);
      counterObs.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => counterObs.observe(el));
})();

// ── Word-by-word headline entrance ─────────────────────────
(function () {
  // Skip entirely if user prefers reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.querySelectorAll('.word-split').forEach(el => {
    const result = [];
    let delay = 0.08;
    function processNode(node) {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(chunk => {
          if (!chunk) return;
          if (/^\s+$/.test(chunk)) { result.push(document.createTextNode(chunk)); return; }
          const span = document.createElement('span');
          span.className = 'word-reveal';
          span.style.animationDelay = delay + 's';
          span.textContent = chunk;
          result.push(span);
          delay += 0.09;
        });
      } else if (node.nodeName === 'EM' || node.nodeName === 'STRONG') {
        const clone = node.cloneNode(true);
        clone.style.display = 'inline-block';
        clone.style.opacity = '0';
        clone.style.transform = 'translateY(22px)';
        clone.style.animation = `wordRise .55s var(--ease-out) ${delay}s forwards`;
        result.push(clone);
        delay += 0.1;
      } else {
        result.push(node.cloneNode(true));
      }
    }
    Array.from(el.childNodes).forEach(processNode);
    el.innerHTML = '';
    result.forEach(n => el.appendChild(n));
  });
})();
