/**************************************************
 * PDF GENERATION FOR OFFLINE INVOICES
 * Uses jsPDF library for client-side PDF creation
 **************************************************/

function isPremium() {
  return localStorage.getItem("premiumUser") === "true";
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
      doc.text(`${item.price.toFixed(2)}`, 140, y);
      doc.text(`${itemTotal.toFixed(2)}`, 170, y);

      y += 8;
    });

    y += 10;

    // Total
    doc.line(120, y - 5, 190, y - 5); // Line above total
    doc.setFont(undefined, "bold");
    doc.setFontSize(14);
    doc.text("TOTAL:", 140, y);
    doc.text(invoice.total, 170, y);

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
