const motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Runs onSeen once, the first time el scrolls into view.
function whenSeen(el, onSeen, threshold = 0.2) {
  if (!('IntersectionObserver' in window)) {
    onSeen(el);
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    observer.disconnect();
    onSeen(el);
  }, { threshold });
  observer.observe(el);
}

// Slot-machine digits: each digit is a reel of 0-9 that rolls to its value.
// spin rebuilds the reels from 0 and adds a full turn before landing.
function slotRoll(el, text, spin = false) {
  if (!motionOK) {
    el.textContent = text;
    return;
  }
  const chars = Array.from(text);
  const shape = chars.map(c => (/\d/.test(c) ? '#' : c)).join('');
  let reel = el.querySelector('.slot-reel');
  if (spin || !reel || reel.dataset.shape !== shape) {
    const spoken = document.createElement('span');
    spoken.className = 'sr-only';
    reel = document.createElement('span');
    reel.className = 'slot-reel';
    reel.setAttribute('aria-hidden', 'true');
    reel.dataset.shape = shape;
    chars.forEach(c => {
      if (!/\d/.test(c)) {
        const plain = document.createElement('span');
        plain.textContent = c;
        reel.appendChild(plain);
        return;
      }
      const digit = document.createElement('span');
      digit.className = 'slot-digit';
      const strip = document.createElement('span');
      strip.className = 'slot-strip';
      for (let i = 0; i < 20; i++) {
        const n = document.createElement('span');
        n.textContent = String(i % 10);
        strip.appendChild(n);
      }
      digit.appendChild(strip);
      reel.appendChild(digit);
    });
    el.replaceChildren(spoken, reel);
    void reel.offsetWidth;
  }
  el.querySelector('.sr-only').textContent = text;
  const digits = chars.filter(c => /\d/.test(c)).map(Number);
  reel.querySelectorAll('.slot-strip').forEach((strip, i) => {
    strip.style.transitionDelay = spin ? i * 0.08 + 's' : '0s';
    strip.style.transform = 'translateY(' + -(spin ? 10 + digits[i] : digits[i]) * 1.1 + 'em)';
  });
}

// FAQ accordion
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const wasOpen = item.classList.contains('open');
    // Close all
    document.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });
    // Toggle clicked
    if (!wasOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// Pricing period toggle — the card shows one price at a time instead of
// cramming both into the sub-line.
const monthlyBtn = document.getElementById('billing-monthly');
const yearlyBtn = document.getElementById('billing-yearly');
const amountEl = document.getElementById('pricing-amount');
const periodEl = document.getElementById('pricing-period');
const priceDescEl = document.getElementById('pricing-desc');

const PLANS = {
  monthly: {
    amount: '$4.99',
    period: '/month',
    desc: 'Billed monthly · switch to yearly and pay half'
  },
  yearly: {
    amount: '$29.99',
    period: '/year',
    desc: 'Works out to $2.50/month, billed once a year'
  }
};

let currentPlan = null;

function showPlan(name, animate) {
  if (name === currentPlan) return;
  currentPlan = name;
  const plan = PLANS[name];
  if (animate) slotRoll(amountEl, plan.amount, true);
  else amountEl.textContent = plan.amount;
  periodEl.textContent = plan.period;
  priceDescEl.textContent = plan.desc;
  monthlyBtn.setAttribute('aria-pressed', String(name === 'monthly'));
  yearlyBtn.setAttribute('aria-pressed', String(name === 'yearly'));
}

if (monthlyBtn && yearlyBtn) {
  monthlyBtn.addEventListener('click', () => showPlan('monthly', true));
  yearlyBtn.addEventListener('click', () => showPlan('yearly', true));
  showPlan('yearly');
}

// Nav: highlight the section in view
const sectionLinks = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
const sections = sectionLinks
  .map(link => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

function markActiveSection() {
  let activeId = '';
  sections.forEach(section => {
    if (section.getBoundingClientRect().top <= 140) activeId = section.id;
  });
  sectionLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === '#' + activeId);
  });
}

const topbar = document.querySelector('.topbar');

function onScroll() {
  markActiveSection();
  if (topbar) topbar.classList.toggle('is-scrolled', window.scrollY > 4);
}

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Hero: play a scan of the sample inbox once, when it first comes into view.
// The markup is the finished state, so visitors without JS or with reduced
// motion see the same picture, still.
const heroScan = document.getElementById('hero-scan');

if (heroScan && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const rows = Array.from(heroScan.querySelectorAll('.scan-row'));
  const unsubRows = rows.filter(row => row.dataset.verdict === 'unsub');
  const label = heroScan.querySelector('.scan-btn-label');
  const progress = heroScan.querySelector('.scan-progress span');
  const foundEl = document.getElementById('scan-found');
  const goneEl = document.getElementById('scan-gone');
  const TAGS = { keep: 'Keep', paid: 'Paid', unsub: 'Unsubscribe', working: 'Working…', done: 'Unsubscribed' };

  const setTag = (row, state) => {
    const tag = row.querySelector('.scan-tag');
    tag.className = 'scan-tag scan-tag-' + state;
    tag.textContent = TAGS[state];
  };

  const play = () => {
    heroScan.classList.add('is-animating');
    rows.forEach(row => {
      row.classList.remove('is-seen', 'is-done', 'is-hl');
      setTag(row, row.dataset.verdict);
    });
    progress.style.setProperty('--p', '0');
    label.textContent = 'Scanning inbox…';
    slotRoll(foundEl, '0');
    slotRoll(goneEl, '0');

    let t = 500;
    const at = (delay, fn) => setTimeout(fn, delay);
    rows.forEach((row, i) => {
      at(t + i * 450, () => {
        row.classList.add('is-seen');
        slotRoll(foundEl, String(i + 1));
        progress.style.setProperty('--p', String((i + 1) / rows.length));
      });
    });
    t += rows.length * 450 + 250;
    at(t, () => { label.textContent = 'Scan complete'; });
    t += 800;
    unsubRows.forEach((row, i) => {
      at(t, () => { row.classList.add('is-hl'); setTag(row, 'working'); });
      at(t + 700, () => {
        row.classList.remove('is-hl');
        row.classList.add('is-done');
        setTag(row, 'done');
        slotRoll(goneEl, String(i + 1));
      });
      t += 950;
    });
    at(t, () => heroScan.classList.remove('is-animating'));
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      play();
    }, { threshold: 0.35 });
    observer.observe(heroScan);
  } else {
    play();
  }
}

// Mobile nav toggle
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

function setNavOpen(open) {
  navLinks.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', String(open));
}

navToggle.addEventListener('click', () => {
  setNavOpen(!navLinks.classList.contains('open'));
});
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => setNavOpen(false));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navLinks.classList.contains('open')) {
    setNavOpen(false);
    navToggle.focus();
  }
});
document.addEventListener('click', (e) => {
  if (navLinks.classList.contains('open') && !e.target.closest('nav')) setNavOpen(false);
});

// Reveal: headings and cards below the fold fade up once as they arrive.
if (motionOK) {
  const revealTargets = document.querySelectorAll('main h2.serif, .step, .item, .plan, .closing h2');
  revealTargets.forEach(el => {
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    const siblings = Array.from(el.parentElement.children).filter(c => c.matches('.step, .plan'));
    const delay = Math.max(0, siblings.indexOf(el)) * 0.12;
    el.classList.add('reveal', 'reveal-pending');
    el.style.transitionDelay = delay + 's';
    whenSeen(el, () => {
      el.classList.remove('reveal-pending');
      setTimeout(() => { el.style.transitionDelay = ''; }, 700 + delay * 1000);
    }, 0.15);
  });

  const scoreEl = document.getElementById('score-value');
  if (scoreEl) {
    const target = scoreEl.textContent;
    slotRoll(scoreEl, target.replace(/\d/g, '0'));
    whenSeen(scoreEl, () => slotRoll(scoreEl, target, true), 0.6);
  }
}
