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
      showToastGlobal(`📦 Transaction saved offline (${msg.count} pending)`, 'warning');
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
  // Silent banner – only show if queue is > 0
  if (state === 'offline') {
    // Only show if we actually have something pending, otherwise be silent
    // We'll rely on updateSyncBadge to show the floating btn
  } else {
    // Back online
    if (networkBanner && !networkBanner.classList.contains('network-banner--hide')) {
      networkBanner.className = `network-banner network-banner--online`;
      networkBanner.innerHTML = `<i class="fas fa-wifi"></i> <span>Reconnected</span>`;
      setTimeout(() => networkBanner.classList.add('network-banner--hide'), 2000);
    }
  }
}

function updateSyncBadge(count) {
  createFloatingSyncButton(); // Ensure it exists
  const floatBtn = document.getElementById('spendly-sync-float');
  if (floatBtn) {
    floatBtn.style.display = count > 0 ? 'flex' : 'none';
    const floatBadge = floatBtn.querySelector('.sync-float-badge');
    if (floatBadge) floatBadge.textContent = count;
  }

  // Backup: Update banner badge if it exists
  const badge = document.getElementById('sync-count-badge');
  if (badge) badge.textContent = count;
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
  // Silent – no toast
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
  if (document.getElementById('spendly-sync-float')) return;
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
//  PWA Install Prompt (Header Integrated)
// ───────────────────────────────────────────
let deferredPrompt = null;

// The Banner Prompt (Full State)
const headerPrompt = document.createElement('div');
headerPrompt.className = 'pwa-bottom-banner';
headerPrompt.style.display = 'none';
headerPrompt.innerHTML = `
    <div style="display:flex; align-items:center; gap: 1rem; flex:1;">
        <div style="background:var(--primary); width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.2rem;">
            <i class="fas fa-download"></i>
        </div>
        <div>
            <strong style="display:block; color:#fff; margin-bottom:0.2rem;">Install Spendly</strong>
            <span style="font-size:0.8rem; color:var(--text-tertiary);">Add to home screen for offline access</span>
        </div>
    </div>
    <div class="actions" style="display:flex; gap:0.5rem;">
        <button class="pwa-btn-dismiss">Later</button>
        <button class="pwa-btn-install">Install</button>
    </div>
`;

// The Floating Button (Dismissed State)
const miniBtn = document.createElement('button');
miniBtn.className = 'pwa-floating-btn';
miniBtn.style.display = 'none';
miniBtn.innerHTML = `<i class="fas fa-download"></i>`;
miniBtn.title = 'Install Spendly';

window.triggerInstall = async function() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome === 'accepted') {
            headerPrompt.remove();
            miniBtn.remove();
            showToastGlobal('🎉 Welcome to Spendly App!', 'success');
        }
    } else {
        // Fallback for iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            showToastGlobal('Tap the Share icon (⎙) at the bottom, then select "Add to Home Screen" 📱', 'info');
        }
    }
};

function mountHeaderUI() {
    const path = location.pathname;
    if (path === '/' || path === '/login' || path === '/signup') return;

    if (!document.body.contains(headerPrompt)) document.body.appendChild(headerPrompt);
    if (!document.body.contains(miniBtn)) document.body.appendChild(miniBtn);

    const pwaDismissed = localStorage.getItem('pwa-banner-dismissed') === 'true';

    if (pwaDismissed) {
        headerPrompt.style.display = 'none';
        miniBtn.style.display = 'flex';
    } else {
        headerPrompt.style.display = 'flex';
        miniBtn.style.display = 'none';
    }

    headerPrompt.querySelector('.pwa-btn-install').onclick = triggerInstall;
    headerPrompt.querySelector('.pwa-btn-dismiss').onclick = () => {
        headerPrompt.classList.add('slide-out');
        setTimeout(() => {
            headerPrompt.style.display = 'none';
            miniBtn.style.display = 'flex';
            localStorage.setItem('pwa-banner-dismissed', 'true');
        }, 300);
    };
    miniBtn.onclick = triggerInstall;
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountHeaderUI);
    } else {
        mountHeaderUI();
    }
});

// Explicitly handle iOS where beforeinstallprompt doesn't fire
document.addEventListener('DOMContentLoaded', () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) {
        mountHeaderUI();
    }
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    headerPrompt.remove();
    miniBtn.remove();
});
