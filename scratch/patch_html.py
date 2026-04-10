import os
import glob

html_files = glob.glob('templates/*.html')

inject_head = '    <link rel="manifest" href="/manifest.json">\n</head>'

inject_body = """
<script>
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
</script>
</body>
"""

for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    changed = False
    if '<link rel="manifest"' not in content:
        content = content.replace('</head>', inject_head)
        changed = True
    
    if "navigator.serviceWorker.register('/sw.js')" not in content:
        content = content.replace('</body>', inject_body)
        changed = True
        
    if changed:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
print("PWA injected successfully into all templates.")
