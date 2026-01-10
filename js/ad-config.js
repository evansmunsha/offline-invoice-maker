//ad-config.js

/* =====================================================
   AD NETWORK CONFIGURATION
   Centralized place to manage ad unit IDs
===================================================== */

const AD_CONFIG = {
  // TEST IDs (provided by Google)
  // Use these for development and testing
  TEST: {
    APP_ID: "ca-app-pub-3940256099942544~3419835294", // Google's demo App ID for testing
    BANNER_SLOT: "ca-app-pub-3940256099942544/6300978111", // Google's demo Fixed Size Banner
    INTERSTITIAL_SLOT: "ca-app-pub-3940256099942544/1033173712", // Google's demo Interstitial
    REWARDED_SLOT: "ca-app-pub-3940256099942544/5224354917", // Google's demo Rewarded
  },

  // YOUR PRODUCTION IDs (update these when you create your AdMob account)
  // Step 1: Create AdMob account at https://admob.google.com
  // Step 2: Add your app (io.github.evansmunsha.twa)
  // Step 3: Create ad units and copy the IDs here
  PRODUCTION: {
    APP_ID: "ca-app-pub-3267288412255550~6408450423",
    BANNER_SLOT: "ca-pub-xxxxxxxxxxxxxxxxxxxxxxxx", // Replace with your Banner Ad Unit ID
    INTERSTITIAL_SLOT: "ca-pub-xxxxxxxxxxxxxxxxxxxxxxxx", // For future use
    REWARDED_SLOT: "ca-pub-xxxxxxxxxxxxxxxxxxxxxxxx", // For future use
  },

  // Current environment - switch to 'PRODUCTION' when ready
  ENVIRONMENT: "TEST",

  // Get current configuration
  getCurrent() {
    return this[this.ENVIRONMENT];
  },

  // Switch environment
  setEnvironment(env) {
    if (this[env]) {
      this.ENVIRONMENT = env;
      console.log(`📱 Ad environment switched to: ${env}`);
      return true;
    }
    return false;
  },
};

// Use this in your app
const CURRENT_AD_CONFIG = AD_CONFIG.getCurrent();

console.log(
  `📊 Ads using ${AD_CONFIG.ENVIRONMENT} configuration`,
  CURRENT_AD_CONFIG,
);
