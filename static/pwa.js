// =============================================
//  SPENDLY PWA CLIENT SCRIPT  –  v5
//  Install prompt + offline detection + sync
// =============================================

// ───────────────────────────────────────────
//  Service Worker Registration
// ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[Spendly] SW registered, scope:', reg.scope);
        // Ask SW for current queue count on load
        if (reg.active) reg.active.postMessage('GET_QUEUE_COUNT');
      })
      .catch(err => console.warn('[Spendly] SW registration failed:', err));
  });

  // Listen for messages FROM service worker
  navigator.serviceWorker.addEventListener('message', event => {
    const msg = event.data;
    if (!msg) return;

    if (msg.type === 'QUEUED') {
      updateSyncBadge(msg.count);
      showNetworkBanner('offline');
    }
    if (msg.type === 'SYNC_DONE') {
      updateSyncBadge(0);
      if (msg.synced > 0) {
        showToastGlobal(`✅ Synced ${msg.synced} pending transaction${msg.synced > 1 ? 's' : ''}!`, 'success');
        setTimeout(() => location.reload(), 1500);
      }
      if (msg.failed > 0) {
        showToastGlobal(`⚠️ ${msg.failed} transactions failed to sync.`, 'warning');
      }
    }
    if (msg.type === 'QUEUE_COUNT') {
      updateSyncBadge(msg.count);
    }
  });
}

// ───────────────────────────────────────────
//  Network-status banner
// ───────────────────────────────────────────
let networkBanner = null;

function createNetworkBanner() {
  if (networkBanner) return;

  networkBanner = document.createElement('div');
  networkBanner.id = 'network-banner';
  networkBanner.setAttribute('aria-live', 'polite');
  document.body.appendChild(networkBanner);
}

function showNetworkBanner(state) {
  createNetworkBanner();
  networkBanner.className = `network-banner network-banner--${state}`;

  if (state === 'offline') {
    networkBanner.innerHTML = `
      <i class="fas fa-wifi-slash"></i>
      <span>You're offline — expenses are saved locally</span>
      <div id="sync-badge-container" style="display:none;">
        <button id="sync-now-btn" onclick="triggerSyncNow()" aria-label="Sync pending transactions">
          <i class="fas fa-sync-alt"></i> Sync Now <span id="sync-count-badge">0</span>
        </button>
      </div>
    `;
  } else {
    networkBanner.innerHTML = `
      <i class="fas fa-wifi"></i>
      <span>Back online!</span>
    `;
    setTimeout(() => {
      if (networkBanner) networkBanner.classList.add('network-banner--hide');
    }, 3000);
  }

  networkBanner.classList.remove('network-banner--hide');
}

function updateSyncBadge(count) {
  const badge = document.getElementById('sync-count-badge');
  const container = document.getElementById('sync-badge-container');
  if (badge) badge.textContent = count;
  if (container) container.style.display = count > 0 ? 'flex' : 'none';

  // Also update the floating sync button
  const floatBtn = document.getElementById('spendly-sync-float');
  if (floatBtn) {
    floatBtn.style.display = count > 0 ? 'flex' : 'none';
    const floatBadge = floatBtn.querySelector('.sync-float-badge');
    if (floatBadge) floatBadge.textContent = count;
  }
}

window.triggerSyncNow = async function () {
  const btn = document.getElementById('sync-now-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Syncing…`;
  }

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready;
    if (reg.sync) {
      await reg.sync.register('spendly-sync');
    } else if (reg.active) {
      reg.active.postMessage('SYNC_NOW');
    }
  }

  // Re-enable after 5s in case of slow connection
  setTimeout(() => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-sync-alt"></i> Sync Now`;
    }
  }, 5000);
};

// ───────────────────────────────────────────
//  Online / Offline events
// ───────────────────────────────────────────
function handleOnline() {
  showNetworkBanner('online');
  showToastGlobal('🌐 Connected! Syncing pending data…', 'info');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      if (reg.sync) {
        reg.sync.register('spendly-sync');
      } else if (reg.active) {
        reg.active.postMessage('SYNC_NOW');
      }
    });
  }
}

function handleOffline() {
  showNetworkBanner('offline');
  showToastGlobal('📡 Gone offline — don\'t worry, we\'ll save your data locally.', 'warning');
}

window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);

// Check initial state
window.addEventListener('DOMContentLoaded', () => {
  if (!navigator.onLine) {
    showNetworkBanner('offline');
  }

  // Ask SW for current pending count
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) reg.active.postMessage('GET_QUEUE_COUNT');
    });
  }

  // Check URL for offline alert flag
  const params = new URLSearchParams(location.search);
  if (params.has('offline')) {
    const rawMsg = params.get('msg') || 'Saved offline';
    showToastGlobal(`📦 ${decodeURIComponent(rawMsg)} — will sync when online.`, 'warning');
  }
});

// ───────────────────────────────────────────
//  Floating Sync Button (shown when offline
//  items are pending and user is back online)
// ───────────────────────────────────────────
function createFloatingSyncButton() {
  const btn = document.createElement('button');
  btn.id = 'spendly-sync-float';
  btn.style.display = 'none';
  btn.innerHTML = `
    <i class="fas fa-sync-alt"></i>
    <span>Sync</span>
    <span class="sync-float-badge">0</span>
  `;
  btn.onclick = () => triggerSyncNow();
  document.body.appendChild(btn);
}

document.addEventListener('DOMContentLoaded', createFloatingSyncButton);

// ───────────────────────────────────────────
//  Global toast (works before DOMContentLoaded
//  since dashboard.html may define showToast)
// ───────────────────────────────────────────
window.showToastGlobal = function (msg, type = 'info') {
  // Use page-level showToast if available, else create simple fallback
  if (typeof showToast === 'function') {
    showToast(msg, type);
    return;
  }
  // Create minimal container if none exists
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const ICONS = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info:    'fa-circle-info',
  };
  const TITLES = { success: 'Success', error: 'Error', warning: 'Offline', info: 'Info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon"><i class="fas ${ICONS[type] || 'fa-circle-info'}"></i></div>
    <div class="toast-body">
      <div class="toast-title">${TITLES[type] || 'Notice'}</div>
      <div class="toast-msg">${msg}</div>
    </div>
    <button class="toast-dismiss" onclick="this.closest('.toast').remove()">✕</button>
    <div class="toast-progress"></div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 400);
  }, 4500);
};

// ───────────────────────────────────────────
//  PWA Install Prompt
// ───────────────────────────────────────────
let deferredPrompt = null;

// Floating install button (shown when dismissed)
const floatingInstallBtn = document.createElement('button');
floatingInstallBtn.id = 'pwa-install-float';
floatingInstallBtn.style.display = 'none';
floatingInstallBtn.innerHTML = `<i class="fas fa-download"></i>`;
floatingInstallBtn.title = 'Install Spendly';
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(floatingInstallBtn));

floatingInstallBtn.addEventListener('mouseover', () => {
  floatingInstallBtn.style.background = 'var(--primary, #6366f1)';
  floatingInstallBtn.style.color = 'white';
});
floatingInstallBtn.addEventListener('mouseout', () => {
  floatingInstallBtn.style.background = 'rgba(99, 102, 241, 0.2)';
  floatingInstallBtn.style.color = 'var(--primary, #6366f1)';
});

// Install banner (shown on first visit)
const installBanner = document.createElement('div');
installBanner.id = 'pwa-install-banner';
installBanner.style.display = 'none';
installBanner.innerHTML = `
  <div class="install-banner-icon">
    <i class="fas fa-mobile-alt"></i>
  </div>
  <div class="install-banner-text">
    <strong>Install Spendly</strong>
    <span>Add to home screen for a native app experience</span>
  </div>
  <div class="install-banner-actions">
    <button id="pwa-dismiss-btn">Later</button>
    <button id="pwa-install-btn"><i class="fas fa-download"></i> Install</button>
  </div>
`;

async function triggerInstall() {
  if (!deferredPrompt) return;
  installBanner.classList.add('install-banner--hide');
  floatingInstallBtn.style.display = 'none';
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (outcome === 'accepted') {
    showToastGlobal('🎉 Spendly installed! Find it on your home screen.', 'success');
  }
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;

  const path = location.pathname;
  if (path === '/' || path === '/login' || path === '/signup') return;

  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(installBanner);

    if (localStorage.getItem('pwa-dismissed') === 'true') {
      floatingInstallBtn.style.display = 'flex';
    } else {
      installBanner.style.display = 'flex';
      installBanner.style.animation = 'slideUpIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';

      document.getElementById('pwa-install-btn').addEventListener('click', triggerInstall);
      document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
        installBanner.classList.add('install-banner--hide');
        setTimeout(() => {
          installBanner.style.display = 'none';
          floatingInstallBtn.style.display = 'flex';
          floatingInstallBtn.animate(
            [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1)' }],
            { duration: 400, fill: 'forwards', easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' }
          );
          localStorage.setItem('pwa-dismissed', 'true');
        }, 400);
      });
    }
  });
});

floatingInstallBtn.addEventListener('click', triggerInstall);

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  floatingInstallBtn.style.display = 'none';
  installBanner.style.display = 'none';
  showToastGlobal('🎉 Spendly is installed!', 'success');
});
