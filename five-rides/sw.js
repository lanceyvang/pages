/* Five Rides to Tableau: offline worker.
   Core files are cached on install. Each narration mp3 is cached on its own in one
   audio cache, stamped with that file's content hash, so changing one mp3 only
   re-downloads that file. The page asks for the download ("fill") and checks how
   much is left ("status"); files are fetched one at a time, so a dropped signal
   only loses one file. */
const VERSION = "00975c455f";
const CORE = "five-rides-core-" + VERSION;
const AUDIO = "five-rides-audio";
const HASH = "X-Five-Rides-Hash";
const CORE_FILES = ["./", "index.html", "manifest.json", "pwa.js", "audio/ride-1.js", "audio/ride-2.js", "audio/ride-3.js", "audio/ride-4.js", "audio/ride-5.js", "audio/ride-6.js", "icons/apple-touch-icon.png", "icons/favicon-48.png", "icons/icon-192-maskable.png", "icons/icon-192.png", "icons/icon-512-maskable.png", "icons/icon-512.png", "fonts/AtkinsonHyperlegible-37a72071.woff2", "fonts/AtkinsonHyperlegible-4577a257.woff2", "fonts/AtkinsonHyperlegible-50207189.woff2", "fonts/AtkinsonHyperlegible-54a74383.woff2", "fonts/AtkinsonHyperlegible-8d7aedff.woff2", "fonts/AtkinsonHyperlegible-dc4fa2c8.woff2", "fonts/BricolageGrotesque-4efd1a5a.woff2", "fonts/BricolageGrotesque-6441e9c6.woff2", "fonts/JetBrainsMono-2b68e366.woff2", "fonts/JetBrainsMono-be8484af.woff2"];
const AUDIO_FILES = [{"u":"audio/e1.mp3","h":"5c3a20838a8b","s":1233063},{"u":"audio/e2.mp3","h":"cecb7edb56f4","s":1647783},{"u":"audio/e3.mp3","h":"f7e49a623874","s":1436535},{"u":"audio/e4.mp3","h":"33ced804d625","s":1831671},{"u":"audio/e5.mp3","h":"f50d34f4eebf","s":1521351},{"u":"audio/e6.mp3","h":"afd8f325b6e8","s":1128087},{"u":"audio/l1.mp3","h":"9eba15a2435e","s":3637575},{"u":"audio/l2.mp3","h":"d9b9c6cb82c7","s":2881575},{"u":"audio/l3.mp3","h":"cff7a2e20e9b","s":2742183},{"u":"audio/l4.mp3","h":"47af2f1ab81b","s":5031495},{"u":"audio/l5.mp3","h":"d62d548fa345","s":2508903},{"u":"audio/l6.mp3","h":"c4689f062743","s":1739079},{"u":"audio/r1-1.mp3","h":"1520179e24aa","s":372807},{"u":"audio/r1-2.mp3","h":"6a6ff1adf450","s":313767},{"u":"audio/r1-3.mp3","h":"6a960f66da36","s":308871},{"u":"audio/r1-4.mp3","h":"67fd99c8e8a5","s":333927}]; /* [{u: path, h: content hash, s: bytes}] */
const abs = (u) => new URL(u, self.registration.scope).href;
const bare = (u) => { const x = new URL(u, self.registration.scope); x.search = ""; x.hash = ""; return x.href; };
const BY_URL = new Map(AUDIO_FILES.map((f) => [abs(f.u), f]));
const subtle = self.crypto && self.crypto.subtle;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CORE)
      .then((c) => c.addAll(CORE_FILES.map((u) => new Request(abs(u), { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

/* A cached mp3 counts only when its stamp matches the file's current hash. */
async function fresh(c, f) {
  const r = await c.match(abs(f.u));
  return r && r.headers.get(HASH) === f.h ? r : null;
}
async function stamp(res, h) {
  const b = await res.blob();
  const hd = new Headers(res.headers);
  hd.set(HASH, h);
  if (!hd.get("Content-Type")) hd.set("Content-Type", "audio/mpeg");
  return new Response(b, { status: 200, headers: hd });
}
async function hashOf(res) {
  const d = new Uint8Array(await subtle.digest("SHA-256", await res.arrayBuffer()));
  return Array.from(d.slice(0, 6), (x) => x.toString(16).padStart(2, "0")).join("");
}

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const audio = await caches.open(AUDIO);
    for (const k of await caches.keys()) {
      if (k.startsWith("five-rides-audio-")) {
        /* older builds kept all narration in one cache named by one hash: keep the files that still match */
        const old = await caches.open(k);
        if (subtle) {
          for (const f of AUDIO_FILES) {
            try {
              if (await fresh(audio, f)) continue;
              const r = await old.match(abs(f.u));
              if (r && (await hashOf(r.clone())) === f.h) await audio.put(abs(f.u), await stamp(r, f.h));
            } catch (err) { /* that file is fetched again later */ }
          }
        }
        await caches.delete(k);
      } else if (k.startsWith("five-rides-") && k !== CORE && k !== AUDIO) {
        await caches.delete(k);
      }
    }
    /* drop narration files that are no longer part of the course */
    if (audio.keys && audio.delete) {
      for (const r of await audio.keys()) if (!BY_URL.has(bare(r.url))) await audio.delete(r);
    }
    await self.clients.claim();
  })());
});

async function tell(msg) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  list.forEach((c) => c.postMessage(msg));
}

async function audioState(c) {
  let done = 0, left = 0;
  for (const f of AUDIO_FILES) { if (await fresh(c, f)) done++; else left += f.s || 0; }
  return { done, total: AUDIO_FILES.length, mb: Math.round(left / 1e5) / 10 };
}

let filling = null;
function fillAudio() {
  if (filling) return filling;
  filling = (async () => {
    const c = await caches.open(AUDIO);
    const st = await audioState(c);
    const total = st.total;
    let done = st.done;
    await tell({ type: "audio", done, total });
    for (const f of AUDIO_FILES) {
      if (await fresh(c, f)) continue;
      try {
        const r = await fetch(abs(f.u), { cache: "no-cache" });
        if (!r.ok || r.status !== 200) throw new Error("status " + r.status);
        await c.put(abs(f.u), await stamp(r, f.h));
        done++;
        await tell({ type: "audio", done, total });
      } catch (err) {
        await tell({ type: "audio", done, total, error: true });
        return false;
      }
    }
    return true;
  })().finally(() => { filling = null; });
  return filling;
}

self.addEventListener("message", (e) => {
  const t = e.data && e.data.type;
  if (t === "fill") e.waitUntil(fillAudio());
  /* how much narration is still missing, without downloading anything */
  if (t === "status") e.waitUntil(caches.open(AUDIO).then(audioState).then((st) => tell(Object.assign({ type: "audio", status: true, busy: !!filling }, st))));
});

/* Audio elements ask for byte ranges, so cached mp3s are sliced to a 206 reply. */
async function audioReply(req) {
  const res = await caches.match(req.url, { cacheName: AUDIO, ignoreSearch: true });
  if (!res) {
    try { return await fetch(req); } catch (err) { return new Response("", { status: 504, statusText: "Offline" }); }
  }
  const f = BY_URL.get(bare(req.url));
  if (f && res.headers.get(HASH) !== f.h) {
    /* an older copy of a file that has changed: prefer the new one, fall back to the old one offline */
    try { const net = await fetch(req); if (net.ok) return net; } catch (err) { /* use the cached copy */ }
  }
  const range = req.headers.get("range");
  if (!range) return res;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === "" && m[2] === "")) return res;
  const blob = await res.blob();
  const size = blob.size;
  let start, end;
  if (m[1] === "") { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, statusText: "Range Not Satisfiable", headers: { "Content-Range": "bytes */" + size } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
      "Content-Length": String(end - start + 1),
      "Content-Range": "bytes " + start + "-" + end + "/" + size,
      "Accept-Ranges": "bytes",
    },
  });
}

async function coreReply(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200 && res.type === "basic") {
      const c = await caches.open(CORE);
      c.put(req, res.clone());
    }
    return res;
  } catch (err) {
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

async function pageReply(req) {
  const hit = await caches.match(abs("./"), { cacheName: CORE }) || await caches.match(abs("index.html"), { cacheName: CORE });
  if (hit) return hit;
  try { return await fetch(req); } catch (err) { return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } }); }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") { e.respondWith(pageReply(req)); return; }
  if (/\.mp3$/i.test(url.pathname)) { e.respondWith(audioReply(req)); return; }
  e.respondWith(coreReply(req));
});
