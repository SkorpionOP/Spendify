import base64
import os

png_192 = b'iVBORw0KGgoAAAANSUhEUgAAAMAAAADAAQMAAABm4XMAAAAAA1BMVEVjZvH/j+bDAAAAH0lEQVR42u3BAQ0AAADCoPdPbQ4HFAAAAAAAAAAA+Bg5oAABZ/P3/AAAAABJRU5ErkJggg=='
png_512 = b'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIAAQMAAADOtka5AAAAA1BMVEVjZvH/j+bDAAAAH0lEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAA/Bo4IAABh7qf5QAAAABJRU5ErkJggg=='

os.makedirs('frontend/public', exist_ok=True)
with open('frontend/public/icon-192x192.png', 'wb') as f:
    f.write(base64.b64decode(png_192))
with open('frontend/public/icon-512x512.png', 'wb') as f:
    f.write(base64.b64decode(png_512))
