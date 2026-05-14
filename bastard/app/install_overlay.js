// PWA install instructions overlay.
//
// Why this file exists:
// When users click "Install" on the landing page at /bastard/install/, they
// get sent here with `?install=1`. The previous design tried to fire
// `beforeinstallprompt` from the landing page, but Chrome silently turns
// "Add to Home screen" into a webclip shortcut (with a screenshot icon)
// when the page doesn't have a linked manifest in scope. So the install
// MUST happen from inside /bastard/app/ — which has the manifest and
// service worker.
//
// This script renders a fullscreen instruction overlay on top of the
// Flutter app shell, with platform-specific steps. The user reads the
// steps, opens the browser menu while on /bastard/app/, and Chrome
// correctly installs the PWA (right icon, right start_url).
//
// CSP note: the page's CSP has `script-src 'self'` without 'unsafe-inline',
// so this MUST be an external file — inline <script> blocks won't execute.

(function () {
  var params;
  try { params = new URLSearchParams(window.location.search); }
  catch (_) { return; }
  if (params.get('install') !== '1') return;

  // Suppress the overlay only when we're certain the app is already in use:
  // running as an installed standalone PWA. We deliberately do NOT trust a
  // cached "installed" flag here — browsers fire no event on uninstall, so
  // that flag can be stale and would silently swallow a legitimate
  // re-install click after the user removed the app.
  var isStandalone = (typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
  if (isStandalone) {
    stripInstallParam();
    return;
  }

  // If we get an install-eligible event here, the app is definitely NOT
  // currently installed — clear any stale flag so the landing page reflects
  // reality on the next visit.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    try { localStorage.removeItem('ub-pwa-installed'); } catch (_) {}
  });

  // Flag <html> so the overlay CSS (in index.html) makes it visible as soon
  // as the markup is parsed. This avoids a flash where Flutter shows first
  // and the overlay then pops on top.
  document.documentElement.classList.add('ub-show-install-overlay');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function stripInstallParam() {
    try {
      var clean = new URL(window.location.href);
      clean.searchParams.delete('install');
      history.replaceState({}, '', clean.toString());
    } catch (_) {}
  }

  function init() {
    var ua = navigator.userAgent;
    var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var isAndroid = /Android/.test(ua);

    var SVG = {
      dots: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
      install: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 10v6M9 13h6"/></svg>',
      check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
      share: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
      plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>'
    };

    var STEPS_ANDROID = [
      { icon: SVG.dots,    html: 'Tap the <strong>menu</strong> button (three dots) at the top right of Chrome.' },
      { icon: SVG.install, html: 'Choose <strong>&ldquo;Install app&rdquo;</strong> or <strong>&ldquo;Add to Home screen&rdquo;</strong>.' },
      { icon: SVG.check,   html: 'Tap <strong>Install</strong>. The app will appear on your home screen.' }
    ];

    var STEPS_IOS = [
      { icon: SVG.share, html: 'Tap the <strong>Share</strong> button at the bottom of Safari (a box with an up arrow).' },
      { icon: SVG.plus,  html: 'Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.' },
      { icon: SVG.check, html: 'Tap <strong>Add</strong> in the top right. The app will appear on your home screen.' }
    ];

    var stepsBox = document.getElementById('ub-install-steps');
    var footEl = document.getElementById('ub-install-foot');
    var closeBtn = document.getElementById('ub-install-close');
    var overlay = document.getElementById('ub-install-overlay');
    if (!stepsBox || !overlay) return;

    var steps = isIOS ? STEPS_IOS : STEPS_ANDROID;
    var html = '';
    for (var i = 0; i < steps.length; i++) {
      html += '<div class="ub-step">'
        + '<div class="ub-step-num">' + (i + 1) + '</div>'
        + '<div class="ub-step-body">' + steps[i].html + '</div>'
        + '<div class="ub-step-icon">' + steps[i].icon + '</div>'
        + '</div>';
    }
    stepsBox.innerHTML = html;

    if (footEl) {
      footEl.innerHTML = isIOS
        ? 'Make sure you\u2019re using <strong>Safari</strong>. \u201CAdd to Home Screen\u201D isn\u2019t available in Chrome or Firefox on iPhone.'
        : 'You\u2019re on the right page \u2014 install from here so the app icon links to the app itself.';
    }

    function dismiss() {
      document.documentElement.classList.remove('ub-show-install-overlay');
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
      stripInstallParam();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') dismiss(); }
    closeBtn && closeBtn.addEventListener('click', dismiss);
    document.addEventListener('keydown', onKey);

    // If the user manages to install while the overlay is open, dismiss
    // automatically — the steps are no longer relevant.
    window.addEventListener('appinstalled', function () {
      try { localStorage.setItem('ub-pwa-installed', '1'); } catch (_) {}
      dismiss();
    });
  }
})();