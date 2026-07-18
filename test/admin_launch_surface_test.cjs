"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const app = readFileSync("assets/js/admin.js", "utf8");
const client = readFileSync("src/admin-api-client.ts", "utf8");
const shell = readFileSync("_includes/admin-console.html", "utf8");

test("customer detail uses the frozen current-customer and reliability-history RPCs", () => {
  assert.match(client, /"admin_customer"/);
  assert.match(client, /admin\.getAdminCustomer/);
  assert.match(client, /"admin_customer_reliability"/);
  assert.match(client, /admin\.listAdminCustomerReliabilityRecords/);
  assert.match(app, /adminRequest\("admin_customer", \{ organizationId \}/);
  assert.match(app, /adminRequest\("admin_customer_reliability", \{ organizationId, page: \{ pageSize: 100/);
  assert.match(shell, /data-customer-detail/);
  assert.match(shell, /data-customer-reliability-rows/);
});

test("customer reliability pagination stays scoped, opaque, ordered, and fail closed", () => {
  assert.match(app, /function opaquePageToken/);
  assert.match(app, /return value;\n  \}/);
  assert.match(app, /recordOrganizationId !== organizationId/);
  assert.match(app, /periodStart > previousPeriodStart/);
  assert.match(app, /duplicate_customer_reliability_record/);
  assert.match(app, /repeated_customer_reliability_cursor/);
  assert.match(app, /page: \{ pageSize: 100, pageToken \}/);
  assert.match(app, /Missing availability ratios are explicit source unavailability, never zero/);
  assert.match(app, /Unavailable · insufficient coverage/);
});

test("customer detail keeps launch intervention signals visible", () => {
  for (const field of ["support", "churn", "initiatives", "approvals"]) assert.match(shell, new RegExp(`data-customer-detail-field="${field}"`));
  assert.match(app, /projectionValue\(customer, "support_state"/);
  assert.match(app, /projectionValue\(customer, "churn_risk_level"/);
  assert.match(app, /customerDetailActivityValue\(activity, "active_initiatives"/);
  assert.match(app, /customerDetailActivityValue\(activity, "pending_approvals"/);
  assert.match(app, /aria-expanded/);
  assert.match(app, /aria-controls/);
});

test("billing exposes upgrades, downgrades, and per-account overages without fake zeros", () => {
  assert.match(shell, /data-billing-metric="upgrades"/);
  assert.match(shell, /data-billing-metric="downgrades"/);
  assert.match(app, /projectionValue\(billing, "upgrades", formatCount, billing\.upgrades\)/);
  assert.match(app, /projectionValue\(billing, "downgrades", formatCount, billing\.downgrades\)/);
  assert.match(app, /projectionValue\(account, "usage_overage_credit_micros", formatNonNegativeCredits/);
  assert.match(app, /projectionValue\(account, "usage_overage_amount", \(value\) => value \? formatNonNegativeMoney\(value\) : "No overage"/);
  assert.match(shell, /Overage credits/);
  assert.match(shell, /Overage premium/);
});
