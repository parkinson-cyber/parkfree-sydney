#!/usr/bin/env python3
"""
Generate every icon and iOS launch image from one definition.

The old icon was a dark tile with a green P, left over from the pre-MUJI
palette — on a home screen next to the paper-coloured app it read as a
different product. This draws the same unbleached paper ground (#F2EFE7) the
app uses, with the sage mark, so the icon, the launch screen and the first
frame of the app are the same colour.

Design notes:
  - No transparency anywhere. App Store Connect rejects an icon with an alpha
    channel, and iOS composites home-screen icons on white, which would put a
    white fringe around a transparent one.
  - Nothing important outside the middle ~80%. Android and iOS both mask icons
    (circle, squircle), and a maskable icon loses its corners.
  - The kerb bar under the P is the same shape the app uses in its legend for
    "free", so the icon says what the app says.

Run:  python3 scripts/make-app-icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

PAPER = (242, 239, 231)
SAGE = (110, 139, 91)
CHARCOAL = (46, 43, 38)

FONT_CANDIDATES = [
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Avenir Next.ttc",
]


def font(px, index=1):
    """Bold face at the given pixel size; index 1 is Bold in these .ttc files."""
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, px, index=index)
            except Exception:
                try:
                    return ImageFont.truetype(path, px)
                except Exception:
                    continue
    return ImageFont.load_default()


def icon(size: int) -> Image.Image:
    """Square app icon: paper ground, sage P, kerb bar beneath."""
    img = Image.new("RGB", (size, size), PAPER)
    d = ImageDraw.Draw(img)

    # "P" — optically centred, sitting slightly high to leave room for the bar.
    f = font(int(size * 0.62))
    text = "P"
    box = d.textbbox((0, 0), text, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], size * 0.44 - h / 2 - box[1]), text, font=f, fill=SAGE)

    # Kerb bar: the same swatch the app's legend uses for "free".
    bar_w, bar_h = size * 0.40, max(2, size * 0.055)
    x0 = (size - bar_w) / 2
    y0 = size * 0.735
    d.rounded_rectangle([x0, y0, x0 + bar_w, y0 + bar_h], radius=bar_h / 2, fill=SAGE)
    return img


def launch(w: int, h: int) -> Image.Image:
    """iOS launch image: paper ground + wordmark, matching App.tsx's boot screen."""
    img = Image.new("RGB", (w, h), PAPER)
    d = ImageDraw.Draw(img)
    scale = min(w, h)
    f = font(int(scale * 0.115))
    park, free = "Park", "Free"
    pw = d.textbbox((0, 0), park, font=f)[2]
    fw = d.textbbox((0, 0), free, font=f)[2]
    total = pw + fw
    x = (w - total) / 2
    y = h / 2 - scale * 0.075
    d.text((x, y), park, font=f, fill=CHARCOAL)
    d.text((x + pw, y), free, font=f, fill=SAGE)
    return img


def save(img: Image.Image, *parts: str) -> None:
    path = os.path.join(REPO, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    print(f"  {os.path.relpath(path, REPO):46} {img.size[0]}x{img.size[1]}")


print("icons:")
save(icon(1024), "assets", "icon.png")                  # native app icon
save(icon(1024), "assets", "splash-icon.png")           # expo splash mark
save(icon(1024), "assets", "android-icon-foreground.png")
save(icon(48), "assets", "favicon.png")
save(icon(192), "public", "icon-192.png")               # PWA manifest
save(icon(512), "public", "icon-512.png")
save(icon(180), "public", "apple-touch-icon.png")       # iOS home screen
save(icon(32), "public", "favicon.png")

# Portrait launch images for the iPhones people actually carry. iOS only uses
# one whose media query matches exactly, so a missing size means a white flash.
DEVICES = [
    (1320, 2868),  # 16 Pro Max
    (1206, 2622),  # 16 Pro
    (1290, 2796),  # 15/14 Pro Max, 15 Plus
    (1179, 2556),  # 15/14 Pro, 15
    (1170, 2532),  # 14, 13, 12
    (1125, 2436),  # 13 mini, X, XS, 11 Pro
    (1242, 2688),  # XS Max, 11 Pro Max
    (828, 1792),   # XR, 11
    (750, 1334),   # SE 2/3, 8
]
print("launch images:")
for w, h in DEVICES:
    save(launch(w, h), "public", "launch", f"launch-{w}x{h}.png")

print("\nNote: index.html needs a <link rel='apple-touch-startup-image'> per size;")
print("scripts/make-app-icons.py and public/index.html must be kept in step.")
