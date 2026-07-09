// PWA install gate + instructions overlay (React build).
//
// Behavior:
//   - Running standalone (installed PWA) or on localhost: do nothing here;
//     src/main.tsx mounts the app.
//   - Running in a browser tab: show a fullscreen install overlay with
//     platform-specific steps. The React app is NOT mounted (main.tsx makes
//     the same standalone/localhost check), so the overlay is all the user
//     sees until they install + launch from the home screen.
//
// Why the install gate: Chrome registers the install against this scope
// (which has the manifest + service worker), so the install must happen
// from inside /bastard/app/.

(function () {
  var isStandalone = (typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;

  var host = window.location.hostname;
  var isLocalDev = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

  // Installed-PWA / dev path: app mounts via main.tsx, no overlay.
  if (isStandalone || isLocalDev) {
    return;
  }

  // Browser-tab path: show the overlay.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    try { localStorage.removeItem('ub-pwa-installed'); } catch (_) {}
  });

  document.documentElement.classList.add('ub-show-install-overlay');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
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
      { icon: SVG.dots,  html: 'Tocca il pulsante <strong>menu</strong> (tre puntini) in alto a destra in Chrome, poi scegli <strong>&ldquo;Aggiungi alla schermata home&rdquo;</strong>.' },
      { icon: SVG.check, html: 'Tocca <strong>Installa</strong>. L\u2019app comparir\u00e0 sulla schermata Home.' }
    ];

    var STEPS_IOS = [
      { icon: SVG.share, html: 'Tocca il pulsante <strong>Condividi</strong> in basso in Safari (la casella con la freccia in su), poi scorri e tocca <strong>&ldquo;Aggiungi a Home&rdquo;</strong> <em>(se non la vedi, tocca prima &ldquo;Altro&rdquo; o &ldquo;Modifica azioni&rdquo; \u2014 il nome cambia a seconda della versione di iOS)</em>.' },
      { icon: SVG.check, html: 'Tocca <strong>Aggiungi</strong> in alto a destra. L\u2019app comparir\u00e0 sulla schermata Home.' }
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
        ? 'Assicurati di usare <strong>Safari</strong>. \u201CAggiungi a Home\u201D non \u00e8 disponibile in Chrome o Firefox su iPhone.'
        : 'Una volta installata, chiudi questa scheda e apri l\u2019app dalla schermata Home.';
    }

    window.addEventListener('appinstalled', function () {
      try { localStorage.setItem('ub-pwa-installed', '1'); } catch (_) {}
      showThanks();
    });

    function showThanks() {
      if (titleEl) titleEl.textContent = 'Grazie per aver installato.';
      if (subEl) {
        subEl.textContent = 'Adesso apri l\u2019app dalla schermata Home.';
      }
      stepsBox.innerHTML =
        '<div class="ub-step">'
        + '<div class="ub-step-num">' + SVG.home + '</div>'
        + '<div class="ub-step-body">Chiudi questa scheda. Tocca l\u2019icona <strong>Ungrateful Bastard</strong> sulla schermata Home per cominciare.</div>'
        + '</div>';
      if (footEl) footEl.innerHTML = '';
    }
  }
})();
