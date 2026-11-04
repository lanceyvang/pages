/* Five Rides to Tableau: offline worker.
   Core files are cached on install. Narration (12 mp3 files) is cached in its own
   cache after install, one file at a time, so a dropped signal only loses one file. */
const VERSION = "cb082eeccf";
const CORE = "five-rides-core-" + VERSION;
const AUDIO = "five-rides-audio-74a124f2b5";
const CORE_FILES = ["./", "index.html", "manifest.json", "pwa.js", "audio/ride-1.js", "audio/ride-2.js", "audio/ride-3.js", "audio/ride-4.js", "audio/ride-5.js", "audio/ride-6.js", "icons/apple-touch-icon.png", "icons/favicon-48.png", "icons/icon-192-maskable.png", "icons/icon-192.png", "icons/icon-512-maskable.png", "icons/icon-512.png", "fonts/AtkinsonHyperlegible-37a72071.woff2", "fonts/AtkinsonHyperlegible-4577a257.woff2", "fonts/AtkinsonHyperlegible-50207189.woff2", "fonts/AtkinsonHyperlegible-54a74383.woff2", "fonts/AtkinsonHyperlegible-8d7aedff.woff2", "fonts/AtkinsonHyperlegible-dc4fa2c8.woff2", "fonts/BricolageGrotesque-4efd1a5a.woff2", "fonts/BricolageGrotesque-6441e9c6.woff2", "fonts/JetBrainsMono-2b68e366.woff2", "fonts/JetBrainsMono-be8484af.woff2"];
const AUDIO_FILES = ["audio/e1.mp3", "audio/e2.mp3", "audio/e3.mp3", "audio/e4.mp3", "audio/e5.mp3", "audio/e6.mp3", "audio/l1.mp3", "audio/l2.mp3", "audio/l3.mp3", "audio/l4.mp3", "audio/l5.mp3", "audio/l6.mp3", "audio/r1-1.mp3", "audio/r1-2.mp3", "audio/r1-3.mp3", "audio/r1-4.mp3"];
const abs = (u) => new URL(u, self.registration.scope).href;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CORE)
      .then((c) => c.addAll(CORE_FILES.map((u) => new Request(abs(u), { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith("five-rides-") && k !== CORE && k !== AUDIO) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

async function tell(msg) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  list.forEach((c) => c.postMessage(msg));
}

let filling = null;
function fillAudio() {
  if (filling) return filling;
  filling = (async () => {
    const c = await caches.open(AUDIO);
    const total = AUDIO_FILES.length;
    let done = 0;
    for (const u of AUDIO_FILES) if (await c.match(abs(u))) done++;
    await tell({ type: "audio", done, total });
    for (const u of AUDIO_FILES) {
      if (await c.match(abs(u))) continue;
      try {
        const r = await fetch(abs(u), { cache: "no-cache" });
        if (!r.ok || r.status !== 200) throw new Error("status " + r.status);
        await c.put(abs(u), r);
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
});

/* Audio elements ask for byte ranges, so cached mp3s are sliced to a 206 reply. */
async function audioReply(req) {
  const res = await caches.match(req.url, { cacheName: AUDIO, ignoreSearch: true });
  if (!res) {
    try { return await fetch(req); } catch (err) { return new Response("", { status: 504, statusText: "Offline" }); }
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
