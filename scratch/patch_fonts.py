import glob

html_files = glob.glob('templates/*.html')

old_fonts = 'href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800&display=swap"'
new_fonts = 'href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Outfit:wght@400;600;700;800&display=swap&font-display=swap"'

preconnect = '''    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    '''

for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    changed = False
    if old_fonts in content:
        content = content.replace(old_fonts, new_fonts)
        changed = True
    if 'rel="preconnect" href="https://fonts.googleapis.com"' not in content:
        content = content.replace('    <link href="https://fonts.', preconnect + '    <link href="https://fonts.')
        changed = True
    
    if changed:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)

print("Font preconnect added to all templates")
