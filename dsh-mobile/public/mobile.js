/* DSH Mobile page hook: marks the document for mobile shell CSS, registers the
   PWA service worker on secure origins, and exposes a tiny connection badge
   only while the phone is offline. It never touches DSH React state. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.setAttribute('data-dsh-mobile', '');
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    root.setAttribute('data-dsh-mobile-standalone', '');
  }
  if (navigator.standalone === true) root.setAttribute('data-dsh-mobile-standalone', '');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/dsh-mobile/sw.js', { scope: '/' }).catch(function () {
        /* HTTP LAN origins are not secure contexts; installability degrades but DSH still works. */
      });
    });
  }

  var badge;
  function showBadge(text) {
    if (!badge) {
      badge = document.createElement('div');
      badge.setAttribute('role', 'status');
      badge.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:calc(14px + env(safe-area-inset-bottom,0px))',
        'transform:translateX(-50%)', 'z-index:2147483000', 'pointer-events:none',
        'padding:7px 13px', 'border-radius:999px', 'font:600 12px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
        'background:rgba(15,23,42,.94)', 'color:#e6eeff', 'border:1px solid rgba(148,163,184,.35)',
        'box-shadow:0 8px 28px rgba(0,0,0,.4)', 'transition:opacity .2s ease', 'opacity:1',
      ].join(';');
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.opacity = '1';
  }
  function hideBadge() {
    if (!badge) return;
    badge.style.opacity = '0';
  }
  window.addEventListener('offline', function () { showBadge('网络已断开，等待重新连接…'); });
  window.addEventListener('online', function () { showBadge('网络已恢复'); setTimeout(hideBadge, 1600); });
  if (navigator.onLine === false) showBadge('网络已断开，等待重新连接…');
})();
