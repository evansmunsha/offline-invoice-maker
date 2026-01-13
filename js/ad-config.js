//ad-config.js

/* =====================================================
   AD NETWORK CONFIGURATION
   Centralized place to manage ad unit IDs

   SETUP INSTRUCTIONS:
   1. Create AdMob account at https://admob.google.com
   2. Add your app (io.github.evansmunsha.twa)
   3. Create a Banner ad unit
   4. Copy your IDs to the PRODUCTION section below
   5. Change ENVIRONMENT to "PRODUCTION"
===================================================== */

const AD_CONFIG = {
  // TEST IDs (provided by Google)
  // Use these for development and testing - they always work
  TEST: {
    APP_ID: "ca-app-pub-3940256099942544~3419835294",
    BANNER_SLOT: "ca-app-pub-3940256099942544/6300978111",
    INTERSTITIAL_SLOT: "ca-app-pub-3940256099942544/1033173712",
    REWARDED_SLOT: "ca-app-pub-3940256099942544/5224354917",
  },

  // YOUR PRODUCTION IDs
  // ✅ Updated with real AdMob IDs
  PRODUCTION: {
    // Your AdMob App ID
    APP_ID: "ca-app-pub-3267288412255550~6408450423",

    // Your Banner Ad Unit ID ✅
    BANNER_SLOT: "ca-app-pub-3267288412255550/3990665481",

    // Interstitial Ad Unit ID (optional - for future use)
    INTERSTITIAL_SLOT: "ca-app-pub-3267288412255550/XXXXXXXXXX",

    // Rewarded Ad Unit ID (optional - for future use)
    REWARDED_SLOT: "ca-app-pub-3267288412255550/XXXXXXXXXX",
  },

  // ✅ PRODUCTION MODE ENABLED
  ENVIRONMENT: "PRODUCTION",

  // Get current configuration based on environment
  getCurrent() {
    return this[this.ENVIRONMENT];
  },

  // Get specific ad unit
  getBannerSlot() {
    return this.getCurrent().BANNER_SLOT;
  },

  getInterstitialSlot() {
    return this.getCurrent().INTERSTITIAL_SLOT;
  },

  getRewardedSlot() {
    return this.getCurrent().REWARDED_SLOT;
  },

  getAppId() {
    return this.getCurrent().APP_ID;
  },

  // Switch environment (useful for testing)
  setEnvironment(env) {
    if (this[env]) {
      this.ENVIRONMENT = env;
      console.log(`📱 Ad environment switched to: ${env}`);
      return true;
    }
    console.error(`❌ Invalid environment: ${env}`);
    return false;
  },

  // Check if using test ads
  isTestMode() {
    return this.ENVIRONMENT === "TEST";
  },

  // Log current configuration (for debugging)
  logConfig() {
    console.log("=== AD CONFIGURATION ===");
    console.log(`Environment: ${this.ENVIRONMENT}`);
    console.log(`App ID: ${this.getAppId()}`);
    console.log(`Banner Slot: ${this.getBannerSlot()}`);
    console.log(`Test Mode: ${this.isTestMode() ? "YES" : "NO"}`);
    console.log("========================");
  },
};

// Current configuration for easy access
const CURRENT_AD_CONFIG = AD_CONFIG.getCurrent();

// Log configuration on load (helpful for debugging)
console.log(`📊 Ads using ${AD_CONFIG.ENVIRONMENT} configuration`);
if (AD_CONFIG.isTestMode()) {
  console.log("💡 Using TEST ads. Switch to PRODUCTION when app is live.");
}

/* =====================================================
   HOW TO GET YOUR PRODUCTION IDS:

   1. Go to https://admob.google.com
   2. Sign in with your Google account
   3. Click "Apps" → "Add App"
   4. Search for "io.github.evansmunsha.twa" or add manually
   5. Once added, click on your app
   6. Go to "Ad units" → "Add ad unit" → "Banner"
   7. Name it "Invoice Maker Banner"
   8. Copy the Ad unit ID (ca-app-pub-XXXX/XXXX)
   9. Paste it in PRODUCTION.BANNER_SLOT above
   10. Change ENVIRONMENT to "PRODUCTION"
   11. Deploy your updated code

   REVENUE INFO:
   - Google takes 30%, you get 70%
   - Payments are monthly via AdMob
   - Minimum payout threshold: $100

   AD TYPES:
   - Banner: Shows at bottom/top, least intrusive
   - Interstitial: Full screen, shows between actions
   - Rewarded: User watches for reward (not recommended for invoice app)
===================================================== */
