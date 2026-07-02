/* DevOps Handbook — interactive progress tracking + flashcard quiz mode.
 * Uses Material for MkDocs' document$ observable so it runs on every
 * (instant) page navigation, not just the first load. State persists in
 * the browser via localStorage — no backend, no account needed. */

(function () {
  var run = function () {
    initCheckboxes();
    initMeter();
    initFlashcards();
  };

  // document$ is provided by Material when navigation.instant is on.
  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(run);
  } else {
    document.addEventListener("DOMContentLoaded", run);
  }

  function key(suffix) {
    return "dhb:" + location.pathname + ":" + suffix;
  }

  /* Persistent, clickable task-list checkboxes (Material renders them disabled). */
  function initCheckboxes() {
    var boxes = document.querySelectorAll(
      ".md-content .task-list-item input[type=checkbox]"
    );
    boxes.forEach(function (box, i) {
      box.disabled = false;
      var k = key("chk:" + i);
      if (localStorage.getItem(k) === "1") box.checked = true;
      box.addEventListener("change", function () {
        localStorage.setItem(k, box.checked ? "1" : "0");
        updateMeter();
      });
    });
  }

  /* Inject a progress bar on pages with several checkboxes (the tracker). */
  function initMeter() {
    var boxes = document.querySelectorAll(
      ".md-content .task-list-item input[type=checkbox]"
    );
    if (boxes.length < 3) return;
    if (document.querySelector(".dhb-progress")) return;
    var bar = document.createElement("div");
    bar.className = "dhb-progress";
    bar.innerHTML =
      '<div class="dhb-progress-fill"></div>' +
      '<span class="dhb-progress-label"></span>';
    var inner = document.querySelector(".md-content__inner");
    if (!inner) return;
    var h1 = inner.querySelector("h1");
    if (h1) h1.insertAdjacentElement("afterend", bar);
    else inner.insertBefore(bar, inner.firstChild);
    updateMeter();
  }

  function updateMeter() {
    var bar = document.querySelector(".dhb-progress");
    if (!bar) return;
    var boxes = document.querySelectorAll(
      ".md-content .task-list-item input[type=checkbox]"
    );
    var done = 0;
    boxes.forEach(function (b) {
      if (b.checked) done++;
    });
    var pct = boxes.length ? Math.round((done / boxes.length) * 100) : 0;
    bar.querySelector(".dhb-progress-fill").style.width = pct + "%";
    bar.querySelector(".dhb-progress-label").textContent =
      done + " / " + boxes.length + " done  ·  " + pct + "%";
  }

  /* Flashcards page: blur the answer column until clicked; add a global toggle. */
  function initFlashcards() {
    if (location.pathname.indexOf("17-flashcards") === -1) return;
    var inner = document.querySelector(".md-content__inner");
    if (!inner) return;
    var tables = inner.querySelectorAll("table");
    if (!tables.length) return;

    tables.forEach(function (t) {
      t.querySelectorAll("tbody tr").forEach(function (row) {
        var cells = row.querySelectorAll("td");
        if (cells.length < 2) return;
        var ans = cells[cells.length - 1];
        if (ans.classList.contains("dhb-fc-answer")) return;
        ans.classList.add("dhb-fc-answer");
        ans.addEventListener("click", function () {
          ans.classList.toggle("dhb-hidden");
        });
      });
    });

    if (document.querySelector(".dhb-fc-toggle")) return;
    var btn = document.createElement("button");
    btn.className = "md-button md-button--primary dhb-fc-toggle";
    var hidden = false;
    var label = function () {
      btn.textContent = hidden
        ? "👁️  Show all answers"
        : "🙈  Quiz mode — hide answers";
    };
    label();
    btn.addEventListener("click", function () {
      hidden = !hidden;
      document.querySelectorAll(".dhb-fc-answer").forEach(function (c) {
        c.classList.toggle("dhb-hidden", hidden);
      });
      label();
    });
    var hint = document.createElement("p");
    hint.className = "dhb-fc-hint";
    hint.textContent =
      "Tip: quiz mode hides answers — click any single answer to reveal just that one.";
    var h1 = inner.querySelector("h1");
    if (h1) {
      h1.insertAdjacentElement("afterend", hint);
      h1.insertAdjacentElement("afterend", btn);
    }
  }
})();
