// FoundrySpecification.projectEditBoundary: prepare, compare, atomically commit.
import { prepareExistingProject } from "./project-creation.mjs";
const failure = code => Object.assign(new Error(code === "projectEditConflict" ? "Project changed during edit" : code === "invalidProjectEdit" ? "Invalid project edit" : code === "projectEditStateInvalid" ? "Project state is invalid" : "Project edit storage failed"), { code });
const validPath = path => typeof path === "string" && path.length > 0 && !/[\\\u0000-\u001f:]/.test(path) && path.split("/").every(part => part && part !== "." && part !== "..");
const range = id => IDBKeyRange.bound(`${id}:`, `${id};`, false, true);
function capture(db, appId) {
  return new Promise((resolve, reject) => {
    let t, app, reference; const files = [];
    const refuse = code => { if (t) { try { t.abort(); } catch {} } reject(failure(code)); };
    try {
      t = db.transaction(["apps", "files", "refs"], "readonly");
      t.onabort = () => reject(failure("projectEditStorageFailed")); t.onerror = () => refuse("projectEditStorageFailed");
      t.oncomplete = () => {
        if (!app || typeof app.name !== "string" || typeof reference !== "string" || !/^blake3:[0-9a-f]{64}$/.test(reference)) reject(failure("projectEditStateInvalid"));
        else resolve({ name: app.name, reference, files });
      };
      const aq = t.objectStore("apps").get(appId), rq = t.objectStore("refs").get(`${appId}:main`);
      aq.onsuccess = () => { app = aq.result; }; rq.onsuccess = () => { reference = rq.result; };
      const q = t.objectStore("files").openCursor(range(appId));
      q.onsuccess = () => {
        try {
          const cursor = q.result; if (!cursor) return;
          files.push([cursor.key.slice(String(appId).length + 1), cursor.value]);
          if (files.length > 1000) { refuse("projectEditStateInvalid"); return; }
          cursor.continue();
        } catch { refuse("projectEditStorageFailed"); }
      };
    } catch { refuse("projectEditStorageFailed"); }
  });
}
function commit(db, appId, filePath, captured, prepared) {
  return new Promise((resolve, reject) => {
    let t, app, reference, appRead = false, refRead = false, filesRead = false, failed = false;
    const original = new Map(captured.files); let seen = 0;
    const refuse = code => { failed = true; if (t) { try { t.abort(); } catch {} } reject(failure(code)); };
    try {
      t = db.transaction(["apps", "files", "objects", "refs", "versions"], "readwrite");
      t.onabort = () => reject(failure("projectEditStorageFailed")); t.onerror = () => refuse("projectEditStorageFailed");
      t.oncomplete = () => failed ? reject(failure("projectEditStorageFailed")) : resolve(prepared.oid);
      const write = () => {
        if (failed || !appRead || !refRead || !filesRead) return;
        if (!app || app.name !== captured.name || reference !== captured.reference || seen !== original.size) { refuse("projectEditConflict"); return; }
        try {
          const q = t.objectStore("versions").get(appId);
          q.onsuccess = () => {
            try {
              if (!Array.isArray(q.result)) { refuse("projectEditStateInvalid"); return; }
              const at = new Date().toISOString();
              const files = new Map(prepared.files);
              t.objectStore("files").put(files.get(filePath), `${appId}:${filePath}`);
              for (const [key, bytes] of prepared.objects) t.objectStore("objects").put(bytes, key);
              t.objectStore("refs").put(prepared.oid, `${appId}:main`);
              if (filePath === "prism/spec.json") t.objectStore("refs").delete(`prism:${appId}`);
              t.objectStore("versions").put([{ oid: prepared.oid, message: `Edit ${filePath}`, timestamp: Math.floor(Date.parse(at) / 1000), dbTimestamp: null, isFavorite: false, note: null }, ...q.result], appId);
              t.objectStore("apps").put({ ...app, updatedAt: at }, appId);
            } catch { refuse("projectEditStorageFailed"); }
          };
        } catch { refuse("projectEditStorageFailed"); }
      };
      const aq = t.objectStore("apps").get(appId), rq = t.objectStore("refs").get(`${appId}:main`);
      aq.onsuccess = () => { app = aq.result; appRead = true; write(); };
      rq.onsuccess = () => { reference = rq.result; refRead = true; write(); };
      const q = t.objectStore("files").openCursor(range(appId));
      q.onsuccess = () => {
        try {
          const cursor = q.result;
          if (!cursor) { filesRead = true; write(); return; }
          const path = cursor.key.slice(String(appId).length + 1);
          if (!original.has(path) || original.get(path) !== cursor.value) { refuse("projectEditConflict"); return; }
          seen++; cursor.continue();
        } catch { refuse("projectEditStorageFailed"); }
      };
    } catch { refuse("projectEditStorageFailed"); }
  });
}
export async function editStoredProject(db, input, boundary) {
  let edit;
  try { edit = structuredClone(input); } catch { throw failure("invalidProjectEdit"); }
  if (!edit || !Number.isSafeInteger(edit.appId) || edit.appId < 1 || !validPath(edit.filePath) || typeof edit.content !== "string") throw failure("invalidProjectEdit");
  const captured = await capture(db, edit.appId);
  const files = Object.fromEntries(captured.files); Object.defineProperty(files, edit.filePath, { value: edit.content, enumerable: true, configurable: true, writable: true });
  const prepared = await prepareExistingProject({ name: captured.name, files }, boundary, captured.reference);
  return commit(db, edit.appId, edit.filePath, captured, prepared);
}
