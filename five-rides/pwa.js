/* Five Rides to Tableau: app install and offline status. */
(function () {
  var msg = document.getElementById("saveMsg");
  var topBtn = document.getElementById("saveTop"), mainBtn = document.getElementById("saveMain");
  var mq = window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;
  function standalone() { return !!((mq && mq.matches) || navigator.standalone); }
  var deferred = null, audio = { done: 0, total: 16, error: false, known: false, waiting: false, mb: 0 };
  var consent = false, later = false; /* this visit only: the reader said yes / not now to downloading on mobile data */
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 7v7"/><path d="m9 11.5 3 3 3-3"/></svg>';
  function toast(t) { var el = document.getElementById("toast"); if (!el) return; el.textContent = t; el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove("show"); }, 2600); }

  /* Small in-page bar: the mobile-data download ask and the update reload. */
  var bar = null;
  function hideBar() { if (bar) { bar.hidden = true; bar.removeAttribute("data-kind"); } }
  function showBar(kind, html, acts) {
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "pwa-bar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Offline app");
      bar.innerHTML = '<p role="status" aria-live="polite"></p><div class="acts"></div>';
      bar.hidden = true;
      document.body.appendChild(bar);
    }
    var box = bar.querySelector(".acts"), line = bar.querySelector("p");
    box.textContent = "";
    /* a beat later, so screen readers hear the live region change */
    setTimeout(function () { if (bar.getAttribute("data-kind") === kind) line.innerHTML = html; }, 60);
    line.textContent = "";
    acts.forEach(function (a, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn" + (i === 0 ? " primary" : ""); b.textContent = a[0];
      b.addEventListener("click", a[1]);
      box.appendChild(b);
    });
    bar.setAttribute("data-kind", kind);
    bar.hidden = false;
  }
  function conn() { return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null; }
  function saver() { var c = conn(); return !!(c && c.saveData); }
  function metered() { var c = conn(); return !!(c && (c.saveData || c.type === "cellular")); }
  function askShown() { return !!(bar && !bar.hidden && bar.getAttribute("data-kind") === "ask"); }
  function startNow() { consent = true; later = false; audio.waiting = false; if (askShown()) hideBar(); paint(); fill(); }
  function askDownload() {
    if (later || consent || (bar && bar.getAttribute("data-kind") === "update")) return;
    var n = audio.total - audio.done, size = audio.mb ? " (about " + Math.max(1, Math.round(audio.mb)) + " MB)" : "";
    showBar("ask", "<b>Save the narration for offline?</b> " + (saver() ? "Data Saver is on" : "You're on mobile data") +
      ", and " + n + " audio file" + (n === 1 ? "" : "s") + size + " " + (n === 1 ? "is" : "are") + " left to download.",
      [["Download now", startNow], ["Later", function () { later = true; hideBar(); paint(); }]]);
  }

  function dress(b, label, aria) {
    if (!b) return;
    var fresh = b.cloneNode(false);
    fresh.innerHTML = ICON + label;
    fresh.setAttribute("aria-label", aria);
    fresh.hidden = true;
    b.parentNode.replaceChild(fresh, b);
    return fresh;
  }
  topBtn = dress(topBtn, "Install", "Install the course as an app");
  mainBtn = dress(mainBtn, "Install the app", "Install the course as an app");
  function showInstall(on) { [topBtn, mainBtn].forEach(function (b) { if (b) b.hidden = !on; }); }

  function paint() {
    if (!msg) return;
    var t;
    if (!("serviceWorker" in navigator)) {
      t = "This browser can't keep the course offline. Open it in Chrome to install it.";
    } else if (!audio.known) {
      t = "Getting the course ready for offline.";
    } else if (audio.done < audio.total && audio.waiting) {
      t = "The narration isn't saved for offline yet (" + audio.done + " of " + audio.total + " files). " +
        (saver() ? "Data Saver is on, so it waits until you choose to download it." : "It downloads by itself on Wi-Fi.");
    } else if (audio.done < audio.total) {
      t = audio.error
        ? "The narration paused at " + audio.done + " of " + audio.total + " files. It picks up again the next time you open the course with signal."
        : "Downloading the narration for offline: " + audio.done + " of " + audio.total + " files.";
    } else {
      t = "Ready offline. All six rides, narration and episodes included, work with no signal.";
    }
    if (!standalone()) {
      if (deferred) t += " Tap Install to add it to your home screen.";
      else if (audio.known && audio.done >= audio.total) t += " To install it, open Chrome's menu and tap Add to home screen, then Install.";
    }
    msg.textContent = t;
    if (audio.waiting && audio.done < audio.total && !askShown()) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn"; b.textContent = "Download the narration now";
      b.addEventListener("click", startNow);
      msg.appendChild(b);
    }
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    showInstall(!standalone());
    paint();
  });
  [topBtn, mainBtn].forEach(function (b) {
    if (!b) return;
    b.addEventListener("click", function () {
      if (!deferred) return;
      var p = deferred; deferred = null;
      p.prompt();
      (p.userChoice || Promise.resolve({})).then(function (c) {
        if (c && c.outcome === "accepted") { showInstall(false); }
        paint();
      });
    });
  });
  window.addEventListener("appinstalled", function () {
    deferred = null; showInstall(false);
    toast("Installed. Find Five Rides on your home screen.");
    paint();
  });
  if (mq && mq.addEventListener) mq.addEventListener("change", paint);

  if (!("serviceWorker" in navigator)) { setTimeout(paint, 0); return; }

  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type !== "audio") return;
    var was = audio.known && audio.done >= audio.total;
    audio.known = true; audio.done = d.done; audio.total = d.total; audio.error = !!d.error;
    if (d.status) {
      /* answer to "status" on mobile data: ask before downloading */
      audio.mb = d.mb || 0;
      audio.waiting = d.done < d.total && !d.busy && !consent;
      if (audio.waiting) askDownload();
    } else {
      audio.waiting = false;
    }
    if (!was && audio.done >= audio.total && audio.total) {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    }
    paint();
  });
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (hadController) {
      showBar("update", "<b>Course updated.</b> Reload to use the new version.",
        [["Reload", function () { hideBar(); location.reload(); }], ["Not now", function () { hideBar(); if (audio.waiting) askDownload(); paint(); }]]);
    }
    hadController = true;
    fill();
  });
  function fill() {
    navigator.serviceWorker.ready.then(function (reg) {
      var w = reg.active || navigator.serviceWorker.controller;
      if (!w) return;
      /* on mobile data or Data Saver, find out what's missing and ask first; on Wi-Fi or unknown, just download */
      w.postMessage({ type: metered() && !consent ? "status" : "fill" });
    });
  }
  window.addEventListener("online", fill);
  var c0 = conn();
  if (c0 && c0.addEventListener) c0.addEventListener("change", function () {
    /* moved onto Wi-Fi (and Data Saver is off): download without asking */
    if (audio.waiting && !metered()) { if (askShown()) hideBar(); audio.waiting = false; paint(); fill(); }
  });
  setTimeout(paint, 0);
  navigator.serviceWorker.register("sw.js", { scope: "./" }).then(fill, function () {
    if (msg) msg.textContent = "Offline mode couldn't start here, so the course needs signal for now.";
  });
})();
