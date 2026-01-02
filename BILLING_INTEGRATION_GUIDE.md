# 🛒 Google Play Billing Integration Guide

## Quick Summary

Your web app is now ready to receive purchase notifications from the Android native app. This guide shows you how to implement the Android side to make payments work.

---

## ✅ **What I Fixed in Your Web App**

I added code to `js/app.js` that:
1. **Listens for purchase messages** from the Android app
2. **Automatically sets premium status** when a purchase is confirmed
3. **Hides ads and updates UI** when premium is activated
4. **Includes a dev/test mode** so you can test without real purchases

---

## 🧪 **Testing Before Android Implementation**

### Option A: Test Premium Locally (Quick)
```
http://localhost:8000/?dev_premium=1
```
This will:
- Activate premium mode
- Remove watermark from PDFs
- Hide ads
- Let you test premium features

### Option B: Simulate a Purchase Message (Advanced)
Open browser DevTools console and run:
```javascript
window.postMessage({
  type: 'PURCHASE_COMPLETE',
  productId: 'premium_unlock'
}, '*');
```
The app will respond as if the purchase succeeded!

---

## 📱 **Android Implementation (What You Need to Do)**

Your Android app must:
1. Implement Google Play Billing Library
2. After a successful purchase, **notify the web app** by sending a message

### Step 1: Add Google Play Billing to Your Android Project

In `build.gradle` (Module: app):
```gradle
dependencies {
    implementation "com.android.billingclient:billing:6.0.1"
}
```

### Step 2: Implement BillingClient in Your Activity/Fragment

```kotlin
import com.android.billingclient.api.*

class MainActivity : AppCompatActivity() {
    
    private lateinit var billingClient: BillingClient
    private val webView: WebView? = findViewById(R.id.webview) // or your WebView reference
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize Billing Client
        billingClient = BillingClient.newBuilder(this)
            .setListener { billingResult, purchases ->
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
                    for (purchase in purchases) {
                        handlePurchase(purchase)
                    }
                }
            }
            .enablePendingPurchases()
            .build()
        
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    queryPremiumPurchases()
                }
            }
            
            override fun onBillingServiceDisconnected() {
                // Try to reconnect
            }
        })
    }
    
    private fun queryPremiumPurchases() {
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        ) { billingResult, purchases ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                for (purchase in purchases) {
                    if (purchase.products.contains("premium_unlock")) {
                        handlePurchase(purchase)
                    }
                }
            }
        }
    }
    
    private fun launchPremiumPurchaseFlow() {
        val productDetails = billingClient.queryProductDetails(
            QueryProductDetailsParams.newBuilder()
                .addProduct("premium_unlock", BillingClient.ProductType.INAPP)
                .build()
        )
        
        val productDetailsParamsList = listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(productDetails)
                .build()
        )
        
        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .build()
        
        billingClient.launchBillingFlow(this, billingFlowParams)
    }
    
    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            // Purchase successful!
            if (!purchase.isAcknowledged) {
                // Acknowledge the purchase (required by Google Play)
                val acknowledgePurchaseParams = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.purchaseToken)
                    .build()
                billingClient.acknowledgePurchase(acknowledgePurchaseParams) { }
            }
            
            // 🔑 IMPORTANT: Notify the web app about the purchase
            notifyWebAppOfPurchase(purchase)
        }
    }
    
    private fun notifyWebAppOfPurchase(purchase: Purchase) {
        val productId = purchase.products.firstOrNull() ?: return
        
        val message = """
        {
            "type": "PURCHASE_COMPLETE",
            "productId": "$productId",
            "purchaseToken": "${purchase.purchaseToken}",
            "timestamp": ${purchase.purchaseTime}
        }
        """.trimIndent()
        
        // Method 1: Using WebView (if you're using a regular WebView)
        webView?.evaluateJavascript(
            "window.postMessage($message, '*');"
        ) { }
        
        // Method 2: If using Trusted Web Activity (TWA)
        // The TWA will handle this automatically if properly configured
    }
}
```

### Step 3: Connect the Purchase Button in Your Web App

In `index.html`, find the premium purchase button and make sure it's setup correctly:

```html
<!-- This button already exists in your HTML -->
<button id="purchasePremium" class="primary premium-btn">
    🚀 Upgrade Now - $4.99
</button>
```

In `js/app.js`, make sure this calls the Android function:

```javascript
// Find and update this in app.js (around line 2900+)
document.getElementById("purchasePremium")?.addEventListener("click", () => {
    if (isAndroidPWA()) {
        // Call the native Android function
        // This depends on your Android wrapper implementation
        // Either:
        
        // Option 1: If using WebViewBridge
        if (window.AndroidBridge && window.AndroidBridge.launchPremiumPurchase) {
            window.AndroidBridge.launchPremiumPurchase();
        }
        
        // Option 2: If using TWA with Digital Goods API
        else if (typeof window.getDigitalGoodsService === 'function') {
            launchDigitalGoodsPurchase();
        }
    } else {
        showToast("Not Available", "Premium purchases only available in the app", "warning");
    }
});

async function launchDigitalGoodsPurchase() {
    try {
        const service = await window.getDigitalGoodsService();
        const details = await service.getDetails(['premium_unlock']);
        
        if (details.length === 0) {
            showToast("Error", "Premium product not found", "error");
            return;
        }
        
        const result = await service.acknowledge(
            'premium_unlock',
            details[0].token
        );
        
        showToast("Success", "Premium activated!", "success");
    } catch (error) {
        console.error("Purchase failed:", error);
        showToast("Error", "Purchase failed: " + error.message, "error");
    }
}
```

---

## 🔧 **Configuration Checklist**

### Google Play Console Setup:
- [ ] Created in-app product with ID: `premium_unlock`
- [ ] Set price: $4.99 USD
- [ ] Product is set to "Managed" (one-time purchase, not subscription)
- [ ] Status: Active

### Your Android App:
- [ ] Google Play Billing Library added to `build.gradle`
- [ ] BillingClient implemented in your Activity
- [ ] Product ID in code matches Play Console: `premium_unlock`
- [ ] After purchase, code calls `notifyWebAppOfPurchase()`

### Your Web App:
- [ ] `js/app.js` has the purchase listener (✅ I added this)
- [ ] Test mode works: `?dev_premium=1` parameter
- [ ] Premium modal button connected to Android billing flow

---

## 🐛 **Debugging**

### Test the Web App First
Open `http://localhost:8000/?dev_premium=1` and verify:
- [ ] Watermark disappears from PDF
- [ ] "Remove Ads" button is gone
- [ ] Usage stats are hidden
- [ ] Premium modal shows "Already Premium"

### Test the Purchase Message (Browser Console)
```javascript
// Simulate what the Android app will send
window.postMessage({
  type: 'PURCHASE_COMPLETE',
  productId: 'premium_unlock'
}, '*');

// Check if premium was set
console.log(isPremiumUser); // Should be true
console.log(localStorage.getItem('premiumUser')); // Should be "true"
```

### In the Android App (Logcat)
```kotlin
Log.d("Billing", "Purchase verified: $purchase")
Log.d("Billing", "Sending message to WebView")
```

---

## 📞 **Support & Troubleshooting**

### Problem: Purchase button doesn't do anything
- [ ] Check if `isAndroidPWA()` returns true
- [ ] Verify BillingClient is initialized in Android
- [ ] Check Logcat for errors

### Problem: Purchase completes but premium doesn't activate
- [ ] Verify `postMessage` is being called with exact format:
  ```json
  {"type":"PURCHASE_COMPLETE","productId":"premium_unlock"}
  ```
- [ ] Check browser console for errors
- [ ] Make sure `window.postMessage` call is in Android WebView code

### Problem: Product ID doesn't match
- [ ] In Play Console, copy exact product ID
- [ ] In Android code, use same ID in `BillingClient.queryProductDetails()`
- [ ] In web message, use same ID in `productId` field

---

## 🎯 **Next Steps**

1. **Build your Android app** with BillingClient implementation
2. **Test on a real device** (emulator doesn't support Play Billing well)
3. **Create a test account** in Play Console → Settings → License Testing
4. **Upload APK to internal testing track**
5. **Test with a test user account**
6. **When ready, submit for review on Play Store**

---

## 📚 **Reference Links**

- Google Play Billing Documentation: https://developer.android.com/google/play/billing
- PWABuilder Documentation: https://docs.pwabuilder.com/
- WebView Post Message: https://developer.android.com/reference/android/webkit/WebView#postWebMessage(android.webkit.WebMessage, android.net.Uri)
- Trusted Web Activity Setup: https://developers.google.com/web/android/trusted-web-activity

---

**Last Updated:** January 2, 2026  
**Status:** Ready for Android implementation
