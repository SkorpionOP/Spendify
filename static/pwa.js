let deferredPrompt;

const floatingBtn = document.createElement('button');
floatingBtn.style.cssText = `
  display: none; position: fixed; top: 15px; right: 15px; z-index: 10000;
  background: rgba(99, 102, 241, 0.2); color: var(--primary, #6366f1); border: 1px solid rgba(99, 102, 241, 0.3);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  width: 44px; height: 44px; border-radius: 50%; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  cursor: pointer; align-items: center; justify-content: center; font-size: 1.1rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
`;
floatingBtn.innerHTML = `<i class="fas fa-download"></i>`;
floatingBtn.title = "Install Spendly";

document.body.appendChild(floatingBtn);

floatingBtn.onmouseover = () => {
    floatingBtn.style.transform = 'scale(1.1)';
    floatingBtn.style.background = 'var(--primary, #6366f1)';
    floatingBtn.style.color = 'white';
};
floatingBtn.onmouseout = () => {
    floatingBtn.style.transform = 'scale(1)';
    floatingBtn.style.background = 'rgba(99, 102, 241, 0.2)';
    floatingBtn.style.color = 'var(--primary, #6366f1)';
};

const installBanner = document.createElement('div');
installBanner.style.cssText = `
  display: none; position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
  background: var(--bg-card-elevated, #1a1a2e); border: 1px solid var(--primary, #6366f1);
  padding: 1rem 1.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
  z-index: 10000; align-items: center; gap: 1rem; width: 90%; max-width: 400px;
  color: white; font-family: inherit; justify-content: space-between;
  transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
`;
installBanner.innerHTML = `
  <div style="display:flex; flex-direction:column; gap:0.25rem;">
    <strong style="font-size:1rem;">Install Spendly</strong>
    <span style="font-size:0.8rem; color:var(--text-secondary, #aaa);">Add to home screen for native app experience</span>
  </div>
  <div style="display:flex; gap:0.5rem; align-items:center;">
    <button id="pwa-dismiss" style="background:transparent; border:none; color:var(--text-secondary, #aaa); cursor:pointer; font-size:0.85rem;">Not now</button>
    <button id="pwa-install" class="btn btn-primary" style="padding:0.5rem 1rem; font-size:0.85rem; background: var(--primary, #6366f1); color: #fff; border:none; border-radius: 8px; cursor: pointer;">Install</button>
  </div>
`;

async function triggerInstall(btnContext) {
    if (deferredPrompt) {
        if(btnContext === 'banner') installBanner.style.display = 'none';
        floatingBtn.style.display = 'none';
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
    }
}

floatingBtn.onclick = () => triggerInstall('floating');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Only prompt on post-login pages
  const path = window.location.pathname;
  if (path !== '/' && path !== '/login' && path !== '/signup') {
    if (localStorage.getItem('pwa-dismissed') === 'true') {
      floatingBtn.style.display = 'flex';
    } else {
      document.body.appendChild(installBanner);
      installBanner.style.display = 'flex';
      
      document.getElementById('pwa-install').addEventListener('click', () => triggerInstall('banner'));
      
      document.getElementById('pwa-dismiss').addEventListener('click', () => {
        // Animate towards top right
        const rect = installBanner.getBoundingClientRect();
        const sw = window.innerWidth;
        const xDist = (sw - 40) - (sw / 2); // move from center to right
        const yDist = 40 - rect.top; // move from bottom to top
        
        installBanner.style.transform = `translate(${xDist}px, ${yDist}px) scale(0.1)`;
        installBanner.style.opacity = '0';
        installBanner.style.borderRadius = '50%';
        
        setTimeout(() => {
            installBanner.style.display = 'none';
            floatingBtn.style.display = 'flex';
            // simple pop-in animation
            floatingBtn.animate([
                { opacity: 0, transform: 'scale(0.5)' },
                { opacity: 1, transform: 'scale(1)' }
            ], { duration: 400, fill: 'forwards', easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });
        }, 500);

        localStorage.setItem('pwa-dismissed', 'true');
      });
    }
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('SW registered');
    });
  });
}

window.addEventListener('online', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
            if(reg.sync) {
                reg.sync.register('spendly-sync');
            } else if (reg.active) {
                reg.active.postMessage('syncData');
            }
        });
    }
});
