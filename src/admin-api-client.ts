import { Code, ConnectError, createClient, type CallOptions } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import {
  AdminEconomicsDimension,
  AdminService
} from "../vendor/platform-protos/deepnavy/v1/admin_pb.js";
import { AuthService } from "../vendor/platform-protos/deepnavy/v1/auth_pb.js";

export const PLATFORM_PROTOS_REVISION = "1a950c9fc437d1d186caa40fb3efbcdc86eedd65";
export const SUPPORTED_PROCEDURES = Object.freeze([
  "current_user",
  "admin_overview",
  "admin_customers",
  "admin_customer",
  "admin_customer_reliability",
  "admin_economics",
  "admin_team_economics",
  "admin_fleet",
  "admin_runtimes",
  "admin_billing",
  "admin_billing_accounts",
  "admin_reconciliation_issues",
  "admin_alerts",
  "admin_audit_events"
] as const);

type ProcedureName = (typeof SUPPORTED_PROCEDURES)[number];
type InputRecord = Record<string, unknown>;

export interface AdminCallOptions {
  accessToken: string;
  requestId: string;
  signal?: AbortSignal;
}

export interface AdminApiOptions {
  baseUrl: string;
  defaultTimeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export class AdminClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string;

  constructor(message: string, code: string, status: number, requestId: string) {
    super(message);
    this.name = "AdminClientError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function codeName(code: Code): string {
  return ({
    [Code.Canceled]: "canceled",
    [Code.Unknown]: "unknown",
    [Code.InvalidArgument]: "invalid_argument",
    [Code.DeadlineExceeded]: "deadline_exceeded",
    [Code.NotFound]: "not_found",
    [Code.AlreadyExists]: "already_exists",
    [Code.PermissionDenied]: "permission_denied",
    [Code.ResourceExhausted]: "resource_exhausted",
    [Code.FailedPrecondition]: "failed_precondition",
    [Code.Aborted]: "aborted",
    [Code.OutOfRange]: "out_of_range",
    [Code.Unimplemented]: "unimplemented",
    [Code.Internal]: "internal",
    [Code.Unavailable]: "unavailable",
    [Code.DataLoss]: "data_loss",
    [Code.Unauthenticated]: "unauthenticated"
  } satisfies Record<number, string>)[code] || "unknown";
}

function httpStatus(code: Code): number {
  return ({
    [Code.Canceled]: 499,
    [Code.Unknown]: 500,
    [Code.InvalidArgument]: 400,
    [Code.DeadlineExceeded]: 504,
    [Code.NotFound]: 404,
    [Code.AlreadyExists]: 409,
    [Code.PermissionDenied]: 403,
    [Code.ResourceExhausted]: 429,
    [Code.FailedPrecondition]: 412,
    [Code.Aborted]: 409,
    [Code.OutOfRange]: 400,
    [Code.Unimplemented]: 501,
    [Code.Internal]: 500,
    [Code.Unavailable]: 503,
    [Code.DataLoss]: 500,
    [Code.Unauthenticated]: 401
  } satisfies Record<number, number>)[code] || 500;
}

function normalizedBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function inputRecord(input: unknown): InputRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AdminClientError("The request payload is invalid.", "invalid_argument", 400, "");
  return input as InputRecord;
}

function pageRequest(value: unknown): { pageSize: number; pageToken: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const page = value as InputRecord;
  const pageSize = typeof page.pageSize === "number" && Number.isInteger(page.pageSize) && page.pageSize >= 0 && page.pageSize <= 200
    ? page.pageSize
    : 0;
  const pageToken = typeof page.pageToken === "string" ? page.pageToken : "";
  if (pageToken.length > 4096 || /[\u0000-\u001f\u007f]/.test(pageToken)) throw new AdminClientError("pageToken is invalid.", "invalid_argument", 400, "");
  return { pageSize, pageToken };
}

function textField(input: InputRecord, name: string): string {
  const raw = input[name];
  if (typeof raw !== "string" || raw !== raw.trim() || !raw || raw.length > 128 || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new AdminClientError(`${name} is required.`, "invalid_argument", 400, "");
  }
  return raw;
}

export function createAdminApi(options: AdminApiOptions) {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  if (!baseUrl) throw new AdminClientError("The platform API origin is invalid.", "invalid_configuration", 0, "");
  const fetchImplementation = options.fetch || globalThis.fetch;
  if (typeof fetchImplementation !== "function") throw new AdminClientError("Fetch is unavailable.", "invalid_configuration", 0, "");

  const safeFetch: typeof globalThis.fetch = (input, init) => fetchImplementation(input, {
    ...init,
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer"
  });
  const transport = createConnectTransport({
    baseUrl,
    defaultTimeoutMs: options.defaultTimeoutMs ?? 12_000,
    fetch: safeFetch,
    useBinaryFormat: false,
    useHttpGet: false
  });
  const admin = createClient(AdminService, transport);
  const auth = createClient(AuthService, transport);

  async function request(name: ProcedureName, input: unknown, options: AdminCallOptions): Promise<unknown> {
    const payload = inputRecord(input);
    const accessToken = options.accessToken.trim();
    const requestId = options.requestId.trim();
    if (!accessToken) throw new AdminClientError("Sign-in is required.", "unauthenticated", 401, requestId);
    if (!requestId) throw new AdminClientError("A request ID is required.", "invalid_argument", 400, "");

    const callOptions: CallOptions = {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Request-ID": requestId
      },
      signal: options.signal
    };

    try {
      switch (name) {
        case "current_user":
          return await auth.getCurrentUser({}, callOptions);
        case "admin_overview":
          return await admin.getAdminOverview({}, callOptions);
        case "admin_customers":
          return await admin.listAdminCustomers({ page: pageRequest(payload.page) }, callOptions);
        case "admin_customer":
          return await admin.getAdminCustomer({ organizationId: textField(payload, "organizationId") }, callOptions);
        case "admin_customer_reliability":
          return await admin.listAdminCustomerReliabilityRecords({
            organizationId: textField(payload, "organizationId"),
            page: pageRequest(payload.page)
          }, callOptions);
        case "admin_economics":
          return await admin.getAdminEconomics({}, callOptions);
        case "admin_team_economics":
          return await admin.listAdminEconomicsSlices({
            dimension: AdminEconomicsDimension.TEAM,
            page: pageRequest(payload.page)
          }, callOptions);
        case "admin_fleet":
          return await admin.getAdminFleet({}, callOptions);
        case "admin_runtimes":
          return await admin.listAdminRuntimeInstances({ page: pageRequest(payload.page) }, callOptions);
        case "admin_billing":
          return await admin.getAdminBilling({}, callOptions);
        case "admin_billing_accounts":
          return await admin.listAdminBillingAccounts({ page: pageRequest(payload.page) }, callOptions);
        case "admin_reconciliation_issues":
          return await admin.listAdminBillingReconciliationIssues({ page: pageRequest(payload.page) }, callOptions);
        case "admin_alerts":
          return await admin.listAdminAlerts({ page: pageRequest(payload.page) }, callOptions);
        case "admin_audit_events":
          return await admin.listAdminAuditEvents({ page: pageRequest(payload.page) }, callOptions);
      }
    } catch (error) {
      if (error instanceof AdminClientError) throw error;
      const connectError = ConnectError.from(error);
      const responseRequestId = connectError.metadata.get("x-request-id") || requestId;
      const safeMessage = connectError.code === Code.Unknown
        ? "The browser could not reach the platform service."
        : connectError.rawMessage.slice(0, 300) || "The platform service rejected the request.";
      throw new AdminClientError(safeMessage, codeName(connectError.code), httpStatus(connectError.code), responseRequestId);
    }
  }

  return Object.freeze({ request });
}
