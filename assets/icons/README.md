# PWA Icon Generation Instructions

This folder contains the SVG template for the Invoice Maker app icon. You need to convert this to PNG format for the PWA to work properly.

## Required Icon Sizes

The `manifest.json` file expects these icon files:
- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)

## How to Convert SVG to PNG

### Option 1: Online Converter
1. Go to https://convertio.co/svg-png/ or similar online converter
2. Upload the `icon.svg` file
3. Set output size to 192x192 for the first icon
4. Download and rename to `icon-192.png`
5. Repeat for 512x512 and rename to `icon-512.png`

### Option 2: Using Inkscape (Free Software)
1. Install Inkscape from https://inkscape.org/
2. Open `icon.svg` in Inkscape
3. Go to File → Export PNG Image
4. Set width/height to 192 pixels
5. Export as `icon-192.png`
6. Repeat for 512 pixels and export as `icon-512.png`

### Option 3: Using ImageMagick (Command Line)
```bash
# Install ImageMagick first
magick icon.svg -resize 192x192 icon-192.png
magick icon.svg -resize 512x512 icon-512.png
```

### Option 4: Using Node.js (for developers)
```bash
npm install -g svg2png-cli
svg2png icon.svg --width=192 --height=192 --output=icon-192.png
svg2png icon.svg --width=512 --height=512 --output=icon-512.png
```

## After Converting

Once you have both PNG files in this directory, your PWA will be able to:
- Show proper icons when installed on mobile/desktop
- Display correctly in app stores and browsers
- Work as a standalone application

The icon design shows:
- Dark background (#222222)
- White invoice document
- Blue dollar sign indicator
- "INVOICE" text at bottom