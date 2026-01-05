/* =====================================================
   AD NETWORK CONFIGURATION
   Centralized place to manage ad unit IDs
===================================================== */

const AD_CONFIG = {
  // TEST IDs (provided by Google)
  // Use these for development and testing
  TEST: {
    APP_ID: "ca-app-pub-3940256099942544~3347511713",
    BANNER_SLOT: "6300978111",
    INTERSTITIAL_SLOT: "1033173712",
    REWARDED_SLOT: "6978759866"
  },
  
  // YOUR PRODUCTION IDs (update these when you create your AdMob account)
  // Step 1: Create AdMob account at https://admob.google.com
  // Step 2: Add your app (io.github.evansmunsha.twa)
  // Step 3: Create ad units and copy the IDs here
  PRODUCTION: {
    APP_ID: "ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy", // Replace with your App ID
    BANNER_SLOT: "ca-pub-xxxxxxxxxxxxxxxxxxxxxxxx",    // Replace with your Banner Ad Unit ID
    INTERSTITIAL_SLOT: "ca-pub-xxxxxxxxxxxxxxxxxxxxxxxx", // For future use
    REWARDED_SLOT: "ca-pub-xxxxxxxxxxxxxxxxxxxxxxxx"     // For future use
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
  }
};

// Use this in your app
const CURRENT_AD_CONFIG = AD_CONFIG.getCurrent();

console.log(`📊 Ads using ${AD_CONFIG.ENVIRONMENT} configuration`, CURRENT_AD_CONFIG);
