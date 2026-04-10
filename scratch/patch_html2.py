import glob

html_files = glob.glob('templates/*.html')

old_script = """<script>
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
</script>"""

new_script = '<script src="/static/pwa.js"></script>'

for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    if old_script in content:
        content = content.replace(old_script, new_script)
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
            
print("PWA script updated")
