(() => {
  "use strict";

  const config = window.deepNavyAdminRuntime || {};
  const generated = window.deepNavyAdminGeneratedClient || null;
  const ui = {
    signedOut: document.querySelector("[data-signed-out]"),
    authenticated: document.querySelector("[data-authenticated]"),
    signIn: document.querySelector("[data-sign-in]"),
    retrySignIn: document.querySelector("[data-retry-sign-in]"),
    signOut: document.querySelector("[data-sign-out]"),
    operatorSummary: document.querySelector("[data-operator-summary]"),
    operatorName: document.querySelector("[data-operator-name]"),
    operatorRole: document.querySelector("[data-operator-role]"),
    configurationState: document.querySelector("[data-configuration-state]"),
    configurationTitle: document.querySelector("[data-configuration-title]"),
    configurationMessage: document.querySelector("[data-configuration-message]"),
    authState: document.querySelector("[data-auth-state]"),
    authTitle: document.querySelector("[data-auth-title]"),
    authMessage: document.querySelector("[data-auth-message]"),
    authRequestReference: document.querySelector("[data-auth-request-reference]"),
    dataState: document.querySelector("[data-admin-data-state]"),
    dataTitle: document.querySelector("[data-admin-data-title]"),
    dataMessage: document.querySelector("[data-admin-data-message]"),
    dataRequestReference: document.querySelector("[data-admin-request-reference]"),
    refresh: document.querySelector("[data-refresh-dashboard]"),
    observedAt: [...document.querySelectorAll("[data-observed-at]")],
    sessionExpiry: [...document.querySelectorAll("[data-session-expiry]")],
    toast: document.querySelector("[data-toast]")
  };

  if (!ui.signIn || !ui.signedOut || !ui.authenticated) return;

  const state = {
    accessToken: "",
    authorized: false,
    deadline: 0,
    sessionTimer: 0,
    refreshController: null
  };
  const allowedRoles = new Set(["admin", "founder"]);
  const environment = stringValue(config.environment) || "local";
  const oauthStorageKey = `deep-navy.admin.oauth.${stringValue(config.cognito_client_id) || environment}`;
  const sessionMaxAgeSeconds = boundedInteger(config.session_max_age_seconds, 300, 900, 900);
  const apiBaseUrl = normalizeServiceOrigin(config.api_base_url);
  const identity = identityConfiguration();
  const adminApi = createAdminApi();

  function stringValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function boundedInteger(value, minimum, maximum, fallback) {
    return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
  }

  function normalizeServiceOrigin(value) {
    const raw = stringValue(value);
    if (!raw) return "";
    try {
      const url = new URL(raw);
      const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
      if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) return "";
      return url.origin;
    } catch {
      return "";
    }
  }

  function normalizeIssuer(value) {
    const raw = stringValue(value);
    if (!raw) return "";
    try {
      const url = new URL(raw);
      const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
      if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) return "";
      const normalizedPath = url.pathname.replace(/\/$/, "");
      if (!normalizedPath || normalizedPath.includes("//") || /(?:^|\/)\.\.?(?:\/|$)/.test(normalizedPath)) return "";
      return `${url.origin}${normalizedPath}`;
    } catch {
      return "";
    }
  }

  function absoluteSameOriginUrl(value) {
    const raw = stringValue(value);
    if (!raw) return "";
    try {
      const url = new URL(raw, window.location.origin);
      const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
      if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash || url.origin !== window.location.origin) return "";
      return url.toString();
    } catch {
      return "";
    }
  }

  function identityConfiguration() {
    const domain = normalizeServiceOrigin(config.cognito_domain);
    const issuer = normalizeIssuer(config.cognito_issuer);
    const clientId = stringValue(config.cognito_client_id);
    const callbackUrl = absoluteSameOriginUrl(config.cognito_callback_url);
    const logoutUrl = absoluteSameOriginUrl(config.cognito_logout_url);
    const requestedScopes = Array.isArray(config.oauth_scopes)
      ? config.oauth_scopes.filter((scope) => typeof scope === "string" && /^[a-zA-Z0-9:./_-]+$/.test(scope))
      : [];
    const scopes = requestedScopes.length ? requestedScopes : ["openid", "email", "profile"];
    const ready = Boolean(domain && issuer && clientId && callbackUrl && logoutUrl && apiBaseUrl);
    return { domain, issuer, clientId, callbackUrl, logoutUrl, scopes, ready };
  }

  function createAdminApi() {
    if (!apiBaseUrl || generated?.PLATFORM_PROTOS_REVISION !== "fa01d7cc4c68c1e7ee606a44677ad70d16f4c563" || typeof generated.createAdminApi !== "function") return null;
    try {
      return generated.createAdminApi({ baseUrl: apiBaseUrl, defaultTimeoutMs: 12_000 });
    } catch {
      return null;
    }
  }

  function renderConfiguration() {
    const missing = [];
    if (!apiBaseUrl) missing.push("platform API origin");
    if (!identity.domain) missing.push("Cognito domain");
    if (!identity.issuer) missing.push("Cognito issuer");
    if (!identity.clientId) missing.push("Cognito public client ID");
    if (!identity.callbackUrl) missing.push("same-origin callback URL");
    if (!identity.logoutUrl) missing.push("same-origin logout URL");
    if (!adminApi) missing.push("generated API client");

    if (missing.length === 0) {
      setState(ui.configurationState, ui.configurationTitle, ui.configurationMessage, "positive", "Access configuration ready", "Cognito and the generated platform client are configured. The API must still verify every request.");
      ui.signIn.disabled = false;
      return;
    }
    setState(ui.configurationState, ui.configurationTitle, ui.configurationMessage, "negative", "Operator sign-in is unavailable", `Missing or invalid ${missing.join(", ")}. This build will not start an authorization request.`);
    ui.signIn.disabled = true;
  }

  function setState(container, titleElement, messageElement, tone, title, message) {
    if (!container || !titleElement || !messageElement) return;
    container.dataset.tone = tone;
    titleElement.textContent = title;
    messageElement.textContent = message;
    container.hidden = false;
  }

  function showAuthError(title, message, requestId = "") {
    setState(ui.authState, ui.authTitle, ui.authMessage, "negative", title, message);
    if (ui.authRequestReference) {
      ui.authRequestReference.textContent = requestId ? `Request reference: ${requestId}` : "";
      ui.authRequestReference.hidden = !requestId;
    }
    ui.retrySignIn.hidden = !identity.ready;
  }

  function clearAuthError() {
    ui.authState.hidden = true;
    ui.retrySignIn.hidden = true;
    if (ui.authRequestReference) {
      ui.authRequestReference.textContent = "";
      ui.authRequestReference.hidden = true;
    }
  }

  function randomBase64Url(byteLength) {
    const bytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function sha256Base64Url(value) {
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return bytesToBase64Url(new Uint8Array(digest));
  }

  function writeOAuthTransaction(transaction) {
    try {
      window.sessionStorage.setItem(oauthStorageKey, JSON.stringify(transaction));
      return true;
    } catch {
      return false;
    }
  }

  function readOAuthTransaction() {
    try {
      const raw = window.sessionStorage.getItem(oauthStorageKey);
      const value = raw ? JSON.parse(raw) : null;
      if (!value || typeof value.verifier !== "string" || typeof value.state !== "string" || typeof value.nonce !== "string" || typeof value.redirectUri !== "string" || typeof value.createdAt !== "number") return null;
      return value;
    } catch {
      return null;
    }
  }

  function clearOAuthTransaction() {
    try { window.sessionStorage.removeItem(oauthStorageKey); } catch { /* storage can be disabled */ }
  }

  async function beginSignIn() {
    clearAuthError();
    if (!identity.ready || !adminApi || !window.crypto?.subtle) {
      showAuthError("Sign-in is unavailable", "This deployment is missing public identity configuration, the generated API client, or required browser cryptography.");
      return;
    }
    ui.signIn.disabled = true;
    ui.retrySignIn.disabled = true;
    try {
      const verifier = randomBase64Url(64);
      const challenge = await sha256Base64Url(verifier);
      const stateValue = randomBase64Url(32);
      const nonce = randomBase64Url(32);
      if (!writeOAuthTransaction({ verifier, state: stateValue, nonce, redirectUri: identity.callbackUrl, createdAt: Date.now() })) {
        throw new Error("storage_unavailable");
      }
      const authorizeUrl = new URL("/oauth2/authorize", identity.domain);
      authorizeUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: identity.clientId,
        redirect_uri: identity.callbackUrl,
        scope: identity.scopes.join(" "),
        state: stateValue,
        nonce,
        code_challenge_method: "S256",
        code_challenge: challenge,
        prompt: "login"
      }).toString();
      window.location.assign(authorizeUrl.toString());
    } catch {
      clearOAuthTransaction();
      showAuthError("Could not start secure sign-in", "The browser could not create the PKCE transaction. No credentials were sent. Use a current browser with session storage enabled.");
      ui.signIn.disabled = !identity.ready;
      ui.retrySignIn.disabled = !identity.ready;
    }
  }

  function safeOAuthDescription(value) {
    const text = stringValue(value).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 240);
    return text || "Cognito cancelled or rejected the authorization request.";
  }

  async function parseSmallJson(response) {
    const text = await response.text();
    if (text.length > 32_768) throw new Error("response_too_large");
    const parsed = JSON.parse(text || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_response");
    return parsed;
  }

  function decodeJwtPayload(token) {
    try {
      const segments = token.split(".");
      if (segments.length !== 3 || !segments.every(Boolean)) return null;
      const normalized = segments[1].replace(/-/g, "+").replace(/_/g, "/");
      const padding = "=".repeat((4 - normalized.length % 4) % 4);
      const bytes = Uint8Array.from(window.atob(normalized + padding), (character) => character.charCodeAt(0));
      const value = JSON.parse(new TextDecoder().decode(bytes));
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  }

  function numericClaim(claims, name) {
    return Number.isFinite(claims?.[name]) ? Number(claims[name]) : 0;
  }

  function validateTokens(idToken, accessToken, transaction) {
    const idClaims = decodeJwtPayload(idToken);
    const accessClaims = decodeJwtPayload(accessToken);
    const now = Math.floor(Date.now() / 1000);
    const idAudience = stringValue(idClaims?.aud);
    const accessClient = stringValue(accessClaims?.client_id) || stringValue(accessClaims?.aud);
    const idExpiry = numericClaim(idClaims, "exp");
    const accessExpiry = numericClaim(accessClaims, "exp");
    const issuedAt = Math.max(numericClaim(idClaims, "iat"), numericClaim(accessClaims, "iat"));
    const authenticatedAt = Math.max(numericClaim(idClaims, "auth_time"), numericClaim(accessClaims, "auth_time"));

    if (!idClaims || !accessClaims || stringValue(idClaims.iss) !== identity.issuer || stringValue(accessClaims.iss) !== identity.issuer) throw new Error("issuer_mismatch");
    if (idAudience !== identity.clientId || accessClient !== identity.clientId) throw new Error("client_mismatch");
    if (stringValue(idClaims.token_use) !== "id" || stringValue(accessClaims.token_use) !== "access") throw new Error("token_use_mismatch");
    if (stringValue(idClaims.nonce) !== transaction.nonce) throw new Error("nonce_mismatch");
    if (!idExpiry || !accessExpiry || idExpiry <= now || accessExpiry <= now) throw new Error("expired_token");
    if (!issuedAt || issuedAt > now + 60 || !authenticatedAt || authenticatedAt > now + 60 || authenticatedAt < now - sessionMaxAgeSeconds - 60) throw new Error("stale_authentication");

    return Math.min(idExpiry, accessExpiry, authenticatedAt + sessionMaxAgeSeconds) * 1000;
  }

  async function completeCallback() {
    const query = stringValue(window.deepNavyAdminInitialQuery) || window.location.search;
    window.deepNavyAdminInitialQuery = "";
    const params = new URLSearchParams(query);
    const oauthError = params.get("error");
    if (oauthError) {
      clearOAuthTransaction();
      showAuthError("Cognito did not complete sign-in", safeOAuthDescription(params.get("error_description")));
      return;
    }

    const code = stringValue(params.get("code"));
    const returnedState = stringValue(params.get("state"));
    const transaction = readOAuthTransaction();
    clearOAuthTransaction();
    if (!code || !returnedState) {
      showAuthError("Incomplete sign-in callback", "The one-time authorization code and state are missing. Start a fresh sign-in.");
      return;
    }
    if (!transaction || transaction.state !== returnedState || Date.now() - transaction.createdAt > 10 * 60 * 1000 || transaction.redirectUri !== identity.callbackUrl) {
      showAuthError("Authorization state did not match", "This callback was not paired with a recent sign-in from this browser tab. No token request was sent.");
      return;
    }

    setState(ui.authState, ui.authTitle, ui.authMessage, "pending", "Completing secure sign-in", "Exchanging the one-time code with PKCE. Tokens remain in memory.");
    try {
      const tokenUrl = new URL("/oauth2/token", identity.domain);
      const response = await fetch(tokenUrl, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: identity.clientId,
          code,
          code_verifier: transaction.verifier,
          redirect_uri: identity.callbackUrl
        })
      });
      const tokenResponse = await parseSmallJson(response);
      const accessToken = stringValue(tokenResponse.access_token);
      const idToken = stringValue(tokenResponse.id_token);
      if (!response.ok || !accessToken || !idToken) throw new Error("token_exchange_failed");
      const deadline = validateTokens(idToken, accessToken, transaction);
      state.accessToken = accessToken;
      state.deadline = deadline;
      scheduleSessionExpiry();
      await verifyOperator();
    } catch {
      clearSession();
      showAuthError("Secure sign-in could not be verified", "The token exchange or validation failed. The code and any returned tokens were discarded. Start a new sign-in.");
    }
  }

  function requestId() {
    return window.crypto.randomUUID ? window.crypto.randomUUID() : randomBase64Url(18);
  }

  async function verifyOperator() {
    if (!adminApi || !state.accessToken) throw new Error("admin_api_unavailable");
    const clientRequestId = requestId();
    try {
      const response = await adminApi.request("current_user", { accessToken: state.accessToken, requestId: clientRequestId });
      const user = response?.user;
      if (!user || typeof user !== "object") throw new Error("invalid_user_response");
      const roles = Array.isArray(user.platformRoles) ? user.platformRoles.map((role) => stringValue(role).toLowerCase()) : [];
      const authorizedRole = roles.find((role) => allowedRoles.has(role));
      if (!authorizedRole) {
        clearSession();
        showAuthError("Founder or Admin access is required", "The platform verified this account, but it did not return an authorized platform role. No admin data request was sent.", clientRequestId);
        return;
      }
      state.authorized = true;
      showAuthenticated(user, authorizedRole);
      clearAuthError();
      await refreshDashboard();
    } catch (error) {
      const reference = stringValue(error?.requestId) || clientRequestId;
      clearSession();
      showAuthError("The platform could not authorize this operator", safeClientMessage(error, "The identity check failed. No admin data was displayed."), reference);
    }
  }

  function showAuthenticated(user, role) {
    ui.signedOut.hidden = true;
    ui.authenticated.hidden = false;
    ui.signOut.hidden = false;
    ui.operatorSummary.hidden = false;
    ui.operatorName.textContent = stringValue(user.displayName) || stringValue(user.username) || "Authenticated operator";
    ui.operatorRole.textContent = role === "founder" ? "Founder" : "Admin";
    ui.refresh.disabled = false;
    updateSessionExpiryLabel();
  }

  function showSignedOut() {
    ui.signedOut.hidden = false;
    ui.authenticated.hidden = true;
    ui.signOut.hidden = true;
    ui.operatorSummary.hidden = true;
    ui.refresh.disabled = true;
    resetMetrics();
  }

  function scheduleSessionExpiry() {
    if (state.sessionTimer) window.clearTimeout(state.sessionTimer);
    const remaining = state.deadline - Date.now();
    if (remaining <= 0) {
      expireSession();
      return;
    }
    state.sessionTimer = window.setTimeout(expireSession, remaining);
  }

  function updateSessionExpiryLabel() {
    if (!state.deadline) return;
    const label = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(state.deadline));
    ui.sessionExpiry.forEach((element) => { element.textContent = label; });
  }

  function clearSession() {
    state.accessToken = "";
    state.authorized = false;
    state.deadline = 0;
    if (state.sessionTimer) window.clearTimeout(state.sessionTimer);
    state.sessionTimer = 0;
    if (state.refreshController) state.refreshController.abort();
    state.refreshController = null;
  }

  function expireSession() {
    clearSession();
    showSignedOut();
    showAuthError("Operator session expired", "The short-lived admin session reached its browser ceiling. Sign in again to request a fresh, MFA-backed session.");
  }

  function safeClientMessage(error, fallback) {
    if (!error || typeof error !== "object") return fallback;
    const safeCodes = new Set(["unauthenticated", "permission_denied", "unavailable", "unimplemented", "not_found", "deadline_exceeded", "resource_exhausted", "failed_precondition"]);
    return safeCodes.has(stringValue(error.code)) && stringValue(error.message) ? stringValue(error.message).slice(0, 300) : fallback;
  }

  function setDataState(tone, title, message, requestReference = "") {
    setState(ui.dataState, ui.dataTitle, ui.dataMessage, tone, title, message);
    ui.dataRequestReference.textContent = requestReference ? `Request reference: ${requestReference}` : "";
    ui.dataRequestReference.hidden = !requestReference;
  }

  function metricElements(name) {
    return document.querySelectorAll(`[data-metric="${name}"]`);
  }

  function setMetric(name, value) {
    metricElements(name).forEach((element) => { element.textContent = value; });
  }

  function resetMetrics() {
    ["mrr", "arr", "active-customers", "active-teams", "gross-margin", "incidents", "prs-merged"].forEach((name) => setMetric(name, "—"));
  }

  function integerValue(value) {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === "string" && /^-?(?:0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
    throw new Error("invalid_integer");
  }

  function formatCount(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(integerValue(value));
  }

  function formatMoney(value) {
    if (!value || typeof value !== "object") throw new Error("invalid_money");
    const currencyCode = stringValue(value.currencyCode).toUpperCase();
    const units = integerValue(value.units);
    const nanos = Number(value.nanos || 0);
    if (!/^[A-Z]{3}$/.test(currencyCode) || !Number.isInteger(nanos) || Math.abs(nanos) >= 1_000_000_000) throw new Error("invalid_money");
    if ((units > 0n && nanos < 0) || (units < 0n && nanos > 0)) throw new Error("invalid_money_sign");
    if (units >= -9_000_000_000_000n && units <= 9_000_000_000_000n) {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(Number(units) + nanos / 1_000_000_000);
    }
    return `${currencyCode} ${units.toString()}`;
  }

  function renderOverview(response) {
    const overview = response?.overview;
    if (!overview || typeof overview !== "object") throw new Error("invalid_overview");
    const grossMargin = Number(overview.grossMargin);
    if (!Number.isFinite(grossMargin)) throw new Error("invalid_gross_margin");
    setMetric("mrr", formatMoney(overview.monthlyRecurringRevenue));
    setMetric("arr", formatMoney(overview.annualRecurringRevenue));
    setMetric("active-customers", formatCount(overview.activeCustomers));
    setMetric("active-teams", formatCount(overview.activeTeams));
    setMetric("gross-margin", new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(grossMargin));
    setMetric("incidents", formatCount(overview.productionIncidents));
    setMetric("prs-merged", formatCount(overview.pullRequestsMerged));
  }

  async function loadOverview(signal) {
    const clientRequestId = requestId();
    setDataState("pending", "Loading authorized overview", "Requesting AdminService.GetAdminOverview through the pinned generated client.");
    try {
      const response = await adminApi.request("admin_overview", { accessToken: state.accessToken, requestId: clientRequestId, signal });
      renderOverview(response);
      setDataState("positive", "Authorized overview loaded", "The seven contracted aggregates were returned by the platform API. Uncontracted sections remain clearly marked.");
      return true;
    } catch (error) {
      resetMetrics();
      const code = stringValue(error?.code);
      const reference = stringValue(error?.requestId) || clientRequestId;
      if (code === "unauthenticated") {
        expireSession();
        return false;
      }
      if (code === "unimplemented" || code === "not_found") {
        setDataState("neutral", "Admin overview is not deployed", "The generated contract exists, but this API deployment does not currently serve it. No substitute data source was used.", reference);
        return false;
      }
      setDataState("negative", "Admin overview unavailable", safeClientMessage(error, "The platform did not return a valid authorized overview. No values were displayed."), reference);
      return false;
    }
  }

  function setProbe(name, tone, label, detail) {
    document.querySelectorAll(`[data-probe-status="${name}"]`).forEach((element) => {
      element.classList.remove("status--positive", "status--pending", "status--negative", "status--neutral");
      element.classList.add(`status--${tone}`);
      const indicator = document.createElement("span");
      indicator.setAttribute("aria-hidden", "true");
      element.replaceChildren(indicator, document.createTextNode(label));
    });
    document.querySelectorAll(`[data-probe-detail="${name}"]`).forEach((element) => { element.textContent = detail; });
  }

  async function probe(name, path, signal) {
    setProbe(name, "pending", "Checking", "Waiting for the public probe.");
    try {
      const response = await fetch(new URL(path, apiBaseUrl), {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: { Accept: "application/json, text/plain;q=0.9" },
        signal
      });
      if (!response.ok) {
        setProbe(name, "negative", `HTTP ${response.status}`, `The public probe returned HTTP ${response.status}.`);
        return false;
      }
      setProbe(name, "positive", name === "health" ? "Healthy" : "Ready", "This browser received a successful public probe response.");
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") setProbe(name, "negative", "Unreachable", "This browser could not reach the public probe.");
      return false;
    }
  }

  async function refreshDashboard() {
    if (!state.authorized || !state.accessToken || Date.now() >= state.deadline || !adminApi) {
      expireSession();
      return;
    }
    if (state.refreshController) state.refreshController.abort();
    state.refreshController = new AbortController();
    ui.refresh.disabled = true;
    ui.refresh.classList.add("is-refreshing");
    try {
      await Promise.all([
        loadOverview(state.refreshController.signal),
        probe("health", "/healthz", state.refreshController.signal),
        probe("readiness", "/readyz", state.refreshController.signal)
      ]);
      const observed = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date());
      ui.observedAt.forEach((element) => { element.textContent = observed; });
    } finally {
      if (state.authorized) ui.refresh.disabled = false;
      ui.refresh.classList.remove("is-refreshing");
    }
  }

  function signOut() {
    clearOAuthTransaction();
    clearSession();
    showSignedOut();
    clearAuthError();
    if (identity.domain && identity.clientId && identity.logoutUrl) {
      const logout = new URL("/logout", identity.domain);
      logout.search = new URLSearchParams({ client_id: identity.clientId, logout_uri: identity.logoutUrl }).toString();
      window.location.assign(logout.toString());
    }
  }

  function activateNavigation(event) {
    const link = event.target.closest(".nav-link");
    if (!link) return;
    document.querySelectorAll(".nav-link").forEach((candidate) => {
      candidate.classList.toggle("is-active", candidate === link);
      if (candidate === link) candidate.setAttribute("aria-current", "page");
      else candidate.removeAttribute("aria-current");
    });
  }

  ui.signIn.addEventListener("click", beginSignIn);
  ui.retrySignIn.addEventListener("click", beginSignIn);
  ui.signOut.addEventListener("click", signOut);
  ui.refresh.addEventListener("click", refreshDashboard);
  document.querySelector(".side-rail nav")?.addEventListener("click", activateNavigation);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });

  renderConfiguration();
  showSignedOut();
  if (document.body.dataset.authCallback === "true") completeCallback();
})();
