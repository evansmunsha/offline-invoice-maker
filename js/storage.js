/**************************************************
 * INDEXEDDB DATABASE FOR OFFLINE INVOICES
 * This runs entirely on the user's device
 **************************************************/

const DB_NAME = "invoiceDB";
const DB_VERSION = 1;
const STORE_NAME = "invoices";

let db = null;

/* =========================
   OPEN DATABASE
========================= */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("clientName", "clientName", { unique: false });
        store.createIndex("invoiceNumber", "invoiceNumber", { unique: false });
      }
    };

    request.onsuccess = event => {
      db = event.target.result;
      console.log("✅ Database opened successfully");
      resolve(db);
    };

    request.onerror = event => {
      console.error("❌ Database error:", event.target.error);
      reject("Failed to open database: " + event.target.error);
    };

    request.onblocked = () => {
      console.warn("⚠️ Database blocked. Close other tabs.");
    };
  });
}

/* =========================
   SAVE INVOICE
========================= */
async function saveInvoice(invoice) {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const request = store.put(invoice);

      request.onsuccess = () => {
        console.log("✅ Invoice saved:", invoice.invoiceNumber || invoice.id);
        resolve(true);
      };

      request.onerror = (event) => {
        console.error("❌ Save failed:", event.target.error);
        reject("Save failed: " + event.target.error);
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = (event) => reject("Transaction failed: " + event.target.error);
    } catch (error) {
      console.error("❌ Save error:", error);
      reject("Save error: " + error.message);
    }
  });
}

/* =========================
   GET ALL INVOICES
========================= */
async function getInvoices() {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const invoices = request.result.reverse(); // Newest first
        console.log(`✅ Retrieved ${invoices.length} invoices`);
        resolve(invoices);
      };

      request.onerror = (event) => {
        console.error("❌ Read failed:", event.target.error);
        reject("Read failed: " + event.target.error);
      };
    } catch (error) {
      console.error("❌ Get invoices error:", error);
      reject("Get invoices error: " + error.message);
    }
  });
}

/* =========================
   GET SINGLE INVOICE
========================= */
async function getInvoice(id) {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          console.log("✅ Invoice retrieved:", id);
          resolve(request.result);
        } else {
          console.warn("⚠️ Invoice not found:", id);
          resolve(null);
        }
      };

      request.onerror = (event) => {
        console.error("❌ Read failed:", event.target.error);
        reject("Read failed: " + event.target.error);
      };
    } catch (error) {
      console.error("❌ Get invoice error:", error);
      reject("Get invoice error: " + error.message);
    }
  });
}

/* =========================
   DELETE INVOICE
========================= */
async function deleteInvoice(id) {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log("✅ Invoice deleted:", id);
        resolve(true);
      };

      request.onerror = (event) => {
        console.error("❌ Delete failed:", event.target.error);
        reject("Delete failed: " + event.target.error);
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = (event) => reject("Transaction failed: " + event.target.error);
    } catch (error) {
      console.error("❌ Delete error:", error);
      reject("Delete error: " + error.message);
    }
  });
}

/* =========================
   DELETE MULTIPLE INVOICES
========================= */
async function deleteMultipleInvoices(ids) {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      let completed = 0;
      const total = ids.length;

      ids.forEach(id => {
        const request = store.delete(id);
        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            console.log(`✅ Deleted ${total} invoices`);
            resolve(true);
          }
        };
      });

      tx.onerror = (event) => reject("Bulk delete failed: " + event.target.error);
    } catch (error) {
      console.error("❌ Bulk delete error:", error);
      reject("Bulk delete error: " + error.message);
    }
  });
}

/* =========================
   CLEAR ALL DATA
========================= */
async function clearAllInvoices() {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("✅ All invoices cleared");
        resolve(true);
      };

      request.onerror = (event) => {
        console.error("❌ Clear failed:", event.target.error);
        reject("Clear failed: " + event.target.error);
      };
    } catch (error) {
      console.error("❌ Clear error:", error);
      reject("Clear error: " + error.message);
    }
  });
}

/* =========================
   GET INVOICE COUNT
========================= */
async function getInvoiceCount() {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => {
        console.log(`✅ Total invoices: ${request.result}`);
        resolve(request.result);
      };

      request.onerror = (event) => {
        console.error("❌ Count failed:", event.target.error);
        reject("Count failed: " + event.target.error);
      };
    } catch (error) {
      console.error("❌ Count error:", error);
      reject("Count error: " + error.message);
    }
  });
}

/* =========================
   EXPORT ALL DATA (BACKUP)
========================= */
async function exportAllData() {
  const invoices = await getInvoices();
  const backup = {
    version: DB_VERSION,
    timestamp: new Date().toISOString(),
    count: invoices.length,
    invoices: invoices
  };
  
  const dataStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-backup-${Date.now()}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  console.log(`✅ Exported ${invoices.length} invoices`);
  return true;
}

/* =========================
   IMPORT DATA (RESTORE)
========================= */
async function importData(jsonData) {
  if (!db) await openDB();

  return new Promise(async (resolve, reject) => {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      if (!data.invoices || !Array.isArray(data.invoices)) {
        reject("Invalid backup format");
        return;
      }

      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      let imported = 0;
      data.invoices.forEach(invoice => {
        const request = store.put(invoice);
        request.onsuccess = () => imported++;
      });

      tx.oncomplete = () => {
        console.log(`✅ Imported ${imported} invoices`);
        resolve(imported);
      };

      tx.onerror = (event) => reject("Import failed: " + event.target.error);
    } catch (error) {
      console.error("❌ Import error:", error);
      reject("Import error: " + error.message);
    }
  });
}

/* =========================
   DATABASE STATUS
========================= */
async function getDatabaseStatus() {
  try {
    if (!db) await openDB();
    
    const count = await getInvoiceCount();
    const invoices = await getInvoices();
    
    const totalSize = new Blob([JSON.stringify(invoices)]).size;
    const sizeInKB = (totalSize / 1024).toFixed(2);
    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    return {
      isOpen: db !== null,
      name: DB_NAME,
      version: DB_VERSION,
      storeName: STORE_NAME,
      invoiceCount: count,
      dataSize: totalSize,
      dataSizeFormatted: totalSize > 1024 * 1024 ? `${sizeInMB} MB` : `${sizeInKB} KB`,
      oldestInvoice: invoices[invoices.length - 1]?.date || null,
      newestInvoice: invoices[0]?.date || null
    };
  } catch (error) {
    return {
      isOpen: false,
      error: error.message
    };
  }
}

// Expose status function globally for debugging
window.checkDBStatus = async () => {
  const status = await getDatabaseStatus();
  console.table(status);
  return status;
};