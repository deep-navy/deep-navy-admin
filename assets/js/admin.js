(function () {
  "use strict";

  var root = document.body;
  var refreshButton = document.querySelector("[data-refresh-probes]");
  var apiOrigin = root.dataset.apiOrigin;
  var healthPath = root.dataset.healthPath;
  var readinessPath = root.dataset.readinessPath;
  var requestTimeout = 5000;

  function setStatus(probe, state, label, summary, detail) {
    document.querySelectorAll('[data-probe-status="' + probe + '"]').forEach(function (element) {
      element.classList.remove("status--positive", "status--pending", "status--negative", "status--neutral");
      element.classList.add("status--" + state);
      element.innerHTML = '<span aria-hidden="true"></span>' + label;
    });

    document.querySelectorAll('[data-probe-summary="' + probe + '"]').forEach(function (element) {
      element.textContent = summary;
    });

    document.querySelectorAll('[data-probe-detail="' + probe + '"]').forEach(function (element) {
      element.textContent = detail;
    });
  }

  function endpoint(path) {
    return new URL(path, apiOrigin).toString();
  }

  async function probe(name, path, healthyLabel, healthySummary) {
    var controller = new AbortController();
    var timeout = window.setTimeout(function () {
      controller.abort();
    }, requestTimeout);

    setStatus(name, "pending", "Checking", "Checking endpoint", "Waiting for the public " + name + " probe.");

    try {
      var response = await fetch(endpoint(path), {
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json, text/plain;q=0.9" },
        method: "GET",
        mode: "cors",
        redirect: "error",
        signal: controller.signal
      });

      if (!response.ok) {
        setStatus(
          name,
          "negative",
          "Unavailable",
          "HTTP " + response.status,
          "The endpoint responded with HTTP " + response.status + "."
        );
        return false;
      }

      setStatus(
        name,
        "positive",
        healthyLabel,
        healthySummary,
        "The endpoint returned a successful response to this browser."
      );
      return true;
    } catch (_error) {
      setStatus(
        name,
        "negative",
        "Unreachable",
        "No response",
        "This browser could not reach the endpoint. It may be offline, blocked by CORS, or not deployed yet."
      );
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function refresh() {
    if (!apiOrigin || !healthPath || !readinessPath) {
      setStatus("health", "neutral", "Not configured", "No endpoint", "This build does not define an API health endpoint.");
      setStatus("readiness", "neutral", "Not configured", "No endpoint", "This build does not define an API readiness endpoint.");
      return;
    }

    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.classList.add("is-refreshing");
    }

    await Promise.all([
      probe("health", healthPath, "Healthy", "API responding"),
      probe("readiness", readinessPath, "Ready", "API ready")
    ]);

    document.querySelectorAll("[data-observed-at]").forEach(function (element) {
      element.textContent = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit"
      }).format(new Date());
    });

    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.classList.remove("is-refreshing");
    }
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", refresh);
  }

  refresh();
  window.setInterval(refresh, 60000);
})();
