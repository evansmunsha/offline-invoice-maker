/*********************************************************
 * OFFLINE INVOICE MAKER – MAIN APP LOGIC
 * Uses IndexedDB (storage.js)
 * Runs fully offline
 *********************************************************/

/* =========================
   GLOBAL STATE
========================= */

let items = [];
let invoiceCounter = 0;
let autoSaveInterval = null;
let hasUnsavedChanges = false;
let selectedInvoices = new Set();
let isPremiumUser = false;

/* =========================
   GOOGLE PLAY BILLING LISTENER
========================= */
// Listen for purchase notifications from Android native app
window.addEventListener("message", (e) => {
  try {
    // Handle both JSON strings and objects
    const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    
    if (data && data.type === "PURCHASE_COMPLETE") {
      // Check if it's the premium product
      if (data.productId === "premium_unlock" || data.productId === "com.evansmunsha.invoicemaker.premium") {
        // Set premium status in localStorage
        localStorage.setItem("premiumUser", "true");
        localStorage.setItem("purchaseMethod", "google_play");
        localStorage.setItem("purchaseDate", new Date().toISOString());
        
        // Update the app's runtime variable
        isPremiumUser = true;
        
        // Update UI immediately
        hideAds();
        updateUIForPremiumStatus();
        
        // Show success message
        showToast(
          "🎉 Premium Unlocked!",
          "Thank you for upgrading! Enjoy unlimited invoices and watermark-free PDFs.",
          "success",
          5000
        );
        
        console.log("Premium purchase confirmed from Android app");
      }
    }
  } catch (err) {
    // Silently ignore malformed messages from other sources
    console.debug("Message received (not a purchase notification):", err);
  }
});

// DOM references
const itemsDiv = document.getElementById("items");
const totalSpan = document.getElementById("total");
const invoiceList = document.getElementById("invoiceList");

/* =========================
   TOAST NOTIFICATION SYSTEM
========================= */

function showToast(title, message, type = "info", duration = 4000) {
  const toastContainer = document.getElementById("toast-container");

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  toast.innerHTML = `
    <div class="toast-header">
      <h4 class="toast-title">${title}</h4>
      <button class="toast-close" onclick="removeToast(this)">&times;</button>
    </div>
    <p class="toast-message">${message}</p>
  `;

  toastContainer.appendChild(toast);

  // Trigger show animation
  setTimeout(() => toast.classList.add("show"), 100);

  // Auto remove
  setTimeout(() => removeToast(toast.querySelector(".toast-close")), duration);
}

function removeToast(closeBtn) {
  const toast = closeBtn.closest(".toast");
  toast.classList.remove("show");
  setTimeout(() => toast.remove(), 300);
}

/* =========================
   LOADING STATES
========================= */

function showLoading(message = "Loading...") {
  const overlay = document.getElementById("loading-overlay");
  const spinner = overlay.querySelector(".loading-spinner p");
  spinner.textContent = message;
  overlay.classList.remove("hidden");
}

function hideLoading() {
  const overlay = document.getElementById("loading-overlay");
  overlay.classList.add("hidden");
}

/* =========================
   FORM VALIDATION
========================= */

function validateField(fieldId, value, rules = {}) {
  const field = document.getElementById(fieldId);
  const errorElement = document.getElementById(fieldId + "Error");

  let isValid = true;
  let errorMessage = "";

  // Required field validation
  if (rules.required && (!value || value.trim() === "")) {
    isValid = false;
    errorMessage = "This field is required";
  }

  // Min length validation
  if (rules.minLength && value && value.length < rules.minLength) {
    isValid = false;
    errorMessage = `Minimum ${rules.minLength} characters required`;
  }

  // Custom validation
  if (rules.custom && value) {
    const customResult = rules.custom(value);
    if (customResult !== true) {
      isValid = false;
      errorMessage = customResult;
    }
  }

  // Update UI
  if (errorElement) {
    errorElement.textContent = errorMessage;
  }

  field.classList.remove("error", "success");
  if (value && value.trim() !== "") {
    field.classList.add(isValid ? "success" : "error");
  }

  return isValid;
}

function validateForm() {
  const businessName = document.getElementById("businessName").value;
  const invoiceDate = document.getElementById("invoiceDate").value;

  let isValid = true;

  // Validate business name
  if (
    !validateField("businessName", businessName, {
      required: true,
      minLength: 2,
    })
  ) {
    isValid = false;
  }

  // Validate invoice date
  if (
    !validateField("invoiceDate", invoiceDate, {
      required: true,
    })
  ) {
    isValid = false;
  }

  // Validate items
  if (items.length === 0) {
    showToast(
      "Validation Error",
      "Please add at least one item to the invoice",
      "error",
    );
    isValid = false;
  }

  // Validate each item
  items.forEach((item, index) => {
    if (!item.name || item.name.trim() === "") {
      showToast("Validation Error", `Item ${index + 1} needs a name`, "error");
      isValid = false;
    }
    if (item.qty <= 0) {
      showToast(
        "Validation Error",
        `Item ${index + 1} quantity must be greater than 0`,
        "error",
      );
      isValid = false;
    }
    if (item.price < 0) {
      showToast(
        "Validation Error",
        `Item ${index + 1} price cannot be negative`,
        "error",
      );
      isValid = false;
    }
  });

  return isValid;
}

/* =========================
   INVOICE NUMBERING
========================= */

function generateInvoiceNumber() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const counter = String(++invoiceCounter).padStart(3, "0");

  return `INV-${year}${month}-${counter}`;
}

async function initializeInvoiceCounter() {
  const invoices = await getInvoices();
  invoiceCounter = invoices.length;
}

/* =========================
   SMART DEFAULTS
========================= */

function setSmartDefaults() {
  // Set today's date
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("invoiceDate").value = today;

  // Set current time
  const now = new Date();
  const timeString = now.toTimeString().slice(0, 5); // HH:MM format
  document.getElementById("invoiceTime").value = timeString;

  // Generate invoice number
  document.getElementById("invoiceNumber").value = generateInvoiceNumber();

  // Load saved business name if available
  const savedBusinessName = localStorage.getItem("businessName");
  if (savedBusinessName) {
    document.getElementById("businessName").value = savedBusinessName;
  }
}

/* =========================
   INITIAL LOAD
========================= */

window.addEventListener("load", async () => {
  await openDB(); // ensure IndexedDB is ready
  await initializeInvoiceCounter(); // set up invoice numbering
  setSmartDefaults(); // set smart defaults
  loadHistory(); // load saved invoices
  addItemRow(); // first item row

  // 🧪 DEV MODE: Simulate premium purchase for testing
  // Remove this block before releasing to production!
  if (location.search.includes("dev_premium=1")) {
    localStorage.setItem("premiumUser", "true");
    isPremiumUser = true;
    console.warn("⚠️ DEV MODE ENABLED: Premium activated via URL parameter");
  }

  // Initialize currency selector with saved preference
  const currencySelect = document.getElementById("currency");
  const savedCurrency = localStorage.getItem("currency") || "ZMW";
  currencySelect.value = savedCurrency;
  calculateTotal();

  // Show welcome message for first-time users
  const hasSeenWelcome = localStorage.getItem("hasSeenWelcome");
  if (!hasSeenWelcome) {
    setTimeout(() => {
      showToast(
        "Welcome!",
        "Welcome to Invoice Maker! Fill in your details and add items to create your first invoice.",
        "success",
        6000,
      );
      localStorage.setItem("hasSeenWelcome", "true");
    }, 1000);
  }

  // Add real-time validation
  setupFormValidation();

  // Setup search and filter after DOM is ready
  setTimeout(() => {
    if (document.getElementById("searchInvoices")) {
      setupSearchAndFilter();
    }
  }, 100);

  // Initialize auto-save and recovery
  initializeAutoSave();
  checkForSavedDraft();

  // Initialize keyboard shortcuts and accessibility
  initializeKeyboardShortcuts();
  initializeAccessibility();

  // Initialize share functionality
  setupShareFunctionality();

  // Initialize bulk actions
  setupBulkActions();

  // Setup select all functionality
  setupSelectAllFunctionality();

  // Initialize monetization features
  initializeMonetization();

  // Update usage stats display
  updateUsageStatsDisplay();

  // Initialize footer handlers
  initializeFooterHandlers();
});

function setupFormValidation() {
  const businessNameField = document.getElementById("businessName");
  const invoiceDateField = document.getElementById("invoiceDate");
  const invoiceTimeField = document.getElementById("invoiceTime");

  businessNameField.addEventListener("blur", () => {
    validateField("businessName", businessNameField.value, {
      required: true,
      minLength: 2,
    });
    // Save business name for future use
    if (businessNameField.value.trim()) {
      localStorage.setItem("businessName", businessNameField.value);
    }
  });

  invoiceDateField.addEventListener("blur", () => {
    validateField("invoiceDate", invoiceDateField.value, { required: true });
  });

  // Time field change handler
  invoiceTimeField.addEventListener("change", () => {
    hasUnsavedChanges = true;
  });
}

/* =========================
   CURRENCY
========================= */

function getCurrency() {
  return document.getElementById("currency").value || "ZMW";
}

document.getElementById("currency").addEventListener("change", (e) => {
  localStorage.setItem("currency", e.target.value);
  calculateTotal();
});

/* =========================
   ITEMS LOGIC
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
    <input
      placeholder="Item name (e.g. Website Design, Consulting)"
      value="${item.name}"
      aria-label="Item name or service description"
      title="Enter the name of the product or service you're charging for">
    <input
      type="number"
      min="1"
      value="${item.qty}"
      aria-label="Quantity"
      placeholder="Qty"
      title="Enter the quantity or number of units">
    <input
      type="number"
      min="0"
      step="0.01"
      value="${item.price}"
      aria-label="Unit price"
      placeholder="0.00"
      title="Enter the price per unit (individual item cost)">
    <button class="danger" aria-label="Remove this item" title="Remove this item from the invoice">✕</button>
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
   ITEM INPUT VALIDATION
========================= */

function validateItemInput(input, value, type) {
  // Remove any existing validation classes
  input.classList.remove("input-valid", "input-warning", "input-error");

  // Clear any existing helper text
  clearItemHelperText(input);

  if (!value || value.trim() === "") {
    if (type === "name") {
      showItemHelperText(
        input,
        "Enter item name (e.g. Consulting, Web Design)",
        "info",
      );
    }
    return;
  }

  switch (type) {
    case "name":
      if (value.length < 2) {
        input.classList.add("input-warning");
        showItemHelperText(
          input,
          "Item name should be more descriptive",
          "warning",
        );
      } else if (value.length > 50) {
        input.classList.add("input-warning");
        showItemHelperText(
          input,
          "Item name is quite long, consider shortening",
          "warning",
        );
      } else {
        input.classList.add("input-valid");
      }
      break;

    case "quantity":
      const qty = parseFloat(value);
      if (qty <= 0) {
        input.classList.add("input-error");
        showItemHelperText(input, "Quantity must be greater than 0", "error");
      } else if (qty > 1000) {
        input.classList.add("input-warning");
        showItemHelperText(
          input,
          "Large quantity - please double-check",
          "warning",
        );
      } else {
        input.classList.add("input-valid");
      }
      break;

    case "price":
      const price = parseFloat(value);
      if (price < 0) {
        input.classList.add("input-error");
        showItemHelperText(input, "Price cannot be negative", "error");
      } else if (price === 0) {
        input.classList.add("input-warning");
        showItemHelperText(input, "Free item - is this correct?", "warning");
      } else if (price > 10000) {
        input.classList.add("input-warning");
        showItemHelperText(
          input,
          "High price - please verify amount",
          "warning",
        );
      } else {
        input.classList.add("input-valid");
      }
      break;
  }
}

function showItemHelperText(input, message, type) {
  const helperId = `helper-${input.getAttribute("aria-label").replace(/\s+/g, "-").toLowerCase()}`;
  let helper = document.getElementById(helperId);

  if (!helper) {
    helper = document.createElement("div");
    helper.id = helperId;
    helper.className = "item-helper-text";
    input.parentNode.appendChild(helper);
  }

  helper.textContent = message;
  helper.className = `item-helper-text helper-${type}`;
  helper.setAttribute("role", "status");
  helper.setAttribute("aria-live", "polite");
}

function clearItemHelperText(input) {
  const helperId = `helper-${input.getAttribute("aria-label").replace(/\s+/g, "-").toLowerCase()}`;
  const helper = document.getElementById(helperId);
  if (helper) {
    helper.remove();
  }
}

/* =========================
   TOTAL CALCULATION
========================= */

function calculateTotal() {
  const currency = document.getElementById("currency").value;
  const total = items.reduce((sum, i) => sum + i.qty * i.price, 0);
  totalSpan.textContent = `${currency} ${total.toFixed(2)}`;

  // Update calculation breakdown
  updateCalculationBreakdown(currency, total);
}

function updateCalculationBreakdown(currency, total) {
  let breakdownElement = document.getElementById("calculation-breakdown");

  if (!breakdownElement) {
    // Create breakdown element if it doesn't exist
    breakdownElement = document.createElement("div");
    breakdownElement.id = "calculation-breakdown";
    breakdownElement.className = "calculation-breakdown";

    const totalElement = document.querySelector(".total");
    if (totalElement) {
      totalElement.appendChild(breakdownElement);
    }
  }

  if (items.length === 0) {
    breakdownElement.innerHTML = "";
    return;
  }

  let breakdownHTML = '<div class="breakdown-title">💡 Calculation:</div>';

  items.forEach((item, index) => {
    if (item.name && item.qty > 0) {
      const itemTotal = item.qty * item.price;
      const itemName =
        item.name.length > 20 ? item.name.substring(0, 20) + "..." : item.name;

      breakdownHTML += `
        <div class="breakdown-item">
          ${itemName}: ${item.qty} × ${currency} ${item.price.toFixed(2)} = ${currency} ${itemTotal.toFixed(2)}
        </div>
      `;
    }
  });

  if (items.length > 1) {
    breakdownHTML += `<div class="breakdown-total"><strong>Total: ${currency} ${total.toFixed(2)}</strong></div>`;
  }

  breakdownElement.innerHTML = breakdownHTML;
}

/* =========================
   SAVE INVOICE
========================= */

document.getElementById("saveInvoice").onclick = async () => {
  // Check usage limits for free users
  if (!isPremiumUser && !(await checkUsageLimit())) {
    return;
  }

  // Validate form before saving
  if (!validateForm()) {
    return;
  }

  const saveBtn = document.getElementById("saveInvoice");
  const originalText = saveBtn.innerHTML;

  try {
    // Show loading state
    saveBtn.classList.add("btn-loading");
    saveBtn.innerHTML = "💾 Saving...";
    saveBtn.disabled = true;

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

    // Track usage for free users
    if (!isPremiumUser) {
      trackUsage("invoice_saved");
      updateUsageStatsDisplay();
    }

    showToast(
      "Success!",
      `Invoice ${invoice.invoiceNumber} has been saved successfully.`,
      "success",
    );

    // Clear draft after successful save
    clearDraft();
    resetForm();
  } catch (error) {
    console.error("Error saving invoice:", error);
    showToast("Error", "Failed to save invoice. Please try again.", "error");
  } finally {
    // Reset button state
    saveBtn.classList.remove("btn-loading");
    saveBtn.innerHTML = originalText;
    saveBtn.disabled = false;
  }
};

/* =========================
   LOAD HISTORY
========================= */

async function loadHistory() {
  const invoices = await getInvoices();
  renderInvoiceList(invoices);
}

function renderInvoiceList(invoices) {
  const invoiceList = document.getElementById("invoiceList");
  invoiceList.innerHTML = "";

  if (!invoices.length) {
    invoiceList.innerHTML = `
      <li class="empty-state">
        <div class="empty-state-icon">📄</div>
        <h3>No invoices yet</h3>
        <p>Create your first invoice to get started!</p>
      </li>
    `;
    return;
  }

  invoices.forEach((inv) => {
    const li = document.createElement("li");

    li.innerHTML = `
      <div class="invoice-select">
        <input type="checkbox" class="invoice-checkbox" data-invoice-id="${inv.id}" aria-label="Select invoice ${inv.invoiceNumber || inv.id}">
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
      </div>
    `;

    // Edit invoice
    li.querySelector("[data-edit]").onclick = () => {
      openEditModal(inv);
    };

    // Generate PDF
    li.querySelector("[data-view]").onclick = () => {
      exportInvoicePDF(inv);
    };

    // Share invoice
    li.querySelector("[data-share]").onclick = () => {
      openShareModal(inv);
    };

    // Quick WhatsApp share
    li.querySelector("[data-whatsapp]").onclick = () => {
      currentShareInvoice = inv;
      shareWhatsApp();
    };

    // Duplicate invoice
    li.querySelector("[data-duplicate]").onclick = () => {
      duplicateInvoice(inv);
    };

    // Delete invoice
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

    // Setup checkbox event listener
    li.querySelector(".invoice-checkbox").addEventListener("change", (e) => {
      const invoiceId = parseInt(e.target.dataset.invoiceId);
      if (e.target.checked) {
        selectedInvoices.add(invoiceId);
      } else {
        selectedInvoices.delete(invoiceId);
      }
      updateBulkActionsVisibility();
    });

    invoiceList.appendChild(li);
  });

  updateBulkActionsVisibility();
}

/* =========================
   PDF EXPORT
========================= */

document.getElementById("generatePDF").onclick = async () => {
  // Check PDF generation limits for free users
  if (!isPremiumUser && !(await checkPDFLimit())) {
    return;
  }

  // Validate form before generating PDF
  if (!validateForm()) {
    return;
  }

  const generateBtn = document.getElementById("generatePDF");
  const originalText = generateBtn.innerHTML;

  try {
    // Show loading state
    showLoading("Generating PDF...");
    generateBtn.classList.add("btn-loading");
    generateBtn.innerHTML = "📄 Generating...";
    generateBtn.disabled = true;

    // Small delay to show loading state
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

    // Track PDF generation for free users
    if (!isPremiumUser) {
      trackUsage("pdf_generated");
      updateUsageStatsDisplay();
    }

    showToast(
      "PDF Generated!",
      "Your invoice PDF has been generated and downloaded.",
      "success",
    );
  } catch (error) {
    console.error("Error generating PDF:", error);
    showToast("Error", "Failed to generate PDF. Please try again.", "error");
  } finally {
    // Reset states
    hideLoading();
    generateBtn.classList.remove("btn-loading");
    generateBtn.innerHTML = originalText;
    generateBtn.disabled = false;
  }
};

/* =========================
   RESET FORM
========================= */

function resetForm() {
  items = [];
  itemsDiv.innerHTML = "";
  addItemRow();
  totalSpan.textContent = "0";

  // Clear form fields but keep business name
  document.getElementById("clientName").value = "";

  // Set new defaults
  setSmartDefaults();

  // Clear any validation states
  document.querySelectorAll(".form-field").forEach((field) => {
    field.classList.remove("error", "success");
  });

  document.querySelectorAll(".error-message").forEach((error) => {
    error.textContent = "";
  });

  showToast("Form Reset", "Ready to create a new invoice!", "info", 2000);

  // Clear any saved draft
  clearDraft();
}

/* =========================
   AUTO-SAVE AND RECOVERY
========================= */

function initializeAutoSave() {
  // Auto-save every 30 seconds
  autoSaveInterval = setInterval(saveDraft, 30000);

  // Save draft when user makes changes
  const formFields = [
    "businessName",
    "clientName",
    "invoiceDate",
    "invoiceTime",
    "currency",
  ];

  formFields.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener("input", () => {
        hasUnsavedChanges = true;
        clearTimeout(field.autoSaveTimeout);
        field.autoSaveTimeout = setTimeout(saveDraft, 2000);
      });
    }
  });

  // Save when user leaves page
  window.addEventListener("beforeunload", (e) => {
    if (hasUnsavedChanges) {
      saveDraft();
      e.preventDefault();
      e.returnValue =
        "You have unsaved changes. Are you sure you want to leave?";
    }
  });
}

function saveDraft() {
  if (!hasUnsavedChanges && items.length === 0) return;

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
  console.log("Draft saved automatically");
}

function checkForSavedDraft() {
  const savedDraft = localStorage.getItem("invoiceDraft");
  if (!savedDraft) return;

  try {
    const draft = JSON.parse(savedDraft);
    const draftAge = Date.now() - draft.timestamp;

    // Only show recovery for drafts less than 24 hours old
    if (draftAge > 24 * 60 * 60 * 1000) {
      localStorage.removeItem("invoiceDraft");
      return;
    }

    const draftDate = new Date(draft.timestamp).toLocaleString();

    setTimeout(() => {
      if (
        confirm(
          `Found unsaved work from ${draftDate}. Would you like to recover it?`,
        )
      ) {
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
    console.error("Error recovering draft:", error);
    localStorage.removeItem("invoiceDraft");
  }
}

function recoverDraft(draft) {
  // Restore form fields
  document.getElementById("businessName").value = draft.businessName || "";
  document.getElementById("clientName").value = draft.clientName || "";
  document.getElementById("invoiceDate").value = draft.invoiceDate || "";
  document.getElementById("invoiceTime").value = draft.invoiceTime || "";
  document.getElementById("currency").value = draft.currency || "ZMW";

  // Restore items
  items = [];
  itemsDiv.innerHTML = "";

  if (draft.items && draft.items.length > 0) {
    draft.items.forEach((item) => addItemRow(item));
  } else {
    addItemRow(); // Add at least one empty row
  }

  calculateTotal();
  hasUnsavedChanges = true;
}

function clearDraft() {
  localStorage.removeItem("invoiceDraft");
  hasUnsavedChanges = false;
}

/* =========================
   KEYBOARD SHORTCUTS
========================= */

function initializeKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + S to save invoice
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      document.getElementById("saveInvoice").click();
      return;
    }

    // Ctrl/Cmd + P to generate PDF
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      document.getElementById("generatePDF").click();
      return;
    }

    // Ctrl/Cmd + N to reset form (new invoice)
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      if (hasUnsavedChanges) {
        if (confirm("You have unsaved changes. Start a new invoice?")) {
          resetForm();
        }
      } else {
        resetForm();
      }
      return;
    }

    // Alt + A to add new item
    if (e.altKey && e.key === "a") {
      e.preventDefault();
      document.getElementById("addItem").click();
      return;
    }

    // Escape to close modals
    if (e.key === "Escape") {
      const modal = document.getElementById("invoiceModal");
      if (!modal.classList.contains("hidden")) {
        closeEditModal();
      }
      return;
    }

    // Ctrl/Cmd + F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      const searchInput = document.getElementById("searchInvoices");
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // Ctrl/Cmd + W to share via WhatsApp
    if ((e.ctrlKey || e.metaKey) && e.key === "w") {
      e.preventDefault();
      if (!validateForm()) {
        showToast(
          "Error",
          "Please complete the invoice before sharing",
          "error",
        );
        return;
      }
      const invoiceData = {
        invoiceNumber: document.getElementById("invoiceNumber").value,
        businessName: document.getElementById("businessName").value,
        clientName: document.getElementById("clientName").value || "Client",
        date: document.getElementById("invoiceDate").value,
        time: document.getElementById("invoiceTime").value,
        currency: getCurrency(),
        items: [...items],
        total: totalSpan.textContent,
      };
      currentShareInvoice = invoiceData;
      shareWhatsApp();
      return;
    }
  });

  // Show keyboard shortcuts on first load
  setTimeout(() => {
    const hasSeenShortcuts = localStorage.getItem("hasSeenShortcuts");
    if (!hasSeenShortcuts) {
      showToast(
        "Keyboard Shortcuts",
        "💡 Tip: Use Ctrl+S to save, Ctrl+P for PDF, Ctrl+W for WhatsApp, Ctrl+N for new invoice, Alt+A to add items",
        "info",
        8000,
      );
      localStorage.setItem("hasSeenShortcuts", "true");
    }
  }, 3000);
}

/* =========================
   ACCESSIBILITY IMPROVEMENTS
========================= */

function initializeAccessibility() {
  // Add ARIA labels and roles
  addAriaLabels();

  // Improve focus management
  setupFocusManagement();

  // Add skip navigation
  addSkipNavigation();

  // Announce dynamic content changes
  setupAriaLiveRegions();
}

function addAriaLabels() {
  // Add aria-labels to form fields
  const businessName = document.getElementById("businessName");
  if (businessName) {
    businessName.setAttribute("aria-label", "Business name required");
    businessName.setAttribute("aria-required", "true");
  }

  const clientName = document.getElementById("clientName");
  if (clientName) {
    clientName.setAttribute("aria-label", "Client name optional");
  }

  const invoiceDate = document.getElementById("invoiceDate");
  if (invoiceDate) {
    invoiceDate.setAttribute("aria-label", "Invoice date required");
    invoiceDate.setAttribute("aria-required", "true");
  }

  const invoiceNumber = document.getElementById("invoiceNumber");
  if (invoiceNumber) {
    invoiceNumber.setAttribute("aria-label", "Invoice number auto-generated");
    invoiceNumber.setAttribute("aria-readonly", "true");
  }

  // Add aria-labels to buttons
  const addItemBtn = document.getElementById("addItem");
  if (addItemBtn) {
    addItemBtn.setAttribute("aria-label", "Add new item to invoice");
  }

  const saveBtn = document.getElementById("saveInvoice");
  if (saveBtn) {
    saveBtn.setAttribute("aria-label", "Save invoice to database");
  }

  const pdfBtn = document.getElementById("generatePDF");
  if (pdfBtn) {
    pdfBtn.setAttribute("aria-label", "Generate and download PDF");
  }

  // Add role to main sections
  const cards = document.querySelectorAll(".card");
  cards.forEach((card) => {
    card.setAttribute("role", "region");
  });

  // Add role to invoice list
  const invoiceList = document.getElementById("invoiceList");
  if (invoiceList) {
    invoiceList.setAttribute("role", "list");
    invoiceList.setAttribute("aria-label", "Invoice history");
  }
}

function setupFocusManagement() {
  // Trap focus in modal
  const modal = document.getElementById("invoiceModal");
  const focusableElements = modal.querySelectorAll(
    'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !modal.classList.contains("hidden")) {
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  });

  // Focus first input when modal opens
  const originalOpenEditModal = openEditModal;
  window.openEditModal = function (invoice) {
    originalOpenEditModal(invoice);
    setTimeout(() => {
      const firstInput = modal.querySelector("input:not([readonly])");
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
  };
}

function addSkipNavigation() {
  const skipLink = document.createElement("a");
  skipLink.href = "#main";
  skipLink.textContent = "Skip to main content";
  skipLink.className = "skip-link";
  skipLink.style.cssText = `
    position: absolute;
    top: -40px;
    left: 6px;
    background: #007bff;
    color: white;
    padding: 8px;
    text-decoration: none;
    border-radius: 4px;
    z-index: 1000;
    transition: top 0.3s;
  `;

  skipLink.addEventListener("focus", () => {
    skipLink.style.top = "6px";
  });

  skipLink.addEventListener("blur", () => {
    skipLink.style.top = "-40px";
  });

  document.body.insertBefore(skipLink, document.body.firstChild);

  // Add id to main content
  const main = document.querySelector("main");
  if (main) {
    main.setAttribute("id", "main");
  }
}

function setupAriaLiveRegions() {
  // Create announcement region for screen readers
  const announcements = document.createElement("div");
  announcements.id = "announcements";
  announcements.setAttribute("aria-live", "polite");
  announcements.setAttribute("aria-atomic", "true");
  announcements.style.cssText = `
    position: absolute;
    left: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  `;
  document.body.appendChild(announcements);

  // Announce important actions
  const originalShowToast = showToast;
  window.showToast = function (title, message, type, duration) {
    originalShowToast(title, message, type, duration);

    // Announce to screen readers
    if (type === "success" || type === "error") {
      announcements.textContent = `${title}: ${message}`;
    }
  };
}

/* =========================
   SHARE FUNCTIONALITY
========================= */

let currentShareInvoice = null;

function setupShareFunctionality() {
  // Share invoice button
  document.getElementById("shareInvoice").addEventListener("click", () => {
    if (!validateForm()) {
      showToast("Error", "Please complete the invoice before sharing", "error");
      return;
    }

    const invoiceData = {
      invoiceNumber: document.getElementById("invoiceNumber").value,
      businessName: document.getElementById("businessName").value,
      clientName: document.getElementById("clientName").value || "Client",
      date: document.getElementById("invoiceDate").value,
      time: document.getElementById("invoiceTime").value,
      currency: getCurrency(),
      items: [...items],
      total: totalSpan.textContent,
    };

    openShareModal(invoiceData);
  });

  // Share modal event listeners
  document
    .getElementById("closeShareModal")
    .addEventListener("click", closeShareModal);
  document
    .getElementById("closeShareModalBtn")
    .addEventListener("click", closeShareModal);

  // Share options
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

  // Close modal on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const shareModal = document.getElementById("shareModal");
      if (!shareModal.classList.contains("hidden")) {
        closeShareModal();
      }
    }
  });
}

function openShareModal(invoice) {
  currentShareInvoice = invoice;

  // Generate share link
  const shareData = btoa(JSON.stringify(invoice));
  const shareUrl = `${window.location.origin}${window.location.pathname}#share=${shareData}`;
  document.getElementById("shareLink").value = shareUrl;

  // Load saved WhatsApp number if available
  const savedNumber = localStorage.getItem("lastWhatsAppNumber");
  if (savedNumber) {
    document.getElementById("whatsappNumber").value = savedNumber;
  }

  // Setup WhatsApp number validation
  setupWhatsAppValidation();

  // Show modal
  document.getElementById("shareModal").classList.remove("hidden");

  // Focus first share option
  setTimeout(() => {
    document.getElementById("shareNative").focus();
  }, 100);
}

function closeShareModal() {
  document.getElementById("shareModal").classList.add("hidden");
  currentShareInvoice = null;
}

async function shareNative() {
  if (!navigator.share) {
    showToast(
      "Not Supported",
      "Native sharing is not supported on this device",
      "warning",
    );
    return;
  }

  try {
    // Generate PDF blob for sharing
    const pdfBlob = await generatePDFBlob(currentShareInvoice);
    const file = new File(
      [pdfBlob],
      `${currentShareInvoice.invoiceNumber || "invoice"}.pdf`,
      {
        type: "application/pdf",
      },
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
      console.error("Share failed:", error);
      showToast("Error", "Failed to share invoice", "error");
    }
  }
}

async function sharePDF() {
  try {
    showLoading("Generating PDF for sharing...");

    // Generate PDF and trigger download
    exportInvoicePDF(currentShareInvoice);

    hideLoading();
    showToast(
      "PDF Generated",
      "PDF has been downloaded. You can now share it manually.",
      "success",
    );
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
${currentShareInvoice.items.map((item) => `- ${item.name}: ${item.qty} x ${item.price} = ${(item.qty * item.price).toFixed(2)}`).join("\n")}

Best regards`;

  const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  try {
    window.location.href = mailtoLink;
    showToast(
      "Email Client Opened",
      "Your email client should open with the invoice details",
      "info",
    );
    closeShareModal();
  } catch (error) {
    showToast("Error", "Failed to open email client", "error");
  }
}

function shareWhatsApp() {
  const message = formatWhatsAppMessage(currentShareInvoice);
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;

  try {
    // Open WhatsApp in a new window/tab
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");

    showToast(
      "WhatsApp Opened",
      "WhatsApp should open with the invoice details ready to send",
      "success",
    );
    if (
      document.getElementById("shareModal") &&
      !document.getElementById("shareModal").classList.contains("hidden")
    ) {
      closeShareModal();
    }
  } catch (error) {
    showToast("Error", "Failed to open WhatsApp", "error");
  }
}

function sendWhatsAppDirect() {
  const phoneNumber = document.getElementById("whatsappNumber").value.trim();

  if (!phoneNumber) {
    showToast(
      "Phone Number Required",
      "Please enter a phone number",
      "warning",
    );
    return;
  }

  // Clean phone number (remove spaces, dashes, parentheses)
  const cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, "");

  // Validate phone number format (basic validation)
  if (!/^\+?[\d]{10,15}$/.test(cleanNumber)) {
    showToast("Invalid Number", "Please enter a valid phone number", "error");
    return;
  }

  const message = formatWhatsAppMessage(currentShareInvoice);

  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;

  try {
    // Open WhatsApp with specific contact
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");

    showToast(
      "WhatsApp Opened",
      `Invoice sent to ${phoneNumber} via WhatsApp`,
      "success",
    );

    // Save the phone number for future use
    localStorage.setItem("lastWhatsAppNumber", phoneNumber);

    closeShareModal();
  } catch (error) {
    showToast("Error", "Failed to open WhatsApp", "error");
  }
}

function formatWhatsAppMessage(invoice) {
  return `*Invoice ${invoice.invoiceNumber}*

🏢 *Business:* ${invoice.businessName}
👤 *Client:* ${invoice.clientName}
📅 *Date:* ${new Date(invoice.date).toLocaleDateString()}${invoice.time ? " ⏰ " + invoice.time : ""}
💰 *Total:* ${invoice.total}

📋 *Items:*
${invoice.items.map((item, index) => `${index + 1}. ${item.name}: ${item.qty} × ${item.price} = *${(item.qty * item.price).toFixed(2)}*`).join("\n")}

📱 _Generated with Invoice Maker_`;
}

function isWhatsAppAvailable() {
  // Check if WhatsApp is available on the device
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobile =
    /android|iPhone|iPad|iPod|blackberry|iemobile|opera mini/i.test(userAgent);

  return {
    isMobile,
    hasWhatsApp:
      isMobile ||
      navigator.platform.toLowerCase().includes("win") ||
      navigator.platform.toLowerCase().includes("mac") ||
      navigator.platform.toLowerCase().includes("linux"),
  };
}

function setupWhatsAppValidation() {
  const whatsappInput = document.getElementById("whatsappNumber");
  const sendButton = document.getElementById("sendWhatsAppDirect");

  if (!whatsappInput || !sendButton) return;

  whatsappInput.addEventListener("input", (e) => {
    const phoneNumber = e.target.value.trim();
    const cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, "");

    // Validate phone number format
    const isValid =
      /^\+?[\d]{10,15}$/.test(cleanNumber) && phoneNumber.length > 0;

    // Update input styling
    whatsappInput.classList.remove("valid", "invalid");
    if (phoneNumber.length > 0) {
      whatsappInput.classList.add(isValid ? "valid" : "invalid");
    }

    // Enable/disable send button
    sendButton.disabled = !isValid;

    // Update placeholder text based on validation
    if (phoneNumber.length > 0 && !isValid) {
      whatsappInput.title = "Please enter a valid phone number (10-15 digits)";
    } else {
      whatsappInput.title =
        "Enter phone number with country code (e.g., +1234567890)";
    }
  });

  // Format phone number on blur
  whatsappInput.addEventListener("blur", (e) => {
    let phoneNumber = e.target.value.trim();
    if (phoneNumber && !phoneNumber.startsWith("+")) {
      // Add + if not present and number looks valid
      const cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, "");
      if (/^[\d]{10,15}$/.test(cleanNumber)) {
        e.target.value = "+" + cleanNumber;
        // Trigger input event to revalidate
        e.target.dispatchEvent(new Event("input"));
      }
    }
  });

  // Initial validation
  sendButton.disabled = true;
}

async function shareData() {
  const textData = `Invoice ${currentShareInvoice.invoiceNumber}

Business: ${currentShareInvoice.businessName}
Client: ${currentShareInvoice.clientName}
Date: ${new Date(currentShareInvoice.date).toLocaleDateString()}${currentShareInvoice.time ? " at " + currentShareInvoice.time : ""}
Total: ${currentShareInvoice.total}

Items:
${currentShareInvoice.items.map((item) => `- ${item.name}: ${item.qty} x ${item.price} = ${(item.qty * item.price).toFixed(2)}`).join("\n")}`;

  try {
    await navigator.clipboard.writeText(textData);
    showToast("Copied", "Invoice details copied to clipboard", "success");
    closeShareModal();
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = textData;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);

    showToast("Copied", "Invoice details copied to clipboard", "success");
    closeShareModal();
  }
}

async function copyShareLink() {
  const shareLink = document.getElementById("shareLink").value;
  const copyBtn = document.getElementById("copyLink");

  try {
    await navigator.clipboard.writeText(shareLink);

    // Visual feedback
    copyBtn.classList.add("success");
    copyBtn.textContent = "✓ Copied!";

    setTimeout(() => {
      copyBtn.classList.remove("success");
      copyBtn.textContent = "📋 Copy";
    }, 2000);

    showToast("Link Copied", "Share link copied to clipboard", "success");
  } catch (error) {
    // Fallback for older browsers
    const shareInput = document.getElementById("shareLink");
    shareInput.select();
    document.execCommand("copy");

    copyBtn.classList.add("success");
    copyBtn.textContent = "✓ Copied!";

    setTimeout(() => {
      copyBtn.classList.remove("success");
      copyBtn.textContent = "📋 Copy";
    }, 2000);

    showToast("Link Copied", "Share link copied to clipboard", "success");
  }
}

async function generatePDFBlob(invoice) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof window.jspdf === "undefined") {
        reject(new Error("PDF library not loaded"));
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      // Use the existing PDF generation logic but return blob
      const templateSelect = document.getElementById("template");
      const template = templateSelect ? templateSelect.value : "simple";

      doc.setFontSize(16);
      doc.setFont(undefined, "bold");

      let y = 20;

      if (template === "boxed") {
        doc.rect(10, 10, 190, 270, "S");
        y = 25;
      }

      // Header
      doc.text("INVOICE", 105, y, { align: "center" });
      doc.setFontSize(12);
      doc.setFont(undefined, "normal");

      y += 15;

      // Invoice Number
      if (invoice.invoiceNumber) {
        doc.setFont(undefined, "bold");
        doc.text(invoice.invoiceNumber, 105, y, { align: "center" });
        doc.setFont(undefined, "normal");
      }

      y += 20;

      // Business Information
      doc.setFont(undefined, "bold");
      doc.text("From:", 20, y);
      doc.setFont(undefined, "normal");
      y += 8;
      doc.text(invoice.businessName || "Business Name", 20, y);

      y += 15;

      // Client Information
      doc.setFont(undefined, "bold");
      doc.text("To:", 20, y);
      doc.setFont(undefined, "normal");
      y += 8;
      doc.text(invoice.clientName || "Client Name", 20, y);

      y += 15;

      // Invoice Date and Time
      doc.setFont(undefined, "bold");
      doc.text("Date:", 20, y);
      doc.setFont(undefined, "normal");
      const dateTimeText =
        new Date(invoice.date).toLocaleDateString() +
        (invoice.time ? ` at ${invoice.time}` : "");
      doc.text(dateTimeText, 60, y);

      y += 20;

      // Items Header
      doc.setFont(undefined, "bold");
      doc.text("Description", 20, y);
      doc.text("Qty", 120, y);
      doc.text("Price", 140, y);
      doc.text("Total", 170, y);
      doc.line(20, y + 2, 190, y + 2);

      y += 10;
      doc.setFont(undefined, "normal");

      // Items
      invoice.items.forEach((item) => {
        const itemTotal = item.qty * item.price;
        const itemName =
          item.name.length > 25
            ? item.name.substring(0, 25) + "..."
            : item.name;

        doc.text(itemName, 20, y);
        doc.text(item.qty.toString(), 120, y);
        doc.text(`${item.price.toFixed(2)}`, 140, y);
        doc.text(`${itemTotal.toFixed(2)}`, 170, y);

        y += 8;
      });

      y += 10;

      // Total
      doc.line(120, y - 5, 190, y - 5);
      doc.setFont(undefined, "bold");
      doc.setFontSize(14);
      doc.text("TOTAL:", 140, y);
      doc.text(invoice.total, 170, y);

      // Convert to blob
      const pdfBlob = doc.output("blob");
      resolve(pdfBlob);
    } catch (error) {
      reject(error);
    }
  });
}

// Handle shared invoice links on page load
window.addEventListener("load", () => {
  // ... existing load code ...

  // Check for shared invoice in URL
  const hash = window.location.hash;
  if (hash.startsWith("#share=")) {
    try {
      const shareData = hash.substring(7);
      const sharedInvoice = JSON.parse(atob(shareData));

      // Load shared invoice data
      setTimeout(() => {
        loadSharedInvoice(sharedInvoice);
      }, 1000);
    } catch (error) {
      console.error("Failed to load shared invoice:", error);
    }
  }
});

function loadSharedInvoice(invoice) {
  // Load invoice data into form
  document.getElementById("businessName").value = invoice.businessName || "";
  document.getElementById("clientName").value = invoice.clientName || "";
  document.getElementById("invoiceDate").value = invoice.date || "";
  document.getElementById("invoiceTime").value = invoice.time || "";
  document.getElementById("invoiceNumber").value = invoice.invoiceNumber || "";

  if (invoice.currency) {
    document.getElementById("currency").value = invoice.currency;
  }

  // Load items
  items = [];
  itemsDiv.innerHTML = "";

  if (invoice.items && invoice.items.length > 0) {
    invoice.items.forEach((item) => addItemRow(item));
  } else {
    addItemRow();
  }

  calculateTotal();

  showToast(
    "Shared Invoice Loaded",
    `Invoice ${invoice.invoiceNumber} has been loaded from shared link`,
    "info",
    5000,
  );

  // Clear the hash to clean up URL
  setTimeout(() => {
    window.history.replaceState({}, document.title, window.location.pathname);
  }, 1000);
}

/* =========================
   SEARCH AND FILTER
========================= */

function setupSearchAndFilter() {
  const searchInput = document.getElementById("searchInvoices");
  const sortSelect = document.getElementById("sortBy");

  searchInput.addEventListener("input", filterInvoices);
  sortSelect.addEventListener("change", filterInvoices);
}

async function filterInvoices() {
  const searchTerm = document
    .getElementById("searchInvoices")
    .value.toLowerCase();
  const sortBy = document.getElementById("sortBy").value;

  let invoices = await getInvoices();

  // Filter by search term
  if (searchTerm) {
    invoices = invoices.filter(
      (inv) =>
        (inv.clientName || "").toLowerCase().includes(searchTerm) ||
        (inv.businessName || "").toLowerCase().includes(searchTerm) ||
        (inv.invoiceNumber || "").toLowerCase().includes(searchTerm),
    );
  }

  // Sort invoices
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

/* =========================
   EDIT INVOICE MODAL
========================= */

let currentEditingInvoice = null;
let editItems = [];

function openEditModal(invoice) {
  currentEditingInvoice = invoice;
  editItems = [...invoice.items];

  // Populate modal fields
  document.getElementById("editInvoiceNumber").value =
    invoice.invoiceNumber || "INV-" + invoice.id;
  document.getElementById("editBusinessName").value =
    invoice.businessName || "";
  document.getElementById("editClientName").value = invoice.clientName || "";
  document.getElementById("editDate").value = invoice.date || "";
  document.getElementById("editTime").value = invoice.time || "";

  renderEditItems();
  calculateEditTotal();

  // Show modal
  document.getElementById("invoiceModal").classList.remove("hidden");
}

function renderEditItems() {
  const editItemsDiv = document.getElementById("editItems");
  editItemsDiv.innerHTML = "";

  editItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "edit-item-row";

    row.innerHTML = `
      <input
        type="text"
        value="${item.name}"
        placeholder="Item name (e.g. Consulting Service, Product)"
        aria-label="Item name or service description"
        title="Enter the name of the product or service you're charging for">
      <input
        type="number"
        value="${item.qty}"
        min="1"
        placeholder="Qty"
        aria-label="Quantity"
        title="Enter the quantity or number of units">
      <input
        type="number"
        value="${item.price}"
        min="0"
        step="0.01"
        placeholder="0.00"
        aria-label="Unit price"
        title="Enter the price per unit (individual item cost)">
      <button
        type="button"
        class="danger"
        aria-label="Remove this item"
        title="Remove this item from the invoice">✕</button>
    `;

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

    editItemsDiv.appendChild(row);
  });
}

function calculateEditTotal() {
  const currency = getCurrency();
  const total = editItems.reduce((sum, item) => sum + item.qty * item.price, 0);
  document.getElementById("editTotal").textContent =
    `${currency} ${total.toFixed(2)}`;

  // Update edit calculation breakdown
  updateEditCalculationBreakdown(currency, total);
}

function updateEditCalculationBreakdown(currency, total) {
  let breakdownElement = document.getElementById("edit-calculation-breakdown");

  if (!breakdownElement) {
    // Create breakdown element if it doesn't exist
    breakdownElement = document.createElement("div");
    breakdownElement.id = "edit-calculation-breakdown";
    breakdownElement.className = "calculation-breakdown";

    const totalElement = document.querySelector("#editTotal").parentNode;
    if (totalElement) {
      totalElement.appendChild(breakdownElement);
    }
  }

  if (editItems.length === 0) {
    breakdownElement.innerHTML = "";
    return;
  }

  let breakdownHTML = '<div class="breakdown-title">💡 Calculation:</div>';

  editItems.forEach((item, index) => {
    if (item.name && item.qty > 0) {
      const itemTotal = item.qty * item.price;
      const itemName =
        item.name.length > 20 ? item.name.substring(0, 20) + "..." : item.name;

      breakdownHTML += `
        <div class="breakdown-item">
          ${itemName}: ${item.qty} × ${currency} ${item.price.toFixed(2)} = ${currency} ${itemTotal.toFixed(2)}
        </div>
      `;
    }
  });

  if (editItems.length > 1) {
    breakdownHTML += `<div class="breakdown-total"><strong>Total: ${currency} ${total.toFixed(2)}</strong></div>`;
  }

  breakdownElement.innerHTML = breakdownHTML;
}

// Event listeners for edit modal
window.addEventListener("load", () => {
  // ... existing load code ...

  // Setup search and filter
  setTimeout(() => {
    setupSearchAndFilter();
  }, 100);

  // Edit modal event listeners
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
      const updatedInvoice = {
        ...currentEditingInvoice,
        businessName: document.getElementById("editBusinessName").value,
        clientName: document.getElementById("editClientName").value,
        date: document.getElementById("editDate").value,
        time: document.getElementById("editTime").value,
        items: [...editItems],
        total: document.getElementById("editTotal").textContent,
      };

      await saveInvoice(updatedInvoice);
      await loadHistory();
      closeEditModal();
      showToast("Updated", "Invoice updated successfully", "success");
    } catch (error) {
      showToast("Error", "Failed to update invoice", "error");
    }
  };

  document.getElementById("duplicateInvoice").onclick = () => {
    duplicateInvoiceFromModal();
  };

  document.getElementById("cancelEdit").onclick = closeEditModal;
  document.getElementById("closeModal").onclick = closeEditModal;
});

function closeEditModal() {
  document.getElementById("invoiceModal").classList.add("hidden");
  currentEditingInvoice = null;
  editItems = [];
}

function duplicateInvoice(invoice) {
  // Load invoice data into main form
  document.getElementById("businessName").value = invoice.businessName || "";
  document.getElementById("clientName").value = invoice.clientName || "";

  // Clear existing items and add invoice items
  items = [];
  itemsDiv.innerHTML = "";

  invoice.items.forEach((item) => {
    addItemRow(item);
  });

  // Set new defaults
  setSmartDefaults();

  showToast(
    "Duplicated",
    "Invoice data loaded. You can modify and save as new invoice.",
    "info",
    5000,
  );

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function duplicateInvoiceFromModal() {
  const invoiceData = {
    businessName: document.getElementById("editBusinessName").value,
    clientName: document.getElementById("editClientName").value,
    items: [...editItems],
  };

  closeEditModal();
  duplicateInvoice(invoiceData);
}

/* =========================
   BULK ACTIONS
========================= */

function setupBulkActions() {
  // Bulk share button
  document
    .getElementById("bulkShare")
    ?.addEventListener("click", handleBulkShare);

  // Bulk WhatsApp button
  document
    .getElementById("bulkWhatsApp")
    ?.addEventListener("click", handleBulkWhatsApp);

  // Bulk delete button
  document
    .getElementById("bulkDelete")
    ?.addEventListener("click", handleBulkDelete);

  // Clear selection button
  document
    .getElementById("clearSelection")
    ?.addEventListener("click", clearSelection);

  // Bulk export PDF button
  document
    .getElementById("bulkExportPDF")
    ?.addEventListener("click", handleBulkExportPDF);

  // Expand bulk actions button
  document
    .getElementById("expandBulkActions")
    ?.addEventListener("click", toggleBulkActionsExpansion);
}

function setupSelectAllFunctionality() {
  const selectAllCheckbox = document.getElementById("selectAllInvoices");
  if (!selectAllCheckbox) return;

  selectAllCheckbox.addEventListener("change", (e) => {
    const invoiceCheckboxes = document.querySelectorAll(".invoice-checkbox");
    const isChecked = e.target.checked;

    invoiceCheckboxes.forEach((checkbox) => {
      checkbox.checked = isChecked;
      const invoiceId = parseInt(checkbox.dataset.invoiceId);

      if (isChecked) {
        selectedInvoices.add(invoiceId);
      } else {
        selectedInvoices.delete(invoiceId);
      }
    });

    updateBulkActionsVisibility();
    updateSelectAllState();
  });
}

function updateBulkActionsVisibility() {
  const bulkActions = document.getElementById("bulkActions");
  const selectedCount = document.getElementById("selectedCount");

  if (!bulkActions || !selectedCount) return;

  if (selectedInvoices.size > 0) {
    bulkActions.classList.remove("hidden");
    selectedCount.textContent = selectedInvoices.size;
  } else {
    bulkActions.classList.add("hidden");
    // Reset expanded state when hiding
    const secondaryActions = document.getElementById("bulkSecondaryActions");
    const expandBtn = document.getElementById("expandBulkActions");
    if (secondaryActions && expandBtn) {
      secondaryActions.classList.add("hidden");
      expandBtn.textContent = "⋯";
      expandBtn.setAttribute("aria-expanded", "false");
    }
  }

  updateSelectAllState();
}

function updateSelectAllState() {
  const selectAllCheckbox = document.getElementById("selectAllInvoices");
  const invoiceCheckboxes = document.querySelectorAll(".invoice-checkbox");

  if (!selectAllCheckbox || invoiceCheckboxes.length === 0) return;

  const checkedCount = document.querySelectorAll(
    ".invoice-checkbox:checked",
  ).length;

  if (checkedCount === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedCount === invoiceCheckboxes.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

async function handleBulkShare() {
  const invoices = await getInvoices();
  const selectedInvoiceData = invoices.filter((inv) =>
    selectedInvoices.has(inv.id),
  );

  if (selectedInvoiceData.length === 1) {
    // Single invoice - open regular share modal
    openShareModal(selectedInvoiceData[0]);
  } else {
    // Multiple invoices - create summary
    shareBulkInvoices(selectedInvoiceData);
  }
}

async function handleBulkWhatsApp() {
  const invoices = await getInvoices();
  const selectedInvoiceData = invoices.filter((inv) =>
    selectedInvoices.has(inv.id),
  );

  if (selectedInvoiceData.length === 1) {
    // Single invoice
    currentShareInvoice = selectedInvoiceData[0];
    shareWhatsApp();
  } else {
    // Multiple invoices
    shareBulkWhatsApp(selectedInvoiceData);
  }
}

async function handleBulkDelete() {
  if (
    !confirm(
      `Delete ${selectedInvoices.size} selected invoices? This cannot be undone.`,
    )
  ) {
    return;
  }

  try {
    for (const invoiceId of selectedInvoices) {
      await deleteInvoice(invoiceId);
    }

    clearSelection();
    await loadHistory();
    showToast(
      "Deleted",
      `${selectedInvoices.size} invoices deleted successfully`,
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
  const secondaryActions = document.getElementById("bulkSecondaryActions");
  const expandBtn = document.getElementById("expandBulkActions");

  if (!secondaryActions || !expandBtn) return;

  const isExpanded = !secondaryActions.classList.contains("hidden");

  if (isExpanded) {
    secondaryActions.classList.add("hidden");
    expandBtn.textContent = "⋯";
    expandBtn.setAttribute("aria-expanded", "false");
  } else {
    secondaryActions.classList.remove("hidden");
    expandBtn.textContent = "✕";
    expandBtn.setAttribute("aria-expanded", "true");
  }
}

async function handleBulkExportPDF() {
  const invoices = await getInvoices();
  const selectedInvoiceData = invoices.filter((inv) =>
    selectedInvoices.has(inv.id),
  );

  if (selectedInvoiceData.length === 0) return;

  try {
    showLoading(`Generating ${selectedInvoiceData.length} PDFs...`);

    // Generate PDFs for each selected invoice
    for (let i = 0; i < selectedInvoiceData.length; i++) {
      const invoice = selectedInvoiceData[i];

      // Update loading message
      const loadingMessage = document.getElementById("loading-message");
      if (loadingMessage) {
        loadingMessage.textContent = `Generating PDF ${i + 1} of ${selectedInvoiceData.length}...`;
      }

      // Small delay to show progress
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Generate PDF
      exportInvoicePDF(invoice);
    }

    hideLoading();
    showToast(
      "PDFs Generated",
      `${selectedInvoiceData.length} PDFs have been generated and downloaded`,
      "success",
    );
    clearSelection();
  } catch (error) {
    hideLoading();
    showToast("Error", "Failed to generate some PDFs", "error");
  }
}

function shareBulkInvoices(invoices) {
  const totalAmount = invoices.reduce((sum, inv) => {
    const amount = parseFloat((inv.total || "0").replace(/[^\d.-]/g, ""));
    return sum + amount;
  }, 0);

  const currency = invoices[0]?.currency || getCurrency();

  const summary = `*Invoice Summary*

📊 *Total Invoices:* ${invoices.length}
💰 *Grand Total:* ${currency} ${totalAmount.toFixed(2)}

📋 *Invoice List:*
${invoices.map((inv) => `• ${inv.invoiceNumber || "INV-" + inv.id}: ${inv.clientName || "No client"} - ${inv.total}`).join("\n")}

📱 _Generated with Invoice Maker_`;

  const encodedMessage = encodeURIComponent(summary);
  const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;

  try {
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    showToast(
      "WhatsApp Opened",
      "Bulk invoice summary shared to WhatsApp",
      "success",
    );
    clearSelection();
  } catch (error) {
    showToast("Error", "Failed to open WhatsApp", "error");
  }
}

function shareBulkWhatsApp(invoices) {
  shareBulkInvoices(invoices);
}

/* =========================
   MONETIZATION SYSTEM
========================= */

async function initializeMonetization() {
  // Temporarily disabled: All users see ads until Google Play billing is fixed
  isPremiumUser = false;
  
  // Always show ads for all users
  showAds();
  showUsageStats();

  // Setup usage stats handlers
  setupUsageStatsHandlers();
}

function showAds() {
  const adContainer = document.getElementById("adContainer");
  if (adContainer) {
    adContainer.classList.remove("hidden");

    // Optionally load Google AdSense or other ad networks
    loadAdNetwork();
  }
}

function hideAds() {
  const adContainer = document.getElementById("adContainer");
  if (adContainer) {
    adContainer.classList.add("hidden");
  }
}

function loadAdNetwork() {
  // Google AdSense/AdMob Integration
  console.log("Loading Google AdSense ads...");

  const adSpace = document.getElementById("adSpace");
  if (adSpace && !isPremiumUser) {
    // Push the adsbygoogle configuration
    setTimeout(() => {
      try {
        if (window.adsbygoogle && window.adsbygoogle.push) {
          (adsbygoogle = window.adsbygoogle || []).push({});
          console.log("✅ Ad loaded successfully");
        }
      } catch (err) {
        console.log("⚠️ AdSense not available (normal in development):", err.message);
        // Fallback to demo ad if AdSense fails
        showDemoAdFallback();
      }
    }, 500);
  }
}

function showDemoAdFallback() {
  // Fallback to demo ad if Google ads not available
  const adSpace = document.getElementById("adSpace");
  if (adSpace) {
    adSpace.innerHTML = `
      <div class="demo-ad">
        <div class="ad-logo">💼</div>
        <p class="ad-title"><strong>Grow Your Business</strong></p>
        <p class="ad-subtitle">Get paid faster with professional invoices</p>
        <div class="ad-features">
          <span class="ad-feature">✓ WhatsApp sharing</span>
          <span class="ad-feature">✓ Offline ready</span>
          <span class="ad-feature">✓ Multi-currency</span>
        </div>
        <a href="#" class="ad-link">Learn More →</a>
      </div>
    `;
    setupAdLearnMoreButton();
  }
}

function setupAdLearnMoreButton() {
  const learnMoreButton = document.querySelector(".ad-link");
  if (learnMoreButton) {
    learnMoreButton.addEventListener("click", (e) => {
      e.preventDefault();
      handleAdLearnMore();
    });
  }
}

function handleAdLearnMore() {
  // Create a modal or popup with business tools information
  const modal = createAdLearnMoreModal();
  document.body.appendChild(modal);

  // Show the modal
  setTimeout(() => {
    modal.classList.add("show");
  }, 100);
}

function createAdLearnMoreModal() {
  const modal = document.createElement("div");
  modal.className = "ad-learn-more-modal";
  modal.innerHTML = `
    <div class="ad-modal-content">
      <div class="ad-modal-header">
        <h3>🚀 Boost Your Business!</h3>
        <button class="ad-modal-close" onclick="closeAdModal(this)">&times;</button>
      </div>
      <div class="ad-modal-body">
        <div class="business-tools">
          <div class="tool-section">
            <h4>📊 Professional Invoicing</h4>
            <p>Create stunning invoices that get you paid faster:</p>
            <ul>
              <li>✅ Professional templates</li>
              <li>✅ Automated calculations</li>
              <li>✅ WhatsApp & email sharing</li>
              <li>✅ Works completely offline</li>
            </ul>
          </div>

          <div class="tool-section">
            <h4>💰 Grow Your Revenue</h4>
            <p>Smart features to boost your business:</p>
            <ul>
              <li>📈 Track payment history</li>
              <li>📱 Mobile-first design</li>
              <li>🌍 Multi-currency support</li>
              <li>🔄 Recurring invoices (Premium)</li>
            </ul>
          </div>

          <div class="tool-section">
            <h4>🎯 Perfect for Entrepreneurs</h4>
            <p>Built specifically for small business owners:</p>
            <ul>
              <li>👨‍💼 Freelancers & consultants</li>
              <li>🏪 Small business owners</li>
              <li>🔧 Service providers</li>
              <li>🎨 Creative professionals</li>
            </ul>
          </div>
        </div>

        <div class="cta-section">
          <p><strong>Ready to get started?</strong></p>
          <button onclick="closeAdModal(this); openPremiumModal();" class="cta-button">
            🚀 Upgrade to Premium - $4.99
          </button>
          <p class="cta-subtitle">Remove ads, watermarks & unlock unlimited features!</p>
        </div>
      </div>
    </div>
  `;

  return modal;
}

window.closeAdModal = function (element) {
  const modal = element.closest(".ad-learn-more-modal");
  if (modal) {
    modal.classList.remove("show");
    setTimeout(() => {
      modal.remove();
    }, 300);
  }
};

function setupPremiumModal() {
  // Temporarily disabled: Hide all premium/upgrade UI
  const removeAdsBtn = document.getElementById("removeAds");
  if (removeAdsBtn) removeAdsBtn.style.display = "none";
  
  const purchaseBtn = document.getElementById("purchasePremium");
  if (purchaseBtn) purchaseBtn.style.display = "none";
  
  const premiumModal = document.getElementById("premiumModal");
  if (premiumModal) premiumModal.style.display = "none";
}

function openPremiumModal() {
  const modal = document.getElementById("premiumModal");
  if (modal) {
    // Update modal content based on platform
    updatePremiumModalForPlatform();
    modal.classList.remove("hidden");
  }
}

function closePremiumModal() {
  const modal = document.getElementById("premiumModal");
  if (modal) {
    modal.classList.add("hidden");
  }
}

async function handlePremiumPurchase() {
  // PWABuilder Google Play Billing Integration
  try {
    // Check if Digital Goods API is available (PWABuilder injected)
    if (typeof window.getDigitalGoodsService === "function") {
      await purchaseWithGooglePlay();
    } else {
      // Fallback for web version - show message
      alert(
        "Premium upgrade is available in the Android app from Google Play Store.\n\n" +
          "Download from Play Store to unlock premium features!",
      );
    }
  } catch (error) {
    console.error("Purchase failed:", error);
    showToast("Error", "Purchase failed. Please try again.", "error");
  }
}

async function purchaseWithGooglePlay() {
  try {
    // Show loading
    const purchaseBtn = document.getElementById("purchasePremium");
    const originalText = purchaseBtn.innerHTML;
    purchaseBtn.innerHTML = "🔄 Processing...";
    purchaseBtn.disabled = true;

    // Get Digital Goods Service (PWABuilder injected)
    const service = await window.getDigitalGoodsService("play.google.com/billing");
    console.log("Digital Goods Service connected:", service);

    // Get product details for our premium unlock
    const details = await service.getDetails(["premium_unlock"]);
    console.log("Product details:", details);

    if (details.length === 0) {
      throw new Error("Premium upgrade not available");
    }

    // Make the purchase through Google Play
    const purchase = await service.purchase({
      itemId: "premium_unlock",
    });

    // Verify the purchase was successful
    if (purchase && purchase.purchaseToken) {
      // Activate premium features
      activatePremium();

      // Show success
      showToast(
        "Success!",
        "Premium activated! Thank you for your purchase.",
        "success",
      );

      // Close modal
      closePremiumModal();
    }
  } catch (error) {
    console.error("Google Play purchase failed:", error);
    showToast("Error", "Purchase failed. Please try again.", "error");

    // Reset button
    const purchaseBtn = document.getElementById("purchasePremium");
    if (purchaseBtn) {
      purchaseBtn.innerHTML = "🚀 Upgrade Now - $4.99";
      purchaseBtn.disabled = false;
    }
  }
}

function activatePremium() {
  // Set premium status
  isPremiumUser = true;
  localStorage.setItem("premiumUser", "true");
  localStorage.setItem("purchaseDate", new Date().toISOString());

  // Hide ads
  hideAds();

  // Update UI
  updateUIForPremiumStatus();

  // Hide usage stats for premium users
  hideUsageStats();

  // Reset action counter
  localStorage.setItem("actionCount", "0");
}

function updateUIForPremiumStatus() {
  // Add premium badge to header if premium
  const header = document.querySelector(".app-header");
  if (isPremiumUser && header) {
    let premiumBadge = header.querySelector(".premium-badge");
    if (!premiumBadge) {
      premiumBadge = document.createElement("div");
      premiumBadge.className = "premium-badge";
      premiumBadge.innerHTML = "⭐ PREMIUM";
      header.appendChild(premiumBadge);
    }
  }
}

function shouldShowWatermark() {
  return !isPremiumUser;
}

/* =========================
   PREMIUM FEATURE CHECKS
========================= */

function checkPremiumFeature(featureName) {
  if (!isPremiumUser) {
    showPremiumPrompt(featureName);
    return false;
  }
  return true;
}

function showPremiumPrompt(featureName) {
  const message = `${featureName} is a premium feature.\n\nUpgrade to Premium for just $4.99 to unlock all features!`;

  if (confirm(message)) {
    openPremiumModal();
  }
}

/* =========================
   USAGE TRACKING & LIMITS
========================= */

const FREE_LIMITS = {
  invoices_per_month: 10,
  pdfs_per_day: 5,
};

function trackUsage(action) {
  const today = new Date().toDateString();
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  let usage = JSON.parse(localStorage.getItem("usage") || "{}");

  if (!usage[currentMonth]) {
    usage[currentMonth] = {};
  }

  if (!usage[currentMonth][today]) {
    usage[currentMonth][today] = {};
  }

  usage[currentMonth][today][action] =
    (usage[currentMonth][today][action] || 0) + 1;

  localStorage.setItem("usage", JSON.stringify(usage));
}

async function checkUsageLimit() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const usage = JSON.parse(localStorage.getItem("usage") || "{}");

  let monthlyInvoices = 0;
  if (usage[currentMonth]) {
    for (const day of Object.values(usage[currentMonth])) {
      monthlyInvoices += day.invoice_saved || 0;
    }
  }

  if (monthlyInvoices >= FREE_LIMITS.invoices_per_month) {
    showUsageLimitModal("invoice");
    return false;
  }

  return true;
}

async function checkPDFLimit() {
  const today = new Date().toDateString();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const usage = JSON.parse(localStorage.getItem("usage") || "{}");

  const dailyPDFs = usage[currentMonth]?.[today]?.pdf_generated || 0;

  if (dailyPDFs >= FREE_LIMITS.pdfs_per_day) {
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

  const message = `${limits[type]}\n\nUpgrade to Premium for unlimited usage - just $4.99 one-time!`;

  if (confirm(message)) {
    openPremiumModal();
  }
}

function getUsageStats() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toDateString();
  const usage = JSON.parse(localStorage.getItem("usage") || "{}");

  let monthlyInvoices = 0;
  let dailyPDFs = usage[currentMonth]?.[today]?.pdf_generated || 0;

  if (usage[currentMonth]) {
    for (const day of Object.values(usage[currentMonth])) {
      monthlyInvoices += day.invoice_saved || 0;
    }
  }

  return {
    invoicesThisMonth: monthlyInvoices,
    pdfsTodayy: dailyPDFs,
    invoiceLimit: FREE_LIMITS.invoices_per_month,
    pdfLimit: FREE_LIMITS.pdfs_per_day,
  };
}

/* =========================
   GOOGLE PLAY BILLING (PWABuilder)
========================= */


async function purchasePremiumWithGooglePlay() {
  try {
    console.log("Starting Google Play purchase...");
    
    if (typeof window.getDigitalGoodsService !== "function") {
      alert("Google Play Billing not available.");
      return;
    }

    const service = await window.getDigitalGoodsService("play");
    console.log("Digital Goods Service connected:", service);

    await service.purchase({
      itemId: "premium_unlock"
    });

    // Re-check ownership after purchase
    await checkGooglePlayPremiumStatus();

    alert("✅ Premium unlocked!");
  } catch (err) {
    console.error("Purchase failed:", err);
    alert("❌ Purchase cancelled or failed");
  }
}


async function checkGooglePlayPremiumStatus() {
  try {
    // Only check if Digital Goods API is available (Android PWA)
    if (typeof window.getDigitalGoodsService !== "function") {
      return false;
    }

    const service = await window.getDigitalGoodsService("play");
    const purchases = await service.listPurchases();

    // Check if premium_unlock was purchased
    const premiumPurchase = purchases.find(
      (p) => p.itemId === "premium_unlock",
    );

    if (premiumPurchase && premiumPurchase.purchaseState === "purchased") {
      // User has purchased premium through Google Play
      isPremiumUser = true;
      localStorage.setItem("premiumUser", "true");
      localStorage.setItem("purchaseMethod", "google_play");
      return true;
    }

    return false;
  } catch (error) {
    console.log("Google Play Billing not available:", error);
    return false;
  }
}

function isPWAInstalled() {
  // Check if app is installed as PWA
  return window.matchMedia("(display-mode: standalone)").matches;
}

function isAndroidPWA() {
  // Check if running in Android PWA with Play Billing
  return typeof window.getDigitalGoodsService === "function";
}

function updatePremiumModalForPlatform() {
  const purchaseBtn = document.getElementById("purchasePremium");
  const platformMessage = document.getElementById("platformMessage");
  const webMessage = document.getElementById("webMessage");
  const androidMessage = document.getElementById("androidMessage");
  const paymentMethod = document.getElementById("paymentMethod");
  const heading = document.getElementById("premiumModalHeading");

  if (isAndroidPWA()) {
    // Android PWA with Google Play Billing
    if (heading) heading.textContent = "🚀 Unlock Premium Features";
    if (paymentMethod)
      paymentMethod.textContent = "One-time payment via Google Play";
    if (purchaseBtn)
      purchaseBtn.innerHTML = "🚀 Purchase via Google Play - $4.99";

    // Show Android-specific message
    if (platformMessage) platformMessage.classList.remove("hidden");
    if (androidMessage) androidMessage.classList.remove("hidden");
    if (webMessage) webMessage.classList.add("hidden");
  } else {
    // Web version - direct to Play Store
    if (heading) heading.textContent = "📱 Get Premium on Android";
    if (paymentMethod)
      paymentMethod.textContent = "Available on Google Play Store";
    if (purchaseBtn) purchaseBtn.innerHTML = "📲 Get Android App";

    // Show web-specific message
    if (platformMessage) platformMessage.classList.remove("hidden");
    if (webMessage) webMessage.classList.remove("hidden");
    if (androidMessage) androidMessage.classList.add("hidden");
  }
}

function setupPlatformLinks() {
  // Setup Play Store link for web users
  const playStoreLink = document.getElementById("playStoreLink");
  if (playStoreLink) {
    playStoreLink.addEventListener("click", (e) => {
      e.preventDefault();
      const playStoreUrl =
        "https://play.google.com/store/apps/details?id=io.github.evansmunsha.twa";
      window.open(playStoreUrl, "_blank");
      closePremiumModal();

      showToast(
        "Redirecting",
        "Opening Google Play Store to download the Android app...",
        "info",
      );
    });
  }

  // Update purchase button behavior for web users
  const purchaseBtn = document.getElementById("purchasePremium");
  if (purchaseBtn && !isAndroidPWA()) {
    purchaseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const playStoreUrl =
        "https://play.google.com/store/apps/details?id=io.github.evansmunsha.twa";
      window.open(playStoreUrl, "_blank");
      closePremiumModal();

      showToast(
        "Download Required",
        "Premium features are available in our Android app from Google Play Store",
        "info",
        6000,
      );
    });
  }
}


/* =========================
   GOOGLE PLAY PURCHASE FLOW
========================= */

async function purchasePremiumWithGooglePlay() {
  try {
    console.log("🔍 Starting purchase flow...");
    
    // Ensure Google Play Billing is available
    if (typeof window.getDigitalGoodsService !== "function") {
      console.error("❌ Digital Goods API not available");
      alert("Purchases are only available in the Android app installed from Google Play.");
      return;
    }
    console.log("✅ Digital Goods API is available");

    // Disable button + show loading
    const btn = document.getElementById("purchasePremium");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "🔄 Processing...";
    }

    // Connect to Google Play
    console.log("🔗 Connecting to Google Play Billing...");
    const service = await window.getDigitalGoodsService("play.google.com/billing");
    console.log("✅ Service connected:", service);

    if (!service) {
      throw new Error("Failed to get Digital Goods Service");
    }

    // Fetch product info
    console.log("📦 Fetching product details for 'premium_unlock'...");
    const details = await service.getDetails(["premium_unlock"]);
    console.log("✅ Product details:", details);
    
    if (!details || details.length === 0) {
      console.error("❌ Product 'premium_unlock' not found in Play Console");
      throw new Error("Product 'premium_unlock' not found. Check Google Play Console.");
    }

    console.log("💰 Product price:", details[0].price);
    console.log("📝 Product title:", details[0].title);

    // 🔥 THIS LINE OPENS GOOGLE PLAY PAYMENT UI
    console.log("🛒 Opening Google Play payment UI...");
    const purchase = await service.purchase({
      itemId: "premium_unlock",
    });

    console.log("✅ Purchase completed, response:", purchase);

    // Verify purchase result
    if (purchase && (purchase.purchaseState === "purchased" || purchase.purchaseToken)) {
      console.log("🎉 Purchase successful! Purchase token:", purchase.purchaseToken);
      activatePremium();

      showToast("Success 🎉", "Premium unlocked permanently!", "success");
      closePremiumModal();
    } else {
      console.error("❌ Purchase state:", purchase?.purchaseState);
      throw new Error("Purchase was not completed successfully");
    }
  } catch (err) {
    console.error("❌ Purchase failed:", err);
    console.error("Error message:", err.message);

    let errorMessage = "Purchase cancelled or failed. Try again.";
    
    if (err.message.includes("not found")) {
      errorMessage = "Premium product not found on Play Store. Check product ID."; 
    } else if (err.message.includes("Digital Goods")) {
      errorMessage = "Google Play Billing is not available. Use Play Store app.";
    } else if (err.name === "NotAllowedError") {
      errorMessage = "Purchase cancelled.";
    }

    showToast("Payment Failed", errorMessage, "error");
  } finally {
    // Restore button
    const btn = document.getElementById("purchasePremium");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "🚀 Purchase via Google Play – $4.99";
    }
  }
}


/* =========================
   USAGE STATS DISPLAY
========================= */

function showUsageStats() {
  const usageStats = document.getElementById("usageStats");
  if (usageStats) {
    usageStats.classList.remove("hidden");
  }
}

function hideUsageStats() {
  const usageStats = document.getElementById("usageStats");
  if (usageStats) {
    usageStats.classList.add("hidden");
  }
}

function updateUsageStatsDisplay() {
  if (isPremiumUser) {
    hideUsageStats();
    return;
  }

  const stats = getUsageStats();

  // Update invoice usage
  const invoiceUsage = document.getElementById("invoiceUsage");
  const invoiceProgress = document.getElementById("invoiceProgress");

  if (invoiceUsage) {
    invoiceUsage.textContent = `${stats.invoicesThisMonth}/${stats.invoiceLimit}`;
  }

  if (invoiceProgress) {
    const invoicePercentage =
      (stats.invoicesThisMonth / stats.invoiceLimit) * 100;
    invoiceProgress.style.width = `${Math.min(invoicePercentage, 100)}%`;

    // Add warning/danger classes
    invoiceProgress.classList.remove("warning", "danger");
    if (invoicePercentage >= 80) {
      invoiceProgress.classList.add("danger");
    } else if (invoicePercentage >= 60) {
      invoiceProgress.classList.add("warning");
    }
  }

  // Update PDF usage
  const pdfUsage = document.getElementById("pdfUsage");
  const pdfProgress = document.getElementById("pdfProgress");

  if (pdfUsage) {
    pdfUsage.textContent = `${stats.pdfsTodayy}/${stats.pdfLimit}`;
  }

  if (pdfProgress) {
    const pdfPercentage = (stats.pdfsTodayy / stats.pdfLimit) * 100;
    pdfProgress.style.width = `${Math.min(pdfPercentage, 100)}%`;

    // Add warning/danger classes
    pdfProgress.classList.remove("warning", "danger");
    if (pdfPercentage >= 80) {
      pdfProgress.classList.add("danger");
    } else if (pdfPercentage >= 60) {
      pdfProgress.classList.add("warning");
    }
  }
}

function setupUsageStatsHandlers() {
  // Upgrade from stats link
  document
    .getElementById("upgradeFromStats")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      openPremiumModal();
    });

  // View usage details
  document.getElementById("viewUsageDetails")?.addEventListener("click", () => {
    showUsageDetailsModal();
  });
}

function showUsageDetailsModal() {
  const stats = getUsageStats();
  const currentMonth = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const message = `📊 Usage Details for ${currentMonth}

📄 Invoices: ${stats.invoicesThisMonth} / ${stats.invoiceLimit} (${Math.round((stats.invoicesThisMonth / stats.invoiceLimit) * 100)}%)
📱 PDFs Today: ${stats.pdfsTodayy} / ${stats.pdfLimit} (${Math.round((stats.pdfsTodayy / stats.pdfLimit) * 100)}%)

Upgrade to Premium for unlimited usage!`;

  if (confirm(message + "\n\nWould you like to upgrade now?")) {
    openPremiumModal();
  }
}

/* =========================
   FOOTER HANDLERS
========================= */

function initializeFooterHandlers() {
  // About app handler
  document.getElementById("aboutApp")?.addEventListener("click", (e) => {
    e.preventDefault();
    showAboutDialog();
  });

  // Support handler
  document.getElementById("supportLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    showSupportDialog();
  });
}

function showAboutDialog() {
  const aboutMessage = `📄 Invoice Maker v1.0

🚀 Professional invoicing made simple!

✨ Features:
• Create unlimited invoices
• Share via WhatsApp & email
• Works completely offline
• Multi-currency support (ZMW, USD, EUR, GBP)
• Auto-save functionality
• Premium upgrade available

🛡️ Privacy-First Design:
• All data stored locally
• No cloud storage
• Your invoices never leave your device
• GDPR compliant

💻 Technology:
• Progressive Web App (PWA)
• Works on all devices
• No installation required
• Offline-ready

🇿🇲 Built by Evans Munsha for African entrepreneurs and small businesses.
Perfect for Zambian market with WhatsApp integration and offline functionality.

Contact: evansmunsha@gmail.com | +260963266937`;

  alert(aboutMessage);
}

function showSupportDialog() {
  const supportMessage = `🛠️ Need Help?

📧 Contact Support:
• Email: evansmunsha@gmail.com
• Phone: +260963266937
• Response time: 24-48 hours

🆘 Common Issues:
• PDF not generating → Check internet connection
• Data not saving → Clear browser cache
• App not loading → Refresh page

💡 Tips:
• Use Chrome/Edge for best experience
• Enable notifications for updates
• Export invoices regularly as backup

🚀 Premium Support:
Upgrade to Premium for priority support and advanced features!

Would you like to contact support via email?`;

  if (confirm(supportMessage)) {
    window.open(
      "mailto:evansmunsha@gmail.com?subject=Invoice Maker Support Request&body=Please describe your issue:",
    );
  }
}

// Add near initialization in js/app.js
window.addEventListener('message', (e) => {
  try {
    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (data && data.type === 'PURCHASE_COMPLETE' && data.productId === 'premium_unlock') {
      localStorage.setItem('premiumUser', 'true');
      isPremiumUser = true; // ensure runtime flag used in app.js updates
      showToast('Premium unlocked', 'Thank you for upgrading!', 'success');
    }
  } catch (err) { /* ignore malformed messages */ }
});

/* =========================
   DEBUGGING TOOLS FOR PAYMENT ISSUES
========================= */

// Exposed globally for DevTools console debugging
window.invoiceMakerDebug = {
  // Check if Digital Goods API is available
  checkBillingAPI: async () => {
    console.log("=== BILLING API CHECK ===");
    console.log("1. Digital Goods Service available:", typeof window.getDigitalGoodsService === 'function' ? "✅ YES" : "❌ NO");
    
    if (typeof window.getDigitalGoodsService === 'function') {
      try {
        const service = await window.getDigitalGoodsService("play.google.com/billing");
        console.log("2. Service connected: ✅ YES");
        
        const details = await service.getDetails(['premium_unlock']);
        console.log("3. Product details:", details);
        console.log("3. Product details:", details);
        
        if (details.length > 0) {
          console.log("   Product ID:", details[0].itemId);
          console.log("   Price:", details[0].price);
          console.log("   ✅ READY TO PURCHASE");
        } else {
          console.log("   ❌ Product 'premium_unlock' not found on Play Store");
          console.log("   → Check Google Play Console product ID");
        }
      } catch (err) {
        console.error("   ❌ Error:", err.message);
      }
    } else {
      console.log("❌ Not running in PWABuilder app or Digital Goods API not enabled");
      console.log("   → This only works on Play Store installed app");
    }
  },
  
  // Check premium status
  checkPremiumStatus: () => {
    console.log("=== PREMIUM STATUS ===");
    console.log("Runtime flag (isPremiumUser):", isPremiumUser ? "✅ PREMIUM" : "❌ FREE");
    console.log("localStorage.premiumUser:", localStorage.getItem('premiumUser') || "NOT SET");
    console.log("Purchase date:", localStorage.getItem('purchaseDate') || "NO PURCHASE");
    console.log("Purchase method:", localStorage.getItem('purchaseMethod') || "NONE");
  },
  
  // Simulate a purchase (for testing)
  simulatePurchase: () => {
    console.log("=== SIMULATING PURCHASE ===");
    localStorage.setItem('premiumUser', 'true');
    isPremiumUser = true;
    hideAds();
    updateUIForPremiumStatus();
    showToast('Test', 'Premium simulated', 'success');
    console.log("✅ Premium activated (test mode)");
  },
  
  // Show all billing info
  fullDiagnostic: async () => {
    console.log("\n🔍 FULL INVOICE MAKER BILLING DIAGNOSTIC\n");
    await window.invoiceMakerDebug.checkBillingAPI();
    console.log("\n");
    window.invoiceMakerDebug.checkPremiumStatus();
    console.log("\n✅ Diagnostic complete\n");
  }
};

// Make it easy to use from console
console.log("💡 TIP: Run this in console to diagnose payment issues:");
console.log("  await invoiceMakerDebug.fullDiagnostic()");
