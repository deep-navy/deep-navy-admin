"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const source = readFileSync("assets/js/admin-api-client.js", "utf8");
const generated = Function(`${source}\nreturn deepNavyAdminGeneratedClient;`)();

function parseRequestBody(body) {
  if (typeof body === "string") return JSON.parse(body);
  if (body instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(body));
  throw new TypeError(`Unexpected request body type: ${Object.prototype.toString.call(body)}`);
}

// Connect server-streaming frames each message with a 5-byte envelope
// (1 flag byte + 4-byte big-endian length). Flag 0x02 marks end-of-stream.
function connectEnvelope(flag, payload) {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = flag;
  new DataView(frame.buffer).setUint32(1, payload.length, false);
  frame.set(payload, 5);
  return frame;
}

function connectStreamResponseBody(messages) {
  const encoder = new TextEncoder();
  const frames = messages.map((message) => connectEnvelope(0x00, encoder.encode(JSON.stringify(message))));
  frames.push(connectEnvelope(0x02, encoder.encode(JSON.stringify({}))));
  const total = frames.reduce((sum, frame) => sum + frame.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const frame of frames) { out.set(frame, offset); offset += frame.length; }
  return out;
}

function parseStreamRequestBody(body) {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(5)));
}

test("the browser bundle exposes the pinned read-only admin launch procedures", () => {
  assert.equal(generated.PLATFORM_PROTOS_REVISION, "31a489d8f0b073fd499207ab86bdea0f2faea0b7");
  assert.deepEqual([...generated.SUPPORTED_PROCEDURES], [
    "admin_identity",
    "admin_overview", "admin_customers", "admin_customer",
    "admin_customer_reliability", "admin_economics", "admin_team_economics",
    "admin_fleet", "admin_runtimes", "admin_billing", "admin_billing_accounts",
    "admin_reconciliation_issues", "admin_alerts", "admin_audit_events"
  ]);
});

// The console asked AuthService.GetCurrentUser who the operator was while holding a
// credential from the OPERATOR pool. That service is mounted behind the CUSTOMER
// authentication interceptor, which does not know that issuer, so it answered 401 to
// every successful sign-in - and the console reported it as "the platform could not
// authorize this operator".
//
// The repair is not a wider interceptor; that same interceptor guards teams, GitHub,
// organizations and billing, and an operator credential must never authenticate
// against a customer surface. So the reachable set is AdminService and nothing else,
// and this is the test that keeps it that way: the client cannot be asked for the
// customer identity service, and the shipped bundle does not contain it.
test("the admin bundle has no path to the customer identity service", () => {
  assert.ok(!generated.SUPPORTED_PROCEDURES.includes("current_user"));
  for (const banned of ["AuthService", "GetCurrentUser", "current_user"]) {
    assert.ok(!source.includes(banned), `the shipped admin bundle still references ${banned}`);
  }
});

test("an unsupported procedure reaches no network at all", async () => {
  let fetched = false;
  const api = generated.createAdminApi({
    baseUrl: "https://dev.api.deep.navy",
    fetch: async () => { fetched = true; return new Response("{}", { status: 200 }); }
  });
  assert.equal(await api.request("current_user", {}, { bearerToken: "id-token", requestId: "request-0" }), undefined);
  assert.equal(fetched, false);
});

test("the browser bundle exposes the live admin streaming procedures", () => {
  assert.deepEqual([...generated.STREAM_PROCEDURES], ["admin_runtimes_stream", "admin_alerts_stream"]);
  const api = generated.createAdminApi({ baseUrl: "https://dev.api.deep.navy", fetch: async () => new Response(null, { status: 200 }) });
  assert.equal(typeof api.stream, "function");
});

test("the generated client resumes the runtime stream past a cursor and delivers each decoded message", async () => {
  const calls = [];
  const messages = [];
  const api = generated.createAdminApi({
    baseUrl: "https://dev.api.deep.navy",
    fetch: async (input, init) => {
      calls.push({ input: String(input), body: parseStreamRequestBody(init.body), headers: new Headers(init.headers) });
      return new Response(connectStreamResponseBody([
        { runtimeInstance: { id: "runtime-1" }, changeType: "ADMIN_STREAM_CHANGE_TYPE_UPSERT", resourceId: "runtime-1", sequence: "7" }
      ]), { status: 200, headers: { "Content-Type": "application/connect+json" } });
    }
  });
  await api.stream("admin_runtimes_stream", { afterSequence: "5" }, { bearerToken: "id-token", requestId: "stream-1" }, (message) => messages.push(message));
  assert.equal(calls[0].input, "https://dev.api.deep.navy/deepnavy.v1.AdminService/StreamAdminRuntimeInstances");
  assert.equal(calls[0].headers.get("authorization"), "Bearer id-token");
  assert.equal(calls[0].headers.get("x-request-id"), "stream-1");
  assert.equal(calls[0].body.afterSequence, "5");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].resourceId, "runtime-1");
  assert.equal(messages[0].sequence, 7n);
  assert.equal(messages[0].runtimeInstance.id, "runtime-1");
});

test("the generated stream rejects an unauthenticated caller before opening a connection", async () => {
  let fetched = false;
  const api = generated.createAdminApi({ baseUrl: "https://dev.api.deep.navy", fetch: async () => { fetched = true; return new Response(null, { status: 200 }); } });
  await assert.rejects(api.stream("admin_alerts_stream", { afterSequence: "0" }, { bearerToken: "  ", requestId: "stream-2" }, () => {}), (error) => {
    assert.equal(error.name, "AdminClientError");
    assert.equal(error.code, "unauthenticated");
    return true;
  });
  assert.equal(fetched, false);
});

// The authorization probe. It is an ADMINISTRATOR request, on the only surface that
// knows the operator pool's issuer, and it carries the operator's bearer credential
// with no cookie, no cache entry, no redirect and no referrer.
test("the authorization probe carries bearer identity without cookies or caching", async () => {
  const calls = [];
  const api = generated.createAdminApi({
    baseUrl: "https://dev.api.deep.navy",
    fetch: async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({ overview: { activeTeams: "6" } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const response = await api.request("admin_overview", {}, { bearerToken: "id-token", requestId: "request-1" });
  assert.equal(response.overview.activeTeams, 6n);
  assert.equal(calls[0].input, "https://dev.api.deep.navy/deepnavy.v1.AdminService/GetAdminOverview");
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer id-token");
  assert.equal(new Headers(calls[0].init.headers).get("x-request-id"), "request-1");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.referrerPolicy, "no-referrer");
});

test("the generated admin request decodes Protobuf money and int64 fields", async () => {
  let requestUrl = "";
  const api = generated.createAdminApi({
    baseUrl: "https://dev.api.deep.navy",
    fetch: async (input) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({ overview: {
        monthlyRecurringRevenue: { currencyCode: "USD", units: "1250", nanos: 0 },
        annualRecurringRevenue: { currencyCode: "USD", units: "15000", nanos: 0 },
        activeCustomers: "4", activeTeams: "6", grossMargin: 0.42,
        productionIncidents: "0", pullRequestsMerged: "17"
      } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const response = await api.request("admin_overview", {}, { bearerToken: "id-token", requestId: "request-2" });
  assert.equal(requestUrl, "https://dev.api.deep.navy/deepnavy.v1.AdminService/GetAdminOverview");
  assert.equal(response.overview.monthlyRecurringRevenue.units, 1250n);
  assert.equal(response.overview.activeTeams, 6n);
  assert.equal(response.overview.grossMargin, 0.42);
});

test("Connect errors expose the safe top-level message and server request ID", async () => {
  const api = generated.createAdminApi({
    baseUrl: "https://dev.api.deep.navy",
    fetch: async () => new Response(JSON.stringify({ code: "permission_denied", message: "Founder or Admin access is required." }), {
      status: 403,
      headers: { "Content-Type": "application/json", "X-Request-ID": "server-reference" }
    })
  });
  await assert.rejects(api.request("admin_overview", {}, { bearerToken: "id-token", requestId: "client-reference" }), (error) => {
    assert.equal(error.name, "AdminClientError");
    assert.equal(error.code, "permission_denied");
    assert.equal(error.status, 403);
    assert.equal(error.requestId, "server-reference");
    assert.equal(error.message, "Founder or Admin access is required.");
    return true;
  });
});

test("the generated client requests team economics and operational resources through AdminService", async () => {
  const calls = [];
  const api = generated.createAdminApi({
    baseUrl: "https://dev.api.deep.navy",
    fetch: async (input, init) => {
      calls.push({ input: String(input), body: parseRequestBody(init.body) });
      return new Response(JSON.stringify({ economicsSlices: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  await api.request("admin_team_economics", { page: { pageSize: 100 } }, { bearerToken: "id-token", requestId: "economics-1" });
  assert.equal(calls[0].input, "https://dev.api.deep.navy/deepnavy.v1.AdminService/ListAdminEconomicsSlices");
  assert.deepEqual(calls[0].body, { dimension: "ADMIN_ECONOMICS_DIMENSION_TEAM", page: { pageSize: 100 } });
});
