/* Five Rides to Tableau: app install and offline status. */
(function () {
  var msg = document.getElementById("saveMsg");
  var topBtn = document.getElementById("saveTop"), mainBtn = document.getElementById("saveMain");
  var mq = window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;
  function standalone() { return !!((mq && mq.matches) || navigator.standalone); }
  var deferred = null, audio = { done: 0, total: 12, error: false, known: false };
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 7v7"/><path d="m9 11.5 3 3 3-3"/></svg>';
  function toast(t) { var el = document.getElementById("toast"); if (!el) return; el.textContent = t; el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove("show"); }, 2600); }

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
    if (!was && audio.done >= audio.total && audio.total) {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    }
    paint();
  });
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (hadController) toast("Course updated.");
    hadController = true;
    fill();
  });
  function fill() {
    navigator.serviceWorker.ready.then(function (reg) {
      var w = reg.active || navigator.serviceWorker.controller;
      if (w) w.postMessage({ type: "fill" });
    });
  }
  window.addEventListener("online", fill);
  setTimeout(paint, 0);
  navigator.serviceWorker.register("sw.js", { scope: "./" }).then(fill, function () {
    if (msg) msg.textContent = "Offline mode couldn't start here, so the course needs signal for now.";
  });
})();
