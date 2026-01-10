/*********************************************************
 * OFFLINE INVOICE MAKER – REFACTORED PART 1
 * Sections 1-12: Core functionality
 *********************************************************/

/* =========================
   1. GLOBAL STATE & CONSTANTS
========================= */
let items = [],
  editItems = [],
  invoiceCounter = 0;
let autoSaveInterval = null,
  hasUnsavedChanges = false;
let selectedInvoices = new Set(),
  isPremiumUser = false;
let currentEditingInvoice = null,
  currentShareInvoice = null;
let digitalGoodsService = null;
let itemsDiv, totalSpan, invoiceList;

const FREE_LIMITS = { invoices_per_month: 10, pdfs_per_day: 5 };

/* =========================
   2. INITIALIZATION
========================= */
window.addEventListener("load", async () => {
  itemsDiv = document.getElementById("items");
  totalSpan = document.getElementById("total");
  invoiceList = document.getElementById("invoiceList");

  await openDB();
  await initializeInvoiceCounter();
  await initDigitalGoods();

  setSmartDefaults();
  loadHistory();
  addItemRow();

  initializeCurrency();
  initializeAutoSave();
  initializeKeyboardShortcuts();
  initializeAccessibility();
  initializeMonetization();

  setupFormValidation();
  setupSearchAndFilter();
  setupShareFunctionality();
  setupBulkActions();
  setupSelectAllFunctionality();
  setupModalHandlers();
  setupUsageStatsHandlers();
  initializeFooterHandlers();

  checkForSavedDraft();
  handleSharedInvoiceFromURL();

  if (location.search.includes("dev_premium=1")) {
    localStorage.setItem("premiumUser", "true");
    isPremiumUser = true;
  }

  updateUsageStatsDisplay();
  showWelcomeMessage();
});

async function initializeInvoiceCounter() {
  const invoices = await getInvoices();
  invoiceCounter = invoices.length;
}

function showWelcomeMessage() {
  if (!localStorage.getItem("hasSeenWelcome")) {
    setTimeout(() => {
      showToast(
        "Welcome!",
        "Fill in your details and add items to create your first invoice.",
        "success",
        6000,
      );
      localStorage.setItem("hasSeenWelcome", "true");
    }, 1000);
  }
}

/* =========================
   3. GOOGLE PLAY BILLING
========================= */
const GOOGLE_PLAY_BILLING_URL = "https://play.google.com/billing";
const PREMIUM_PRODUCT_ID = "premium_unlock";

async function initDigitalGoods() {
  if (!window.getDigitalGoodsService) {
    console.log("Digital Goods API not available (not in TWA)");
    return;
  }
  try {
    digitalGoodsService = await window.getDigitalGoodsService(
      GOOGLE_PLAY_BILLING_URL,
    );
    console.log("✅ Digital Goods Service initialized");
    await restorePurchases();
  } catch (err) {
    console.error("Digital Goods init failed:", err);
  }
}

async function restorePurchases() {
  if (!digitalGoodsService) return;
  try {
    const purchases = await digitalGoodsService.listPurchases();
    console.log("Checking existing purchases:", purchases);
    for (const purchase of purchases) {
      if (purchase.itemId === PREMIUM_PRODUCT_ID) {
        console.log("✅ Found existing premium purchase");
        activatePremium();
        return;
      }
    }
  } catch (err) {
    console.error("Restore purchases failed:", err);
  }
}

async function purchasePremiumWithGooglePlay() {
  const btn = document.getElementById("purchasePremium");

  try {
    // Check if Digital Goods API is available
    if (typeof window.getDigitalGoodsService !== "function") {
      showToast(
        "Not Available",
        "Purchases only available in the Android app from Google Play.",
        "error",
      );
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "🔄 Processing...";
    }

    // Get Digital Goods Service
    const service = await window.getDigitalGoodsService(
      GOOGLE_PLAY_BILLING_URL,
    );
    if (!service) {
      throw new Error("Failed to connect to Google Play Billing");
    }
    console.log("✅ Got Digital Goods Service");

    // Get product details to verify product exists
    const skuDetails = await service.getDetails([PREMIUM_PRODUCT_ID]);
    console.log("Product details:", skuDetails);

    if (!skuDetails || skuDetails.length === 0) {
      throw new Error(
        `Product '${PREMIUM_PRODUCT_ID}' not found in Google Play Console. Make sure the product is active.`,
      );
    }

    const product = skuDetails[0];
    console.log(
      `✅ Product found: ${product.title} - ${product.price.value} ${product.price.currency}`,
    );

    // Use Payment Request API to initiate purchase
    const paymentMethods = [
      {
        supportedMethods: GOOGLE_PLAY_BILLING_URL,
        data: {
          sku: PREMIUM_PRODUCT_ID,
        },
      },
    ];

    const paymentDetails = {
      total: {
        label: product.title || "Premium Unlock",
        amount: {
          currency: product.price?.currency || "USD",
          value: product.price?.value || "4.99",
        },
      },
    };

    console.log("Creating Payment Request...");
    const paymentRequest = new PaymentRequest(paymentMethods, paymentDetails);

    // Check if payment method is available
    const canMakePayment = await paymentRequest.canMakePayment();
    if (!canMakePayment) {
      throw new Error("Google Play payment is not available on this device");
    }
    console.log("✅ Payment method available");

    // Show payment UI
    console.log("Showing payment UI...");
    const paymentResponse = await paymentRequest.show();
    console.log("Payment response received:", paymentResponse);

    // Get purchase token from response
    const { purchaseToken } = paymentResponse.details;

    if (!purchaseToken) {
      throw new Error("No purchase token received");
    }
    console.log("✅ Purchase token received");

    // Acknowledge the purchase (required for one-time purchases)
    try {
      await service.acknowledge(purchaseToken, "onetime");
      console.log("✅ Purchase acknowledged");
    } catch (ackErr) {
      console.warn(
        "Acknowledge warning (may already be acknowledged):",
        ackErr,
      );
    }

    // Complete the payment
    await paymentResponse.complete("success");
    console.log("✅ Payment completed");

    // Activate premium features
    activatePremium();
    showToast(
      "Success 🎉",
      "Premium unlocked permanently! Thank you for your purchase.",
      "success",
      5000,
    );
    closePremiumModal();
  } catch (err) {
    console.error("Purchase failed:", err);

    let errorMessage = "Purchase failed. Please try again.";

    if (err.name === "AbortError" || err.name === "NotAllowedError") {
      errorMessage = "Purchase was cancelled.";
    } else if (err.message.includes("not found")) {
      errorMessage = "Product not available. Please try again later.";
    } else if (err.message.includes("not available")) {
      errorMessage = err.message;
    } else if (err.message) {
      errorMessage = err.message;
    }

    showToast("Payment Failed", errorMessage, "error", 5000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "🚀 Purchase via Google Play – $4.99";
    }
  }
}

window.addEventListener("message", (e) => {
  try {
    const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    if (
      data?.type === "PURCHASE_COMPLETE" &&
      (data.productId === "premium_unlock" ||
        data.productId === "io.github.evansmunsha.twa.premium")
    ) {
      localStorage.setItem("premiumUser", "true");
      localStorage.setItem("purchaseMethod", "google_play");
      localStorage.setItem("purchaseDate", new Date().toISOString());
      isPremiumUser = true;
      hideAds();
      updateUIForPremiumStatus();
      showToast(
        "🎉 Premium Unlocked!",
        "Enjoy unlimited invoices and watermark-free PDFs.",
        "success",
        5000,
      );
    }
  } catch (err) {}
});

function activatePremium() {
  isPremiumUser = true;
  localStorage.setItem("premiumUser", "true");
  localStorage.setItem("purchaseDate", new Date().toISOString());
  hideAds();
  updateUIForPremiumStatus();
  hideUsageStats();
}

/* =========================
   4. CURRENCY
========================= */
function initializeCurrency() {
  const currencySelect = document.getElementById("currency");
  currencySelect.value = localStorage.getItem("currency") || "ZMW";
  currencySelect.addEventListener("change", (e) => {
    localStorage.setItem("currency", e.target.value);
    calculateTotal();
  });
  calculateTotal();
}

function getCurrency() {
  return document.getElementById("currency").value || "ZMW";
}

/* =========================
   5. INVOICE NUMBERING
========================= */
function generateInvoiceNumber() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const counter = String(++invoiceCounter).padStart(3, "0");
  return `INV-${year}${month}-${counter}`;
}

function setSmartDefaults() {
  document.getElementById("invoiceDate").value = new Date()
    .toISOString()
    .split("T")[0];
  document.getElementById("invoiceTime").value = new Date()
    .toTimeString()
    .slice(0, 5);
  document.getElementById("invoiceNumber").value = generateInvoiceNumber();
  const saved = localStorage.getItem("businessName");
  if (saved) document.getElementById("businessName").value = saved;
}

/* =========================
   6. NOTIFICATIONS
========================= */
function showToast(title, message, type = "info", duration = 4000) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-header">
      <h4 class="toast-title">${title}</h4>
      <button class="toast-close" onclick="removeToast(this)">&times;</button>
    </div>
    <p class="toast-message">${message}</p>`;
  document.getElementById("toast-container").appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 100);
  setTimeout(() => removeToast(toast.querySelector(".toast-close")), duration);
}

function removeToast(closeBtn) {
  const toast = closeBtn.closest(".toast");
  toast.classList.remove("show");
  setTimeout(() => toast.remove(), 300);
}

function showLoading(message = "Loading...") {
  const overlay = document.getElementById("loading-overlay");
  overlay.querySelector(".loading-spinner p").textContent = message;
  overlay.classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

/* =========================
   7. VALIDATION
========================= */
function setupFormValidation() {
  const fields = {
    businessName: { required: true, minLength: 2 },
    invoiceDate: { required: true },
  };

  Object.entries(fields).forEach(([id, rules]) => {
    const field = document.getElementById(id);
    field.addEventListener("blur", () => {
      validateField(id, field.value, rules);
      if (id === "businessName" && field.value.trim()) {
        localStorage.setItem("businessName", field.value);
      }
    });
  });

  document.getElementById("invoiceTime").addEventListener("change", () => {
    hasUnsavedChanges = true;
  });
}

function validateField(fieldId, value, rules = {}) {
  const field = document.getElementById(fieldId);
  const errorElement = document.getElementById(fieldId + "Error");
  let isValid = true,
    errorMessage = "";

  if (rules.required && (!value || value.trim() === "")) {
    isValid = false;
    errorMessage = "This field is required";
  } else if (rules.minLength && value?.length < rules.minLength) {
    isValid = false;
    errorMessage = `Minimum ${rules.minLength} characters required`;
  } else if (rules.custom && value) {
    const result = rules.custom(value);
    if (result !== true) {
      isValid = false;
      errorMessage = result;
    }
  }

  if (errorElement) errorElement.textContent = errorMessage;
  field.classList.remove("error", "success");
  if (value?.trim()) field.classList.add(isValid ? "success" : "error");
  return isValid;
}

function validateForm() {
  let isValid = validateField(
    "businessName",
    document.getElementById("businessName").value,
    { required: true, minLength: 2 },
  );
  isValid =
    validateField("invoiceDate", document.getElementById("invoiceDate").value, {
      required: true,
    }) && isValid;

  if (!items.length) {
    showToast("Validation Error", "Add at least one item", "error");
    return false;
  }

  items.forEach((item, i) => {
    if (!item.name?.trim()) {
      showToast("Validation Error", `Item ${i + 1} needs a name`, "error");
      isValid = false;
    }
    if (item.qty <= 0) {
      showToast(
        "Validation Error",
        `Item ${i + 1} quantity must be > 0`,
        "error",
      );
      isValid = false;
    }
    if (item.price < 0) {
      showToast(
        "Validation Error",
        `Item ${i + 1} price cannot be negative`,
        "error",
      );
      isValid = false;
    }
  });

  return isValid;
}

function validateItemInput(input, value, type) {
  input.classList.remove("input-valid", "input-warning", "input-error");
  clearItemHelperText(input);
  if (!value?.trim()) {
    if (type === "name") showItemHelperText(input, "Enter item name", "info");
    return;
  }

  const validations = {
    name: [
      {
        check: (v) => v.length < 2,
        class: "input-warning",
        msg: "Name should be more descriptive",
      },
      {
        check: (v) => v.length > 50,
        class: "input-warning",
        msg: "Name is too long",
      },
      { check: () => false, class: "input-valid", msg: "" },
    ],
    quantity: [
      {
        check: (v) => v <= 0,
        class: "input-error",
        msg: "Quantity must be > 0",
      },
      {
        check: (v) => v > 1000,
        class: "input-warning",
        msg: "Large quantity - verify",
      },
      { check: () => false, class: "input-valid", msg: "" },
    ],
    price: [
      {
        check: (v) => v < 0,
        class: "input-error",
        msg: "Price cannot be negative",
      },
      {
        check: (v) => v === 0,
        class: "input-warning",
        msg: "Free item - correct?",
      },
      {
        check: (v) => v > 10000,
        class: "input-warning",
        msg: "High price - verify",
      },
      { check: () => false, class: "input-valid", msg: "" },
    ],
  };

  const val = parseFloat(value);
  const checks = validations[type];
  for (const { check, class: cls, msg } of checks) {
    if (check(type === "name" ? value : val)) {
      input.classList.add(cls);
      if (msg) showItemHelperText(input, msg, cls.replace("input-", ""));
      break;
    }
  }
}

function showItemHelperText(input, message, type) {
  const id = `helper-${input.getAttribute("aria-label").replace(/\s+/g, "-").toLowerCase()}`;
  let helper = document.getElementById(id);
  if (!helper) {
    helper = document.createElement("div");
    helper.id = id;
    helper.className = "item-helper-text";
    input.parentNode.appendChild(helper);
  }
  helper.textContent = message;
  helper.className = `item-helper-text helper-${type}`;
  helper.setAttribute("role", "status");
  helper.setAttribute("aria-live", "polite");
}

function clearItemHelperText(input) {
  const id = `helper-${input.getAttribute("aria-label").replace(/\s+/g, "-").toLowerCase()}`;
  document.getElementById(id)?.remove();
}

/*********************************************************
 * OFFLINE INVOICE MAKER – REFACTORED PART 2
 * Sections 8-15: Items, Calculations, Saving, PDF
 *********************************************************/

/* =========================
   8. ITEMS MANAGEMENT
========================= */
function addItemRow(data = {}) {
  const item = {
    name: data.name || "",
    qty: data.qty || 1,
    price: data.price || 0,
  };
  items.push(item);
  const index = items.length - 1;

  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <input placeholder="Item name (e.g. Website Design)" value="${item.name}"
           aria-label="Item name or service description">
    <input type="number" min="1" value="${item.qty}" aria-label="Quantity" placeholder="Qty">
    <input type="number" min="0" step="0.01" value="${item.price}" aria-label="Unit price" placeholder="0.00">
    <button class="danger" aria-label="Remove this item">✕</button>
  `;

  const [nameInput, qtyInput, priceInput, deleteBtn] =
    row.querySelectorAll("input, button");

  nameInput.oninput = (e) => {
    items[index].name = e.target.value;
    hasUnsavedChanges = true;
    validateItemInput(nameInput, e.target.value, "name");
  };

  qtyInput.oninput = (e) => {
    items[index].qty = +e.target.value;
    calculateTotal();
    hasUnsavedChanges = true;
    validateItemInput(qtyInput, e.target.value, "quantity");
  };

  priceInput.oninput = (e) => {
    items[index].price = +e.target.value;
    calculateTotal();
    hasUnsavedChanges = true;
    validateItemInput(priceInput, e.target.value, "price");
  };

  deleteBtn.onclick = () => {
    items.splice(index, 1);
    row.remove();
    calculateTotal();
    hasUnsavedChanges = true;
  };

  itemsDiv.appendChild(row);
  calculateTotal();
}

document.getElementById("addItem").onclick = () => addItemRow();

/* =========================
   9. CALCULATIONS
========================= */
function calculateTotal() {
  const currency = getCurrency();
  const total = items.reduce((sum, i) => sum + i.qty * i.price, 0);
  totalSpan.textContent = `${currency} ${total.toFixed(2)}`;
  updateCalculationBreakdown(currency, total, items, "calculation-breakdown");
}

function calculateEditTotal() {
  const currency = getCurrency();
  const total = editItems.reduce((sum, i) => sum + i.qty * i.price, 0);
  document.getElementById("editTotal").textContent =
    `${currency} ${total.toFixed(2)}`;
  updateCalculationBreakdown(
    currency,
    total,
    editItems,
    "edit-calculation-breakdown",
  );
}

function updateCalculationBreakdown(currency, total, itemsList, elementId) {
  let element = document.getElementById(elementId);

  if (!element) {
    element = document.createElement("div");
    element.id = elementId;
    element.className = "calculation-breakdown";
    const parent = elementId.includes("edit")
      ? document.querySelector("#editTotal")?.parentNode
      : document.querySelector(".total");
    if (parent) parent.appendChild(element);
  }

  if (!itemsList.length) {
    element.innerHTML = "";
    return;
  }

  let html = '<div class="breakdown-title">💡 Calculation:</div>';
  itemsList.forEach((item) => {
    if (item.name && item.qty > 0) {
      const itemTotal = item.qty * item.price;
      const name =
        item.name.length > 20 ? item.name.substring(0, 20) + "..." : item.name;
      html += `<div class="breakdown-item">${name}: ${item.qty} × ${currency} ${item.price.toFixed(2)} = ${currency} ${itemTotal.toFixed(2)}</div>`;
    }
  });

  if (itemsList.length > 1) {
    html += `<div class="breakdown-total"><strong>Total: ${currency} ${total.toFixed(2)}</strong></div>`;
  }

  element.innerHTML = html;
}

/* =========================
   10. SAVE & LOAD
========================= */
document.getElementById("saveInvoice").onclick = async () => {
  if (!isPremiumUser && !(await checkUsageLimit())) return;
  if (!validateForm()) return;

  const btn = document.getElementById("saveInvoice");
  const originalText = btn.innerHTML;

  try {
    btn.classList.add("btn-loading");
    btn.innerHTML = "💾 Saving...";
    btn.disabled = true;

    const invoice = {
      id: Date.now(),
      invoiceNumber: document.getElementById("invoiceNumber").value,
      businessName: document.getElementById("businessName").value,
      clientName: document.getElementById("clientName").value || "Client",
      date: document.getElementById("invoiceDate").value,
      time: document.getElementById("invoiceTime").value,
      currency: getCurrency(),
      items: structuredClone(items),
      total: totalSpan.textContent,
    };

    await saveInvoice(invoice);
    await loadHistory();

    if (!isPremiumUser) {
      trackUsage("invoice_saved");
      updateUsageStatsDisplay();
    }

    showToast(
      "Success!",
      `Invoice ${invoice.invoiceNumber} saved successfully.`,
      "success",
    );
    clearDraft();
    resetForm();
  } catch (error) {
    showToast("Error", "Failed to save invoice.", "error");
  } finally {
    btn.classList.remove("btn-loading");
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

async function loadHistory() {
  const invoices = await getInvoices();
  renderInvoiceList(invoices);
}

function renderInvoiceList(invoices) {
  invoiceList.innerHTML = "";

  if (!invoices.length) {
    invoiceList.innerHTML = `
      <li class="empty-state">
        <div class="empty-state-icon">📄</div>
        <h3>No invoices yet</h3>
        <p>Create your first invoice to get started!</p>
      </li>`;
    return;
  }

  invoices.forEach((inv) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="invoice-select">
        <input type="checkbox" class="invoice-checkbox" data-invoice-id="${inv.id}"
               aria-label="Select invoice ${inv.invoiceNumber || inv.id}">
      </div>
      <div class="invoice-content">
        <div class="invoice-header">
          <div class="invoice-info">
            <h4>${inv.invoiceNumber || "INV-" + inv.id}</h4>
            <p><strong>Client:</strong> ${inv.clientName || "No client"}</p>
            <p><strong>Date:</strong> ${new Date(inv.date).toLocaleDateString()}</p>
          </div>
          <div class="invoice-amount">${inv.total}</div>
        </div>
        <div class="invoice-actions">
          <button data-edit class="secondary">✏️ Edit</button>
          <button data-view class="secondary">📄 PDF</button>
          <button data-share class="secondary">🔗 Share</button>
          <button data-whatsapp class="whatsapp-quick">💬 WhatsApp</button>
          <button data-duplicate class="secondary">📋 Copy</button>
          <button data-delete class="danger">🗑️ Delete</button>
        </div>
      </div>`;

    li.querySelector("[data-edit]").onclick = () => openEditModal(inv);
    li.querySelector("[data-view]").onclick = () => exportInvoicePDF(inv);
    li.querySelector("[data-share]").onclick = () => openShareModal(inv);
    li.querySelector("[data-whatsapp]").onclick = () => {
      currentShareInvoice = inv;
      shareWhatsApp();
    };
    li.querySelector("[data-duplicate]").onclick = () => duplicateInvoice(inv);
    li.querySelector("[data-delete]").onclick = async () => {
      if (confirm(`Delete invoice ${inv.invoiceNumber || inv.id}?`)) {
        try {
          await deleteInvoice(inv.id);
          await loadHistory();
          showToast("Deleted", "Invoice deleted successfully", "success");
        } catch (error) {
          showToast("Error", "Failed to delete invoice", "error");
        }
      }
    };

    li.querySelector(".invoice-checkbox").addEventListener("change", (e) => {
      const id = parseInt(e.target.dataset.invoiceId);
      e.target.checked ? selectedInvoices.add(id) : selectedInvoices.delete(id);
      updateBulkActionsVisibility();
    });

    invoiceList.appendChild(li);
  });

  updateBulkActionsVisibility();
}

function resetForm() {
  items = [];
  itemsDiv.innerHTML = "";
  addItemRow();
  totalSpan.textContent = "0";
  document.getElementById("clientName").value = "";
  setSmartDefaults();
  document
    .querySelectorAll(".form-field")
    .forEach((f) => f.classList.remove("error", "success"));
  document
    .querySelectorAll(".error-message")
    .forEach((e) => (e.textContent = ""));
  showToast("Form Reset", "Ready to create a new invoice!", "info", 2000);
  clearDraft();
}

function duplicateInvoice(invoice) {
  document.getElementById("businessName").value = invoice.businessName || "";
  document.getElementById("clientName").value = invoice.clientName || "";
  items = [];
  itemsDiv.innerHTML = "";
  invoice.items.forEach((item) => addItemRow(item));
  setSmartDefaults();
  showToast(
    "Duplicated",
    "Invoice data loaded. Modify and save as new.",
    "info",
    5000,
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================
   11. PDF EXPORT
========================= */
document.getElementById("generatePDF").onclick = async () => {
  if (!isPremiumUser && !(await checkPDFLimit())) return;
  if (!validateForm()) return;

  const btn = document.getElementById("generatePDF");
  const originalText = btn.innerHTML;

  try {
    showLoading("Generating PDF...");
    btn.classList.add("btn-loading");
    btn.innerHTML = "📄 Generating...";
    btn.disabled = true;

    await new Promise((resolve) => setTimeout(resolve, 500));

    const invoiceData = {
      invoiceNumber: document.getElementById("invoiceNumber").value,
      businessName: document.getElementById("businessName").value,
      clientName: document.getElementById("clientName").value || "Client",
      date: document.getElementById("invoiceDate").value,
      time: document.getElementById("invoiceTime").value,
      currency: getCurrency(),
      items,
      total: totalSpan.textContent,
    };

    exportInvoicePDF(invoiceData);

    if (!isPremiumUser) {
      trackUsage("pdf_generated");
      updateUsageStatsDisplay();
    }

    showToast(
      "PDF Generated!",
      "Your invoice PDF has been downloaded.",
      "success",
    );
  } catch (error) {
    showToast("Error", "Failed to generate PDF.", "error");
  } finally {
    hideLoading();
    btn.classList.remove("btn-loading");
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

async function generatePDFBlob(invoice) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof window.jspdf === "undefined") {
        reject(new Error("PDF library not loaded"));
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const template = document.getElementById("template")?.value || "simple";

      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      let y = template === "boxed" ? 25 : 20;

      if (template === "boxed") doc.rect(10, 10, 190, 270, "S");

      doc.text("INVOICE", 105, y, { align: "center" });
      doc.setFontSize(12);
      doc.setFont(undefined, "normal");
      y += 15;

      if (invoice.invoiceNumber) {
        doc.setFont(undefined, "bold");
        doc.text(invoice.invoiceNumber, 105, y, { align: "center" });
        doc.setFont(undefined, "normal");
      }
      y += 20;

      doc.setFont(undefined, "bold");
      doc.text("From:", 20, y);
      doc.setFont(undefined, "normal");
      y += 8;
      doc.text(invoice.businessName || "Business Name", 20, y);
      y += 15;

      doc.setFont(undefined, "bold");
      doc.text("To:", 20, y);
      doc.setFont(undefined, "normal");
      y += 8;
      doc.text(invoice.clientName || "Client Name", 20, y);
      y += 15;

      doc.setFont(undefined, "bold");
      doc.text("Date:", 20, y);
      doc.setFont(undefined, "normal");
      const dateTime =
        new Date(invoice.date).toLocaleDateString() +
        (invoice.time ? ` at ${invoice.time}` : "");
      doc.text(dateTime, 60, y);
      y += 20;

      doc.setFont(undefined, "bold");
      doc.text("Description", 20, y);
      doc.text("Qty", 120, y);
      doc.text("Price", 140, y);
      doc.text("Total", 170, y);
      doc.line(20, y + 2, 190, y + 2);
      y += 10;
      doc.setFont(undefined, "normal");

      invoice.items.forEach((item) => {
        const itemTotal = item.qty * item.price;
        const name =
          item.name.length > 25
            ? item.name.substring(0, 25) + "..."
            : item.name;
        doc.text(name, 20, y);
        doc.text(item.qty.toString(), 120, y);
        doc.text(item.price.toFixed(2), 140, y);
        doc.text(itemTotal.toFixed(2), 170, y);
        y += 8;
      });

      y += 10;
      doc.line(120, y - 5, 190, y - 5);
      doc.setFont(undefined, "bold");
      doc.setFontSize(14);
      doc.text("TOTAL:", 140, y);
      doc.text(invoice.total, 170, y);

      resolve(doc.output("blob"));
    } catch (error) {
      reject(error);
    }
  });
}

/* =========================
   12. AUTO-SAVE & RECOVERY
========================= */
function initializeAutoSave() {
  autoSaveInterval = setInterval(saveDraft, 30000);

  [
    "businessName",
    "clientName",
    "invoiceDate",
    "invoiceTime",
    "currency",
  ].forEach((id) => {
    const field = document.getElementById(id);
    if (field) {
      field.addEventListener("input", () => {
        hasUnsavedChanges = true;
        clearTimeout(field.autoSaveTimeout);
        field.autoSaveTimeout = setTimeout(saveDraft, 2000);
      });
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (hasUnsavedChanges) {
      saveDraft();
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Are you sure?";
    }
  });
}

function saveDraft() {
  if (!hasUnsavedChanges && !items.length) return;

  const draft = {
    timestamp: Date.now(),
    businessName: document.getElementById("businessName").value,
    clientName: document.getElementById("clientName").value,
    invoiceDate: document.getElementById("invoiceDate").value,
    invoiceTime: document.getElementById("invoiceTime").value,
    currency: document.getElementById("currency").value,
    items: structuredClone(items),
    total: totalSpan.textContent,
  };

  localStorage.setItem("invoiceDraft", JSON.stringify(draft));
}

function checkForSavedDraft() {
  const saved = localStorage.getItem("invoiceDraft");
  if (!saved) return;

  try {
    const draft = JSON.parse(saved);
    const age = Date.now() - draft.timestamp;

    if (age > 24 * 60 * 60 * 1000) {
      localStorage.removeItem("invoiceDraft");
      return;
    }

    const date = new Date(draft.timestamp).toLocaleString();
    setTimeout(() => {
      if (confirm(`Found unsaved work from ${date}. Recover it?`)) {
        recoverDraft(draft);
        showToast(
          "Recovered",
          "Your unsaved work has been restored",
          "success",
        );
      } else {
        clearDraft();
      }
    }, 1500);
  } catch (error) {
    localStorage.removeItem("invoiceDraft");
  }
}

function recoverDraft(draft) {
  document.getElementById("businessName").value = draft.businessName || "";
  document.getElementById("clientName").value = draft.clientName || "";
  document.getElementById("invoiceDate").value = draft.invoiceDate || "";
  document.getElementById("invoiceTime").value = draft.invoiceTime || "";
  document.getElementById("currency").value = draft.currency || "ZMW";

  items = [];
  itemsDiv.innerHTML = "";
  if (draft.items?.length) {
    draft.items.forEach((item) => addItemRow(item));
  } else {
    addItemRow();
  }
  calculateTotal();
  hasUnsavedChanges = true;
}

function clearDraft() {
  localStorage.removeItem("invoiceDraft");
  hasUnsavedChanges = false;
}

/* =========================
   13. SEARCH & FILTER
========================= */
function setupSearchAndFilter() {
  const search = document.getElementById("searchInvoices");
  const sort = document.getElementById("sortBy");
  if (search) search.addEventListener("input", filterInvoices);
  if (sort) sort.addEventListener("change", filterInvoices);
}

async function filterInvoices() {
  const term = document.getElementById("searchInvoices").value.toLowerCase();
  const sortBy = document.getElementById("sortBy").value;
  let invoices = await getInvoices();

  if (term) {
    invoices = invoices.filter(
      (inv) =>
        (inv.clientName || "").toLowerCase().includes(term) ||
        (inv.businessName || "").toLowerCase().includes(term) ||
        (inv.invoiceNumber || "").toLowerCase().includes(term),
    );
  }

  invoices.sort((a, b) => {
    switch (sortBy) {
      case "date-asc":
        return new Date(a.date) - new Date(b.date);
      case "date-desc":
        return new Date(b.date) - new Date(a.date);
      case "client-asc":
        return (a.clientName || "").localeCompare(b.clientName || "");
      case "total-desc":
        const aTotal = parseFloat((a.total || "0").replace(/[^\d.-]/g, ""));
        const bTotal = parseFloat((b.total || "0").replace(/[^\d.-]/g, ""));
        return bTotal - aTotal;
      default:
        return new Date(b.date) - new Date(a.date);
    }
  });

  renderInvoiceList(invoices);
}

/*********************************************************
 * OFFLINE INVOICE MAKER – REFACTORED PART 3 (FINAL)
 * Sections 14-20: Modals, Sharing, Bulk Actions, Monetization
 *********************************************************/

/* =========================
   14. EDIT MODAL
========================= */
function setupModalHandlers() {
  document.getElementById("addEditItem").onclick = () => {
    editItems.push({ name: "", qty: 1, price: 0 });
    renderEditItems();
  };

  document.getElementById("saveEdit").onclick = async () => {
    if (!editItems.length) {
      showToast("Error", "Add at least one item", "error");
      return;
    }

    try {
      const updated = {
        ...currentEditingInvoice,
        businessName: document.getElementById("editBusinessName").value,
        clientName: document.getElementById("editClientName").value,
        date: document.getElementById("editDate").value,
        time: document.getElementById("editTime").value,
        items: [...editItems],
        total: document.getElementById("editTotal").textContent,
      };

      await saveInvoice(updated);
      await loadHistory();
      closeEditModal();
      showToast("Updated", "Invoice updated successfully", "success");
    } catch (error) {
      showToast("Error", "Failed to update invoice", "error");
    }
  };

  document.getElementById("duplicateInvoice").onclick = () =>
    duplicateInvoiceFromModal();
  document.getElementById("cancelEdit").onclick = closeEditModal;
  document.getElementById("closeModal").onclick = closeEditModal;
}

function openEditModal(invoice) {
  currentEditingInvoice = invoice;
  editItems = [...invoice.items];

  document.getElementById("editInvoiceNumber").value =
    invoice.invoiceNumber || "INV-" + invoice.id;
  document.getElementById("editBusinessName").value =
    invoice.businessName || "";
  document.getElementById("editClientName").value = invoice.clientName || "";
  document.getElementById("editDate").value = invoice.date || "";
  document.getElementById("editTime").value = invoice.time || "";

  renderEditItems();
  calculateEditTotal();
  document.getElementById("invoiceModal").classList.remove("hidden");
}

function renderEditItems() {
  const container = document.getElementById("editItems");
  container.innerHTML = "";

  editItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "edit-item-row";
    row.innerHTML = `
      <input type="text" value="${item.name}" placeholder="Item name" aria-label="Item name">
      <input type="number" value="${item.qty}" min="1" placeholder="Qty" aria-label="Quantity">
      <input type="number" value="${item.price}" min="0" step="0.01" placeholder="0.00" aria-label="Unit price">
      <button type="button" class="danger" aria-label="Remove">✕</button>`;

    const [nameInput, qtyInput, priceInput, deleteBtn] =
      row.querySelectorAll("input, button");

    nameInput.oninput = (e) => {
      editItems[index].name = e.target.value;
      validateItemInput(nameInput, e.target.value, "name");
    };
    qtyInput.oninput = (e) => {
      editItems[index].qty = +e.target.value;
      calculateEditTotal();
      validateItemInput(qtyInput, e.target.value, "quantity");
    };
    priceInput.oninput = (e) => {
      editItems[index].price = +e.target.value;
      calculateEditTotal();
      validateItemInput(priceInput, e.target.value, "price");
    };
    deleteBtn.onclick = () => {
      editItems.splice(index, 1);
      renderEditItems();
      calculateEditTotal();
    };

    container.appendChild(row);
  });
}

function closeEditModal() {
  document.getElementById("invoiceModal").classList.add("hidden");
  currentEditingInvoice = null;
  editItems = [];
}

function duplicateInvoiceFromModal() {
  duplicateInvoice({
    businessName: document.getElementById("editBusinessName").value,
    clientName: document.getElementById("editClientName").value,
    items: [...editItems],
  });
  closeEditModal();
}

/* =========================
   15. SHARE FUNCTIONALITY
========================= */
function setupShareFunctionality() {
  document.getElementById("shareInvoice").addEventListener("click", () => {
    if (!validateForm()) {
      showToast("Error", "Please complete the invoice before sharing", "error");
      return;
    }

    openShareModal({
      invoiceNumber: document.getElementById("invoiceNumber").value,
      businessName: document.getElementById("businessName").value,
      clientName: document.getElementById("clientName").value || "Client",
      date: document.getElementById("invoiceDate").value,
      time: document.getElementById("invoiceTime").value,
      currency: getCurrency(),
      items: [...items],
      total: totalSpan.textContent,
    });
  });

  document
    .getElementById("closeShareModal")
    .addEventListener("click", closeShareModal);
  document
    .getElementById("closeShareModalBtn")
    .addEventListener("click", closeShareModal);

  document.getElementById("shareNative").addEventListener("click", shareNative);
  document.getElementById("sharePDF").addEventListener("click", sharePDF);
  document.getElementById("shareEmail").addEventListener("click", shareEmail);
  document
    .getElementById("shareWhatsApp")
    .addEventListener("click", shareWhatsApp);
  document.getElementById("shareData").addEventListener("click", shareData);
  document.getElementById("copyLink").addEventListener("click", copyShareLink);
  document
    .getElementById("sendWhatsAppDirect")
    .addEventListener("click", sendWhatsAppDirect);
}

function openShareModal(invoice) {
  currentShareInvoice = invoice;

  const shareData = btoa(JSON.stringify(invoice));
  const shareUrl = `${window.location.origin}${window.location.pathname}#share=${shareData}`;
  document.getElementById("shareLink").value = shareUrl;

  const saved = localStorage.getItem("lastWhatsAppNumber");
  if (saved) document.getElementById("whatsappNumber").value = saved;

  setupWhatsAppValidation();
  document.getElementById("shareModal").classList.remove("hidden");
  setTimeout(() => document.getElementById("shareNative").focus(), 100);
}

function closeShareModal() {
  document.getElementById("shareModal").classList.add("hidden");
  currentShareInvoice = null;
}

async function shareNative() {
  if (!navigator.share) {
    showToast(
      "Not Supported",
      "Native sharing not supported on this device",
      "warning",
    );
    return;
  }

  try {
    const pdfBlob = await generatePDFBlob(currentShareInvoice);
    const file = new File(
      [pdfBlob],
      `${currentShareInvoice.invoiceNumber || "invoice"}.pdf`,
      { type: "application/pdf" },
    );

    await navigator.share({
      title: `Invoice ${currentShareInvoice.invoiceNumber}`,
      text: `Invoice for ${currentShareInvoice.clientName} - ${currentShareInvoice.total}`,
      files: [file],
    });

    showToast("Shared", "Invoice shared successfully", "success");
    closeShareModal();
  } catch (error) {
    if (error.name !== "AbortError") {
      showToast("Error", "Failed to share invoice", "error");
    }
  }
}

async function sharePDF() {
  try {
    showLoading("Generating PDF for sharing...");
    exportInvoicePDF(currentShareInvoice);
    hideLoading();
    showToast("PDF Generated", "PDF downloaded. Share it manually.", "success");
    closeShareModal();
  } catch (error) {
    hideLoading();
    showToast("Error", "Failed to generate PDF", "error");
  }
}

function shareEmail() {
  const subject = `Invoice ${currentShareInvoice.invoiceNumber}`;
  const body = `Hi,

Please find the invoice details below:

Invoice Number: ${currentShareInvoice.invoiceNumber}
Business: ${currentShareInvoice.businessName}
Client: ${currentShareInvoice.clientName}
Date: ${new Date(currentShareInvoice.date).toLocaleDateString()}${currentShareInvoice.time ? " at " + currentShareInvoice.time : ""}
Total: ${currentShareInvoice.total}

Items:
${currentShareInvoice.items.map((i) => `- ${i.name}: ${i.qty} x ${i.price} = ${(i.qty * i.price).toFixed(2)}`).join("\n")}

Best regards`;

  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  showToast(
    "Email Client Opened",
    "Your email client should open with invoice details",
    "info",
  );
  closeShareModal();
}

function shareWhatsApp() {
  const message = formatWhatsAppMessage(currentShareInvoice);
  window.open(
    `https://wa.me/?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer",
  );
  showToast(
    "WhatsApp Opened",
    "WhatsApp opened with invoice details",
    "success",
  );
  if (!document.getElementById("shareModal").classList.contains("hidden")) {
    closeShareModal();
  }
}

function sendWhatsAppDirect() {
  const phone = document.getElementById("whatsappNumber").value.trim();
  if (!phone) {
    showToast(
      "Phone Number Required",
      "Please enter a phone number",
      "warning",
    );
    return;
  }

  const clean = phone.replace(/[\s\-\(\)]/g, "");
  if (!/^\+?[\d]{10,15}$/.test(clean)) {
    showToast("Invalid Number", "Please enter a valid phone number", "error");
    return;
  }

  const message = formatWhatsAppMessage(currentShareInvoice);
  window.open(
    `https://wa.me/${clean}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer",
  );
  showToast(
    "WhatsApp Opened",
    `Invoice sent to ${phone} via WhatsApp`,
    "success",
  );
  localStorage.setItem("lastWhatsAppNumber", phone);
  closeShareModal();
}

function formatWhatsAppMessage(inv) {
  return `*Invoice ${inv.invoiceNumber}*

🏢 *Business:* ${inv.businessName}
👤 *Client:* ${inv.clientName}
📅 *Date:* ${new Date(inv.date).toLocaleDateString()}${inv.time ? " ⏰ " + inv.time : ""}
💰 *Total:* ${inv.total}

📋 *Items:*
${inv.items.map((item, i) => `${i + 1}. ${item.name}: ${item.qty} × ${item.price} = *${(item.qty * item.price).toFixed(2)}*`).join("\n")}

📱 _Generated with Invoice Maker_`;
}

function setupWhatsAppValidation() {
  const input = document.getElementById("whatsappNumber");
  const btn = document.getElementById("sendWhatsAppDirect");
  if (!input || !btn) return;

  input.addEventListener("input", (e) => {
    const phone = e.target.value.trim();
    const clean = phone.replace(/[\s\-\(\)]/g, "");
    const isValid = /^\+?[\d]{10,15}$/.test(clean) && phone.length > 0;

    input.classList.remove("valid", "invalid");
    if (phone.length > 0) input.classList.add(isValid ? "valid" : "invalid");
    btn.disabled = !isValid;
  });

  input.addEventListener("blur", (e) => {
    let phone = e.target.value.trim();
    if (phone && !phone.startsWith("+")) {
      const clean = phone.replace(/[\s\-\(\)]/g, "");
      if (/^[\d]{10,15}$/.test(clean)) {
        e.target.value = "+" + clean;
        e.target.dispatchEvent(new Event("input"));
      }
    }
  });

  btn.disabled = true;
}

async function shareData() {
  const text = `Invoice ${currentShareInvoice.invoiceNumber}

Business: ${currentShareInvoice.businessName}
Client: ${currentShareInvoice.clientName}
Date: ${new Date(currentShareInvoice.date).toLocaleDateString()}${currentShareInvoice.time ? " at " + currentShareInvoice.time : ""}
Total: ${currentShareInvoice.total}

Items:
${currentShareInvoice.items.map((i) => `- ${i.name}: ${i.qty} x ${i.price} = ${(i.qty * i.price).toFixed(2)}`).join("\n")}`;

  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied", "Invoice details copied to clipboard", "success");
    closeShareModal();
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
    showToast("Copied", "Invoice details copied to clipboard", "success");
    closeShareModal();
  }
}

async function copyShareLink() {
  const link = document.getElementById("shareLink").value;
  const btn = document.getElementById("copyLink");

  try {
    await navigator.clipboard.writeText(link);
    btn.classList.add("success");
    btn.textContent = "✓ Copied!";
    setTimeout(() => {
      btn.classList.remove("success");
      btn.textContent = "📋 Copy";
    }, 2000);
    showToast("Link Copied", "Share link copied to clipboard", "success");
  } catch (error) {
    document.getElementById("shareLink").select();
    document.execCommand("copy");
    btn.classList.add("success");
    btn.textContent = "✓ Copied!";
    setTimeout(() => {
      btn.classList.remove("success");
      btn.textContent = "📋 Copy";
    }, 2000);
    showToast("Link Copied", "Share link copied to clipboard", "success");
  }
}

function handleSharedInvoiceFromURL() {
  const hash = window.location.hash;
  if (hash.startsWith("#share=")) {
    try {
      const shareData = hash.substring(7);
      const shared = JSON.parse(atob(shareData));
      setTimeout(() => loadSharedInvoice(shared), 1000);
    } catch (error) {
      console.error("Failed to load shared invoice:", error);
    }
  }
}

function loadSharedInvoice(inv) {
  document.getElementById("businessName").value = inv.businessName || "";
  document.getElementById("clientName").value = inv.clientName || "";
  document.getElementById("invoiceDate").value = inv.date || "";
  document.getElementById("invoiceTime").value = inv.time || "";
  document.getElementById("invoiceNumber").value = inv.invoiceNumber || "";
  if (inv.currency) document.getElementById("currency").value = inv.currency;

  items = [];
  itemsDiv.innerHTML = "";
  if (inv.items?.length) {
    inv.items.forEach((item) => addItemRow(item));
  } else {
    addItemRow();
  }

  calculateTotal();
  showToast(
    "Shared Invoice Loaded",
    `Invoice ${inv.invoiceNumber} loaded from shared link`,
    "info",
    5000,
  );
  setTimeout(
    () =>
      window.history.replaceState({}, document.title, window.location.pathname),
    1000,
  );
}

/* =========================
   16. BULK ACTIONS
========================= */
function setupBulkActions() {
  document
    .getElementById("bulkShare")
    ?.addEventListener("click", handleBulkShare);
  document
    .getElementById("bulkWhatsApp")
    ?.addEventListener("click", handleBulkWhatsApp);
  document
    .getElementById("bulkDelete")
    ?.addEventListener("click", handleBulkDelete);
  document
    .getElementById("clearSelection")
    ?.addEventListener("click", clearSelection);
  document
    .getElementById("bulkExportPDF")
    ?.addEventListener("click", handleBulkExportPDF);
  document
    .getElementById("expandBulkActions")
    ?.addEventListener("click", toggleBulkActionsExpansion);
}

function setupSelectAllFunctionality() {
  const checkbox = document.getElementById("selectAllInvoices");
  if (!checkbox) return;

  checkbox.addEventListener("change", (e) => {
    document.querySelectorAll(".invoice-checkbox").forEach((cb) => {
      cb.checked = e.target.checked;
      const id = parseInt(cb.dataset.invoiceId);
      e.target.checked ? selectedInvoices.add(id) : selectedInvoices.delete(id);
    });
    updateBulkActionsVisibility();
    updateSelectAllState();
  });
}

function updateBulkActionsVisibility() {
  const actions = document.getElementById("bulkActions");
  const count = document.getElementById("selectedCount");

  if (!actions || !count) return;

  if (selectedInvoices.size > 0) {
    actions.classList.remove("hidden");
    count.textContent = selectedInvoices.size;
  } else {
    actions.classList.add("hidden");
    const secondary = document.getElementById("bulkSecondaryActions");
    const btn = document.getElementById("expandBulkActions");
    if (secondary && btn) {
      secondary.classList.add("hidden");
      btn.textContent = "⋯";
      btn.setAttribute("aria-expanded", "false");
    }
  }

  updateSelectAllState();
}

function updateSelectAllState() {
  const selectAll = document.getElementById("selectAllInvoices");
  const checkboxes = document.querySelectorAll(".invoice-checkbox");
  if (!selectAll || !checkboxes.length) return;

  const checked = document.querySelectorAll(".invoice-checkbox:checked").length;

  if (checked === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  } else if (checked === checkboxes.length) {
    selectAll.checked = true;
    selectAll.indeterminate = false;
  } else {
    selectAll.checked = false;
    selectAll.indeterminate = true;
  }
}

async function handleBulkShare() {
  const invoices = await getInvoices();
  const selected = invoices.filter((inv) => selectedInvoices.has(inv.id));
  selected.length === 1
    ? openShareModal(selected[0])
    : shareBulkInvoices(selected);
}

async function handleBulkWhatsApp() {
  const invoices = await getInvoices();
  const selected = invoices.filter((inv) => selectedInvoices.has(inv.id));
  if (selected.length === 1) {
    currentShareInvoice = selected[0];
    shareWhatsApp();
  } else {
    shareBulkInvoices(selected);
  }
}

async function handleBulkDelete() {
  if (
    !confirm(`Delete ${selectedInvoices.size} invoices? This cannot be undone.`)
  )
    return;

  try {
    for (const id of selectedInvoices) {
      await deleteInvoice(id);
    }
    clearSelection();
    await loadHistory();
    showToast(
      "Deleted",
      `${selectedInvoices.size} invoices deleted`,
      "success",
    );
  } catch (error) {
    showToast("Error", "Failed to delete some invoices", "error");
  }
}

function clearSelection() {
  selectedInvoices.clear();
  document
    .querySelectorAll(".invoice-checkbox")
    .forEach((cb) => (cb.checked = false));
  updateBulkActionsVisibility();
}

function toggleBulkActionsExpansion() {
  const secondary = document.getElementById("bulkSecondaryActions");
  const btn = document.getElementById("expandBulkActions");
  if (!secondary || !btn) return;

  const isExpanded = !secondary.classList.contains("hidden");
  if (isExpanded) {
    secondary.classList.add("hidden");
    btn.textContent = "⋯";
    btn.setAttribute("aria-expanded", "false");
  } else {
    secondary.classList.remove("hidden");
    btn.textContent = "✕";
    btn.setAttribute("aria-expanded", "true");
  }
}

async function handleBulkExportPDF() {
  const invoices = await getInvoices();
  const selected = invoices.filter((inv) => selectedInvoices.has(inv.id));
  if (!selected.length) return;

  try {
    showLoading(`Generating ${selected.length} PDFs...`);

    for (let i = 0; i < selected.length; i++) {
      const loading = document.getElementById("loading-message");
      if (loading)
        loading.textContent = `Generating PDF ${i + 1} of ${selected.length}...`;
      await new Promise((resolve) => setTimeout(resolve, 500));
      exportInvoicePDF(selected[i]);
    }

    hideLoading();
    showToast(
      "PDFs Generated",
      `${selected.length} PDFs generated and downloaded`,
      "success",
    );
    clearSelection();
  } catch (error) {
    hideLoading();
    showToast("Error", "Failed to generate some PDFs", "error");
  }
}

function shareBulkInvoices(invoices) {
  const total = invoices.reduce((sum, inv) => {
    return sum + parseFloat((inv.total || "0").replace(/[^\d.-]/g, ""));
  }, 0);

  const currency = invoices[0]?.currency || getCurrency();
  const summary = `*Invoice Summary*

📊 *Total Invoices:* ${invoices.length}
💰 *Grand Total:* ${currency} ${total.toFixed(2)}

📋 *Invoice List:*
${invoices.map((inv) => `• ${inv.invoiceNumber || "INV-" + inv.id}: ${inv.clientName || "No client"} - ${inv.total}`).join("\n")}

📱 _Generated with Invoice Maker_`;

  window.open(
    `https://wa.me/?text=${encodeURIComponent(summary)}`,
    "_blank",
    "noopener,noreferrer",
  );
  showToast("WhatsApp Opened", "Bulk invoice summary shared", "success");
  clearSelection();
}

/* =========================
   17. MONETIZATION - FIXED FOR HTML
========================= */
function initializeMonetization() {
  // Check saved premium status
  const savedPremium = localStorage.getItem("premiumUser");
  isPremiumUser = savedPremium === "true";

  if (isPremiumUser) {
    hideAds();
    hideUsageStats();
    updateUIForPremiumStatus();
  } else {
    showAds();
    showUsageStats();
  }

  setupPremiumModal();
  setupUsageStatsHandlers();

  if (!isPremiumUser) {
    setTimeout(loadAdNetwork, 1000);
  }
}

function setupPremiumModal() {
  document
    .getElementById("closePremiumModal")
    ?.addEventListener("click", closePremiumModal);
  document
    .getElementById("cancelPremium")
    ?.addEventListener("click", closePremiumModal);

  const purchaseBtn = document.getElementById("purchasePremium");
  if (purchaseBtn) {
    purchaseBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (typeof window.getDigitalGoodsService === "function") {
        await purchasePremiumWithGooglePlay();
      } else {
        window.open(
          "https://play.google.com/store/apps/details?id=io.github.evansmunsha.twa",
          "_blank",
        );
        closePremiumModal();
        showToast(
          "Download Required",
          "Premium available in Android app",
          "info",
          6000,
        );
      }
    });
  }

  setupPlatformLinks();
}

function setupPlatformLinks() {
  const playStoreUrl =
    "https://play.google.com/store/apps/details?id=io.github.evansmunsha.twa";
  const playStoreLink = document.getElementById("playStoreLink");

  if (playStoreLink) {
    playStoreLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(playStoreUrl, "_blank");
      closePremiumModal();
      showToast("Redirecting", "Opening Google Play Store...", "info");
    });
  }
}

function openPremiumModal() {
  const modal = document.getElementById("premiumModal");
  if (modal) {
    modal.style.display = "";
    updatePremiumModalForPlatform();
    modal.classList.remove("hidden");
  }
}

function closePremiumModal() {
  document.getElementById("premiumModal")?.classList.add("hidden");
}

function updatePremiumModalForPlatform() {
  const btn = document.getElementById("purchasePremium");
  const heading = document.getElementById("premiumModalHeading");
  const paymentMethod = document.getElementById("paymentMethod");
  const platformMsg = document.getElementById("platformMessage");
  const androidMsg = document.getElementById("androidMessage");
  const webMsg = document.getElementById("webMessage");

  if (platformMsg) platformMsg.classList.remove("hidden");

  if (typeof window.getDigitalGoodsService === "function") {
    if (heading) heading.textContent = "🚀 Unlock Premium Features";
    if (paymentMethod)
      paymentMethod.textContent = "One-time payment via Google Play";
    if (btn) btn.innerHTML = "🚀 Purchase via Google Play - $4.99";
    if (androidMsg) androidMsg.classList.remove("hidden");
    if (webMsg) webMsg.classList.add("hidden");
  } else {
    if (heading) heading.textContent = "📱 Get Premium on Android";
    if (paymentMethod)
      paymentMethod.textContent = "Available on Google Play Store";
    if (btn) btn.innerHTML = "📲 Get Android App";
    if (webMsg) webMsg.classList.remove("hidden");
    if (androidMsg) androidMsg.classList.add("hidden");
  }
}

function showAds() {
  const container = document.getElementById("adContainer");
  if (container) {
    container.classList.remove("hidden");
    loadAdNetwork();
  }
}

function hideAds() {
  document.getElementById("adContainer")?.classList.add("hidden");
}

function loadAdNetwork() {
  if (isPremiumUser) return;

  const adSpace = document.getElementById("adSpace");
  const adIns = adSpace?.querySelector(".adsbygoogle");

  if (!adSpace || !adIns) return;

  // Prevent double loading
  if (adIns.dataset.loaded === "true") return;

  // Ensure layout is ready
  if (adSpace.offsetWidth === 0) {
    setTimeout(loadAdNetwork, 500);
    return;
  }

  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    adIns.dataset.loaded = "true";
    console.log("✅ AdSense loaded successfully");
  } catch (err) {
    console.warn("❌ AdSense failed:", err);
  }
}

window.addEventListener("load", () => {
  setTimeout(loadAdNetwork, 1000);
});

function updateUIForPremiumStatus() {
  const header = document.querySelector(".app-header");
  if (isPremiumUser && header && !header.querySelector(".premium-badge")) {
    const badge = document.createElement("div");
    badge.className = "premium-badge";
    badge.innerHTML = "⭐ PREMIUM";
    header.appendChild(badge);
  }
}

// Ensure exportInvoicePDF exists
if (typeof exportInvoicePDF === "undefined") {
  window.exportInvoicePDF = async function (invoice) {
    const blob = await generatePDFBlob(invoice);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoiceNumber || "invoice"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };
}

/* =========================
   18. USAGE TRACKING
========================= */
function trackUsage(action) {
  const today = new Date().toDateString();
  const month = new Date().toISOString().slice(0, 7);
  let usage = JSON.parse(localStorage.getItem("usage") || "{}");

  if (!usage[month]) usage[month] = {};
  if (!usage[month][today]) usage[month][today] = {};
  usage[month][today][action] = (usage[month][today][action] || 0) + 1;

  localStorage.setItem("usage", JSON.stringify(usage));
}

async function checkUsageLimit() {
  const month = new Date().toISOString().slice(0, 7);
  const usage = JSON.parse(localStorage.getItem("usage") || "{}");

  let count = 0;
  if (usage[month]) {
    for (const day of Object.values(usage[month])) {
      count += day.invoice_saved || 0;
    }
  }

  if (count >= FREE_LIMITS.invoices_per_month) {
    showUsageLimitModal("invoice");
    return false;
  }
  return true;
}

async function checkPDFLimit() {
  const today = new Date().toDateString();
  const month = new Date().toISOString().slice(0, 7);
  const usage = JSON.parse(localStorage.getItem("usage") || "{}");
  const count = usage[month]?.[today]?.pdf_generated || 0;

  if (count >= FREE_LIMITS.pdfs_per_day) {
    showUsageLimitModal("pdf");
    return false;
  }
  return true;
}

function showUsageLimitModal(type) {
  const limits = {
    invoice: `You've reached your monthly limit of ${FREE_LIMITS.invoices_per_month} invoices.`,
    pdf: `You've reached your daily limit of ${FREE_LIMITS.pdfs_per_day} PDF generations.`,
  };

  if (
    confirm(
      `${limits[type]}\n\nUpgrade to Premium for unlimited usage - just $4.99!`,
    )
  ) {
    openPremiumModal();
  }
}

function getUsageStats() {
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toDateString();
  const usage = JSON.parse(localStorage.getItem("usage") || "{}");

  let invoices = 0,
    pdfs = usage[month]?.[today]?.pdf_generated || 0;

  if (usage[month]) {
    for (const day of Object.values(usage[month])) {
      invoices += day.invoice_saved || 0;
    }
  }

  return {
    invoicesThisMonth: invoices,
    pdfsTodayy: pdfs,
    invoiceLimit: FREE_LIMITS.invoices_per_month,
    pdfLimit: FREE_LIMITS.pdfs_per_day,
  };
}

function showUsageStats() {
  document.getElementById("usageStats")?.classList.remove("hidden");
}

function hideUsageStats() {
  document.getElementById("usageStats")?.classList.add("hidden");
}

function updateUsageStatsDisplay() {
  if (isPremiumUser) {
    hideUsageStats();
    return;
  }

  const stats = getUsageStats();

  const invUsage = document.getElementById("invoiceUsage");
  const invProgress = document.getElementById("invoiceProgress");
  if (invUsage)
    invUsage.textContent = `${stats.invoicesThisMonth}/${stats.invoiceLimit}`;
  if (invProgress) {
    const pct = (stats.invoicesThisMonth / stats.invoiceLimit) * 100;
    invProgress.style.width = `${Math.min(pct, 100)}%`;
    invProgress.classList.remove("warning", "danger");
    if (pct >= 80) invProgress.classList.add("danger");
    else if (pct >= 60) invProgress.classList.add("warning");
  }

  const pdfUsage = document.getElementById("pdfUsage");
  const pdfProgress = document.getElementById("pdfProgress");
  if (pdfUsage) pdfUsage.textContent = `${stats.pdfsTodayy}/${stats.pdfLimit}`;
  if (pdfProgress) {
    const pct = (stats.pdfsTodayy / stats.pdfLimit) * 100;
    pdfProgress.style.width = `${Math.min(pct, 100)}%`;
    pdfProgress.classList.remove("warning", "danger");
    if (pct >= 80) pdfProgress.classList.add("danger");
    else if (pct >= 60) pdfProgress.classList.add("warning");
  }
}

function setupUsageStatsHandlers() {
  document
    .getElementById("upgradeFromStats")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      openPremiumModal();
    });

  document.getElementById("viewUsageDetails")?.addEventListener("click", () => {
    const stats = getUsageStats();
    const month = new Date().toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const msg = `📊 Usage Details for ${month}

📄 Invoices: ${stats.invoicesThisMonth} / ${stats.invoiceLimit} (${Math.round((stats.invoicesThisMonth / stats.invoiceLimit) * 100)}%)
📱 PDFs Today: ${stats.pdfsTodayy} / ${stats.pdfLimit} (${Math.round((stats.pdfsTodayy / stats.pdfLimit) * 100)}%)

Upgrade to Premium for unlimited usage!`;

    if (confirm(msg + "\n\nUpgrade now?")) openPremiumModal();
  });
}

/* =========================
   19. KEYBOARD SHORTCUTS
========================= */
function initializeKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      document.getElementById("saveInvoice").click();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      document.getElementById("generatePDF").click();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      if (hasUnsavedChanges && !confirm("Unsaved changes. Start new?")) return;
      resetForm();
    } else if (e.altKey && e.key === "a") {
      e.preventDefault();
      document.getElementById("addItem").click();
    } else if (e.key === "Escape") {
      if (
        !document.getElementById("invoiceModal").classList.contains("hidden")
      ) {
        closeEditModal();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      const search = document.getElementById("searchInvoices");
      if (search) {
        search.focus();
        search.select();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === "w") {
      e.preventDefault();
      if (!validateForm()) {
        showToast("Error", "Complete invoice before sharing", "error");
        return;
      }
      currentShareInvoice = {
        invoiceNumber: document.getElementById("invoiceNumber").value,
        businessName: document.getElementById("businessName").value,
        clientName: document.getElementById("clientName").value || "Client",
        date: document.getElementById("invoiceDate").value,
        time: document.getElementById("invoiceTime").value,
        currency: getCurrency(),
        items: [...items],
        total: totalSpan.textContent,
      };
      shareWhatsApp();
    }
  });

  setTimeout(() => {
    if (!localStorage.getItem("hasSeenShortcuts")) {
      showToast(
        "Keyboard Shortcuts",
        "💡 Ctrl+S=save, Ctrl+P=PDF, Ctrl+W=WhatsApp, Ctrl+N=new, Alt+A=add items",
        "info",
        8000,
      );
      localStorage.setItem("hasSeenShortcuts", "true");
    }
  }, 3000);
}

/* =========================
   20. ACCESSIBILITY
========================= */
function initializeAccessibility() {
  addAriaLabels();
  setupFocusManagement();
  addSkipNavigation();
  setupAriaLiveRegions();
}

function addAriaLabels() {
  const labels = {
    businessName: { label: "Business name required", required: true },
    clientName: { label: "Client name optional" },
    invoiceDate: { label: "Invoice date required", required: true },
    invoiceNumber: { label: "Invoice number auto-generated", readonly: true },
  };

  Object.entries(labels).forEach(([id, props]) => {
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute("aria-label", props.label);
      if (props.required) el.setAttribute("aria-required", "true");
      if (props.readonly) el.setAttribute("aria-readonly", "true");
    }
  });

  document
    .getElementById("addItem")
    ?.setAttribute("aria-label", "Add new item to invoice");
  document
    .getElementById("saveInvoice")
    ?.setAttribute("aria-label", "Save invoice to database");
  document
    .getElementById("generatePDF")
    ?.setAttribute("aria-label", "Generate and download PDF");

  document
    .querySelectorAll(".card")
    .forEach((card) => card.setAttribute("role", "region"));

  const list = document.getElementById("invoiceList");
  if (list) {
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", "Invoice history");
  }
}

function setupFocusManagement() {
  const modal = document.getElementById("invoiceModal");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !modal.classList.contains("hidden")) {
      const focusable = modal.querySelectorAll(
        'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

function addSkipNavigation() {
  const skip = document.createElement("a");
  skip.href = "#main";
  skip.textContent = "Skip to main content";
  skip.className = "skip-link";
  skip.style.cssText =
    "position:absolute;top:-40px;left:6px;background:#007bff;color:white;padding:8px;text-decoration:none;border-radius:4px;z-index:1000;transition:top 0.3s";
  skip.addEventListener("focus", () => (skip.style.top = "6px"));
  skip.addEventListener("blur", () => (skip.style.top = "-40px"));
  document.body.insertBefore(skip, document.body.firstChild);
  document.querySelector("main")?.setAttribute("id", "main");
}

function setupAriaLiveRegions() {
  const announce = document.createElement("div");
  announce.id = "announcements";
  announce.setAttribute("aria-live", "polite");
  announce.setAttribute("aria-atomic", "true");
  announce.style.cssText =
    "position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden";
  document.body.appendChild(announce);

  const originalToast = showToast;
  window.showToast = function (title, message, type, duration) {
    originalToast(title, message, type, duration);
    if (type === "success" || type === "error") {
      announce.textContent = `${title}: ${message}`;
    }
  };
}

/* =========================
   21. FOOTER & ABOUT
========================= */
function initializeFooterHandlers() {
  document.getElementById("aboutApp")?.addEventListener("click", (e) => {
    e.preventDefault();
    alert(`📄 Invoice Maker v1.0

🚀 Professional invoicing made simple!

✨ Features:
• Create unlimited invoices
• Share via WhatsApp & email
• Works completely offline
• Multi-currency support
• Auto-save functionality

🛡️ Privacy-First: All data stored locally on your device

💻 Progressive Web App (PWA)

🇿🇲 Built by Evans Munsha for African entrepreneurs

Contact: evansmunsha@gmail.com | +260963266937`);
  });

  document.getElementById("supportLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (
      confirm(`🛠️ Need Help?

📧 Email: evansmunsha@gmail.com
📱 Phone: +260963266937

Contact support via email?`)
    ) {
      window.open("mailto:evansmunsha@gmail.com?subject=Invoice Maker Support");
    }
  });
}

/* =========================
   22. DEBUGGING TOOLS
========================= */
window.invoiceMakerDebug = {
  checkBillingAPI: async () => {
    console.log("=== BILLING API CHECK ===");
    console.log(
      "1. Digital Goods API:",
      typeof window.getDigitalGoodsService === "function"
        ? "✅ Available"
        : "❌ Not available (not in TWA)",
    );
    console.log(
      "2. Payment Request API:",
      typeof PaymentRequest === "function"
        ? "✅ Available"
        : "❌ Not available",
    );

    if (typeof window.getDigitalGoodsService === "function") {
      try {
        const service = await window.getDigitalGoodsService(
          "https://play.google.com/billing",
        );
        console.log("3. Digital Goods Service: ✅ Connected");

        const details = await service.getDetails(["premium_unlock"]);
        console.log("4. Product lookup result:", details);

        if (details && details.length > 0) {
          const product = details[0];
          console.log("   ✅ Product found!");
          console.log("   - Item ID:", product.itemId);
          console.log("   - Title:", product.title);
          console.log("   - Description:", product.description);
          console.log(
            "   - Price:",
            product.price?.value,
            product.price?.currency,
          );

          // Check Payment Request availability
          const paymentMethods = [
            {
              supportedMethods: "https://play.google.com/billing",
              data: { sku: "premium_unlock" },
            },
          ];
          const paymentDetails = {
            total: {
              label: "Test",
              amount: { currency: "USD", value: "4.99" },
            },
          };
          const request = new PaymentRequest(paymentMethods, paymentDetails);
          const canPay = await request.canMakePayment();
          console.log("5. Can make payment:", canPay ? "✅ YES" : "❌ NO");

          if (canPay) {
            console.log("\n🎉 READY TO ACCEPT PAYMENTS!");
          }
        } else {
          console.log("   ❌ Product 'premium_unlock' not found");
          console.log("   Check Google Play Console:");
          console.log("   - Is the product ID exactly 'premium_unlock'?");
          console.log("   - Is the product status 'Active'?");
          console.log("   - Is the app in the same testing track?");
        }

        // Check existing purchases
        const purchases = await service.listPurchases();
        console.log(
          "6. Existing purchases:",
          purchases.length > 0 ? purchases : "None",
        );
      } catch (err) {
        console.error("   ❌ Error:", err.name, "-", err.message);
      }
    } else {
      console.log("\n⚠️ Not running in Google Play TWA environment");
      console.log("   Digital Goods API requires the app to be:");
      console.log("   - Installed from Google Play Store");
      console.log("   - Running as a Trusted Web Activity (TWA)");
    }
  },

  checkPremiumStatus: () => {
    console.log("=== PREMIUM STATUS ===");
    console.log("isPremiumUser:", isPremiumUser ? "✅ PREMIUM" : "❌ FREE");
    console.log(
      "localStorage:",
      localStorage.getItem("premiumUser") || "NOT SET",
    );
  },

  simulatePurchase: () => {
    localStorage.setItem("premiumUser", "true");
    isPremiumUser = true;
    hideAds();
    updateUIForPremiumStatus();
    showToast("Test", "Premium simulated", "success");
  },

  fullDiagnostic: async () => {
    console.log("\n🔍 FULL DIAGNOSTIC\n");
    await window.invoiceMakerDebug.checkBillingAPI();
    console.log("\n");
    window.invoiceMakerDebug.checkPremiumStatus();
    console.log("\n✅ Complete\n");
  },
};

console.log(
  "💡 TIP: Run 'await invoiceMakerDebug.fullDiagnostic()' to diagnose issues",
);
