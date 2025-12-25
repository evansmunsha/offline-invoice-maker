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

    // Runs first time OR when version changes
    request.onupgradeneeded = event => {
      db = event.target.result;

      // Create object store if not exists
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id"
        });

        // Index for sorting by date
        store.createIndex("date", "date");
      }
    };

    request.onsuccess = event => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = event => {
      reject("Failed to open database");
    };
  });
}

/* =========================
   SAVE INVOICE
========================= */

async function saveInvoice(invoice) {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.put(invoice);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject("Save failed");
  });
}

/* =========================
   GET ALL INVOICES
========================= */

async function getInvoices() {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Newest first
      resolve(request.result.reverse());
    };

    request.onerror = () => reject("Read failed");
  });
}

/* =========================
   DELETE INVOICE
========================= */

async function deleteInvoice(id) {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.delete(id);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject("Delete failed");
  });
}
