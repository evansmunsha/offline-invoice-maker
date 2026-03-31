/**************************************************
 * PDF GENERATION FOR OFFLINE INVOICES
 * Uses jsPDF library for client-side PDF creation
 **************************************************/

function isPremium() {
  return localStorage.getItem("premiumUser") === "true";
}

/**
 * Format date to readable format: Monday, 30 March 2026
 */
function formatInvoiceDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

/**
 * Format number with commas (e.g., 1000.50 becomes 1,000.50)
 */
function formatNumberWithCommas(num) {
  const parts = num.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/**
 * Export invoice to PDF format
 * @param {Object} invoice - Invoice data object
 */
function exportInvoicePDF(invoice) {
  // Check if jsPDF is available
  if (typeof window.jspdf === "undefined") {
    alert(
      "PDF library not loaded. Please check your internet connection and refresh the page.",
    );
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Get template preference
    const templateSelect = document.getElementById("template");
    const template = templateSelect ? templateSelect.value : "simple";

    // Set up fonts and styling
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");

    let y = 20;

    // Add boxed template styling if selected
    if (template === "boxed") {
      doc.rect(10, 10, 190, 270, "S");
      y = 25;
    }

    // Header
    doc.text("INVOICE", 105, y, { align: "center" });
    doc.setFontSize(12);
    doc.setFont(undefined, "normal");

    y += 15;

    // Invoice Number (centered)
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
    y += 6;

    // ✅ Business Address (NEW)
    if (invoice.businessAddress && invoice.businessAddress.trim()) {
      const addressLines = doc.splitTextToSize(invoice.businessAddress, 170);
      addressLines.forEach(line => {
        doc.text(line, 20, y);
        y += 6;
      });
    }

    // ✅ Business Phone (NEW)
    if (invoice.businessPhone && invoice.businessPhone.trim()) {
      doc.text(invoice.businessPhone, 20, y);
      y += 6;
    }

    // ✅ Business Email (NEW)
    if (invoice.businessEmail && invoice.businessEmail.trim()) {
      doc.text(invoice.businessEmail, 20, y);
      y += 6;
    }

    y += 9; // Extra spacing after business info

    // ✅ Client Information (with background shading for distinction)
    doc.setFillColor(245, 245, 245); // Light gray background
    doc.rect(15, y - 2, 180, 35, "F"); // Background box
    
    doc.setFont(undefined, "bold");
    doc.text("To:", 20, y);
    doc.setFont(undefined, "normal");
    y += 8;
    doc.text(invoice.clientName || "Client Name", 20, y);
    y += 6;

    // ✅ Client Address (NEW)
    if (invoice.clientAddress && invoice.clientAddress.trim()) {
      const clientAddressLines = doc.splitTextToSize(invoice.clientAddress, 170);
      clientAddressLines.forEach(line => {
        doc.text(line, 20, y);
        y += 6;
      });
    }

    // ✅ Client Phone (NEW)
    if (invoice.clientPhone && invoice.clientPhone.trim()) {
      doc.text(invoice.clientPhone, 20, y);
      y += 6;
    }

    // ✅ Client Email (NEW)
    if (invoice.clientEmail && invoice.clientEmail.trim()) {
      doc.text(invoice.clientEmail, 20, y);
      y += 6;
    }

    y += 15;

    // ✅ Invoice Date and Time (Formatted)
    doc.setFont(undefined, "bold");
    doc.text("Date:", 20, y);
    doc.setFont(undefined, "normal");
    const formattedDate = formatInvoiceDate(invoice.date);
    doc.text(formattedDate, 60, y);
    
    // ✅ Time on the right side
    if (invoice.time) {
      doc.setFont(undefined, "bold");
      doc.text("Time:", 140, y);
      doc.setFont(undefined, "normal");
      doc.text(invoice.time, 160, y);
    }

    y += 15;

    // Items Header
    doc.setFont(undefined, "bold");
    doc.text("Description", 20, y);
    doc.text("Qty", 120, y);
    doc.text("Price", 140, y);
    doc.text("Total", 170, y);
    doc.line(20, y + 2, 190, y + 2); // Underline

    y += 10;
    doc.setFont(undefined, "normal");

    // Items
    let subtotal = 0;
    invoice.items.forEach((item) => {
      const itemTotal = item.qty * item.price;
      subtotal += itemTotal;

      // Truncate long item names
      const itemName =
        item.name.length > 25 ? item.name.substring(0, 25) + "..." : item.name;

      doc.text(itemName, 20, y);
      doc.text(item.qty.toString(), 120, y);
      doc.text(formatNumberWithCommas(item.price), 140, y);
      doc.text(formatNumberWithCommas(itemTotal), 170, y);

      y += 8;
    });

    y += 10;

    // ✅ CENTERED TOTAL (PROMINENT)
    doc.line(20, y - 5, 190, y - 5); // Line above total
    y += 10;
    
    // Format total with commas - extract currency and number
    let formattedTotal = invoice.total;
    const totalParts = invoice.total.split(" ");
    if (totalParts.length === 2) {
      const currency = totalParts[0];
      const amount = parseFloat(totalParts[1]);
      formattedTotal = `${currency} ${formatNumberWithCommas(amount)}`;
    }
    
    // Create a highlighted box for the total
    doc.setFillColor(240, 240, 240); // Light gray background
    doc.rect(40, y - 5, 130, 15, "F"); // Filled rectangle
    doc.setDrawColor(0); // Black border
    doc.rect(40, y - 5, 130, 15); // Border
    
    doc.setFont(undefined, "bold");
    doc.setFontSize(16);
    doc.text("TOTAL: " + formattedTotal, 105, y + 3, { align: "center" });
    
    doc.setFont(undefined, "normal");
    doc.setFontSize(12);

    // Add watermark for free version
    if (!isPremium()) {
      doc.setTextColor(220, 220, 220);
      doc.setFontSize(50);
      doc.text("MADE WITH INVOICE MAKER", 105, 150, {
        align: "center",
        angle: 45,
      });

      // Add upgrade prompt watermark
      doc.setTextColor(200, 200, 200);
      doc.setFontSize(12);
      doc.text(
        "Upgrade to Premium to remove this watermark - Only $4.99",
        105,
        280,
        {
          align: "center",
        },
      );

      doc.setTextColor(0, 0, 0); // Reset color
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split("T")[0];
    const clientName = (invoice.clientName || "client")
      .replace(/\s+/g, "-")
      .toLowerCase();
    const filename = `invoice-${clientName}-${timestamp}.pdf`;

    doc.save(filename);
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert("Error generating PDF. Please try again.");
  }
}