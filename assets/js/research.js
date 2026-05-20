(() => {
  const DB_NAME = "research-papers-db";
  const DB_VERSION = 1;
  const STORE_NAME = "papers";

  const elFile = document.getElementById("paperFile");
  const elUploadBtn = document.getElementById("uploadBtn");
  const elClearAllBtn = document.getElementById("clearAllBtn");
  const elStatus = document.getElementById("uploadStatus");
  const elDescription = document.getElementById("paperDescription");

  const elPapersList = document.getElementById("papersList");
  const elPapersEmpty = document.getElementById("papersEmpty");

  function setStatus(msg, tone = "muted") {
    if (!elStatus) return;
    elStatus.textContent = msg;
    elStatus.style.color = tone === "success" ? "var(--cyan)" : "var(--text-muted)";
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbTx(storeMode) {
    return openDb().then((db) => {
      const t = db.transaction(STORE_NAME, storeMode);
      return { db, tx: t, store: t.objectStore(STORE_NAME) };
    });
  }

  function makeIdForFile(file) {
    return file.name + "__" + file.size + "__" + file.lastModified;
  }

  function filenameToTitle(name) {
    return name.replace(/\.pdf$/i, "");
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let i = -1;
    let val = n;
    do { val /= 1024; i++; } while (val >= 1024 && i < units.length - 1);
    return val.toFixed(val >= 10 ? 1 : 2) + " " + units[i];
  }

  function escapeHtml(str) {
    const s = String(str);
    return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function revokeObjectUrl(url) {
    try { URL.revokeObjectURL(url); } catch (_) {}
  }

  function renderEmptyIfNeeded(count) {
    if (!elPapersEmpty) return;
    elPapersEmpty.style.display = count === 0 ? "block" : "none";
  }

  async function getPaper(id) {
    const { store, tx, db } = await dbTx("readonly");
    return new Promise((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
      tx.onerror = () => db.close();
    });
  }

  async function listPapersMeta() {
    const { store, tx, db } = await dbTx("readonly");
    return new Promise((resolve) => {
      const papers = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const v = cursor.value;
          papers.push({ id: cursor.key, name: v.name, size: v.size, description: v.description || "" });
          cursor.continue();
        } else { resolve(papers); }
      };
      req.onerror = () => resolve([]);
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
      tx.onerror = () => db.close();
    });
  }

  function renderCards(papers) {
    elPapersList.innerHTML = "";
    if (!papers.length) { renderEmptyIfNeeded(0); return; }
    renderEmptyIfNeeded(papers.length);

    for (const paper of papers) {
      const col = document.createElement("div");
      col.className = "col-md-6";

      const safeName = escapeHtml(paper.name);
      const safeDesc = paper.description ? escapeHtml(paper.description) : "";
      const title = escapeHtml(filenameToTitle(paper.name));

      col.innerHTML =
        '<div class="glass-card h-100 pub-card" style="padding:1.25rem;">' +
        '  <div class="d-flex align-items-start gap-3">' +
        '    <div class="pub-icon" style="width:40px;height:40px;min-width:40px;font-size:1rem;margin-bottom:0;">' +
        '      <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>' +
        '    </div>' +
        '    <div class="flex-grow-1">' +
        '      <h6 style="font-weight:700;color:var(--text-primary);font-size:.9rem;margin-bottom:.25rem;" title="' + safeName + '">' + title + '</h6>' +
        '      <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.4rem;">' + formatBytes(paper.size) + '</div>' +
        (safeDesc ? '<div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:.5rem;">' + safeDesc + '</div>' : '') +
        '      <div class="d-flex gap-2">' +
        '        <a class="card-link paper-view" href="#" style="font-size:.8rem;">View PDF →</a>' +
        '        <button class="paper-delete" style="background:none;border:none;color:var(--text-muted);font-size:.8rem;cursor:pointer;">Delete</button>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      const btnView = col.querySelector(".paper-view");
      const btnDelete = col.querySelector(".paper-delete");
      btnDelete.addEventListener("click", () => deletePaper(paper.id));
      btnView.addEventListener("click", async (e) => {
        e.preventDefault();
        const record = await getPaper(paper.id);
        if (!record) return;
        const blobUrl = URL.createObjectURL(record.blob);
        window.open(blobUrl, "_blank", "noopener,noreferrer");
        setTimeout(() => revokeObjectUrl(blobUrl), 60000);
      });
      elPapersList.appendChild(col);
    }
  }

  async function upsertPapers(files) {
    if (!files || !files.length) return 0;
    const description = elDescription && elDescription.value ? elDescription.value.trim() : "";
    const { store, tx, db } = await dbTx("readwrite");
    const items = Array.from(files);
    setStatus("Uploading " + items.length + " file(s)...");
    let completed = 0;
    await Promise.all(items.map((file) => new Promise((resolve) => {
      const id = makeIdForFile(file);
      const blob = file.slice(0, file.size, file.type || "application/pdf");
      const putReq = store.put({ id, name: file.name, size: file.size, description, blob, uploadedAt: Date.now() });
      putReq.onsuccess = () => { completed++; resolve(); };
      putReq.onerror = () => resolve();
    })));
    await new Promise((resolve) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
    return completed;
  }

  async function deletePaper(id) {
    if (!id) return;
    setStatus("Deleting...");
    const { store, tx, db } = await dbTx("readwrite");
    await new Promise((resolve) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); resolve(); };
    });
    setStatus("Deleted.", "success");
    await refresh();
  }

  async function clearAll() {
    if (!confirm("Delete all saved papers from this browser?")) return;
    setStatus("Clearing all...");
    const { store, tx, db } = await dbTx("readwrite");
    await new Promise((resolve) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); resolve(); };
    });
    setStatus("All cleared.", "success");
    await refresh();
  }

  async function refresh() {
    const papers = await listPapersMeta();
    renderCards(papers);
  }

  if (elUploadBtn) {
    elUploadBtn.addEventListener("click", async () => {
      const files = elFile && elFile.files ? Array.from(elFile.files) : [];
      const pdfs = files.filter(f => (f.type || "").toLowerCase() === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (!pdfs.length) { setStatus("Please select PDF files to upload."); return; }
      const completed = await upsertPapers(pdfs);
      setStatus(completed ? "Upload complete!" : "Upload finished.", "success");
      if (elFile) elFile.value = "";
      if (elDescription) elDescription.value = "";
      await refresh();
    });
  }

  if (elClearAllBtn) {
    elClearAllBtn.addEventListener("click", () => clearAll());
  }

  refresh();
})();
