import { Code, ConnectError, createClient, type CallOptions } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import {
  AdminEconomicsDimension,
  AdminService
} from "../vendor/platform-protos/deepnavy/v1/admin_pb.js";
import { AuthService } from "../vendor/platform-protos/deepnavy/v1/auth_pb.js";

export const PLATFORM_PROTOS_REVISION = "39ae22707fe8ac5185d1383dc088426af63cc5a1";
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

export const STREAM_PROCEDURES = Object.freeze([
  "admin_runtimes_stream",
  "admin_alerts_stream"
] as const);
type StreamName = (typeof STREAM_PROCEDURES)[number];

// Streams live for the browser session, well beyond the unary default timeout.
// The admin session ceiling is at most 15 minutes and its abort controller closes
// the stream first, so this ceiling is only a safety net.
const STREAM_TIMEOUT_MS = 16 * 60 * 1000;

type InputRecord = Record<string, unknown>;

function streamCursor(value: unknown): bigint {
  if (typeof value === "bigint") return value >= 0n ? value : 0n;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return BigInt(value);
  return 0n;
}

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

// The economics ledger can only aggregate by a dimension it actually carries, so the
// console offers exactly these and no more: a "slice by" control that lists a dimension
// the server would reject is a control that lies. AdminEconomicsDimension also declares
// AGENT, ISSUE, PULL_REQUEST, REPOSITORY and PROVIDER; they are omitted here only because
// no screen asks for them yet, and adding one is a single line plus a button.
const ECONOMICS_DIMENSIONS: Readonly<Record<string, AdminEconomicsDimension>> = Object.freeze({
  team: AdminEconomicsDimension.TEAM,
  organization: AdminEconomicsDimension.ORGANIZATION,
  agent_role: AdminEconomicsDimension.AGENT_ROLE,
  model: AdminEconomicsDimension.MODEL,
  initiative: AdminEconomicsDimension.INITIATIVE
});

export const SUPPORTED_ECONOMICS_DIMENSIONS = Object.freeze(Object.keys(ECONOMICS_DIMENSIONS));

function economicsDimension(value: unknown): AdminEconomicsDimension {
  if (value === undefined || value === null || value === "") return AdminEconomicsDimension.TEAM;
  if (typeof value !== "string" || !Object.hasOwn(ECONOMICS_DIMENSIONS, value)) {
    throw new AdminClientError("dimension is not a supported economics dimension.", "invalid_argument", 400, "");
  }
  return ECONOMICS_DIMENSIONS[value] as AdminEconomicsDimension;
}

// An optional server-side filter. Empty means "not applied", which is what the API
// documents; anything present is validated to the same shape as a required field, so a
// filter can never smuggle control characters into a logged query.
function optionalTextField(input: InputRecord, name: string): string {
  const raw = input[name];
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string" || raw !== raw.trim() || raw.length > 128 || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new AdminClientError(`${name} is invalid.`, "invalid_argument", 400, "");
  }
  return raw;
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
            dimension: economicsDimension(payload.dimension),
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
          // The action filter is applied by the SERVER. The audit trail is the one
          // list in this console that must never be narrowed in the browser: absence
          // of an audit row has to mean the server did not return it, not that a
          // client-side predicate hid it.
          return await admin.listAdminAuditEvents({
            page: pageRequest(payload.page),
            action: optionalTextField(payload, "action")
          }, callOptions);
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

  async function stream(name: StreamName, input: unknown, options: AdminCallOptions, onMessage: (message: unknown) => void): Promise<void> {
    const payload = inputRecord(input);
    const accessToken = options.accessToken.trim();
    const requestId = options.requestId.trim();
    if (!accessToken) throw new AdminClientError("Sign-in is required.", "unauthenticated", 401, requestId);
    if (!requestId) throw new AdminClientError("A request ID is required.", "invalid_argument", 400, "");
    if (typeof onMessage !== "function") throw new AdminClientError("A stream handler is required.", "invalid_argument", 400, requestId);

    const afterSequence = streamCursor(payload.afterSequence);
    const callOptions: CallOptions = {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Request-ID": requestId
      },
      signal: options.signal,
      timeoutMs: STREAM_TIMEOUT_MS
    };

    try {
      let iterable: AsyncIterable<unknown>;
      switch (name) {
        case "admin_runtimes_stream":
          iterable = admin.streamAdminRuntimeInstances({ afterSequence }, callOptions);
          break;
        case "admin_alerts_stream":
          iterable = admin.streamAdminAlerts({ afterSequence }, callOptions);
          break;
        default:
          throw new AdminClientError("Unsupported administrator stream.", "invalid_argument", 400, requestId);
      }
      for await (const message of iterable) {
        onMessage(message);
      }
    } catch (error) {
      if (error instanceof AdminClientError) throw error;
      const connectError = ConnectError.from(error);
      if (connectError.code === Code.Canceled) return;
      const responseRequestId = connectError.metadata.get("x-request-id") || requestId;
      const safeMessage = connectError.code === Code.Unknown
        ? "The browser could not reach the platform service."
        : connectError.rawMessage.slice(0, 300) || "The platform service closed the administrator stream.";
      throw new AdminClientError(safeMessage, codeName(connectError.code), httpStatus(connectError.code), responseRequestId);
    }
  }

  return Object.freeze({ request, stream });
}
