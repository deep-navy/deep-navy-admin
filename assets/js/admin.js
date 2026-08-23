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
    overviewSource: [...document.querySelectorAll("[data-overview-source]")],
    sessionExpiry: [...document.querySelectorAll("[data-session-expiry]")],
    customerDetail: document.querySelector("[data-customer-detail]"),
    customerDetailTitle: document.querySelector("[data-customer-detail-title]"),
    customerDetailState: document.querySelector("[data-customer-detail-state]"),
    customerDetailClose: document.querySelector("[data-customer-detail-close]"),
    customerReliabilityState: document.querySelector("[data-customer-reliability-state]"),
    customerReliabilityMore: document.querySelector("[data-customer-reliability-more]"),
    toast: document.querySelector("[data-toast]")
  };

  if (!ui.signIn || !ui.signedOut || !ui.authenticated) return;

  const state = {
    accessToken: "",
    authorized: false,
    deadline: 0,
    sessionTimer: 0,
    refreshController: null,
    customerDetailController: null,
    customerDetailGeneration: 0,
    selectedCustomerId: "",
    reliabilityRecords: [],
    reliabilityRecordIds: new Set(),
    reliabilityNextPageToken: "",
    reliabilityPageTokens: new Set(),
    reliabilityLoading: false,
    reliabilityLastPeriodStart: null,
    runtimeInstances: new Map(),
    runtimeCursor: 0n,
    alertInstances: new Map(),
    alertCursor: 0n,
    streamController: null,
    runtimeRenderQueued: false,
    alertRenderQueued: false
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

  function opaquePageToken(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("invalid_admin_page_cursor");
    return value;
  }

  function safeResourceId(value) {
    return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value) ? value : "";
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
    if (!apiBaseUrl || generated?.PLATFORM_PROTOS_REVISION !== "39ae22707fe8ac5185d1383dc088426af63cc5a1" || typeof generated.createAdminApi !== "function") return null;
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

  // The banner callouts are design-system callouts, so a tone is a modifier rather
  // than a private class. One helper, because the configuration banner, the sign-in
  // error and the projection banner all move through the same set of states.
  const CALLOUT_FOR_TONE = { positive: " dn-callout--success", pending: " dn-callout--live", negative: " dn-callout--danger", neutral: "" };

  function setState(container, titleElement, messageElement, tone, title, message) {
    if (!container || !titleElement || !messageElement) return;
    container.dataset.tone = tone;
    container.className = `dn-callout${CALLOUT_FOR_TONE[tone] || ""}`;
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
        // The pool supports exactly one identity provider, so name it and skip
        // Cognito's chooser entirely. Per the Cognito developer guide the
        // Authorize endpoint is a redirection endpoint: given identity_provider
        // (or idp_identifier) it "redirects silently to your IdP, bypassing
        // managed login", and otherwise falls through to the managed Login
        // page. Verified end to end against this pool - the click lands on
        // accounts.google.com, not on an interstitial. The button promises
        // Google; this is what keeps that promise true.
        identity_provider: "Google",
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
      const response = await adminApi.request("current_user", {}, { accessToken: state.accessToken, requestId: clientRequestId });
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
    // The monogram is derived from whatever name the API returned, never from an
    // email local-part or an identifier the operator did not choose to display.
    document.querySelectorAll("[data-operator-initials]").forEach((element) => {
      const label = stringValue(ui.operatorName.textContent);
      element.textContent = label.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
    });
    ui.refresh.disabled = false;
    updateSessionExpiryLabel();
  }

  function showSignedOut() {
    document.querySelectorAll("[data-operator-initials]").forEach((element) => { element.textContent = ""; });
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
    stopStreams();
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
    metricElements(name).forEach((element) => setValue(element, value));
  }

  function resetOverviewMetrics() {
    ["mrr", "arr", "active-customers", "active-teams", "gross-margin", "nrr", "churn", "new-customers", "churned-customers", "active-agents", "open-alerts", "at-risk-customers", "incidents", "prs-merged"].forEach((name) => setMetric(name, "—"));
  }

  function resetMetrics() {
    resetOverviewMetrics();
    ui.overviewSource.forEach((element) => { element.textContent = "not yet loaded"; });
    document.querySelectorAll("[data-alert-coverage]").forEach((element) => { element.textContent = "No alert coverage has been loaded."; });
    document.querySelectorAll("[data-economics-metric], [data-fleet-metric], [data-billing-metric]").forEach((element) => { element.textContent = "—"; element.classList.remove("ad-val--success", "ad-val--attention", "ad-val--danger"); });
    ["customers", "team-economics", "runtimes", "alerts", "billing-accounts", "team-credit-controls", "reconciliation", "audit"].forEach(clearTable);
    ["customers", "economics", "operations", "billing", "metrics", "audit"].forEach((name) => setSectionState(name, "Waiting", "neutral"));
    // The derived overview surfaces are cleared with the projections they summarise,
    // so a signed-out console never shows the previous operator's alert count.
    customersState.records = [];
    renderAttentionRows([]);
    renderOpenAlertCount(0);
    ["customers", "economics", "fleet", "billing-collected"].forEach((name) => setFreshness(name, "—"));
    document.querySelectorAll("[data-economics-scatter], [data-economics-composition], [data-mismatch-breakdown]").forEach((element) => element.replaceChildren());
    document.querySelectorAll("[data-economics-callout]").forEach((element) => { element.hidden = true; });
    resetMetricsExplorer();
    closeCustomerDetail();
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

  function formatOptionalMoney(value) {
    try { return value ? formatMoney(value) : UNAVAILABLE; } catch { return UNAVAILABLE; }
  }

  function formatNonNegativeMoney(value) {
    if (!value || integerValue(value.units) < 0n || Number(value.nanos || 0) < 0) throw new Error("invalid_negative_money");
    return formatMoney(value);
  }

  function formatRatio(value) {
    const ratio = Number(value);
    return Number.isFinite(ratio) ? new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(ratio) : UNAVAILABLE;
  }

  function formatCredits(value) {
    try {
      const micros = integerValue(value);
      const negative = micros < 0n;
      const absolute = negative ? -micros : micros;
      const whole = absolute / 1_000_000n;
      const fraction = (absolute % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
      return `${negative ? "−" : ""}${new Intl.NumberFormat().format(whole)}${fraction ? `.${fraction}` : ""}`;
    } catch {
      return UNAVAILABLE;
    }
  }

  function formatNonNegativeCredits(value) {
    try {
      return integerValue(value) >= 0n ? formatCredits(value) : UNAVAILABLE;
    } catch {
      return UNAVAILABLE;
    }
  }

  function teamCreditPauseReason(value) {
    if (typeof value === "number") return ["", "none", "customer paused", "billing inactive", "credits exhausted", "budget exhausted"][value] || "";
    return ({
      TEAM_CREDIT_PAUSE_REASON_NONE: "none",
      TEAM_CREDIT_PAUSE_REASON_CUSTOMER_PAUSED: "customer paused",
      TEAM_CREDIT_PAUSE_REASON_BILLING_INACTIVE: "billing inactive",
      TEAM_CREDIT_PAUSE_REASON_CREDITS_EXHAUSTED: "credits exhausted",
      TEAM_CREDIT_PAUSE_REASON_BUDGET_EXHAUSTED: "budget exhausted"
    })[stringValue(value)] || "";
  }

  function validTeamCreditControl(control) {
    try {
      const fields = ["ledgerAvailableMicros", "openReservedMicros", "periodConsumedMicros", "hardLimitMicros", "budgetRemainingMicros", "effectiveAvailableMicros", "version"];
      if (!stringValue(control?.teamId) || fields.some((field) => integerValue(control?.[field]) < 0n)) return false;
      const reason = teamCreditPauseReason(control?.pauseReason);
      const periodStart = timestampMilliseconds(control?.periodStartsAt);
      const periodEnd = timestampMilliseconds(control?.periodEndsAt);
      if (!reason || periodStart === null || periodEnd === null || periodEnd <= periodStart) return false;
      if (Boolean(control?.paused) !== (reason !== "none")) return false;
      if (Boolean(control?.customerPaused) !== (reason === "customer paused")) return false;
      return true;
    } catch {
      return false;
    }
  }

  function timestampMilliseconds(value) {
    if (!value || typeof value !== "object") return null;
    try {
      const seconds = Number(integerValue(value.seconds || 0));
      const nanos = Number(value.nanos || 0);
      if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1_000_000_000) return null;
      const milliseconds = seconds * 1000 + Math.floor(nanos / 1_000_000);
      return Number.isFinite(milliseconds) ? milliseconds : null;
    } catch {
      return null;
    }
  }

  function formatTimestamp(value) {
    const milliseconds = timestampMilliseconds(value);
    if (milliseconds === null) return UNAVAILABLE;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? UNAVAILABLE : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function formatBytes(value) {
    try {
      const bytes = Number(integerValue(value));
      if (!Number.isSafeInteger(bytes) || bytes < 0) return UNAVAILABLE;
      if (bytes < 1024) return `${bytes} B`;
      const units = ["KB", "MB", "GB", "TB"];
      let amount = bytes;
      let index = -1;
      do { amount /= 1024; index += 1; } while (amount >= 1024 && index < units.length - 1);
      return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(amount)} ${units[index]}`;
    } catch {
      return UNAVAILABLE;
    }
  }

  function enumLabel(value, labels) {
    if (typeof value === "number" && Number.isInteger(value)) return labels[value] || "not reported";
    return stringValue(value).replace(/^[A-Z_]+?_/, "").replaceAll("_", " ").toLowerCase() || "not reported";
  }

  // THE HONESTY CONTRACT.
  //
  // The admin API marks fields it cannot vouch for by name, in snake_case, on
  // projection_status.unavailable_fields. Those fields still arrive on the wire —
  // as protobuf scalar zeros, which is precisely the trap: a zero MRR and an
  // unmeasurable MRR are the same bytes and opposite facts. So a named field never
  // renders its value. It renders this word, in tertiary ink, at the size of the
  // number it replaces.
  //
  // Not a zero, which is a claim. Not a dash, which in a numeric column reads as a
  // measured value at a glance. Not an attention colour, because nothing is wrong —
  // several of these fields are permanently unavailable by construction today
  // (production incidents, most runtime-instance telemetry, upgrades and
  // downgrades), and a screen that nags about them every refresh is a screen
  // operators learn to stop reading.
  const UNAVAILABLE = "unavailable";

  function unavailableNode() {
    const span = document.createElement("span");
    span.className = "ad-unavailable";
    span.textContent = UNAVAILABLE;
    return span;
  }

  // Writes a value into an element, honouring the sentinel and the element's own
  // declared tone. A tone is a claim about a number, so it is applied only when
  // there IS a number and it is not zero: colouring a zero "danger" says something
  // is wrong when nothing is, and colouring an unavailable field says the same
  // about a fact we simply do not have.
  function setValue(element, value) {
    const text = stringValue(value);
    element.classList.remove("ad-val--success", "ad-val--attention", "ad-val--danger");
    if (text === UNAVAILABLE) {
      element.replaceChildren(unavailableNode());
      return;
    }
    element.textContent = text || "—";
    const tone = stringValue(element.dataset.tone);
    if (tone && text && text !== "—" && !/^0([.,]0+)?\s*%?$/.test(text)) element.classList.add(`ad-val--${tone}`);
  }

  function projectionAvailability(record) {
    const value = record?.projectionStatus?.availability;
    if (typeof value === "number") return ["unspecified", "complete", "partial", "unavailable", "stale"][value] || "unspecified";
    return stringValue(value).replace(/^ADMIN_PROJECTION_AVAILABILITY_/, "").toLowerCase() || "unspecified";
  }

  function projectionFieldAvailable(record, snakeCaseField) {
    const status = record?.projectionStatus;
    const availability = projectionAvailability(record);
    if (!status || !["complete", "partial", "stale"].includes(availability)) return false;
    const unavailable = Array.isArray(status.unavailableFields) ? new Set(status.unavailableFields.map(stringValue)) : new Set();
    if (availability === "complete" && unavailable.size > 0) return false;
    return !unavailable.has(snakeCaseField);
  }

  function projectionValue(record, snakeCaseField, formatter, value) {
    if (!projectionFieldAvailable(record, snakeCaseField)) return UNAVAILABLE;
    try { return formatter(value); } catch { return UNAVAILABLE; }
  }

  function projectionSummary(record) {
    const availability = projectionAvailability(record);
    const observed = formatTimestamp(record?.projectionStatus?.sourceObservedAt);
    const label = ["complete", "partial", "stale"].includes(availability) ? availability : "unavailable";
    return `${label}${observed !== UNAVAILABLE ? ` · source ${observed}` : " · source time unavailable"}`;
  }

  function projectionCollectionState(records) {
    const statuses = records.map(projectionAvailability);
    if (statuses.some((status) => !["complete", "partial", "stale"].includes(status))) return { label: "Unavailable", tone: "negative" };
    if (statuses.includes("stale")) return { label: "Stale rows", tone: "neutral" };
    if (statuses.includes("partial")) return { label: "Partial", tone: "neutral" };
    return { label: "Verified", tone: "positive" };
  }

  function setSectionState(name, label, tone = "neutral", detail = "") {
    document.querySelectorAll(`[data-section-state="${name}"]`).forEach((element) => {
      element.className = `dn-badge ad-badge-none${BADGE_FOR_TONE[tone] || ""}`;
      element.textContent = label;
      element.title = detail;
    });
  }

  function tableBody(name) {
    const selectors = {
      customers: "[data-customer-rows]",
      "team-economics": "[data-team-economics-rows]",
      runtimes: "[data-runtime-rows]",
      alerts: "[data-alert-rows]",
      "billing-accounts": "[data-billing-account-rows]",
      "team-credit-controls": "[data-team-credit-control-rows]",
      "customer-reliability": "[data-customer-reliability-rows]",
      reconciliation: "[data-reconciliation-rows]",
      audit: "[data-audit-rows]"
    };
    return document.querySelector(selectors[name] || "[data-missing-table]");
  }

  function clearTable(name, message = "No authorized records returned.") {
    tableBody(name)?.replaceChildren();
    const empty = document.querySelector(`[data-table-empty="${name}"]`);
    if (empty) {
      empty.textContent = message;
      empty.hidden = false;
    }
  }

  function showTable(name, count) {
    const empty = document.querySelector(`[data-table-empty="${name}"]`);
    if (empty) empty.hidden = count > 0;
  }

  function cell(row, value, heading = false) {
    const element = document.createElement(heading ? "th" : "td");
    if (heading) element.scope = "row";
    setValue(element, stringValue(value) || UNAVAILABLE);
    row.append(element);
    return element;
  }

  // A numeric column. Right-aligned tabular mono, so a column of figures lines up
  // and an unavailable row is visibly not a number rather than a small one.
  function numericCell(row, value) {
    const element = cell(row, value);
    element.className = "dn-table__num";
    return element;
  }

  function statusTone(label) {
    const normalized = stringValue(label).toLowerCase();
    if (normalized === "running") return "positive";
    if (normalized.startsWith("paused ·")) return "pending";
    if (["ready", "active", "current", "matched", "healthy", "low", "resolved"].includes(normalized)) return "positive";
    if (["degraded", "pending", "trialing", "needs attention", "medium", "warning", "lagging"].includes(normalized)) return "pending";
    if (["failed", "past due", "mismatched", "at risk", "critical", "high", "unavailable", "overdue"].includes(normalized)) return "negative";
    return "neutral";
  }

  // The design system owns what a state looks like. These two maps are the only
  // place this console decides which of its vocabulary words is which state; every
  // chip and dot on every screen resolves through them, so there is exactly one
  // definition of "danger" in the product, and colour is never the only cue —
  // the word is always right there beside the dot.
  const BADGE_FOR_TONE = { positive: " dn-badge--success", pending: " dn-badge--attention", negative: " dn-badge--danger", neutral: "" };
  const DOT_FOR_TONE = { positive: "success", pending: "attention", negative: "danger", neutral: "" };

  function toneBadge(label, tone) {
    const span = document.createElement("span");
    span.className = `dn-badge${BADGE_FOR_TONE[tone] || ""}`;
    const dotTone = DOT_FOR_TONE[tone] || "";
    const dot = document.createElement("span");
    dot.className = `dn-dot dn-dot--sm${dotTone ? ` dn-dot--${dotTone}` : ""}`;
    dot.setAttribute("aria-hidden", "true");
    span.append(dot, document.createTextNode(label || "not reported"));
    return span;
  }

  function statusText(label) {
    return toneBadge(label, statusTone(label));
  }

  function renderOverview(response) {
    const overview = response?.overview;
    if (!overview || typeof overview !== "object") throw new Error("invalid_overview");
    if (!["complete", "partial", "stale"].includes(projectionAvailability(overview))) throw new Error("invalid_overview_projection_status");
    setMetric("mrr", projectionValue(overview, "monthly_recurring_revenue", formatMoney, overview.monthlyRecurringRevenue));
    setMetric("arr", projectionValue(overview, "annual_recurring_revenue", formatMoney, overview.annualRecurringRevenue));
    setMetric("active-customers", projectionValue(overview, "active_customers", formatCount, overview.activeCustomers));
    setMetric("active-teams", projectionValue(overview, "active_teams", formatCount, overview.activeTeams));
    setMetric("gross-margin", projectionValue(overview, "gross_margin_ratio", formatRatio, overview.grossMarginRatio));
    setMetric("nrr", projectionValue(overview, "net_revenue_retention_ratio", formatRatio, overview.netRevenueRetentionRatio));
    setMetric("churn", projectionValue(overview, "customer_churn_ratio", formatRatio, overview.customerChurnRatio));
    setMetric("new-customers", projectionValue(overview, "new_customers", formatCount, overview.newCustomers));
    setMetric("churned-customers", projectionValue(overview, "churned_customers", formatCount, overview.churnedCustomers));
    setMetric("active-agents", projectionValue(overview, "currently_active_agents", formatCount, overview.currentlyActiveAgents));
    setMetric("open-alerts", projectionValue(overview, "open_alerts", formatCount, overview.openAlerts));
    setMetric("at-risk-customers", projectionValue(overview, "at_risk_customers", formatCount, overview.atRiskCustomers));
    setMetric("incidents", projectionValue(overview, "production_incidents", formatCount, overview.productionIncidents));
    setMetric("prs-merged", projectionValue(overview, "pull_requests_merged", formatCount, overview.pullRequestsMerged));
    ui.overviewSource.forEach((element) => setValue(element, projectionSummary(overview)));
    document.querySelectorAll('[data-metric-delta="nrr"]').forEach((element) => {
      element.textContent = projectionFieldAvailable(overview, "net_revenue_retention_ratio") ? "measured this period" : "denominator was zero or untrustworthy";
    });
  }

  async function loadOverview(signal) {
    const clientRequestId = requestId();
    setDataState("pending", "Loading authorized overview", "Requesting AdminService.GetAdminOverview through the pinned generated client.");
    try {
      const response = await adminApi.request("admin_overview", {}, { accessToken: state.accessToken, requestId: clientRequestId, signal });
      renderOverview(response);
      return true;
    } catch (error) {
      resetOverviewMetrics();
      ui.overviewSource.forEach((element) => { element.textContent = "unavailable"; });
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

  async function adminRequest(name, input, signal) {
    const clientRequestId = requestId();
    try {
      return await adminApi.request(name, input, { accessToken: state.accessToken, requestId: clientRequestId, signal });
    } catch (error) {
      throw error;
    }
  }

  async function adminListRequest(name, collectionName, input, signal) {
    const records = [];
    const seenTokens = new Set();
    let pageToken = "";
    for (let pageNumber = 0; pageNumber < 1000; pageNumber += 1) {
      const response = await adminRequest(name, { ...input, page: { pageSize: 100, pageToken } }, signal);
      const pageRecords = response?.[collectionName];
      if (!Array.isArray(pageRecords) || pageRecords.length > 100) throw new Error("invalid_admin_page");
      records.push(...pageRecords);
      const nextPageToken = opaquePageToken(response?.page?.nextPageToken);
      if (!nextPageToken) return { ...response, [collectionName]: records };
      if (nextPageToken === pageToken || seenTokens.has(nextPageToken)) throw new Error("repeated_admin_page_cursor");
      seenTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }
    throw new Error("admin_page_limit_exceeded");
  }

  // The filter runs in the browser, and that is safe here for one specific reason:
  // adminListRequest exhausts every page before rendering, so the browser holds the
  // COMPLETE authorized set. Filtering a complete set cannot hide a row that exists.
  // The audit trail deliberately does not work this way — absence of an audit row is
  // never evidence, so its filter goes to the server.
  const customersState = { records: [], filter: "all", search: "" };

  function customerMatchesFilter(customer) {
    if (customersState.filter === "at-risk") {
      const health = projectionFieldAvailable(customer, "health_state") ? Number(customer?.healthState) : 0;
      return health === 3 || health === 4;
    }
    if (customersState.filter === "trialing") return Number(customer?.subscription?.subscriptionStatus) === 3;
    if (customersState.filter === "churned") return Number(customer?.subscription?.subscriptionStatus) === 6;
    return true;
  }

  function customerMatchesSearch(customer) {
    const needle = customersState.search.trim().toLowerCase();
    if (!needle) return true;
    const organization = customer?.organization || {};
    return `${stringValue(organization.name)} ${stringValue(organization.id)} ${stringValue(organization.slug)}`.toLowerCase().includes(needle);
  }

  function renderCustomerRows() {
    const visible = customersState.records.filter((customer) => customerMatchesFilter(customer) && customerMatchesSearch(customer));
    renderCustomerTable(visible);
    const empty = document.querySelector('[data-table-empty="customers"]');
    if (empty && !visible.length && customersState.records.length) {
      empty.textContent = "No authorized customer matches this filter. Every loaded row is still counted in the totals above.";
      empty.hidden = false;
    }
  }

  function renderCustomers(response) {
    const customers = Array.isArray(response?.customers) ? response.customers : [];
    // Identity and projection status are validated against the authoritative set,
    // once, before any filter narrows it — so a duplicate or unusable row is caught
    // whether or not the current filter would have shown it.
    const seenCustomerIds = new Set();
    customers.forEach((customer) => {
      if (!["complete", "partial", "stale"].includes(projectionAvailability(customer))) throw new Error("invalid_customer_projection_status");
      const organizationId = safeResourceId(customer?.organization?.id);
      if (!organizationId || seenCustomerIds.has(organizationId)) throw new Error("invalid_or_duplicate_customer_id");
      seenCustomerIds.add(organizationId);
    });
    customersState.records = customers;
    renderCustomerRows();
    return projectionCollectionState(customers);
  }

  function renderCustomerTable(customers) {
    const body = tableBody("customers");
    body.replaceChildren();
    customers.forEach((customer) => {
      const organization = customer?.organization || {};
      const organizationId = safeResourceId(organization.id);
      const economics = customer?.economics || {};
      const economicsAvailable = projectionFieldAvailable(customer, "economics");
      const subscriptionLabel = projectionFieldAvailable(customer, "subscription") ? enumLabel(customer?.subscription?.subscriptionStatus, ["not reported", "incomplete", "incomplete expired", "trialing", "active", "past due", "canceled", "unpaid", "paused"]) : UNAVAILABLE;
      const healthLabel = projectionFieldAvailable(customer, "health_state") ? enumLabel(customer?.healthState, ["not reported", "healthy", "needs attention", "at risk", "critical"]) : UNAVAILABLE;
      const supportLabel = projectionFieldAvailable(customer, "support_state") ? enumLabel(customer?.supportState, ["not reported", "none", "open", "escalated"]) : UNAVAILABLE;
      const riskLabel = projectionFieldAvailable(customer, "churn_risk_level") ? enumLabel(customer?.churnRiskLevel, ["not reported", "low", "medium", "high", "critical"]) : UNAVAILABLE;
      const activity = projectionFieldAvailable(customer, "activity") ? customer?.activity : null;
      const reliability = projectionFieldAvailable(customer, "reliability") ? customer?.reliability : null;

      const row = document.createElement("tr");
      row.className = "dn-table__clickable";
      row.dataset.customerRow = organizationId;

      // The name and its stable identifier ride in one cell: the identifier is the
      // thing an operator pastes into a ticket, so it is mono and always present,
      // and the display name never has to be unique for the row to be actionable.
      const identity = document.createElement("th");
      identity.scope = "row";
      const name = document.createElement("div");
      name.className = "ad-cell-main";
      name.textContent = stringValue(organization.name) || organizationId;
      const id = document.createElement("div");
      id.className = "ad-cell-sub";
      id.textContent = organizationId;
      identity.append(name, id);
      row.append(identity);

      cell(row, `${projectionFieldAvailable(customer, "plan") ? stringValue(customer?.plan?.name) || "No plan" : UNAVAILABLE} · ${subscriptionLabel}`);

      const teams = numericCell(row, projectionValue(customer, "team_count", formatCount, customer?.teamCount));
      teams.title = `${projectionValue(customer, "user_count", formatCount, customer?.userCount)} people · ${projectionValue(customer, "repository_count", formatCount, customer?.repositoryCount)} repositories`;

      const agents = numericCell(row, activity ? projectionValue(activity, "active_agents", formatCount, activity.activeAgents) : UNAVAILABLE);
      agents.title = activity
        ? `${projectionValue(activity, "active_agents", formatCount, activity.activeAgents)} active · ${projectionValue(activity, "idle_agents", formatCount, activity.idleAgents)} idle · ${projectionValue(activity, "blocked_agents", formatCount, activity.blockedAgents)} blocked · ${projectionValue(activity, "failed_agents", formatCount, activity.failedAgents)} failed · ${projectionValue(activity, "current_sessions", formatCount, activity.currentSessions)} sessions · ${projectionValue(activity, "active_initiatives", formatCount, activity.activeInitiatives)} initiatives · ${projectionValue(activity, "pending_approvals", formatCount, activity.pendingApprovals)} approvals`
        : "This account's activity projection is unavailable.";

      numericCell(row, economicsAvailable ? formatCredits(economics.creditsUsedMicros) : UNAVAILABLE);
      numericCell(row, economicsAvailable ? formatOptionalMoney(economics.directCost) : UNAVAILABLE);
      numericCell(row, economicsAvailable ? formatOptionalMoney(economics.revenue) : UNAVAILABLE);

      // A negative margin is the one number on this table that earns a hue, and it
      // keeps its minus sign as well — colour is never the only cue.
      const marginText = economicsAvailable ? formatRatio(economics.grossMarginRatio ?? economics.grossMargin) : UNAVAILABLE;
      const margin = numericCell(row, marginText);
      if (marginText !== UNAVAILABLE && marginText.trim().startsWith("-")) margin.classList.add("ad-val--danger");

      const reliabilityCell = numericCell(row, reliability
        ? projectionValue(reliability, "gateway_availability_ratio", formatRatio, reliability.gatewayAvailabilityRatio)
        : UNAVAILABLE);
      reliabilityCell.title = reliability
        ? `${projectionValue(reliability, "production_incidents", formatCount, reliability.productionIncidents)} production incidents · last ${projectionFieldAvailable(reliability, "last_incident_at") ? formatTimestamp(reliability.lastIncidentAt) : UNAVAILABLE}`
        : "This account's reliability projection is unavailable.";

      const health = cell(row, "");
      health.replaceChildren(statusText(healthLabel));
      health.title = `${riskLabel} churn risk · ${supportLabel} support · projection ${projectionSummary(customer)}`;

      const action = cell(row, "");
      const detailButton = document.createElement("button");
      detailButton.className = "dn-btn dn-btn--ghost dn-btn--sm";
      detailButton.type = "button";
      detailButton.dataset.customerDetailId = organizationId;
      detailButton.setAttribute("aria-controls", "customer-detail");
      detailButton.setAttribute("aria-expanded", String(state.selectedCustomerId === organizationId && !ui.customerDetail.hidden));
      detailButton.setAttribute("aria-label", `Review ${stringValue(organization.name) || organizationId} account detail and reliability history`);
      detailButton.textContent = "Open";
      action.replaceChildren(detailButton);

      body.append(row);
    });
    showTable("customers", customers.length);
  }

  async function loadCustomers(signal) {
    try {
      setSectionState("customers", "Loading", "pending");
      const collectionState = renderCustomers(await adminListRequest("admin_customers", "customers", {}, signal));
      setSectionState("customers", collectionState.label, collectionState.tone, "Each row reports its source projection freshness.");
      setFreshness("customers", collectionState.label.toLowerCase());
      return true;
    } catch (error) {
      customersState.records = [];
      setFreshness("customers", UNAVAILABLE);
      clearTable("customers", "Customer projection unavailable. No substitute data source was used.");
      setSectionState("customers", "Unavailable", "negative", safeClientMessage(error, "Admin customer data is unavailable."));
      if (stringValue(error?.code) === "unauthenticated") expireSession();
      return false;
    }
  }

  function setCustomerDetailField(name, value) {
    document.querySelectorAll(`[data-customer-detail-field="${name}"]`).forEach((element) => setValue(element, stringValue(value) || UNAVAILABLE));
  }

  function resetCustomerDetailFields() {
    document.querySelectorAll("[data-customer-detail-field]").forEach((element) => { element.textContent = UNAVAILABLE; });
  }

  function resetCustomerReliability(message = "Not loaded.") {
    state.reliabilityRecords = [];
    state.reliabilityRecordIds = new Set();
    state.reliabilityNextPageToken = "";
    state.reliabilityPageTokens = new Set();
    state.reliabilityLoading = false;
    state.reliabilityLastPeriodStart = null;
    tableBody("customer-reliability")?.replaceChildren();
    const empty = document.querySelector('[data-table-empty="customer-reliability"]');
    if (empty) {
      empty.textContent = message;
      empty.hidden = false;
    }
    ui.customerReliabilityState.textContent = message;
    ui.customerReliabilityMore.hidden = true;
    ui.customerReliabilityMore.disabled = false;
  }

  function closeCustomerDetail() {
    if (state.customerDetailController) state.customerDetailController.abort();
    state.customerDetailController = null;
    state.customerDetailGeneration += 1;
    state.selectedCustomerId = "";
    resetCustomerDetailFields();
    resetCustomerReliability("Choose a customer to request daily reliability history.");
    ui.customerDetailTitle.textContent = "Customer detail";
    ui.customerDetailState.textContent = "Choose a customer to request its current AdminService projection and daily reliability history.";
    ui.customerDetail.hidden = true;
    document.querySelectorAll("[data-customer-detail-id]").forEach((button) => button.setAttribute("aria-expanded", "false"));
  }

  function customerDetailActivityValue(activity, field, formatter, value) {
    return activity ? projectionValue(activity, field, formatter, value) : UNAVAILABLE;
  }

  function renderCustomerDetailProjection(response, organizationId) {
    const customer = response?.customer;
    const organization = customer?.organization;
    if (!customer || !["complete", "partial", "stale"].includes(projectionAvailability(customer)) || safeResourceId(organization?.id) !== organizationId) {
      throw new Error("invalid_admin_customer_detail");
    }
    const activity = projectionFieldAvailable(customer, "activity") ? customer.activity : null;
    const reliability = projectionFieldAvailable(customer, "reliability") ? customer.reliability : null;
    const economics = projectionFieldAvailable(customer, "economics") ? customer.economics : null;
    const subscription = projectionFieldAvailable(customer, "subscription") ? enumLabel(customer?.subscription?.subscriptionStatus, ["not reported", "incomplete", "incomplete expired", "trialing", "active", "past due", "canceled", "unpaid", "paused"]) : UNAVAILABLE;
    const payment = projectionValue(customer, "payment_state", (value) => enumLabel(value, ["not reported", "current", "failed", "past due", "no payment method"]), customer.paymentState);
    const health = projectionValue(customer, "health_state", (value) => enumLabel(value, ["not reported", "healthy", "needs attention", "at risk", "critical"]), customer.healthState);
    const support = projectionValue(customer, "support_state", (value) => enumLabel(value, ["not reported", "none", "open", "escalated"]), customer.supportState);
    const churn = projectionValue(customer, "churn_risk_level", (value) => enumLabel(value, ["not reported", "low", "medium", "high", "critical"]), customer.churnRiskLevel);
    ui.customerDetailTitle.textContent = stringValue(organization.name) || organizationId;
    setCustomerDetailField("plan", `${projectionFieldAvailable(customer, "plan") ? stringValue(customer?.plan?.name) || "No plan" : UNAVAILABLE} · ${subscription} · ${payment}`);
    setCustomerDetailField("health", health);
    setCustomerDetailField("support", support);
    setCustomerDetailField("churn", churn);
    setCustomerDetailField("account-counts", `${projectionValue(customer, "team_count", formatCount, customer.teamCount)} / ${projectionValue(customer, "user_count", formatCount, customer.userCount)} / ${projectionValue(customer, "repository_count", formatCount, customer.repositoryCount)}`);
    setCustomerDetailField("agents", `${customerDetailActivityValue(activity, "active_agents", formatCount, activity?.activeAgents)} / ${customerDetailActivityValue(activity, "idle_agents", formatCount, activity?.idleAgents)} / ${customerDetailActivityValue(activity, "blocked_agents", formatCount, activity?.blockedAgents)} / ${customerDetailActivityValue(activity, "failed_agents", formatCount, activity?.failedAgents)}`);
    setCustomerDetailField("sessions", customerDetailActivityValue(activity, "current_sessions", formatCount, activity?.currentSessions));
    setCustomerDetailField("initiatives", customerDetailActivityValue(activity, "active_initiatives", formatCount, activity?.activeInitiatives));
    setCustomerDetailField("approvals", customerDetailActivityValue(activity, "pending_approvals", formatCount, activity?.pendingApprovals));
    setCustomerDetailField("pull-requests", customerDetailActivityValue(activity, "pull_requests_merged", formatCount, activity?.pullRequestsMerged));
    setCustomerDetailField("last-activity", customerDetailActivityValue(activity, "last_agent_activity_at", formatTimestamp, activity?.lastAgentActivityAt));
    setCustomerDetailField("reliability", reliability
      ? `${projectionValue(reliability, "gateway_availability_ratio", formatRatio, reliability.gatewayAvailabilityRatio)} gateway · ${projectionValue(reliability, "production_incidents", formatCount, reliability.productionIncidents)} incidents · last ${projectionValue(reliability, "last_incident_at", formatTimestamp, reliability.lastIncidentAt)}`
      : UNAVAILABLE);
    setCustomerDetailField("mrr", projectionValue(customer, "monthly_recurring_revenue", formatOptionalMoney, customer.monthlyRecurringRevenue));
    setCustomerDetailField("economics", economics ? `${formatCredits(economics.creditsUsedMicros)} credits · ${formatOptionalMoney(economics.directCost)} direct cost` : UNAVAILABLE);
    setCustomerDetailField("projection", projectionSummary(customer));
    ui.customerDetailState.textContent = `Current AdminService customer projection loaded · ${projectionSummary(customer)}.`;
  }

  function normalizedReliabilityRecord(record, organizationId, previousPeriodStart) {
    const recordOrganizationId = safeResourceId(record?.organizationId);
    const periodStart = timestampMilliseconds(record?.reportingPeriod?.startedAt);
    const periodEnd = timestampMilliseconds(record?.reportingPeriod?.endedAt);
    const generatedAt = timestampMilliseconds(record?.generatedAt);
    const lastIncidentAt = record?.lastIncidentAt ? timestampMilliseconds(record.lastIncidentAt) : null;
    const incidents = integerValue(record?.productionIncidents);
    const ratioPresent = record?.gatewayAvailabilityRatio !== undefined && record?.gatewayAvailabilityRatio !== null;
    const ratio = ratioPresent ? Number(record.gatewayAvailabilityRatio) : null;
    if (
      recordOrganizationId !== organizationId || periodStart === null || periodEnd === null || periodEnd <= periodStart || generatedAt === null ||
      incidents < 0n || (record?.lastIncidentAt && lastIncidentAt === null) ||
      (ratioPresent && (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)) ||
      (previousPeriodStart !== null && periodStart > previousPeriodStart)
    ) throw new Error("invalid_customer_reliability_record");
    return {
      id: `${organizationId}:${periodStart}:${periodEnd}`,
      periodStart,
      periodEnd,
      ratio,
      incidents,
      lastIncidentAt: record.lastIncidentAt,
      generatedAt: record.generatedAt
    };
  }

  function formatUtcReliabilityPeriod(start, end) {
    const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });
    return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))} UTC`;
  }

  function renderReliabilityHistoryResult(result, organizationId, requestedToken, append) {
    if (organizationId !== state.selectedCustomerId) return false;
    if (result.status === "rejected") {
      ui.customerReliabilityState.textContent = safeClientMessage(result.reason, "Reliability history is unavailable. No absence of incidents is inferred.");
      ui.customerReliabilityMore.hidden = !state.reliabilityNextPageToken;
      return false;
    }
    try {
      const records = Array.isArray(result.value?.reliabilityRecords) ? result.value.reliabilityRecords : [];
      if (records.length > 100) throw new Error("oversized_customer_reliability_page");
      const localIds = new Set(state.reliabilityRecordIds);
      let previousPeriodStart = state.reliabilityLastPeriodStart;
      const normalized = records.map((record) => {
        const entry = normalizedReliabilityRecord(record, organizationId, previousPeriodStart);
        if (localIds.has(entry.id)) throw new Error("duplicate_customer_reliability_record");
        localIds.add(entry.id);
        previousPeriodStart = entry.periodStart;
        return entry;
      });
      const next = opaquePageToken(result.value?.page?.nextPageToken);
      if (next && (next === requestedToken || state.reliabilityPageTokens.has(next))) throw new Error("repeated_customer_reliability_cursor");
      const body = tableBody("customer-reliability");
      if (!append) body.replaceChildren();
      normalized.forEach((entry) => {
        const row = document.createElement("tr");
        const period = cell(row, formatUtcReliabilityPeriod(entry.periodStart, entry.periodEnd), true);
        period.className = "ad-cell-mono";
        // A missing availability ratio is explicit source unavailability, never zero.
        const availability = numericCell(row, entry.ratio === null ? "Unavailable · insufficient coverage" : formatRatio(entry.ratio));
        if (entry.ratio === null) availability.className = "ad-unavailable";
        const incidents = numericCell(row, formatCount(entry.incidents));
        incidents.title = entry.lastIncidentAt ? `last incident ${formatTimestamp(entry.lastIncidentAt)}` : "no incident recorded in this bucket";
        const generated = cell(row, formatTimestamp(entry.generatedAt));
        generated.className = "ad-cell-mono";
        body.append(row);
      });
      normalized.forEach((entry) => state.reliabilityRecordIds.add(entry.id));
      state.reliabilityRecords.push(...records);
      if (normalized.length) state.reliabilityLastPeriodStart = normalized.at(-1).periodStart;
      if (next) state.reliabilityPageTokens.add(next);
      state.reliabilityNextPageToken = next;
      showTable("customer-reliability", state.reliabilityRecords.length);
      const empty = document.querySelector('[data-table-empty="customer-reliability"]');
      if (empty && state.reliabilityRecords.length === 0) empty.textContent = "AdminService returned no daily reliability records for this reporting period.";
      ui.customerReliabilityState.textContent = state.reliabilityRecords.length
        ? `${state.reliabilityRecords.length} daily records loaded. Missing availability ratios are explicit source unavailability, never zero.`
        : "No daily reliability records returned for this reporting period.";
      ui.customerReliabilityMore.hidden = !next;
      ui.customerReliabilityMore.disabled = false;
      return true;
    } catch {
      if (!append) resetCustomerReliability("Reliability history was rejected because its scope, order, or fields were invalid.");
      state.reliabilityNextPageToken = "";
      ui.customerReliabilityState.textContent = "Reliability history was rejected because its scope, order, or fields were invalid.";
      ui.customerReliabilityMore.hidden = true;
      return false;
    }
  }

  async function openCustomerDetail(event) {
    const button = event.target.closest("[data-customer-detail-id]");
    const organizationId = safeResourceId(button?.dataset.customerDetailId);
    if (!button || !organizationId || !state.authorized || !state.accessToken) return;
    if (state.customerDetailController) state.customerDetailController.abort();
    const controller = new AbortController();
    state.customerDetailController = controller;
    const generation = ++state.customerDetailGeneration;
    state.selectedCustomerId = organizationId;
    resetCustomerDetailFields();
    resetCustomerReliability("Loading daily reliability history.");
    ui.customerDetailTitle.textContent = "Loading customer detail";
    ui.customerDetailState.textContent = "Requesting the current authorized AdminService customer projection.";
    ui.customerDetail.hidden = false;
    document.querySelectorAll("[data-customer-detail-id]").forEach((candidate) => candidate.setAttribute("aria-expanded", String(candidate === button)));
    ui.customerDetail.focus({ preventScroll: true });
    ui.customerDetail.scrollIntoView({ block: "start" });
    const [customerResult, reliabilityResult] = await Promise.allSettled([
      adminRequest("admin_customer", { organizationId }, controller.signal),
      adminRequest("admin_customer_reliability", { organizationId, page: { pageSize: 100 } }, controller.signal)
    ]);
    if (controller.signal.aborted || generation !== state.customerDetailGeneration || organizationId !== state.selectedCustomerId) return;
    if (customerResult.status === "fulfilled") {
      try { renderCustomerDetailProjection(customerResult.value, organizationId); } catch { ui.customerDetailState.textContent = "The current customer projection was rejected as invalid. No detail values were displayed."; }
    } else {
      ui.customerDetailState.textContent = safeClientMessage(customerResult.reason, "The current customer projection is unavailable. No detail values were displayed.");
    }
    renderReliabilityHistoryResult(reliabilityResult, organizationId, "", false);
    if ([customerResult, reliabilityResult].some((result) => result.status === "rejected" && stringValue(result.reason?.code) === "unauthenticated")) expireSession();
  }

  async function loadMoreCustomerReliability() {
    const organizationId = state.selectedCustomerId;
    const pageToken = state.reliabilityNextPageToken;
    const generation = state.customerDetailGeneration;
    if (!organizationId || !pageToken || state.reliabilityLoading || !state.customerDetailController) return;
    state.reliabilityLoading = true;
    ui.customerReliabilityMore.disabled = true;
    ui.customerReliabilityState.textContent = "Loading the next scoped reliability snapshot page.";
    try {
      const response = await adminRequest("admin_customer_reliability", { organizationId, page: { pageSize: 100, pageToken } }, state.customerDetailController.signal);
      if (generation !== state.customerDetailGeneration || organizationId !== state.selectedCustomerId) return;
      renderReliabilityHistoryResult({ status: "fulfilled", value: response }, organizationId, pageToken, true);
    } catch (error) {
      if (generation !== state.customerDetailGeneration || organizationId !== state.selectedCustomerId) return;
      renderReliabilityHistoryResult({ status: "rejected", reason: error }, organizationId, pageToken, true);
      if (stringValue(error?.code) === "unauthenticated") expireSession();
    } finally {
      if (generation === state.customerDetailGeneration && organizationId === state.selectedCustomerId) {
        state.reliabilityLoading = false;
        ui.customerReliabilityMore.disabled = false;
      }
    }
  }

  function renderEconomicsSummary(economicsResponse) {
    const economics = economicsResponse?.economics;
    const summary = economics?.summary;
    if (!economics || !["complete", "partial", "stale"].includes(projectionAvailability(economics))) throw new Error("invalid_economics");
    const summaryAvailable = projectionFieldAvailable(economics, "summary") && summary;
    const values = {
      "direct-cost": summaryAvailable ? formatOptionalMoney(summary.directCost) : UNAVAILABLE,
      revenue: summaryAvailable ? formatOptionalMoney(summary.revenue) : UNAVAILABLE,
      "gross-profit": summaryAvailable ? formatOptionalMoney(summary.grossProfit) : UNAVAILABLE,
      "gross-margin": summaryAvailable ? formatRatio(summary.grossMarginRatio ?? summary.grossMargin) : UNAVAILABLE
    };
    Object.entries(values).forEach(([name, value]) => document.querySelectorAll(`[data-economics-metric="${name}"]`).forEach((element) => setValue(element, value)));
    return projectionSummary(economics);
  }

  // The five dimensions the ledger can actually aggregate by, mirroring the frozen
  // set in the generated bridge. The mockup's fifth control said "Objective"; the
  // ledger carries INITIATIVE and has no objective dimension, so the button says
  // Initiative. A slice the ledger cannot produce is not offered — that rule is the
  // mockup's own, and honouring it means changing the label rather than shipping a
  // control that returns INVALID_FILTER.
  const ECONOMICS_DIMENSION_LABELS = {
    team: "Team",
    organization: "Customer",
    agent_role: "Role",
    model: "Model",
    initiative: "Initiative"
  };

  const economicsState = { dimension: "team", slices: [] };

  function moneyAmount(value) {
    if (!value || typeof value !== "object") return null;
    try {
      const units = Number(integerValue(value.units));
      const nanos = Number(value.nanos || 0);
      const amount = units + nanos / 1_000_000_000;
      return Number.isFinite(amount) ? amount : null;
    } catch {
      return null;
    }
  }

  // Direct cost against revenue, one point per slice, with the break-even diagonal
  // drawn behind them. This is the only shape that surfaces a slice running below
  // cost instead of averaging it into a healthy fleet margin: on a bar chart of
  // margins it is one short bar among many, here it is the only point on the wrong
  // side of a line. Points whose cost or revenue the projection could not supply
  // are omitted rather than plotted at the origin — a point at (0,0) is a claim.
  function renderEconomicsScatter(slices) {
    const host = document.querySelector("[data-economics-scatter]");
    const note = document.querySelector("[data-economics-scatter-note]");
    if (!host) return;
    const svgNamespace = "http://www.w3.org/2000/svg";
    const points = slices.map((slice) => ({
      label: stringValue(slice?.displayName) || stringValue(slice?.dimensionId),
      cost: moneyAmount(slice?.summary?.directCost),
      revenue: moneyAmount(slice?.summary?.revenue)
    })).filter((point) => point.cost !== null && point.revenue !== null);

    if (!points.length) {
      host.replaceChildren(metricsDataState(
        "bydesign",
        "No plottable slices",
        "Every slice in this period is missing a direct cost or a revenue figure, so there is nothing to place against the diagonal. Nothing was substituted.",
        ""
      ));
      if (note) note.hidden = true;
      return;
    }
    if (note) note.hidden = false;

    const width = 320;
    const height = 200;
    const pad = 6;
    const ceiling = Math.max(...points.map((point) => Math.max(point.cost, point.revenue)), 1);
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("class", "ad-spark ad-spark--tall");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    const below = points.filter((point) => point.cost > point.revenue);
    svg.setAttribute("aria-label", `Direct cost against revenue for ${points.length} slices; ${below.length} below break-even.`);

    const x = (value) => pad + (value / ceiling) * (width - pad * 2);
    const y = (value) => height - pad - (value / ceiling) * (height - pad * 2);

    const diagonal = document.createElementNS(svgNamespace, "line");
    diagonal.setAttribute("x1", String(x(0)));
    diagonal.setAttribute("y1", String(y(0)));
    diagonal.setAttribute("x2", String(x(ceiling)));
    diagonal.setAttribute("y2", String(y(ceiling)));
    diagonal.setAttribute("stroke", "var(--viz-grid)");
    diagonal.setAttribute("stroke-dasharray", "3 3");
    svg.append(diagonal);

    points.forEach((point) => {
      const dot = document.createElementNS(svgNamespace, "circle");
      dot.setAttribute("cx", x(point.cost).toFixed(1));
      dot.setAttribute("cy", y(point.revenue).toFixed(1));
      dot.setAttribute("r", "3.5");
      dot.setAttribute("fill", point.cost > point.revenue ? "var(--status-danger-dot)" : "var(--viz-1)");
      const title = document.createElementNS(svgNamespace, "title");
      title.textContent = `${point.label} — cost ${point.cost.toFixed(2)} against revenue ${point.revenue.toFixed(2)}`;
      dot.append(title);
      svg.append(dot);
    });

    host.replaceChildren(svg);
    if (note) {
      note.textContent = below.length
        ? `${below.length} of ${points.length} slices sit below the diagonal — direct cost above the revenue attributed to them. Averaged into the fleet they disappear; here they are the only points on the wrong side.`
        : `All ${points.length} slices sit on or above the break-even diagonal for this period.`;
    }
  }

  // The composition of the SAME direct-cost total the summary reports, split by the
  // dimension currently selected. The mockup split it by cost category — model
  // inference, team compute, storage, tooling — and the admin projection has no such
  // field: AdminEconomics carries one direct_cost Money for the period and the slice
  // list carries one per dimension member. So the panel composes what the ledger can
  // actually attribute, and says which dimension it used, rather than inventing four
  // categories that no response contains.
  function renderEconomicsComposition(slices) {
    const host = document.querySelector("[data-economics-composition]");
    if (!host) return;
    const parts = slices
      .map((slice) => ({ label: stringValue(slice?.displayName) || stringValue(slice?.dimensionId), cost: moneyAmount(slice?.summary?.directCost), money: slice?.summary?.directCost }))
      .filter((part) => part.cost !== null && part.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 6);
    const total = parts.reduce((sum, part) => sum + part.cost, 0);

    const label = document.createElement("div");
    label.className = "ad-note";
    label.textContent = `by ${ECONOMICS_DIMENSION_LABELS[economicsState.dimension].toLowerCase()} — the projection reports one direct-cost total per slice, not a split by cost category`;

    if (!parts.length || total <= 0) {
      host.replaceChildren(metricsDataState(
        "bydesign",
        "No attributable cost",
        "No slice in this period reported a positive direct cost, so there is nothing to compose. Nothing was substituted.",
        ""
      ), label);
      return;
    }

    const bar = document.createElement("div");
    bar.className = "ad-mix";
    parts.forEach((part, index) => {
      const segment = document.createElement("span");
      segment.className = `ad-mix__part ad-mix__part--${(index % 6) + 1}`;
      segment.dataset.share = String(Math.round((part.cost / total) * 1000));
      segment.title = `${part.label} — ${formatOptionalMoney(part.money)}`;
      bar.append(segment);
    });
    sizeMixSegments(bar);

    const legend = document.createElement("div");
    legend.className = "ad-stack";
    parts.forEach((part, index) => {
      const row = document.createElement("div");
      row.className = "ad-kv";
      const key = document.createElement("span");
      key.className = "ad-kv__k";
      const swatch = document.createElement("span");
      swatch.className = `ad-mix__swatch ad-mix__part--${(index % 6) + 1}`;
      swatch.setAttribute("aria-hidden", "true");
      key.append(swatch, document.createTextNode(part.label));
      const value = document.createElement("span");
      value.className = "ad-kv__v";
      value.textContent = formatOptionalMoney(part.money);
      row.append(key, value);
      legend.append(row);
    });

    host.replaceChildren(bar, legend, label);
  }

  // Economics slices carry no projection status of their own, so there is no
  // unavailable_fields list to consult: a scalar is either on the wire or it is not.
  // That still must not become a zero. "This slice made no model requests" and "the
  // ledger did not report model requests for this slice" are different facts, and a
  // `|| 0` fallback silently turns the second into the first.
  function countOrUnavailable(value) {
    try { return formatCount(value); } catch { return UNAVAILABLE; }
  }

  function renderEconomicsSlices(slicesResponse) {
    const slices = Array.isArray(slicesResponse?.economicsSlices) ? slicesResponse.economicsSlices : [];
    economicsState.slices = slices;
    const body = tableBody("team-economics");
    body.replaceChildren();
    document.querySelectorAll("[data-slice-heading]").forEach((element) => { element.textContent = ECONOMICS_DIMENSION_LABELS[economicsState.dimension]; });
    slices.forEach((slice) => {
      const sliceSummary = slice?.summary || {};
      const row = document.createElement("tr");
      cell(row, stringValue(slice?.displayName) || stringValue(slice?.dimensionId), true);
      numericCell(row, formatCredits(sliceSummary.creditsUsedMicros));
      numericCell(row, formatCredits(sliceSummary.creditsRemainingMicros));
      numericCell(row, formatOptionalMoney(sliceSummary.directCost));
      numericCell(row, formatOptionalMoney(sliceSummary.revenue));
      numericCell(row, formatOptionalMoney(sliceSummary.grossProfit));
      numericCell(row, formatRatio(sliceSummary.grossMarginRatio ?? sliceSummary.grossMargin));
      numericCell(row, countOrUnavailable(slice?.modelRequestCount));
      body.append(row);
    });
    showTable("team-economics", slices.length);
    renderEconomicsScatter(slices);
    renderEconomicsComposition(slices);
    renderEconomicsCallout(slices);
  }

  // One callout, only when the ledger actually shows a slice below cost. A panel
  // that always says something teaches operators to stop reading it.
  function renderEconomicsCallout(slices) {
    const callout = document.querySelector("[data-economics-callout]");
    const title = document.querySelector("[data-economics-callout-title]");
    const bodyText = document.querySelector("[data-economics-callout-body]");
    if (!callout || !title || !bodyText) return;
    const below = slices.filter((slice) => {
      const cost = moneyAmount(slice?.summary?.directCost);
      const revenue = moneyAmount(slice?.summary?.revenue);
      return cost !== null && revenue !== null && cost > revenue;
    });
    callout.hidden = below.length === 0;
    if (!below.length) return;
    const worst = below.reduce((a, b) => (moneyAmount(a?.summary?.directCost) - moneyAmount(a?.summary?.revenue) > moneyAmount(b?.summary?.directCost) - moneyAmount(b?.summary?.revenue) ? a : b));
    const name = stringValue(worst?.displayName) || stringValue(worst?.dimensionId);
    title.textContent = below.length === 1 ? "One slice is running below cost" : `${below.length} slices are running below cost`;
    bodyText.textContent = `${name} consumed ${formatOptionalMoney(worst?.summary?.directCost)} of direct cost against ${formatOptionalMoney(worst?.summary?.revenue)} of attributed revenue this period. The figures come from the economics projection; no browser-side accounting was applied to them.`;
  }

  // Widths are written through an adopted stylesheet rather than a style attribute:
  // this page ships style-src 'self', which refuses style attributes silently, and a
  // silently-refused width is a bar that renders at zero while looking correct in the
  // source. A real rule is the same result without widening the policy.
  let mixSheet = null;
  let mixSequence = 0;
  function sizeMixSegments(bar) {
    if (!("adoptedStyleSheets" in document) || typeof CSSStyleSheet !== "function") return;
    if (!mixSheet) {
      try {
        mixSheet = new CSSStyleSheet();
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, mixSheet];
      } catch {
        return;
      }
    }
    for (let index = mixSheet.cssRules.length - 1; index >= 0; index -= 1) mixSheet.deleteRule(index);
    mixSequence += 1;
    [...bar.children].forEach((segment, index) => {
      const id = `m${mixSequence}-${index}`;
      segment.dataset.mix = id;
      const share = Number(segment.dataset.share || 0) / 10;
      mixSheet.insertRule(`[data-mix="${id}"]{flex-basis:${share.toFixed(1)}%}`, mixSheet.cssRules.length);
    });
  }

  async function loadEconomics(signal) {
    setSectionState("economics", "Loading", "pending");
    const [economicsResult, slicesResult] = await Promise.allSettled([
      adminRequest("admin_economics", {}, signal),
      adminListRequest("admin_team_economics", "economicsSlices", { dimension: economicsState.dimension }, signal)
    ]);
    const errors = [];
    let loaded = 0;
    let economicsProjection = "";

    if (economicsResult.status === "fulfilled") {
      try {
        economicsProjection = renderEconomicsSummary(economicsResult.value);
        setFreshness("economics", economicsProjection);
        loaded += 1;
      } catch (error) {
        errors.push(error);
        document.querySelectorAll("[data-economics-metric]").forEach((element) => setValue(element, UNAVAILABLE));
      }
    } else {
      errors.push(economicsResult.reason);
      document.querySelectorAll("[data-economics-metric]").forEach((element) => setValue(element, UNAVAILABLE));
    }

    if (slicesResult.status === "fulfilled") {
      try {
        renderEconomicsSlices(slicesResult.value);
        loaded += 1;
      } catch (error) {
        errors.push(error);
        clearTable("team-economics", "Team economics are unavailable. No browser-side totals were calculated.");
      }
    } else {
      errors.push(slicesResult.reason);
      clearTable("team-economics", "Team economics are unavailable. No browser-side totals were calculated.");
    }

    if (errors.some((error) => stringValue(error?.code) === "unauthenticated")) {
      expireSession();
      return false;
    }
    if (loaded === 2) {
      const current = economicsProjection.startsWith("complete");
      setSectionState("economics", current ? "Reconciled" : economicsProjection, current ? "positive" : "neutral", economicsProjection);
      return true;
    }
    if (loaded > 0) {
      setSectionState("economics", "Partially verified", "neutral", "An independently authorized economics projection loaded; unavailable projections remain blank.");
      return true;
    }
    setSectionState("economics", "Unavailable", "negative", safeClientMessage(errors[0], "Admin economics data is unavailable."));
    return false;
  }

  function renderFleet(response) {
    const fleet = response?.fleet;
    if (!fleet || !["complete", "partial", "stale"].includes(projectionAvailability(fleet))) throw new Error("invalid_fleet");
    const values = {
      instances: projectionValue(fleet, "runtime_instances", formatCount, fleet.runtimeInstances),
      ready: projectionValue(fleet, "ready_instances", formatCount, fleet.readyInstances),
      degraded: projectionValue(fleet, "degraded_instances", formatCount, fleet.degradedInstances),
      stopped: `${projectionValue(fleet, "suspended_instances", formatCount, fleet.suspendedInstances)} / ${projectionValue(fleet, "failed_instances", formatCount, fleet.failedInstances)}`,
      "stale-heartbeat": projectionValue(fleet, "stale_heartbeat_instances", formatCount, fleet.staleHeartbeatInstances),
      "backup-overdue": projectionValue(fleet, "backup_overdue_instances", formatCount, fleet.backupOverdueInstances),
      "event-stream-unavailable": projectionValue(fleet, "event_stream_unavailable_instances", formatCount, fleet.eventStreamUnavailableInstances),
      "agent-states": `${projectionValue(fleet, "active_agents", formatCount, fleet.activeAgents)} / ${projectionValue(fleet, "blocked_agents", formatCount, fleet.blockedAgents)} / ${projectionValue(fleet, "failed_agents", formatCount, fleet.failedAgents)}`,
      sessions: projectionValue(fleet, "current_sessions", formatCount, fleet.currentSessions)
    };
    Object.entries(values).forEach(([name, value]) => document.querySelectorAll(`[data-fleet-metric="${name}"]`).forEach((element) => setValue(element, value)));
    return projectionSummary(fleet);
  }

  function runtimeInstanceRow(runtime) {
      if (!["complete", "partial", "stale"].includes(projectionAvailability(runtime))) throw new Error("invalid_runtime_projection_status");
      const runtimeState = projectionValue(runtime, "runtime_state", (value) => enumLabel(value, ["not reported", "ready", "degraded", "suspended", "failed"]), runtime?.runtimeState);
      const backupState = projectionValue(runtime, "backup_state", (value) => enumLabel(value, ["not reported", "current", "overdue", "failed", "never completed"]), runtime?.backupState);
      const eventState = projectionValue(runtime, "event_stream_state", (value) => enumLabel(value, ["not reported", "current", "lagging", "unavailable"]), runtime?.eventStreamState);
      const healthReason = projectionValue(runtime, "runtime_health_reason", (value) => enumLabel(value, ["not reported", "none", "reconciling", "generation mismatch", "gateway not ready", "agent roster not ready", "suspended", "reconciliation failed", "heartbeat stale"]), runtime?.runtimeHealthReason);
      const instanceName = projectionFieldAvailable(runtime, "openclaw_instance_name") ? stringValue(runtime?.openclawInstanceName) : "";
      const row = document.createElement("tr");
      const identity = document.createElement("th");
      identity.scope = "row";
      const team = document.createElement("div");
      team.className = "ad-cell-main";
      team.textContent = stringValue(runtime?.teamId) || "Unknown team";
      const instance = document.createElement("div");
      instance.className = "ad-cell-sub";
      instance.textContent = instanceName || stringValue(runtime?.id);
      identity.append(team, instance);
      row.append(identity);

      // The runtime's own account of why it is in this state rides on the state chip
      // rather than taking a column of its own: it is the thing you read AFTER the
      // state has told you to look, and it is far too long to be a cell.
      const stateCell = cell(row, "");
      stateCell.replaceChildren(statusText(runtimeState));
      stateCell.title = `${healthReason} · ${projectionValue(runtime, "gateway_ready", (value) => value ? "gateway ready" : "gateway not ready", runtime?.gatewayReady)} · ${projectionValue(runtime, "ready_agent_count", formatCount, runtime?.readyAgentCount)} ready agents · generation ${projectionValue(runtime, "observed_generation", formatCount, runtime?.observedGeneration)}/${projectionValue(runtime, "desired_generation", formatCount, runtime?.desiredGeneration)} · projection ${projectionSummary(runtime)}`;

      const agents = numericCell(row, projectionValue(runtime, "active_agents", formatCount, runtime?.activeAgents));
      agents.title = `${projectionValue(runtime, "active_agents", formatCount, runtime?.activeAgents)} active · ${projectionValue(runtime, "blocked_agents", formatCount, runtime?.blockedAgents)} blocked · ${projectionValue(runtime, "failed_agents", formatCount, runtime?.failedAgents)} failed`;
      numericCell(row, projectionValue(runtime, "current_sessions", formatCount, runtime?.currentSessions));
      numericCell(row, projectionValue(runtime, "last_heartbeat_at", formatTimestamp, runtime?.lastHeartbeatAt));
      numericCell(row, projectionValue(runtime, "last_tool_call_at", formatTimestamp, runtime?.lastToolCallAt));
      const model = cell(row, projectionFieldAvailable(runtime, "current_model_aliases") && Array.isArray(runtime?.currentModelAliases) && runtime.currentModelAliases.length ? runtime.currentModelAliases.join(", ") : UNAVAILABLE);
      model.className = "ad-cell-mono";
      const workspace = numericCell(row, projectionValue(runtime, "workspace_volume_used_bytes", formatBytes, runtime?.workspaceVolumeUsedBytes));
      workspace.title = `of ${projectionValue(runtime, "workspace_volume_capacity_bytes", formatBytes, runtime?.workspaceVolumeCapacityBytes)} capacity`;
      const backup = cell(row, backupState);
      backup.className = "ad-cell-mono";
      backup.title = `event stream ${eventState}`;
      const version = cell(row, projectionFieldAvailable(runtime, "openclaw_version") ? stringValue(runtime?.openclawVersion) || UNAVAILABLE : UNAVAILABLE);
      version.className = "ad-cell-mono";
      version.title = `operator ${projectionFieldAvailable(runtime, "operator_version") ? stringValue(runtime?.operatorVersion) || UNAVAILABLE : UNAVAILABLE} · template ${projectionFieldAvailable(runtime, "organization_template_version") ? stringValue(runtime?.organizationTemplateVersion) || UNAVAILABLE : UNAVAILABLE}`;
      return row;
  }

  function renderRuntimeRows(runtimes) {
    const body = tableBody("runtimes");
    body.replaceChildren();
    runtimes.forEach((runtime) => body.append(runtimeInstanceRow(runtime)));
    showTable("runtimes", runtimes.length);
  }

  function seedRuntimeStream(runtimes, snapshotSequence) {
    state.runtimeInstances = new Map();
    runtimes.forEach((runtime) => {
      const id = stringValue(runtime?.id);
      if (id) state.runtimeInstances.set(id, runtime);
    });
    state.runtimeCursor = toSequence(snapshotSequence);
  }

  function renderRuntimes(response) {
    const runtimes = Array.isArray(response?.runtimeInstances) ? response.runtimeInstances : [];
    seedRuntimeStream(runtimes, response?.snapshotSequence);
    renderRuntimeRows([...state.runtimeInstances.values()]);
  }

  // The metrics explorer reads the per-environment Prometheus workspaces
  // through platform-api's closed PromQL proxy. The proxy takes PANEL NAMES
  // plus params - never raw PromQL - with the window capped at 24h and the
  // step at >=30s. Environments render side by side, and the empty states
  // are the design system's four kinds of empty, mapped onto what the proxy
  // really answered: an environment whose workspace does not exist answers
  // 404 and its column says "Not provisioned" (the production column is
  // honest before the production account is real); a series that is wired
  // but has never delivered a sample says "No data yet" with the brass
  // pending flag and the reason; target_health is empty by construction
  // (push pipeline, no scrape up) and says so; a failed request is a
  // failure, never a substitute series. Nothing is invented browser-side.
  const METRICS_ENVIRONMENTS = ["development", "production"];
  const METRICS_SERVICES = ["platform-api", "builder", "gateway"];
  const METRICS_WINDOWS = ["1h", "6h", "24h"];
  const METRICS_STEP_SECONDS = "30";
  const METRICS_PENDING_WHY = "Wired, but no crew-runtime series has reached this workspace yet. Activation happens at the next crew provisioning — that action belongs to provisioning, not to this console, so no button pretends otherwise.";
  const METRICS_ABSENT_WHY = "Not provisioned — the environment map has one entry until the production account exists. An absent environment is not an outage and not a permissions problem; there is no environment to query.";
  const METRICS_FAILED_WHY = "The proxy did not answer this request. Nothing was substituted — the panel stays empty rather than showing an invented series.";
  // Ten panel names, exactly the proxy's vocabulary. The service= filter
  // exists on the first five only.
  const METRICS_PANELS = [
    { key: "request_rate", title: "Request rate", unit: "req/s", scale: 1, group: "service", filterable: true, resolves: "http_server_request_duration_seconds (histogram)" },
    { key: "error_rate", title: "Error rate (5xx)", unit: "req/s", scale: 1, group: "service", filterable: true, tone: "danger", resolves: "http_server_request_duration_seconds + http_response_status_code" },
    { key: "latency_p95", title: "Latency p95", unit: "ms", scale: 1000, group: "service", filterable: true, resolves: "http_server_request_duration_seconds → p95", caveat: "No http_route label — this is service-wide. Per-endpoint latency needs new instrumentation, not a different query." },
    { key: "goroutines", title: "Goroutines", unit: "", scale: 1, group: "service", filterable: true, resolves: "go_goroutine_count" },
    { key: "memory_bytes", title: "Go heap in use", unit: "MiB", scale: 1 / (1024 * 1024), group: "service", filterable: true, resolves: "go_memory_used_bytes" },
    { key: "queue_depth", title: "Agent queue depth", unit: "", scale: 1, group: "crew", filterable: false, resolves: "crew runtime gauge" },
    { key: "target_health", title: "Target health", unit: "", scale: 1, group: "service", filterable: false, resolves: "target_info", emptyByDesign: "Resolves to target_info. Push pipeline — there is no scrape up to report. Empty by construction, not by outage." },
    { key: "llm_tokens", title: "Model tokens", unit: "tok/s", scale: 1, group: "crew", filterable: false, resolves: "crew runtime counter" },
    { key: "llm_cost_usd", title: "Model spend (1h)", unit: "USD", scale: 1, group: "crew", filterable: false, resolves: "crew runtime counter" },
    { key: "run_duration", title: "Run duration p95", unit: "s", scale: 1, group: "crew", filterable: false, resolves: "crew runtime histogram → p95" },
  ];

  const metricsState = {
    outcomes: new Map(),
    focusKey: METRICS_PANELS[0].key,
    service: "",
    windowKey: "24h",
    environment: "development",
    gridController: null,
    loaded: false
  };

  function metricsPanel(key) {
    return METRICS_PANELS.find((panel) => panel.key === key) || METRICS_PANELS[0];
  }

  function metricsUpstreamSeries(panel) {
    return panel.resolves.split(" ")[0];
  }

  // One URL builder serves both the fetch and the query-echo strip, so what
  // the strip reads back is provably the request the browser sends.
  function metricsRequestUrl(environment, panel, service, windowKey) {
    const target = new URL("/admin/v1/metrics/query_range", apiBaseUrl);
    target.searchParams.set("panel", panel.key);
    if (panel.filterable && service) target.searchParams.set("service", service);
    target.searchParams.set("window", windowKey);
    target.searchParams.set("step", METRICS_STEP_SECONDS);
    target.searchParams.set("environment", environment);
    return target;
  }

  async function fetchMetricsPanel(environment, panel, signal) {
    const target = metricsRequestUrl(environment, panel, metricsState.service, metricsState.windowKey);
    const response = await fetch(target, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json", Authorization: `Bearer ${state.accessToken}` },
      signal
    });
    if (response.status === 404) return { state: "unprovisioned" };
    if (!response.ok) return { state: "unavailable", detail: `HTTP ${response.status}` };
    const payload = await response.json();
    const series = payload?.data?.result;
    if (!Array.isArray(series) || series.length === 0) return { state: "empty" };
    // Sum across result series per timestamp: the panel headline is the
    // fleet total, and the per-series split belongs to a drill-down, not a
    // tile.
    const totals = new Map();
    for (const entry of series) {
      for (const [timestamp, raw] of entry?.values ?? []) {
        const value = Number(raw);
        if (!Number.isFinite(value)) continue;
        totals.set(timestamp, (totals.get(timestamp) ?? 0) + value);
      }
    }
    const points = [...totals.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => ({ value: value * panel.scale }));
    if (!points.length) return { state: "empty" };
    return { state: "ok", latest: points[points.length - 1].value, points };
  }

  function formatMetricsValue(value) {
    return value.toFixed(value >= 100 ? 0 : 2);
  }

  function metricsDot(pipState) {
    const dot = document.createElement("span");
    dot.className = `dn-dot dn-dot--sm${pipState && pipState !== "idle" ? ` dn-dot--${pipState}` : ""}`;
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }

  function metricsPipState(outcome, panel) {
    if (!outcome) return "idle";
    if (outcome.state === "ok") return "live";
    if (outcome.state === "unavailable") return "danger";
    if (outcome.state === "unprovisioned") return "idle";
    return panel.emptyByDesign ? "idle" : "attention";
  }

  function metricsChart(points, panel) {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const width = 160;
    const height = 46;
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("class", "ad-spark");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    // Hairline y-grid only — no x-grid, no frame, no fill. The only colour on the
    // plot is the data, and the plot is drawn here rather than by a charting
    // library because this page's CSP cannot reach a CDN and will not grow an
    // exception for a sparkline.
    for (const fraction of [0.25, 0.5, 0.75]) {
      const grid = document.createElementNS(svgNamespace, "line");
      grid.setAttribute("class", "spark-grid");
      grid.setAttribute("stroke", "var(--viz-grid)");
      grid.setAttribute("x1", "0");
      grid.setAttribute("x2", String(width));
      grid.setAttribute("y1", (height * fraction).toFixed(1));
      grid.setAttribute("y2", (height * fraction).toFixed(1));
      svg.append(grid);
    }
    const maxValue = Math.max(...points.map((point) => point.value), 1e-9);
    const coordinates = points.map((point, index) => {
      const x = points.length === 1 ? width : (index / (points.length - 1)) * width;
      const y = height - (point.value / maxValue) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = document.createElementNS(svgNamespace, "polyline");
    line.setAttribute("class", "spark-line");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", panel.tone === "danger" ? "var(--status-danger-dot)" : "var(--viz-1)");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("points", coordinates.join(" "));
    svg.append(line);
    return svg;
  }

  // A ghost plot: repeating hairlines where the grid would be, so a grid of empty
  // panels reads as instruments whose series are absent, not as a screen that
  // failed to load. The design system's .dn-dstate paints the same idea behind the
  // explanation; this keeps the panel's own plot area the height it would have had.
  function metricsGhostPlot() {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const width = 160;
    const height = 36;
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("class", "ad-spark");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
      const line = document.createElementNS(svgNamespace, "line");
      line.setAttribute("class", "spark-grid");
      line.setAttribute("stroke", "var(--viz-grid)");
      line.setAttribute("x1", "0");
      line.setAttribute("x2", String(width));
      line.setAttribute("y1", (height * fraction).toFixed(1));
      line.setAttribute("y2", (height * fraction).toFixed(1));
      svg.append(line);
    }
    return svg;
  }

  // Empty is four different facts, so it is four different states: pending (wired,
  // not flowing — the only one that takes a hue, because it will change on its own),
  // bydesign (empty by construction), absent (the environment does not exist),
  // failed (the request itself failed). Never a bare "no data": every one of these
  // names its kind AND its cause, because three of the four are not fixed by
  // retrying and an operator deserves to know which.
  function metricsDataState(kind, label, why, queryLine) {
    const block = document.createElement("div");
    block.className = `dn-dstate${kind === "pending" ? " dn-dstate--attention" : ""}`;
    const flag = document.createElement("span");
    flag.className = "dn-dstate__flag";
    flag.append(metricsDot(kind === "pending" ? "attention" : kind === "failed" ? "danger" : "idle"), document.createTextNode(label));
    block.append(flag);
    if (why) {
      const explanation = document.createElement("p");
      explanation.className = "dn-dstate__why";
      explanation.textContent = why;
      block.append(explanation);
    }
    if (queryLine) {
      const query = document.createElement("code");
      query.className = "dn-dstate__query";
      query.textContent = queryLine;
      block.append(query);
    }
    return block;
  }

  function metricsOutcomeState(outcome, panel) {
    if (outcome.state === "unprovisioned") {
      return metricsDataState("absent", "Not provisioned", METRICS_ABSENT_WHY, `${metricsUpstreamSeries(panel)} → 404`);
    }
    if (outcome.state === "unavailable") {
      return metricsDataState("failed", `Unavailable${outcome.detail ? ` (${outcome.detail})` : ""}`, METRICS_FAILED_WHY, `${metricsUpstreamSeries(panel)} → no answer`);
    }
    if (panel.emptyByDesign) {
      return metricsDataState("bydesign", "Empty by design", panel.emptyByDesign, `${metricsUpstreamSeries(panel)} → 0 series`);
    }
    const why = panel.group === "crew" ? METRICS_PENDING_WHY : "The workspace answered this request with zero series for the window. No sample was invented to fill the panel.";
    return metricsDataState("pending", "No data yet", why, `${metricsUpstreamSeries(panel)} → 0 series`);
  }

  function metricsSeriesLabel(panel) {
    return panel.filterable && metricsState.service ? `${panel.key} · service=${metricsState.service}` : panel.key;
  }

  // One panel of the grid, in the design system's metric-panel shape. An empty
  // panel keeps a populated panel's frame and is marked dashed at its edge rather
  // than collapsing, so the grid holds its rhythm and absence never reads as
  // breakage.
  function buildMetricsPanel(panel) {
    const card = document.createElement("article");
    card.className = "dn-mpanel";
    card.dataset.metricsPanel = panel.key;

    const head = document.createElement("div");
    head.className = "dn-mpanel__head";
    const identity = document.createElement("div");
    identity.className = "dn-mpanel__id";
    const series = document.createElement("span");
    series.className = "dn-mpanel__series";
    series.textContent = metricsSeriesLabel(panel);
    const filter = document.createElement("span");
    filter.className = "dn-mpanel__filter";
    filter.textContent = `environment=${metricsState.environment}`;
    identity.append(series, filter);

    const titles = document.createElement("div");
    titles.className = "dn-mpanel__titles";
    const title = document.createElement("span");
    title.className = "dn-mpanel__title";
    title.textContent = panel.title;
    const unit = document.createElement("span");
    unit.className = "dn-mpanel__unit";
    unit.textContent = panel.unit;
    const meta = document.createElement("span");
    meta.className = "dn-mpanel__meta";
    meta.dataset.metricsMeta = "true";
    meta.textContent = "…";
    titles.append(title, unit, meta);

    head.append(identity, titles);
    const body = document.createElement("div");
    body.className = "dn-mpanel__body";
    body.dataset.metricsBody = "true";
    card.append(head, body);
    renderMetricsPanel(card, null, panel);
    return card;
  }

  function renderMetricsPanel(card, outcome, panel) {
    const body = card?.querySelector("[data-metrics-body]");
    const meta = card?.querySelector("[data-metrics-meta]");
    if (!body || !meta) return;
    card.classList.toggle("dn-mpanel--empty", Boolean(outcome) && outcome.state !== "ok");
    if (!outcome) {
      meta.textContent = "…";
      body.replaceChildren(metricsGhostPlot());
      return;
    }
    if (outcome.state === "ok") {
      meta.textContent = formatMetricsValue(outcome.latest);
      body.replaceChildren(metricsChart(outcome.points, panel));
      return;
    }
    meta.textContent = outcome.state === "unprovisioned"
      ? "Environment absent"
      : outcome.state === "unavailable"
        ? outcome.detail || UNAVAILABLE
        : "no samples";
    body.replaceChildren(metricsGhostPlot(), metricsOutcomeState(outcome, panel));
  }

  // The controls are the design system's segmented control, not free text. That is
  // the whole point of this screen: the proxy accepts a panel NAME, a window and a
  // step, and refuses anything else. There is no query box to type PromQL into
  // because there is no endpoint that would run it.
  function metricsSegItem(label, active, onSelect, disabled = false) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "dn-seg__item";
    if (active) item.dataset.active = "true";
    item.disabled = disabled;
    item.addEventListener("click", onSelect);
    item.append(document.createTextNode(label));
    return item;
  }

  function renderMetricsQueryBar() {
    const seriesHost = document.querySelector("[data-metrics-series-chips]");
    const serviceHost = document.querySelector("[data-metrics-service-chips]");
    const windowHost = document.querySelector("[data-metrics-window-chips]");
    const environmentHost = document.querySelector("[data-metrics-env-chips]");
    const serviceNote = document.querySelector("[data-metrics-service-note]");
    const stepNote = document.querySelector("[data-metrics-step-note]");
    if (!seriesHost || !serviceHost || !windowHost || !environmentHost) return;
    const focused = metricsPanel(metricsState.focusKey);

    environmentHost.replaceChildren();
    METRICS_ENVIRONMENTS.forEach((environment) => {
      const item = metricsSegItem(environment, metricsState.environment === environment, () => selectMetricsEnvironment(environment));
      item.prepend(metricsDot(metricsEnvironmentPipState(environment)));
      environmentHost.append(item);
    });

    windowHost.replaceChildren();
    METRICS_WINDOWS.forEach((windowKey) => {
      windowHost.append(metricsSegItem(windowKey, metricsState.windowKey === windowKey, () => selectMetricsWindow(windowKey)));
    });

    seriesHost.replaceChildren();
    METRICS_PANELS.forEach((panel) => {
      const item = metricsSegItem(panel.key, panel.key === metricsState.focusKey, () => selectMetricsFocus(panel.key));
      item.title = panel.title;
      item.prepend(metricsDot(metricsPipState(metricsState.outcomes.get(`${metricsState.environment}:${panel.key}`), panel)));
      seriesHost.append(item);
    });

    serviceHost.replaceChildren();
    serviceHost.append(metricsSegItem("all", !metricsState.service, () => selectMetricsService(""), !focused.filterable));
    METRICS_SERVICES.forEach((service) => {
      serviceHost.append(metricsSegItem(service, metricsState.service === service, () => selectMetricsService(service), !focused.filterable));
    });
    if (serviceNote) serviceNote.hidden = focused.filterable;

    // The two limits the proxy actually enforces, stated where the controls are:
    // a window of at most 24 hours and a step of at least 30 seconds. Neither is a
    // preference — a request outside them is refused upstream.
    if (stepNote) stepNote.textContent = `step ${METRICS_STEP_SECONDS}s · window ≤ 24h`;

    updateMetricsQueryEcho();
  }

  function metricsEnvironmentPipState(environment) {
    const outcomes = METRICS_PANELS.map((panel) => metricsState.outcomes.get(`${environment}:${panel.key}`)).filter(Boolean);
    if (!outcomes.length) return "idle";
    if (outcomes.some((outcome) => outcome.state === "ok")) return "live";
    return "idle";
  }

  function updateMetricsQueryEcho() {
    const echo = document.querySelector("[data-metrics-query-echo]");
    if (!echo) return;
    const panel = metricsPanel(metricsState.focusKey);
    if (!state.authorized || !apiBaseUrl) {
      echo.textContent = "Sign in to build a verified metrics request.";
      return;
    }
    const target = metricsRequestUrl(metricsState.environment, panel, metricsState.service, metricsState.windowKey);
    echo.textContent = `GET ${target.pathname}?${target.searchParams.toString()}  ↳ ${panel.resolves} — panel names only, the browser never sends PromQL`;
  }

  function selectMetricsFocus(key) {
    if (metricsState.focusKey === key) return;
    metricsState.focusKey = key;
    renderMetricsQueryBar();
  }

  function selectMetricsService(service) {
    if (metricsState.service === service) return;
    metricsState.service = service;
    void reloadMetricsGrid();
  }

  function selectMetricsWindow(windowKey) {
    if (metricsState.windowKey === windowKey) return;
    metricsState.windowKey = windowKey;
    void reloadMetricsGrid();
  }

  function selectMetricsEnvironment(environment) {
    if (metricsState.environment === environment) return;
    metricsState.environment = environment;
    void reloadMetricsGrid();
  }

  // A control change is a new request, so it refetches rather than re-slicing a
  // cached answer. Every panel on screen was produced by the request the echo
  // strip is showing at that moment.
  async function reloadMetricsGrid() {
    renderMetricsQueryBar();
    if (!state.authorized || !state.accessToken || Date.now() >= state.deadline) {
      updateMetricsGridBasis();
      return;
    }
    if (metricsState.gridController) metricsState.gridController.abort();
    const controller = new AbortController();
    metricsState.gridController = controller;
    await loadMetrics(controller.signal);
  }

  function updateMetricsGridBasis() {
    const basis = document.querySelector("[data-metrics-grid-basis]");
    if (!basis) return;
    basis.textContent = metricsState.loaded
      ? `grid basis: environment=${metricsState.environment} · window=${metricsState.windowKey} · step=${METRICS_STEP_SECONDS}s · service=${metricsState.service || "all"}`
      : "Panels load after operator verification.";
  }

  function resetMetricsExplorer() {
    if (metricsState.gridController) metricsState.gridController.abort();
    metricsState.gridController = null;
    metricsState.outcomes = new Map();
    metricsState.loaded = false;
    const grid = document.querySelector("[data-metrics-grid]");
    // The grid keeps its ten panels and their ghost plots rather than emptying:
    // an explorer with no session still reads as a rack of instruments.
    if (grid) {
      grid.replaceChildren();
      for (const panel of METRICS_PANELS) grid.append(buildMetricsPanel(panel));
    }
    updateMetricsGridBasis();
    renderMetricsQueryBar();
  }

  async function loadMetrics(signal) {
    const grid = document.querySelector("[data-metrics-grid]");
    if (!grid) return true;
    setSectionState("metrics", "Loading", "pending");
    grid.replaceChildren();
    metricsState.outcomes = new Map();
    metricsState.loaded = false;
    const cards = new Map();
    for (const panel of METRICS_PANELS) {
      const card = buildMetricsPanel(panel);
      grid.append(card);
      cards.set(panel.key, card);
    }
    const environment = metricsState.environment;
    let anyFailure = false;
    await Promise.all(METRICS_PANELS.map(async (panel) => {
      let outcome;
      try {
        outcome = await fetchMetricsPanel(environment, panel, signal);
      } catch (error) {
        if (error?.name === "AbortError") return;
        outcome = { state: "unavailable" };
      }
      if (outcome.state === "unavailable") anyFailure = true;
      metricsState.outcomes.set(`${environment}:${panel.key}`, outcome);
      renderMetricsPanel(cards.get(panel.key), outcome, panel);
    }));
    if (signal?.aborted) return !anyFailure;
    metricsState.loaded = true;
    updateMetricsGridBasis();
    renderMetricsQueryBar();
    setSectionState("metrics", anyFailure ? "Degraded" : "Live", anyFailure ? "negative" : "positive");
    return !anyFailure;
  }

  async function loadOperations(signal) {
    setSectionState("operations", "Loading", "pending");
    const [fleetResult, runtimesResult] = await Promise.allSettled([
      adminRequest("admin_fleet", {}, signal),
      adminListRequest("admin_runtimes", "runtimeInstances", {}, signal)
    ]);
    const errors = [];
    let loaded = 0;
    let fleetProjection = "";

    if (fleetResult.status === "fulfilled") {
      try {
        fleetProjection = renderFleet(fleetResult.value);
        setFreshness("fleet", fleetProjection);
        loaded += 1;
      } catch (error) {
        errors.push(error);
        document.querySelectorAll("[data-fleet-metric]").forEach((element) => setValue(element, UNAVAILABLE));
      }
    } else {
      errors.push(fleetResult.reason);
      setFreshness("fleet", UNAVAILABLE);
      document.querySelectorAll("[data-fleet-metric]").forEach((element) => setValue(element, UNAVAILABLE));
    }

    if (runtimesResult.status === "fulfilled") {
      try {
        renderRuntimes(runtimesResult.value);
        loaded += 1;
      } catch (error) {
        errors.push(error);
        clearTable("runtimes", "Runtime projection unavailable. Public health probes remain separate below.");
      }
    } else {
      errors.push(runtimesResult.reason);
      clearTable("runtimes", "Runtime projection unavailable. Public health probes remain separate below.");
    }

    if (errors.some((error) => stringValue(error?.code) === "unauthenticated")) {
      expireSession();
      return false;
    }
    if (loaded === 2) {
      const current = fleetProjection.startsWith("complete");
      setSectionState("operations", current ? "Observed" : fleetProjection, current ? "positive" : "neutral", fleetProjection);
      return true;
    }
    if (loaded > 0) {
      setSectionState("operations", "Partially observed", "neutral", "An independently authorized operations projection loaded; unavailable projections remain blank.");
      return true;
    }
    setSectionState("operations", "Unavailable", "negative", safeClientMessage(errors[0], "Fleet data is unavailable."));
    return false;
  }

  const alertKinds = ["not reported", "gateway unavailable", "invalid OpenClaw configuration", "failed Stripe webhook", "failed GitHub webhook", "paid customer not provisioned", "subscription canceled while team running", "customer over included usage", "gross margin below threshold", "PVC near capacity", "backup overdue", "elevated model provider errors", "customer adoption decline", "trial nearing expiration"];

  function alertRow(alert) {
    if (!["complete", "partial", "stale"].includes(projectionAvailability(alert))) throw new Error("invalid_alert_projection_status");
    const severity = projectionValue(alert, "severity", (value) => enumLabel(value, ["not reported", "informational", "warning", "critical"]), alert?.severity);
    const row = document.createElement("tr");
    const severityCell = cell(row, "", true); severityCell.replaceChildren(statusText(severity));
    const kind = cell(row, projectionValue(alert, "kind", (value) => enumLabel(value, alertKinds), alert?.kind));
    kind.className = "ad-cell-mono";
    cell(row, `${stringValue(alert?.teamId) || UNAVAILABLE} / ${stringValue(alert?.organizationId) || UNAVAILABLE}`);
    const summary = cell(row, projectionFieldAvailable(alert, "safe_summary") ? stringValue(alert?.safeSummary) : UNAVAILABLE);
    summary.className = "ad-cell-quiet";
    numericCell(row, projectionValue(alert, "occurrence_count", formatCount, alert?.occurrenceCount));
    const detected = cell(row, projectionValue(alert, "last_detected_at", formatTimestamp, alert?.lastDetectedAt));
    detected.className = "ad-cell-mono";
    detected.title = `projection ${projectionSummary(alert)}`;
    return row;
  }

  // The overview's "Needs attention" list is not a second source of truth: it is the
  // same alert projection the Operations table renders, sorted the way the API
  // already sorted it (severity, then most recent) and capped at four. Clicking a
  // row moves to the surface that owns it rather than opening a private detail
  // view, so there is one place each fact is explained.
  function renderAttentionRows(alerts) {
    const host = document.querySelector("[data-attention-rows]");
    const empty = document.querySelector('[data-table-empty="attention"]');
    if (!host) return;
    host.replaceChildren();
    const rows = alerts.slice(0, 4);
    if (empty) empty.hidden = rows.length > 0;
    rows.forEach((alert) => {
      const severity = projectionValue(alert, "severity", (value) => enumLabel(value, ["not reported", "informational", "warning", "critical"]), alert?.severity);
      const tone = statusTone(severity);
      const link = document.createElement("button");
      link.type = "button";
      link.className = "dn-work dn-bare";
      link.dataset.viewLink = stringValue(alert?.organizationId) && !stringValue(alert?.teamId) ? "billing" : "operations";

      const glyph = document.createElement("span");
      glyph.className = "dn-work__glyph";
      glyph.append(metricsDot(DOT_FOR_TONE[tone] || "idle"));

      const main = document.createElement("div");
      main.className = "dn-work__main";
      const title = document.createElement("div");
      title.className = "dn-work__title";
      title.textContent = projectionFieldAvailable(alert, "safe_summary") ? stringValue(alert?.safeSummary) : UNAVAILABLE;
      const sub = document.createElement("div");
      sub.className = "dn-work__sub";
      const scope = document.createElement("span");
      scope.textContent = [stringValue(alert?.organizationId), stringValue(alert?.teamId)].filter(Boolean).join(" · ") || "platform";
      const when = document.createElement("span");
      when.textContent = projectionValue(alert, "last_detected_at", formatTimestamp, alert?.lastDetectedAt);
      sub.append(scope, when);
      main.append(title, sub);

      link.append(glyph, main, toneBadge(severity, tone));
      link.addEventListener("click", () => setView(stringValue(link.dataset.viewLink)));
      host.append(link);
    });
  }

  // The rail and the tab bar both carry the open-alert count, and both hide it at
  // zero: a badge showing "0" is a permanent piece of furniture that stops meaning
  // anything. An unavailable count hides too, because a badge cannot say "unknown".
  function renderOpenAlertCount(count) {
    document.querySelectorAll("[data-open-alert-count]").forEach((element) => {
      const numeric = Number.isFinite(count) && count > 0;
      element.hidden = !numeric;
      element.textContent = numeric ? String(count) : "";
    });
  }

  // Freshness is per projection, from each projection's own source_observed_at —
  // never one page-level "last refreshed" stamp, which would claim that a stale
  // economics projection is as current as a live fleet one.
  function setFreshness(name, value) {
    document.querySelectorAll(`[data-freshness-for="${name}"]`).forEach((element) => setValue(element, value));
  }

  function renderAlertRows(alerts) {
    const body = tableBody("alerts");
    body.replaceChildren();
    alerts.forEach((alert) => body.append(alertRow(alert)));
    showTable("alerts", alerts.length);
  }

  function seedAlertStream(alerts, snapshotSequence) {
    state.alertInstances = new Map();
    alerts.forEach((alert) => {
      const id = stringValue(alert?.id);
      if (id) state.alertInstances.set(id, alert);
    });
    state.alertCursor = toSequence(snapshotSequence);
  }

  function renderAlerts(response) {
    const alerts = Array.isArray(response?.alerts) ? response.alerts : [];
    seedAlertStream(alerts, response?.snapshotSequence);
    const current = [...state.alertInstances.values()];
    renderAlertRows(current);
    renderAttentionRows(current);
    renderOpenAlertCount(current.length);
    const unavailableKinds = Array.isArray(response?.unavailableKinds) ? response.unavailableKinds.map((kind) => enumLabel(kind, alertKinds)) : [];
    const coverage = [];
    if (unavailableKinds.length) coverage.push(`Unavailable alert producers: ${unavailableKinds.join(", ")}.`);
    coverage.push(response?.resolvedAlertHistoryAvailable === true
      ? "Resolved-alert history is covered by this projection."
      : "Only current open alerts are trustworthy; resolved-alert history is unavailable.");
    document.querySelectorAll("[data-alert-coverage]").forEach((element) => { element.textContent = coverage.join(" "); });
  }

  // --- Live streaming (runtime instances + alerts) ---
  // The unary load seeds each table and its cursor (SnapshotSequence). The stream
  // then delivers only sequence-ordered deltas past that cursor, applied to the
  // maintained id->resource map and re-rendered. A transient error reconnects from
  // the last cursor; an auth failure ends the session. Streams stop on sign-out,
  // session expiry, and each manual refresh (which reseeds and restarts them).
  const streamBaseBackoff = 2000;
  const streamMaxBackoff = 30000;

  function toSequence(value) {
    if (typeof value === "bigint") return value >= 0n ? value : 0n;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === "string" && /^[0-9]+$/.test(value)) return BigInt(value);
    return 0n;
  }

  function streamDelay(ms, signal) {
    return new Promise((resolve) => {
      if (signal.aborted) { resolve(); return; }
      const timer = window.setTimeout(resolve, ms);
      signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
    });
  }

  function applyStreamUpsert(map, resource, message, cursorKey) {
    const resourceId = stringValue(message?.resourceId);
    if (!resourceId) return false;
    const sequence = toSequence(message?.sequence);
    if (sequence > state[cursorKey]) state[cursorKey] = sequence;
    if (resource) map.set(resourceId, resource); else map.delete(resourceId);
    return true;
  }

  function applyRuntimeUpsert(message) {
    if (applyStreamUpsert(state.runtimeInstances, message?.runtimeInstance, message, "runtimeCursor")) scheduleRuntimeRender();
  }

  function applyAlertUpsert(message) {
    if (applyStreamUpsert(state.alertInstances, message?.alert, message, "alertCursor")) scheduleAlertRender();
  }

  function scheduleRuntimeRender() {
    if (state.runtimeRenderQueued) return;
    state.runtimeRenderQueued = true;
    window.requestAnimationFrame(() => {
      state.runtimeRenderQueued = false;
      try { renderRuntimeRows([...state.runtimeInstances.values()]); }
      catch { clearTable("runtimes", "Runtime projection unavailable. Public health probes remain separate below."); }
    });
  }

  function renderAlertSurfaces() {
    const current = [...state.alertInstances.values()];
    renderAlertRows(current);
    renderAttentionRows(current);
    renderOpenAlertCount(current.length);
  }

  function scheduleAlertRender() {
    if (state.alertRenderQueued) return;
    state.alertRenderQueued = true;
    window.requestAnimationFrame(() => {
      state.alertRenderQueued = false;
      // A streamed delta updates every surface that reads the alert map, not just
      // the Operations table: the overview's attention list and the rail badge are
      // views of the same projection, and letting them drift would put two
      // different alert counts on one screen.
      try { renderAlertSurfaces(); }
      catch { clearTable("alerts", "Alert projection unavailable. No alert state was inferred from probes."); }
    });
  }

  async function runStream(streamName, cursorKey, controller, apply) {
    let backoff = streamBaseBackoff;
    while (state.authorized && !controller.signal.aborted && Date.now() < state.deadline) {
      try {
        await adminApi.stream(streamName,
          { afterSequence: state[cursorKey].toString() },
          { accessToken: state.accessToken, requestId: requestId(), signal: controller.signal },
          apply);
        backoff = streamBaseBackoff;
      } catch (error) {
        if (controller.signal.aborted) return;
        const code = stringValue(error?.code);
        if (code === "unauthenticated" || code === "permission_denied") { expireSession(); return; }
      }
      if (controller.signal.aborted || !state.authorized || Date.now() >= state.deadline) return;
      await streamDelay(backoff, controller.signal);
      backoff = Math.min(backoff * 2, streamMaxBackoff);
    }
  }

  function stopStreams() {
    if (state.streamController) state.streamController.abort();
    state.streamController = null;
  }

  function startStreams() {
    stopStreams();
    if (!state.authorized || !state.accessToken || !adminApi || typeof adminApi.stream !== "function") return;
    const controller = new AbortController();
    state.streamController = controller;
    void runStream("admin_runtimes_stream", "runtimeCursor", controller, applyRuntimeUpsert);
    void runStream("admin_alerts_stream", "alertCursor", controller, applyAlertUpsert);
  }

  async function loadAlerts(signal) {
    try {
      renderAlerts(await adminListRequest("admin_alerts", "alerts", {}, signal));
      return true;
    } catch (error) {
      clearTable("alerts", "Alert projection unavailable. No alert state was inferred from probes.");
      document.querySelectorAll("[data-alert-coverage]").forEach((element) => { element.textContent = "Alert producer coverage is unavailable. Absence of a row is not evidence that no alert exists."; });
      if (stringValue(error?.code) === "unauthenticated") expireSession();
      return false;
    }
  }

  const auditState = { action: "", actions: [] };

  // The filter vocabulary is DISCOVERED, never guessed. AdminAuditEvent.action is a
  // free-form string on the wire, not an enum, so the only actions this control can
  // honestly offer are the ones the server has actually returned. A hardcoded list
  // would eventually offer a filter that matches nothing and look like an empty
  // trail instead of a wrong button.
  function renderAuditFilter() {
    const host = document.querySelector("[data-audit-filter]");
    if (!host) return;
    host.replaceChildren();
    const all = metricsSegItem("All", !auditState.action, () => selectAuditAction(""));
    host.append(all);
    auditState.actions.forEach((action) => {
      host.append(metricsSegItem(action, auditState.action === action, () => selectAuditAction(action)));
    });
  }

  function selectAuditAction(action) {
    if (auditState.action === action) return;
    auditState.action = action;
    renderAuditFilter();
    if (!state.authorized || !state.accessToken || Date.now() >= state.deadline) return;
    void loadAudit();
  }

  function renderAudit(response) {
    const events = Array.isArray(response?.events) ? response.events : [];
    const body = tableBody("audit");
    body.replaceChildren();
    events.forEach((event) => {
      const row = document.createElement("tr");
      const when = cell(row, formatTimestamp(event?.occurredAt), true);
      when.className = "ad-cell-mono ad-cell-mono--wrapless";
      cell(row, stringValue(event?.actorLabel) || stringValue(event?.actorUserId) || UNAVAILABLE);
      const action = cell(row, stringValue(event?.action));
      action.className = "ad-cell-mono";
      const resource = cell(row, `${stringValue(event?.resourceType) || UNAVAILABLE} / ${stringValue(event?.resourceId) || UNAVAILABLE}`);
      resource.className = "ad-cell-quiet";
      const organization = cell(row, stringValue(event?.organizationId) || UNAVAILABLE);
      organization.className = "ad-cell-mono";
      const ip = cell(row, stringValue(event?.sourceIp) || UNAVAILABLE);
      ip.className = "ad-cell-mono";
      const request = cell(row, stringValue(event?.requestId) || UNAVAILABLE);
      request.className = "ad-cell-mono";
      body.append(row);
    });
    // Only the unfiltered pass may widen the vocabulary: a filtered response
    // contains one action by construction, and letting it rewrite the list would
    // collapse the control to a single button the moment it was used.
    if (!auditState.action) {
      auditState.actions = [...new Set(events.map((event) => stringValue(event?.action)).filter(Boolean))].sort().slice(0, 8);
      renderAuditFilter();
    }
    showTable("audit", events.length);
    setSectionState("audit", events.length ? "Loaded" : "Empty", events.length ? "positive" : "neutral");
  }

  async function loadAudit(signal) {
    try {
      renderAudit(await adminListRequest("admin_audit_events", "events", { action: auditState.action }, signal));
      return true;
    } catch (error) {
      clearTable("audit", "Audit projection unavailable. Absence of a row is not evidence that no action occurred.");
      setSectionState("audit", "Unavailable", "negative", safeClientMessage(error, "Audit data is unavailable."));
      if (stringValue(error?.code) === "unauthenticated") expireSession();
      return false;
    }
  }

  function renderBillingSummary(billingResponse) {
    const billing = billingResponse?.billing;
    if (!billing || !["complete", "partial", "stale"].includes(projectionAvailability(billing))) throw new Error("invalid_billing");
    const values = {
      active: projectionValue(billing, "active_subscriptions", formatCount, billing.activeSubscriptions),
      trialing: projectionValue(billing, "trialing_subscriptions", formatCount, billing.trialingSubscriptions),
      collected: projectionValue(billing, "collected_revenue", formatOptionalMoney, billing.collectedRevenue),
      upgrades: projectionValue(billing, "upgrades", formatCount, billing.upgrades),
      downgrades: projectionValue(billing, "downgrades", formatCount, billing.downgrades),
      cancellations: projectionValue(billing, "cancellations", formatCount, billing.cancellations),
      "failed-payments": projectionValue(billing, "failed_payments", formatCount, billing.failedPayments),
      "past-due": projectionValue(billing, "past_due_invoices", formatCount, billing.pastDueInvoices),
      "over-included": projectionValue(billing, "customers_over_included_usage", formatCount, billing.customersOverIncludedUsage),
      "credit-balance": projectionValue(billing, "total_credit_balance_micros", formatCredits, billing.totalCreditBalanceMicros),
      renewals: projectionValue(billing, "upcoming_renewals_next_30_days", formatCount, billing.upcomingRenewalsNext30Days),
      mismatches: projectionValue(billing, "open_reconciliation_issues", formatCount, billing.openReconciliationIssues),
      "paid-no-team": projectionValue(billing, "paid_customers_without_provisioned_teams", formatCount, billing.paidCustomersWithoutProvisionedTeams),
      "team-no-subscription": projectionValue(billing, "provisioned_teams_without_valid_subscriptions", formatCount, billing.provisionedTeamsWithoutValidSubscriptions)
    };
    Object.entries(values).forEach(([name, value]) => document.querySelectorAll(`[data-billing-metric="${name}"]`).forEach((element) => setValue(element, value)));

    // The breakdown beside the mismatch count names the two kinds the projection
    // counts separately. A kind whose count is unavailable is listed as unavailable
    // rather than dropped, so the lines always add up to the headline or explain why
    // they cannot.
    document.querySelectorAll("[data-mismatch-breakdown]").forEach((element) => {
      element.replaceChildren();
      [["paid, no crew", values["paid-no-team"]], ["crew, no valid subscription", values["team-no-subscription"]]].forEach(([label, value]) => {
        const line = document.createElement("span");
        line.className = "ad-kv";
        const text = document.createElement("span");
        text.className = "ad-kv__k";
        text.textContent = label;
        const count = document.createElement("span");
        setValue(count, value);
        line.append(count, text);
        element.append(line);
      });
    });

    // Collected revenue is absent whenever the projection spans more than one
    // currency or no paid invoice is recorded — a routine, permanent condition
    // today, not an error. The freshness list says so in as many words rather than
    // leaving a blank the reader has to interpret.
    setFreshness("billing-collected", projectionFieldAvailable(billing, "collected_revenue") ? projectionSummary(billing) : UNAVAILABLE);
    document.querySelectorAll('[data-billing-metric-delta="collected"]').forEach((element) => {
      element.textContent = projectionFieldAvailable(billing, "collected_revenue")
        ? "cash collected this period"
        : "the projection exposes one period revenue value";
    });
    return projectionSummary(billing);
  }

  function renderBillingAccounts(accountsResponse) {
    const accounts = Array.isArray(accountsResponse?.billingAccounts) ? accountsResponse.billingAccounts : [];
    const accountBody = tableBody("billing-accounts");
    const controlBody = tableBody("team-credit-controls");
    accountBody.replaceChildren();
    controlBody.replaceChildren();
    let controlCount = 0;
    let controlsUnavailable = 0;
    const seenControls = new Set();
    accounts.forEach((account) => {
      if (!["complete", "partial", "stale"].includes(projectionAvailability(account))) throw new Error("invalid_billing_account_projection_status");
      const organizationName = stringValue(account?.organization?.name) || stringValue(account?.organization?.id);
      const subscription = projectionValue(account, "subscription", (value) => enumLabel(value?.subscriptionStatus, ["not reported", "incomplete", "incomplete expired", "trialing", "active", "past due", "canceled", "unpaid", "paused"]), account?.subscription);
      const payment = projectionValue(account, "payment_state", (value) => enumLabel(value, ["not reported", "current", "failed", "past due", "no payment method"]), account?.paymentState);
      const reconciliation = projectionValue(account, "reconciliation_state", (value) => enumLabel(value, ["not reported", "matched", "mismatched"]), account?.reconciliationState);
      const row = document.createElement("tr");
      cell(row, organizationName, true);
      cell(row, `${projectionFieldAvailable(account, "plan") ? stringValue(account?.plan?.name) || "No plan" : UNAVAILABLE} · ${subscription}`);
      const paymentCell = cell(row, ""); paymentCell.replaceChildren(statusText(payment));
      const reconciliationCell = cell(row, ""); reconciliationCell.replaceChildren(statusText(reconciliation));
      cell(row, projectionValue(account, "monthly_recurring_revenue", formatOptionalMoney, account?.monthlyRecurringRevenue));
      cell(row, projectionValue(account, "collected_revenue", formatOptionalMoney, account?.collectedRevenue));
      cell(row, `${projectionValue(account, "credit_balance_micros", formatCredits, account?.creditBalanceMicros)} / ${projectionValue(account, "credits_used_micros", formatCredits, account?.creditsUsedMicros)}`);
      cell(row, projectionValue(account, "usage_overage_credit_micros", formatNonNegativeCredits, account?.usageOverageCreditMicros));
      cell(row, projectionValue(account, "usage_overage_amount", (value) => value ? formatNonNegativeMoney(value) : "No overage", account?.usageOverageAmount));
      const renewal = cell(row, projectionValue(account, "upcoming_renewal_at", formatTimestamp, account?.upcomingRenewalAt));
      renewal.className = "ad-cell-mono";
      renewal.title = `${projectionValue(account, "provisioned_team_count", formatCount, account?.provisionedTeamCount)} of ${projectionValue(account, "entitled_team_count", formatCount, account?.entitledTeamCount)} entitled crews provisioned · projection ${projectionSummary(account)}`;
      accountBody.append(row);

      if (!projectionFieldAvailable(account, "team_credit_controls")) {
        controlsUnavailable += 1;
        return;
      }
      const controls = Array.isArray(account?.teamCreditControls) ? account.teamCreditControls : [];
      controls.forEach((control) => {
        const teamId = stringValue(control?.teamId);
        const controlKey = `${stringValue(account?.organization?.id)}:${teamId}`;
        if (!validTeamCreditControl(control) || seenControls.has(controlKey)) throw new Error("invalid_team_credit_control");
        seenControls.add(controlKey);
        const reason = teamCreditPauseReason(control?.pauseReason);
        const controlRow = document.createElement("tr");
        const identity = document.createElement("th");
        identity.scope = "row";
        const customer = document.createElement("div");
        customer.className = "ad-cell-main";
        customer.textContent = organizationName || "Unknown customer";
        const team = document.createElement("div");
        team.className = "ad-cell-sub";
        team.textContent = teamId;
        identity.append(customer, team);
        controlRow.append(identity);
        numericCell(controlRow, formatNonNegativeCredits(control?.ledgerAvailableMicros));
        numericCell(controlRow, formatNonNegativeCredits(control?.openReservedMicros));
        numericCell(controlRow, formatNonNegativeCredits(control?.periodConsumedMicros));
        numericCell(controlRow, formatNonNegativeCredits(control?.hardLimitMicros));
        // "Spendable now" is the effective figure — what the proxy will actually let
        // this crew consume once every reservation, limit and pause is applied. The
        // raw budget remaining and the paid period ride along as detail.
        const spendable = numericCell(controlRow, formatNonNegativeCredits(control?.effectiveAvailableMicros));
        spendable.title = `${formatNonNegativeCredits(control?.budgetRemainingMicros)} budget remaining · paid period ${formatTimestamp(control?.periodStartsAt)} → ${formatTimestamp(control?.periodEndsAt)} · projection ${projectionSummary(account)}`;
        const execution = cell(controlRow, "");
        execution.replaceChildren(statusText(control?.paused === true ? `paused · ${reason}` : "running"));
        controlBody.append(controlRow);
        controlCount += 1;
      });
    });
    showTable("billing-accounts", accounts.length);
    const controlEmpty = document.querySelector('[data-table-empty="team-credit-controls"]');
    if (controlEmpty && controlCount === 0) {
      controlEmpty.textContent = controlsUnavailable > 0
        ? "Team credit controls are unavailable in every returned account projection."
        : "No current paid-period team credit controls were returned.";
    }
    showTable("team-credit-controls", controlCount);
  }

  function renderReconciliationIssues(issuesResponse) {
    const issues = Array.isArray(issuesResponse?.reconciliationIssues) ? issuesResponse.reconciliationIssues : [];
    const issueKinds = ["not reported", "Stripe/local state mismatch", "paid customer not provisioned", "provisioned team without valid subscription", "usage ledger mismatch", "credit ledger mismatch"];
    const issueBody = tableBody("reconciliation");
    issueBody.replaceChildren();
    issues.forEach((issue) => {
      const row = document.createElement("tr");
      const kind = cell(row, enumLabel(issue?.kind, issueKinds), true);
      kind.className = "ad-cell-mono";
      cell(row, `${stringValue(issue?.organizationId) || UNAVAILABLE} / ${stringValue(issue?.teamId) || UNAVAILABLE}`);
      const summary = cell(row, stringValue(issue?.safeSummary));
      summary.className = "ad-cell-quiet";
      const stateCell = cell(row, "");
      stateCell.replaceChildren(statusText(enumLabel(issue?.state, ["not reported", "open", "resolved"])));
      const detected = cell(row, formatTimestamp(issue?.detectedAt));
      detected.className = "ad-cell-mono";
      issueBody.append(row);
    });
    showTable("reconciliation", issues.length);
  }

  async function loadBilling(signal) {
    setSectionState("billing", "Loading", "pending");
    const results = await Promise.allSettled([
      adminRequest("admin_billing", {}, signal),
      adminListRequest("admin_billing_accounts", "billingAccounts", {}, signal),
      adminListRequest("admin_reconciliation_issues", "reconciliationIssues", {}, signal)
    ]);
    const renderers = [
      [renderBillingSummary, () => document.querySelectorAll("[data-billing-metric]").forEach((element) => { element.textContent = UNAVAILABLE; })],
      [renderBillingAccounts, () => {
        clearTable("billing-accounts", "Billing account projection unavailable.");
        clearTable("team-credit-controls", "Team credit control projection unavailable.");
      }],
      [renderReconciliationIssues, () => clearTable("reconciliation", "Reconciliation issue projection unavailable.")]
    ];
    const errors = [];
    let loaded = 0;
    let billingProjection = "";
    results.forEach((result, index) => {
      const [render, clear] = renderers[index];
      if (result.status === "rejected") {
        errors.push(result.reason);
        clear();
        return;
      }
      try {
        const renderedProjection = render(result.value);
        if (index === 0 && typeof renderedProjection === "string") billingProjection = renderedProjection;
        loaded += 1;
      } catch (error) {
        errors.push(error);
        clear();
      }
    });

    if (errors.some((error) => stringValue(error?.code) === "unauthenticated")) {
      expireSession();
      return false;
    }
    if (loaded === 3) {
      const current = billingProjection.startsWith("complete");
      setSectionState("billing", current ? "Reconciled" : billingProjection, current ? "positive" : "neutral", billingProjection);
      return true;
    }
    if (loaded > 0) {
      setSectionState("billing", "Partially reconciled", "neutral", `${loaded} of 3 independently authorized billing projections loaded; unavailable projections remain blank.`);
      return true;
    }
    setSectionState("billing", "Unavailable", "negative", safeClientMessage(errors[0], "Admin billing data is unavailable."));
    return false;
  }

  function setProbe(name, tone, label, detail) {
    document.querySelectorAll(`[data-probe-status="${name}"]`).forEach((element) => {
      element.replaceChildren(...toneBadge(label, tone).childNodes);
      element.className = `dn-badge${BADGE_FOR_TONE[tone] || ""}`;
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
    stopStreams();
    // Reset the stream projections before reloading. A successful unary seed
    // repopulates the map and advances the cursor to its snapshot sequence; a
    // failed seed leaves the cursor at 0 so the stream re-delivers the full
    // snapshot from scratch rather than resuming past a stale cursor.
    state.runtimeInstances = new Map();
    state.runtimeCursor = 0n;
    state.alertInstances = new Map();
    state.alertCursor = 0n;
    closeCustomerDetail();
    state.refreshController = new AbortController();
    ui.refresh.disabled = true;
    ui.refresh.setAttribute("aria-busy", "true");
    try {
      setDataState("pending", "Loading authorized operations data", "Requesting current business, customer, economics, fleet, billing, alert, and audit projections.");
      const results = await Promise.all([
        loadOverview(state.refreshController.signal),
        loadCustomers(state.refreshController.signal),
        loadEconomics(state.refreshController.signal),
        loadOperations(state.refreshController.signal),
        loadMetrics(state.refreshController.signal),
        loadBilling(state.refreshController.signal),
        loadAlerts(state.refreshController.signal),
        loadAudit(state.refreshController.signal),
        probe("health", "/healthz", state.refreshController.signal),
        probe("readiness", "/readyz", state.refreshController.signal)
      ]);
      if (!state.authorized) return;
      // The unary loads have seeded the runtime and alert maps plus their
      // cursors; open the live streams to apply sequence-ordered deltas past them.
      startStreams();
      const protectedSuccesses = results.slice(0, 7).filter(Boolean).length;
      if (protectedSuccesses === 7) {
        setDataState("positive", "All authorized projections loaded", "Overview, customers, economics, fleet, billing, alerts, and audit were returned by the shared API.");
      } else if (protectedSuccesses > 0) {
        setDataState("neutral", "Authorized data loaded with gaps", `${protectedSuccesses} of 7 protected projections returned trustworthy data. Unavailable sections remain empty.`);
      } else {
        setDataState("negative", "Admin projections unavailable", "The shared API returned no trustworthy protected dashboard projection. No substitute data was displayed.");
      }
      const observed = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date());
      ui.observedAt.forEach((element) => { element.textContent = observed; });
    } finally {
      if (state.authorized) ui.refresh.disabled = false;
      ui.refresh.removeAttribute("aria-busy");
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

  // ---- view routing ---------------------------------------------------------
  //
  // Seven surfaces behind one rail, replacing the single long page of anchors this
  // console used to be. Each surface is a [data-view] section in the markup and only
  // one is ever un-hidden, so a screen full of billing tables cannot scroll past
  // under an operations heading.
  //
  // The rail and the bottom tab bar are BOTH mounted and the breakpoint chooses
  // between them, which is why they share one setView and one [data-view-link]
  // contract: no viewport can end up with two navs or none. The hash is kept in
  // step so a view survives a reload and can be sent to someone, but it is never
  // the source of truth — an unrecognised hash resolves to overview rather than
  // leaving the operator on a blank screen.
  const VIEWS = ["overview", "customers", "economics", "operations", "billing", "metrics", "audit"];
  const VIEW_TITLES = {
    overview: "Overview",
    customers: "Customers",
    economics: "Economics",
    operations: "Operations",
    billing: "Billing",
    metrics: "Metrics",
    audit: "Audit"
  };

  function setView(view) {
    const target = VIEWS.includes(view) ? view : "overview";
    document.querySelectorAll("[data-view]").forEach((section) => { section.hidden = section.dataset.view !== target; });
    // aria-current belongs to the NAVS, not to every control that happens to change
    // view. The overview's "All alerts" button and its attention rows also carry
    // data-view-link so they route through the same handler, but announcing one of
    // them as the current page would be a lie to a screen reader.
    document.querySelectorAll("[data-view-nav] [data-view-link], [data-view-tabbar] [data-view-link]").forEach((link) => {
      if (stringValue(link.dataset.viewLink) === target) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-view-title]").forEach((element) => { element.textContent = VIEW_TITLES[target]; });
    const scrollport = document.querySelector("[data-scrollport]");
    if (scrollport) scrollport.scrollTop = 0;
    if (window.location.hash !== `#${target}`) {
      window.history.replaceState({}, "", `${window.location.pathname}#${target}`);
    }
  }

  function viewFromLocation() {
    const hash = stringValue(window.location.hash).replace(/^#/, "");
    return VIEWS.includes(hash) ? hash : "overview";
  }

  function bindViewNavigation() {
    document.querySelectorAll("[data-view-link]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        setView(stringValue(link.dataset.viewLink));
      });
    });
    window.addEventListener("hashchange", () => setView(viewFromLocation()));
  }

  ui.signIn.addEventListener("click", beginSignIn);
  ui.retrySignIn.addEventListener("click", beginSignIn);
  ui.signOut.addEventListener("click", signOut);
  ui.refresh.addEventListener("click", refreshDashboard);
  document.querySelector("[data-customer-rows]")?.addEventListener("click", openCustomerDetail);
  ui.customerDetailClose.addEventListener("click", closeCustomerDetail);
  ui.customerReliabilityMore.addEventListener("click", loadMoreCustomerReliability);
  bindViewNavigation();

  // The economics slice control. Changing the dimension is a NEW REQUEST — the
  // server aggregates, the browser never re-buckets rows it already has, because a
  // client-side regroup would silently drop every slice the current dimension's
  // page window happened to exclude.
  document.querySelector("[data-economics-dimension]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dimension]");
    if (!button) return;
    const dimension = stringValue(button.dataset.dimension);
    if (!dimension || dimension === economicsState.dimension) return;
    economicsState.dimension = dimension;
    document.querySelectorAll("[data-economics-dimension] [data-dimension]").forEach((item) => {
      if (item === button) item.dataset.active = "true";
      else delete item.dataset.active;
    });
    if (state.authorized && state.accessToken && Date.now() < state.deadline) void loadEconomics();
  });

  // The customer filter and search narrow a COMPLETE set (see customersState), so
  // they run here rather than as another round trip.
  document.querySelector("[data-customer-filter]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    customersState.filter = stringValue(button.dataset.filter) || "all";
    document.querySelectorAll("[data-customer-filter] [data-filter]").forEach((item) => {
      if (item === button) item.dataset.active = "true";
      else delete item.dataset.active;
    });
    renderCustomerRows();
  });
  document.querySelector("[data-customer-search]")?.addEventListener("input", (event) => {
    customersState.search = stringValue(event.target.value);
    renderCustomerRows();
  });

  // The audit request-ID box is deliberately inert. ListAdminAuditEvents filters by
  // organization, action and actor — there is no request-ID filter in the contract —
  // so honouring it would mean filtering immutable records in the browser, which is
  // the one thing this screen promises it never does. It stays visible, disabled,
  // and says why, rather than quietly doing something weaker than it looks.
  const auditRequestId = document.querySelector("[data-audit-request-id]");
  if (auditRequestId) {
    auditRequestId.disabled = true;
    auditRequestId.title = "The audit list filters by organization, action and actor. There is no request-ID filter in the API, and these records are never filtered in the browser.";
  }
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });

  setView(viewFromLocation());
  renderMetricsQueryBar();
  renderConfiguration();
  showSignedOut();
  if (document.body.dataset.authCallback === "true") completeCallback();
})();
