# Ad Network Setup Guide

## Current Status
✅ **Test Ads Integrated** - Using Google's test ad unit IDs

The app is configured with **TEST ad unit IDs** provided by Google. These show test banners and allow you to:
- Test ad functionality locally
- Test on Play Store internal testing
- See how ads render in the app
- Verify performance

## Test Ad Unit IDs (Currently Active)
- **App ID:** `ca-app-pub-3940256099942544~3347511713`
- **Banner Slot:** `6300978111`

These are Google's official test IDs - they will always work.

---

## When App is Published on Play Store

### Step 1: Create AdMob Account
1. Go to https://admob.google.com
2. Sign in with your Google account
3. Click **Apps** → **Add app**
4. Select **Android**
5. Enter your app details:
   - **App name:** Offline Invoice Maker
   - **App store:** Google Play
   - **App package:** `io.github.evansmunsha.twa`

### Step 2: Create Ad Units
1. Click **Ad units** under your app
2. Click **Create ad unit**
3. **Ad format:** Banner
4. **Ad unit name:** Invoice Maker Banner
5. Google will generate your IDs (starts with `ca-pub-`)

### Step 3: Update Configuration
Once you have your production IDs:

**File:** `js/ad-config.js`

```javascript
PRODUCTION: {
  APP_ID: "ca-app-pub-YOUR-ID~HERE", // Your App ID
  BANNER_SLOT: "ca-pub-YOUR-BANNER-SLOT-ID", // Your Banner Ad Unit ID
  // ... other slots
}
```

Then change the environment:
```javascript
ENVIRONMENT: "PRODUCTION"  // Switch from "TEST"
```

### Step 4: Update HTML
**File:** `index.html`

Find the Google Mobile Ads script line and update the client ID:
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-app-pub-YOUR-APPID"
        crossorigin="anonymous"></script>
```

Also update the ad unit:
```html
<ins class="adsbygoogle"
     data-ad-client="ca-app-pub-YOUR-ID"
     data-ad-slot="YOUR-BANNER-SLOT-ID"
     ...></ins>
```

---

## Important Notes

### ⚠️ Current Limitations
- ❌ Cannot link internal testing app to AdMob (must be public)
- ✅ Test ads work in all environments (local, internal testing, production)
- ✅ Can test revenue potential with test ads

### ✅ Best Practices
- **Development:** Keep using TEST IDs (they always work)
- **Testing:** Test app behavior with test ads
- **Production:** Switch to PRODUCTION IDs after app is public

### 📊 Ad Format
- **Type:** Responsive Banner Ads (320x50, 300x250, 320x100)
- **Location:** Above invoice history section
- **Fallback:** Demo ad appears if Google ads unavailable

---

## Troubleshooting

### Ads Not Showing?
1. Check browser console for errors
2. Verify ad unit IDs are correct
3. Make sure AdMob account is verified (24-48 hours)
4. Check if app is linked in AdMob dashboard

### Demo Ad Appears Instead?
This is normal behavior - it means:
- Google Mobile Ads SDK didn't load (maybe no network)
- AdMob hasn't approved the ad unit yet
- You're testing locally (test ads don't always display in development)

The fallback ensures the ad space is always filled.

---

## Code Structure

**Ad Configuration:** `js/ad-config.js`
- Centralized ad unit IDs
- Easy switching between TEST and PRODUCTION
- Comments for setup instructions

**Ad Loading:** `js/app.js` → `loadAdNetwork()`
- Initializes Google AdSense SDK
- Handles errors gracefully
- Falls back to demo ad if needed

**HTML Ads:** `index.html`
- Google Mobile Ads script tag
- AdSense ad placeholder
- Responsive banner format

---

## Questions?
Refer to Google AdMob documentation: https://support.google.com/admob
