// PWA install gate + instructions overlay.
//
// Behavior:
//   - Running standalone (installed PWA, launched from home screen):
//     inject flutter_bootstrap.js and let the app run normally.
//   - Running in a browser tab: show a fullscreen install overlay with
//     platform-specific steps and do NOT load Flutter at all. The user
//     cannot dismiss the overlay — they have to install. After install
//     fires (Android), we swap the content to a "thanks, open from your
//     home screen" message.
//
// Why this is the install gate:
// When users click "Install" on the landing page at /bastard/install/, they
// land here. Chrome will only register the install against this scope
// (which has the manifest + service worker), so the install MUST happen
// from inside /bastard/app/.
//
// CSP note: the page's CSP has `script-src 'self'` without 'unsafe-inline',
// so this MUST be an external file — inline <script> blocks won't execute.

(function () {
  var isStandalone = (typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;

  // Dev bypass: when serving from localhost, skip the install gate so the
  // app is testable in a normal browser tab. Production (riot.haus) still
  // gates as usual.
  var host = window.location.hostname;
  var isLocalDev = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

  if (isStandalone || isLocalDev) {
    // Installed-PWA path: clean any stale ?install=1 from the URL,
    // then load Flutter and bail.
    stripInstallParam();
    loadFlutter();
    return;
  }

  // Browser-tab path: show the overlay, never load Flutter.

  // Clear any stale "installed" flag — browsers fire no event on uninstall,
  // so the flag could be wrong, and we want the landing page to reflect
  // reality.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    try { localStorage.removeItem('ub-pwa-installed'); } catch (_) {}
  });

  // Flag <html> so the overlay CSS (in index.html) makes it visible as soon
  // as the markup is parsed.
  document.documentElement.classList.add('ub-show-install-overlay');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function loadFlutter() {
    var s = document.createElement('script');
    s.src = 'flutter_bootstrap.js';
    s.async = true;
    document.head.appendChild(s);
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

    var SVG = {
      dots: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
      install: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 10v6M9 13h6"/></svg>',
      check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
      share: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
      plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>',
      home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>'
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

    var titleEl = document.getElementById('ub-install-title');
    var subEl = document.querySelector('.ub-install-sub');
    var stepsBox = document.getElementById('ub-install-steps');
    var footEl = document.getElementById('ub-install-foot');
    var closeBtn = document.getElementById('ub-install-close');
    var overlay = document.getElementById('ub-install-overlay');
    if (!stepsBox || !overlay) return;

    // No bypass in browser mode — the overlay is the page.
    if (closeBtn && closeBtn.parentNode) {
      closeBtn.parentNode.removeChild(closeBtn);
    }

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
        : 'Once installed, close this tab and open the app from your home screen.';
    }

    // On Android/desktop Chrome, `appinstalled` fires when the install
    // completes. Swap the overlay content to a thank-you message asking the
    // user to launch from the home screen. (iOS Safari doesn\u2019t fire
    // this event — there the footer text already tells them to open from
    // the home screen.)
    window.addEventListener('appinstalled', function () {
      try { localStorage.setItem('ub-pwa-installed', '1'); } catch (_) {}
      showThanks();
    });

    function showThanks() {
      if (titleEl) titleEl.textContent = 'Thanks for installing.';
      if (subEl) {
        subEl.textContent =
          'Now open the app from your home screen.';
      }
      stepsBox.innerHTML =
        '<div class="ub-step">'
        + '<div class="ub-step-num">' + SVG.home + '</div>'
        + '<div class="ub-step-body">Close this tab. Tap the <strong>Ungrateful Bastard</strong> icon on your home screen to get started.</div>'
        + '</div>';
      if (footEl) footEl.innerHTML = '';
    }
  }
})();
