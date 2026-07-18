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
    reliabilityLastPeriodStart: null
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
    if (!apiBaseUrl || generated?.PLATFORM_PROTOS_REVISION !== "1a950c9fc437d1d186caa40fb3efbcdc86eedd65" || typeof generated.createAdminApi !== "function") return null;
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

  function resetOverviewMetrics() {
    ["mrr", "arr", "active-customers", "active-teams", "gross-margin", "nrr", "churn", "new-customers", "churned-customers", "active-agents", "open-alerts", "at-risk-customers", "incidents", "prs-merged"].forEach((name) => setMetric(name, "—"));
  }

  function resetMetrics() {
    resetOverviewMetrics();
    ui.overviewSource.forEach((element) => { element.textContent = "not yet loaded"; });
    document.querySelectorAll("[data-alert-coverage]").forEach((element) => { element.textContent = "No alert coverage has been loaded."; });
    document.querySelectorAll("[data-economics-metric], [data-fleet-metric], [data-billing-metric]").forEach((element) => { element.textContent = "—"; });
    ["customers", "team-economics", "runtimes", "alerts", "billing-accounts", "team-credit-controls", "reconciliation", "audit"].forEach(clearTable);
    ["customers", "economics", "operations", "billing"].forEach((name) => setSectionState(name, "Waiting", "neutral"));
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
    try { return value ? formatMoney(value) : "—"; } catch { return "—"; }
  }

  function formatNonNegativeMoney(value) {
    if (!value || integerValue(value.units) < 0n || Number(value.nanos || 0) < 0) throw new Error("invalid_negative_money");
    return formatMoney(value);
  }

  function formatRatio(value) {
    const ratio = Number(value);
    return Number.isFinite(ratio) ? new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(ratio) : "—";
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
      return "—";
    }
  }

  function formatNonNegativeCredits(value) {
    try {
      return integerValue(value) >= 0n ? formatCredits(value) : "—";
    } catch {
      return "—";
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
    if (milliseconds === null) return "—";
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function formatBytes(value) {
    try {
      const bytes = Number(integerValue(value));
      if (!Number.isSafeInteger(bytes) || bytes < 0) return "—";
      if (bytes < 1024) return `${bytes} B`;
      const units = ["KB", "MB", "GB", "TB"];
      let amount = bytes;
      let index = -1;
      do { amount /= 1024; index += 1; } while (amount >= 1024 && index < units.length - 1);
      return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(amount)} ${units[index]}`;
    } catch {
      return "—";
    }
  }

  function enumLabel(value, labels) {
    if (typeof value === "number" && Number.isInteger(value)) return labels[value] || "not reported";
    return stringValue(value).replace(/^[A-Z_]+?_/, "").replaceAll("_", " ").toLowerCase() || "not reported";
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
    if (!projectionFieldAvailable(record, snakeCaseField)) return "—";
    try { return formatter(value); } catch { return "—"; }
  }

  function projectionSummary(record) {
    const availability = projectionAvailability(record);
    const observed = formatTimestamp(record?.projectionStatus?.sourceObservedAt);
    const label = ["complete", "partial", "stale"].includes(availability) ? availability : "unavailable";
    return `${label}${observed !== "—" ? ` · source ${observed}` : " · source time unavailable"}`;
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
      element.textContent = label;
      element.dataset.tone = tone;
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
    element.textContent = stringValue(value) || "—";
    row.append(element);
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

  function statusText(label) {
    const span = document.createElement("span");
    span.className = `status status--${statusTone(label)}`;
    const indicator = document.createElement("span");
    indicator.setAttribute("aria-hidden", "true");
    span.append(indicator, document.createTextNode(label || "not reported"));
    return span;
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
    ui.overviewSource.forEach((element) => { element.textContent = projectionSummary(overview); });
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

  function renderCustomers(response) {
    const customers = Array.isArray(response?.customers) ? response.customers : [];
    const body = tableBody("customers");
    body.replaceChildren();
    const seenCustomerIds = new Set();
    customers.forEach((customer) => {
      if (!["complete", "partial", "stale"].includes(projectionAvailability(customer))) throw new Error("invalid_customer_projection_status");
      const organization = customer?.organization || {};
      const organizationId = safeResourceId(organization.id);
      if (!organizationId || seenCustomerIds.has(organizationId)) throw new Error("invalid_or_duplicate_customer_id");
      seenCustomerIds.add(organizationId);
      const economics = customer?.economics || {};
      const subscriptionLabel = projectionFieldAvailable(customer, "subscription") ? enumLabel(customer?.subscription?.subscriptionStatus, ["not reported", "incomplete", "incomplete expired", "trialing", "active", "past due", "canceled", "unpaid", "paused"]) : "—";
      const paymentLabel = projectionFieldAvailable(customer, "payment_state") ? enumLabel(customer?.paymentState, ["not reported", "current", "failed", "past due", "no payment method"]) : "—";
      const healthLabel = projectionFieldAvailable(customer, "health_state") ? enumLabel(customer?.healthState, ["not reported", "healthy", "needs attention", "at risk", "critical"]) : "unavailable";
      const supportLabel = projectionFieldAvailable(customer, "support_state") ? enumLabel(customer?.supportState, ["not reported", "none", "open", "escalated"]) : "unavailable";
      const riskLabel = projectionFieldAvailable(customer, "churn_risk_level") ? enumLabel(customer?.churnRiskLevel, ["not reported", "low", "medium", "high", "critical"]) : "unavailable";
      const activity = projectionFieldAvailable(customer, "activity") ? customer?.activity : null;
      const reliability = projectionFieldAvailable(customer, "reliability") ? customer?.reliability : null;
      const row = document.createElement("tr");
      cell(row, stringValue(organization.name) || stringValue(organization.id), true);
      cell(row, `${projectionFieldAvailable(customer, "plan") ? stringValue(customer?.plan?.name) || "No plan" : "—"} · ${subscriptionLabel} · ${paymentLabel}`);
      cell(row, projectionValue(customer, "team_count", formatCount, customer?.teamCount));
      cell(row, `${projectionValue(customer, "user_count", formatCount, customer?.userCount)} / ${projectionValue(customer, "repository_count", formatCount, customer?.repositoryCount)}`);
      cell(row, activity
        ? `${projectionValue(activity, "active_agents", formatCount, activity.activeAgents)} active · ${projectionValue(activity, "blocked_agents", formatCount, activity.blockedAgents)} blocked · ${projectionValue(activity, "failed_agents", formatCount, activity.failedAgents)} failed · ${projectionValue(activity, "current_sessions", formatCount, activity.currentSessions)} sessions · ${projectionValue(activity, "active_initiatives", formatCount, activity.activeInitiatives)} initiatives · ${projectionValue(activity, "pending_approvals", formatCount, activity.pendingApprovals)} approvals · last ${projectionFieldAvailable(activity, "last_agent_activity_at") ? formatTimestamp(activity.lastAgentActivityAt) : "—"}`
        : "—");
      const economicsAvailable = projectionFieldAvailable(customer, "economics");
      cell(row, economicsAvailable ? formatCredits(economics.creditsUsedMicros) : "—");
      cell(row, economicsAvailable ? formatOptionalMoney(economics.directCost) : "—");
      cell(row, economicsAvailable ? formatOptionalMoney(economics.revenue) : "—");
      cell(row, economicsAvailable ? formatOptionalMoney(economics.grossProfit) : "—");
      cell(row, economicsAvailable ? formatRatio(economics.grossMarginRatio ?? economics.grossMargin) : "—");
      cell(row, reliability
        ? `${projectionValue(reliability, "gateway_availability_ratio", formatRatio, reliability.gatewayAvailabilityRatio)} gateway · ${projectionValue(reliability, "production_incidents", formatCount, reliability.productionIncidents)} incidents · last ${projectionFieldAvailable(reliability, "last_incident_at") ? formatTimestamp(reliability.lastIncidentAt) : "—"}`
        : "—");
      const health = cell(row, "");
      health.replaceChildren(statusText(`${healthLabel} · ${riskLabel} risk · ${supportLabel} support`));
      cell(row, projectionSummary(customer));
      const action = cell(row, "");
      const detailButton = document.createElement("button");
      detailButton.className = "button button--quiet button--small customer-detail-action";
      detailButton.type = "button";
      detailButton.dataset.customerDetailId = organizationId;
      detailButton.setAttribute("aria-controls", "customer-detail");
      detailButton.setAttribute("aria-expanded", String(state.selectedCustomerId === organizationId && !ui.customerDetail.hidden));
      detailButton.setAttribute("aria-label", `Review ${stringValue(organization.name) || organizationId} account detail and reliability history`);
      detailButton.textContent = "Review";
      action.replaceChildren(detailButton);
      body.append(row);
    });
    showTable("customers", customers.length);
    return projectionCollectionState(customers);
  }

  async function loadCustomers(signal) {
    try {
      setSectionState("customers", "Loading", "pending");
      const collectionState = renderCustomers(await adminListRequest("admin_customers", "customers", {}, signal));
      setSectionState("customers", collectionState.label, collectionState.tone, "Each row reports its source projection freshness.");
      return true;
    } catch (error) {
      clearTable("customers", "Customer projection unavailable. No substitute data source was used.");
      setSectionState("customers", "Unavailable", "negative", safeClientMessage(error, "Admin customer data is unavailable."));
      if (stringValue(error?.code) === "unauthenticated") expireSession();
      return false;
    }
  }

  function setCustomerDetailField(name, value) {
    document.querySelectorAll(`[data-customer-detail-field="${name}"]`).forEach((element) => { element.textContent = stringValue(value) || "—"; });
  }

  function resetCustomerDetailFields() {
    document.querySelectorAll("[data-customer-detail-field]").forEach((element) => { element.textContent = "—"; });
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
    return activity ? projectionValue(activity, field, formatter, value) : "—";
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
    const subscription = projectionFieldAvailable(customer, "subscription") ? enumLabel(customer?.subscription?.subscriptionStatus, ["not reported", "incomplete", "incomplete expired", "trialing", "active", "past due", "canceled", "unpaid", "paused"]) : "—";
    const payment = projectionValue(customer, "payment_state", (value) => enumLabel(value, ["not reported", "current", "failed", "past due", "no payment method"]), customer.paymentState);
    const health = projectionValue(customer, "health_state", (value) => enumLabel(value, ["not reported", "healthy", "needs attention", "at risk", "critical"]), customer.healthState);
    const support = projectionValue(customer, "support_state", (value) => enumLabel(value, ["not reported", "none", "open", "escalated"]), customer.supportState);
    const churn = projectionValue(customer, "churn_risk_level", (value) => enumLabel(value, ["not reported", "low", "medium", "high", "critical"]), customer.churnRiskLevel);
    ui.customerDetailTitle.textContent = stringValue(organization.name) || organizationId;
    setCustomerDetailField("plan", `${projectionFieldAvailable(customer, "plan") ? stringValue(customer?.plan?.name) || "No plan" : "—"} · ${subscription} · ${payment}`);
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
      : "—");
    setCustomerDetailField("mrr", projectionValue(customer, "monthly_recurring_revenue", formatOptionalMoney, customer.monthlyRecurringRevenue));
    setCustomerDetailField("economics", economics ? `${formatCredits(economics.creditsUsedMicros)} credits · ${formatOptionalMoney(economics.directCost)} direct cost` : "—");
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
        cell(row, formatUtcReliabilityPeriod(entry.periodStart, entry.periodEnd), true);
        cell(row, entry.ratio === null ? "Unavailable · insufficient coverage" : formatRatio(entry.ratio));
        cell(row, formatCount(entry.incidents));
        cell(row, entry.lastIncidentAt ? formatTimestamp(entry.lastIncidentAt) : "—");
        cell(row, formatTimestamp(entry.generatedAt));
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
      "direct-cost": summaryAvailable ? formatOptionalMoney(summary.directCost) : "—",
      revenue: summaryAvailable ? formatOptionalMoney(summary.revenue) : "—",
      "gross-profit": summaryAvailable ? formatOptionalMoney(summary.grossProfit) : "—",
      "gross-margin": summaryAvailable ? formatRatio(summary.grossMarginRatio ?? summary.grossMargin) : "—"
    };
    Object.entries(values).forEach(([name, value]) => document.querySelectorAll(`[data-economics-metric="${name}"]`).forEach((element) => { element.textContent = value; }));
    return projectionSummary(economics);
  }

  function renderEconomicsSlices(slicesResponse) {
    const slices = Array.isArray(slicesResponse?.economicsSlices) ? slicesResponse.economicsSlices : [];
    const body = tableBody("team-economics");
    body.replaceChildren();
    slices.forEach((slice) => {
      const teamSummary = slice?.summary || {};
      const row = document.createElement("tr");
      cell(row, stringValue(slice?.displayName) || stringValue(slice?.dimensionId), true);
      cell(row, formatCredits(teamSummary.creditsUsedMicros));
      cell(row, formatCredits(teamSummary.creditsRemainingMicros));
      cell(row, formatOptionalMoney(teamSummary.directCost));
      cell(row, formatOptionalMoney(teamSummary.revenue));
      cell(row, formatOptionalMoney(teamSummary.grossProfit));
      cell(row, formatRatio(teamSummary.grossMarginRatio ?? teamSummary.grossMargin));
      cell(row, formatCount(slice?.modelRequestCount || 0));
      body.append(row);
    });
    showTable("team-economics", slices.length);
  }

  async function loadEconomics(signal) {
    setSectionState("economics", "Loading", "pending");
    const [economicsResult, slicesResult] = await Promise.allSettled([
      adminRequest("admin_economics", {}, signal),
      adminListRequest("admin_team_economics", "economicsSlices", {}, signal)
    ]);
    const errors = [];
    let loaded = 0;
    let economicsProjection = "";

    if (economicsResult.status === "fulfilled") {
      try {
        economicsProjection = renderEconomicsSummary(economicsResult.value);
        loaded += 1;
      } catch (error) {
        errors.push(error);
        document.querySelectorAll("[data-economics-metric]").forEach((element) => { element.textContent = "—"; });
      }
    } else {
      errors.push(economicsResult.reason);
      document.querySelectorAll("[data-economics-metric]").forEach((element) => { element.textContent = "—"; });
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
    Object.entries(values).forEach(([name, value]) => document.querySelectorAll(`[data-fleet-metric="${name}"]`).forEach((element) => { element.textContent = value; }));
    return projectionSummary(fleet);
  }

  function renderRuntimes(response) {
    const runtimes = Array.isArray(response?.runtimeInstances) ? response.runtimeInstances : [];
    const body = tableBody("runtimes");
    body.replaceChildren();
    runtimes.forEach((runtime) => {
      if (!["complete", "partial", "stale"].includes(projectionAvailability(runtime))) throw new Error("invalid_runtime_projection_status");
      const runtimeState = projectionValue(runtime, "runtime_state", (value) => enumLabel(value, ["not reported", "ready", "degraded", "suspended", "failed"]), runtime?.runtimeState);
      const backupState = projectionValue(runtime, "backup_state", (value) => enumLabel(value, ["not reported", "current", "overdue", "failed", "never completed"]), runtime?.backupState);
      const eventState = projectionValue(runtime, "event_stream_state", (value) => enumLabel(value, ["not reported", "current", "lagging", "unavailable"]), runtime?.eventStreamState);
      const healthReason = projectionValue(runtime, "runtime_health_reason", (value) => enumLabel(value, ["not reported", "none", "reconciling", "generation mismatch", "gateway not ready", "agent roster not ready", "suspended", "reconciliation failed", "heartbeat stale"]), runtime?.runtimeHealthReason);
      const instanceName = projectionFieldAvailable(runtime, "openclaw_instance_name") ? stringValue(runtime?.openclawInstanceName) : "";
      const row = document.createElement("tr");
      cell(row, `${stringValue(runtime?.teamId) || "Unknown team"} · ${instanceName || stringValue(runtime?.id)}`, true);
      const stateCell = cell(row, ""); stateCell.replaceChildren(statusText(runtimeState));
      cell(row, `${healthReason} · ${projectionValue(runtime, "gateway_ready", (value) => value ? "gateway ready" : "gateway not ready", runtime?.gatewayReady)} · ${projectionValue(runtime, "ready_agent_count", formatCount, runtime?.readyAgentCount)} ready agents · generation ${projectionValue(runtime, "observed_generation", formatCount, runtime?.observedGeneration)}/${projectionValue(runtime, "desired_generation", formatCount, runtime?.desiredGeneration)} · ${projectionFieldAvailable(runtime, "kubernetes_namespace") ? stringValue(runtime?.kubernetesNamespace) || "namespace unavailable" : "namespace unavailable"}`);
      cell(row, `${projectionValue(runtime, "active_agents", formatCount, runtime?.activeAgents)} active · ${projectionValue(runtime, "blocked_agents", formatCount, runtime?.blockedAgents)} blocked · ${projectionValue(runtime, "failed_agents", formatCount, runtime?.failedAgents)} failed`);
      cell(row, projectionValue(runtime, "current_sessions", formatCount, runtime?.currentSessions));
      cell(row, `${projectionValue(runtime, "last_heartbeat_at", formatTimestamp, runtime?.lastHeartbeatAt)} / ${projectionValue(runtime, "last_tool_call_at", formatTimestamp, runtime?.lastToolCallAt)}`);
      cell(row, projectionFieldAvailable(runtime, "current_model_aliases") && Array.isArray(runtime?.currentModelAliases) && runtime.currentModelAliases.length ? runtime.currentModelAliases.join(", ") : "—");
      cell(row, `${projectionValue(runtime, "workspace_volume_used_bytes", formatBytes, runtime?.workspaceVolumeUsedBytes)} / ${projectionValue(runtime, "workspace_volume_capacity_bytes", formatBytes, runtime?.workspaceVolumeCapacityBytes)}`);
      cell(row, `${backupState} / ${eventState}`);
      cell(row, `${projectionFieldAvailable(runtime, "openclaw_version") ? stringValue(runtime?.openclawVersion) || "—" : "—"} / ${projectionFieldAvailable(runtime, "operator_version") ? stringValue(runtime?.operatorVersion) || "—" : "—"} / ${projectionFieldAvailable(runtime, "organization_template_version") ? stringValue(runtime?.organizationTemplateVersion) || "—" : "—"}`);
      cell(row, projectionSummary(runtime));
      body.append(row);
    });
    showTable("runtimes", runtimes.length);
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
        loaded += 1;
      } catch (error) {
        errors.push(error);
        document.querySelectorAll("[data-fleet-metric]").forEach((element) => { element.textContent = "—"; });
      }
    } else {
      errors.push(fleetResult.reason);
      document.querySelectorAll("[data-fleet-metric]").forEach((element) => { element.textContent = "—"; });
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

  function renderAlerts(response) {
    const alerts = Array.isArray(response?.alerts) ? response.alerts : [];
    const body = tableBody("alerts");
    body.replaceChildren();
    const kinds = ["not reported", "gateway unavailable", "invalid OpenClaw configuration", "failed Stripe webhook", "failed GitHub webhook", "paid customer not provisioned", "subscription canceled while team running", "customer over included usage", "gross margin below threshold", "PVC near capacity", "backup overdue", "elevated model provider errors", "customer adoption decline", "trial nearing expiration"];
    alerts.forEach((alert) => {
      if (!["complete", "partial", "stale"].includes(projectionAvailability(alert))) throw new Error("invalid_alert_projection_status");
      const severity = projectionValue(alert, "severity", (value) => enumLabel(value, ["not reported", "informational", "warning", "critical"]), alert?.severity);
      const row = document.createElement("tr");
      const severityCell = cell(row, "", true); severityCell.replaceChildren(statusText(severity));
      cell(row, projectionValue(alert, "kind", (value) => enumLabel(value, kinds), alert?.kind));
      cell(row, `${stringValue(alert?.teamId) || "—"} / ${stringValue(alert?.organizationId) || "—"}`);
      cell(row, projectionFieldAvailable(alert, "safe_summary") ? stringValue(alert?.safeSummary) : "—");
      cell(row, projectionValue(alert, "occurrence_count", formatCount, alert?.occurrenceCount));
      cell(row, projectionValue(alert, "last_detected_at", formatTimestamp, alert?.lastDetectedAt));
      cell(row, projectionSummary(alert));
      body.append(row);
    });
    const unavailableKinds = Array.isArray(response?.unavailableKinds) ? response.unavailableKinds.map((kind) => enumLabel(kind, kinds)) : [];
    const coverage = [];
    if (unavailableKinds.length) coverage.push(`Unavailable alert producers: ${unavailableKinds.join(", ")}.`);
    coverage.push(response?.resolvedAlertHistoryAvailable === true
      ? "Resolved-alert history is covered by this projection."
      : "Only current open alerts are trustworthy; resolved-alert history is unavailable.");
    document.querySelectorAll("[data-alert-coverage]").forEach((element) => { element.textContent = coverage.join(" "); });
    showTable("alerts", alerts.length);
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

  function renderAudit(response) {
    const events = Array.isArray(response?.events) ? response.events : [];
    const body = tableBody("audit");
    body.replaceChildren();
    events.forEach((event) => {
      const row = document.createElement("tr");
      cell(row, formatTimestamp(event?.occurredAt), true);
      cell(row, stringValue(event?.actorLabel) || stringValue(event?.actorUserId) || "—");
      cell(row, stringValue(event?.action));
      cell(row, `${stringValue(event?.resourceType) || "—"} / ${stringValue(event?.resourceId) || "—"}`);
      cell(row, stringValue(event?.organizationId) || "—");
      cell(row, stringValue(event?.sourceIp) || "—");
      cell(row, stringValue(event?.requestId) || "—");
      body.append(row);
    });
    showTable("audit", events.length);
    setSectionState("audit", events.length ? "Loaded" : "Empty", events.length ? "positive" : "neutral");
  }

  async function loadAudit(signal) {
    try {
      renderAudit(await adminListRequest("admin_audit_events", "events", {}, signal));
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
    Object.entries(values).forEach(([name, value]) => document.querySelectorAll(`[data-billing-metric="${name}"]`).forEach((element) => { element.textContent = value; }));
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
      cell(row, `${projectionFieldAvailable(account, "plan") ? stringValue(account?.plan?.name) || "No plan" : "—"} · ${subscription}`);
      const paymentCell = cell(row, ""); paymentCell.replaceChildren(statusText(payment));
      const reconciliationCell = cell(row, ""); reconciliationCell.replaceChildren(statusText(reconciliation));
      cell(row, projectionValue(account, "monthly_recurring_revenue", formatOptionalMoney, account?.monthlyRecurringRevenue));
      cell(row, `${projectionValue(account, "credit_balance_micros", formatCredits, account?.creditBalanceMicros)} / ${projectionValue(account, "credits_used_micros", formatCredits, account?.creditsUsedMicros)}`);
      cell(row, projectionValue(account, "usage_overage_credit_micros", formatNonNegativeCredits, account?.usageOverageCreditMicros));
      cell(row, projectionValue(account, "usage_overage_amount", (value) => value ? formatNonNegativeMoney(value) : "No overage", account?.usageOverageAmount));
      cell(row, `${projectionValue(account, "provisioned_team_count", formatCount, account?.provisionedTeamCount)} / ${projectionValue(account, "entitled_team_count", formatCount, account?.entitledTeamCount)}`);
      cell(row, projectionValue(account, "upcoming_renewal_at", formatTimestamp, account?.upcomingRenewalAt));
      cell(row, projectionSummary(account));
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
        cell(controlRow, `${organizationName || "Unknown customer"} · ${teamId}`, true);
        cell(controlRow, formatNonNegativeCredits(control?.ledgerAvailableMicros));
        cell(controlRow, formatNonNegativeCredits(control?.openReservedMicros));
        cell(controlRow, formatNonNegativeCredits(control?.periodConsumedMicros));
        cell(controlRow, formatNonNegativeCredits(control?.hardLimitMicros));
        cell(controlRow, formatNonNegativeCredits(control?.budgetRemainingMicros));
        cell(controlRow, formatNonNegativeCredits(control?.effectiveAvailableMicros));
        const execution = cell(controlRow, "");
        execution.replaceChildren(statusText(control?.paused === true ? `paused · ${reason}` : "running"));
        cell(controlRow, `${formatTimestamp(control?.periodStartsAt)} → ${formatTimestamp(control?.periodEndsAt)}`);
        cell(controlRow, projectionSummary(account));
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
      cell(row, enumLabel(issue?.kind, issueKinds), true);
      cell(row, `${stringValue(issue?.organizationId) || "—"} / ${stringValue(issue?.teamId) || "—"}`);
      cell(row, stringValue(issue?.safeSummary));
      cell(row, enumLabel(issue?.state, ["not reported", "open", "resolved"]));
      cell(row, formatTimestamp(issue?.detectedAt));
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
      [renderBillingSummary, () => document.querySelectorAll("[data-billing-metric]").forEach((element) => { element.textContent = "—"; })],
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
    closeCustomerDetail();
    state.refreshController = new AbortController();
    ui.refresh.disabled = true;
    ui.refresh.classList.add("is-refreshing");
    try {
      setDataState("pending", "Loading authorized operations data", "Requesting current business, customer, economics, fleet, billing, alert, and audit projections.");
      const results = await Promise.all([
        loadOverview(state.refreshController.signal),
        loadCustomers(state.refreshController.signal),
        loadEconomics(state.refreshController.signal),
        loadOperations(state.refreshController.signal),
        loadBilling(state.refreshController.signal),
        loadAlerts(state.refreshController.signal),
        loadAudit(state.refreshController.signal),
        probe("health", "/healthz", state.refreshController.signal),
        probe("readiness", "/readyz", state.refreshController.signal)
      ]);
      if (!state.authorized) return;
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
  document.querySelector("[data-customer-rows]")?.addEventListener("click", openCustomerDetail);
  ui.customerDetailClose.addEventListener("click", closeCustomerDetail);
  ui.customerReliabilityMore.addEventListener("click", loadMoreCustomerReliability);
  document.querySelector(".side-rail nav")?.addEventListener("click", activateNavigation);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });

  renderConfiguration();
  showSignedOut();
  if (document.body.dataset.authCallback === "true") completeCallback();
})();
