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

test("the browser bundle exposes the pinned read-only admin launch procedures", () => {
  assert.equal(generated.PLATFORM_PROTOS_REVISION, "39ae22707fe8ac5185d1383dc088426af63cc5a1");
  assert.deepEqual([...generated.SUPPORTED_PROCEDURES], [
    "current_user", "admin_overview", "admin_customers", "admin_customer",
    "admin_customer_reliability", "admin_economics", "admin_team_economics",
    "admin_fleet", "admin_runtimes", "admin_billing", "admin_billing_accounts",
    "admin_reconciliation_issues", "admin_alerts", "admin_audit_events"
  ]);
});

test("the generated current-user request carries bearer identity without cookies or caching", async () => {
  const calls = [];
  const api = generated.createAdminApi({
    baseUrl: "https://dev.api.deep.navy",
    fetch: async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({ user: { id: "user-1", displayName: "Founder", platformRoles: ["Founder"] } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const response = await api.request("current_user", {}, { accessToken: "access-token", requestId: "request-1" });
  assert.equal(response.user.displayName, "Founder");
  assert.equal(calls[0].input, "https://dev.api.deep.navy/deepnavy.v1.AuthService/GetCurrentUser");
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer access-token");
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
  const response = await api.request("admin_overview", {}, { accessToken: "access-token", requestId: "request-2" });
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
  await assert.rejects(api.request("admin_overview", {}, { accessToken: "access-token", requestId: "client-reference" }), (error) => {
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
  await api.request("admin_team_economics", { page: { pageSize: 100 } }, { accessToken: "access-token", requestId: "economics-1" });
  assert.equal(calls[0].input, "https://dev.api.deep.navy/deepnavy.v1.AdminService/ListAdminEconomicsSlices");
  assert.deepEqual(calls[0].body, { dimension: "ADMIN_ECONOMICS_DIMENSION_TEAM", page: { pageSize: 100 } });
});
