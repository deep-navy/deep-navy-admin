# deep-navy-admin

Static, noindex Jekyll application for deep navy founders and administrators.
The browser uses Amazon Cognito authorization code with PKCE and calls the same
ConnectRPC platform API as the customer application. The repository contains no
secret and the browser is never treated as an authorization boundary.

## Implemented launch surface

- Cognito managed-login redirect with PKCE S256, nonce, state, issuer, audience,
  token-use, expiry, issue-time, and authentication-time validation.
- Forced fresh login and a browser-enforced session ceiling of at most 15
  minutes. Access and ID tokens are held only in JavaScript memory. Only the
  transient PKCE verifier, state, nonce, redirect URI, and creation time enter
  `sessionStorage`; no bearer or refresh token is persisted.
- `AuthService.GetCurrentUser` verifies the bearer identity through the platform
  API. The admin overview is requested only after that response contains a
  case-insensitive `Founder` or `Admin` platform role.
- The read-only overview, customer, team economics, fleet, runtime, billing,
  reconciliation, and alert projections are consumed through TypeScript
  generated from `platform-protos` revision
  `fa01d7cc4c68c1e7ee606a44677ad70d16f4c563`.
- Every list follows the AdminService snapshot cursor until complete, so the
  customer, team, runtime, billing-account, reconciliation, and alert tables do
  not silently stop at the first 100 records.
- Each customer row opens an authorized current-account detail projection with
  support and churn state, agent/session/initiative/approval activity, and an
  independently paginated daily reliability history. Reliability cursors stay
  opaque and organization-scoped; missing availability ratios are shown as
  unavailable rather than zero.
- MRR, ARR, retention, churn, customers, per-team direct cost, revenue, gross
  profit and margin, runtime health, billing state, credits, reconciliation,
  and alerts render only from successful API responses. Failed or unavailable
  projections stay empty; independently successful customer, per-team,
  billing-account, and reconciliation projections remain visible when an
  aggregate summary is unavailable. The UI has no demo records or fallback
  business data.
- Every partial or stale projection reports source freshness and exact
  unavailable protobuf fields; those fields remain visibly blank instead of
  becoming trustworthy scalar zeroes. Billing accounts also expose the
  authoritative paid-period team credit controls: ledger availability, open
  reservations, consumed credits, hard limits, spendable capacity, and the
  effective pause reason. Billing operations also expose upgrades, downgrades,
  and each account's overage credits and premium, subject to the same exact
  field-availability rules.
- Public `/healthz` and `/readyz` probes are clearly distinguished from
  authenticated admin data.
- All browser API and token requests use `cache: "no-store"`, omit cookies,
  reject redirects, and suppress referrers. An early callback scrubber removes
  OAuth query parameters before other application assets load. A restored
  back-forward-cache page is reloaded so an in-memory operator session is not
  revived.
- CSP, no-referrer, Permissions Policy, noindex metadata, accessible focus and
  status handling, and responsive layouts are part of every page.

## Runtime configuration

Deployment runs `scripts/write_runtime_config.rb`, which accepts public values
only and fails a development or production deployment when any required value
is absent or malformed.

| GitHub environment variable | Meaning |
| --- | --- |
| `ADMIN_API_BASE_URL` | Exact HTTPS origin of the shared platform API, such as `https://api.dev.deep.navy` |
| `ADMIN_COGNITO_DOMAIN` | Exact Cognito managed-login origin |
| `ADMIN_COGNITO_ISSUER` | Exact user-pool issuer, such as `https://cognito-idp.us-west-2.amazonaws.com/us-west-2_example` |
| `ADMIN_COGNITO_CLIENT_ID` | Public Cognito app-client ID; never a client secret |
| `ADMIN_SESSION_MAX_AGE_SECONDS` | Optional browser ceiling from 300 through 900; defaults to 900 |

The deployment workflow pins `ADMIN_URL` to the development custom domain. The
writer derives the only accepted callback and logout URLs from that deployed
URL:

```text
<ADMIN_URL>/auth/callback/
<ADMIN_URL>/
```

For development those are:

```text
https://admin.deep.navy/auth/callback/
https://admin.deep.navy/
```

This exact callback/logout pair must be registered on the development Cognito
app client before the Pages URL is deployed. The current platform
API validates a single Cognito client ID, so development should initially add
the admin URLs to that existing public client (and reduce its access/ID token
validity to 15 minutes) unless platform authentication is first expanded to
accept a separate admin app-client audience.

The user pool must keep MFA `ON`. The browser session limit is defense in depth;
the API must independently enforce admin/founder role, MFA policy, and recent
authentication for every protected admin RPC.

## API routes

The generated browser client issues ConnectRPC JSON `POST` requests to:

```text
/deepnavy.v1.AuthService/GetCurrentUser
/deepnavy.v1.AdminService/GetAdminOverview
/deepnavy.v1.AdminService/ListAdminCustomers
/deepnavy.v1.AdminService/GetAdminCustomer
/deepnavy.v1.AdminService/ListAdminCustomerReliabilityRecords
/deepnavy.v1.AdminService/GetAdminEconomics
/deepnavy.v1.AdminService/ListAdminEconomicsSlices
/deepnavy.v1.AdminService/GetAdminFleet
/deepnavy.v1.AdminService/ListAdminRuntimeInstances
/deepnavy.v1.AdminService/GetAdminBilling
/deepnavy.v1.AdminService/ListAdminBillingAccounts
/deepnavy.v1.AdminService/ListAdminBillingReconciliationIssues
/deepnavy.v1.AdminService/ListAdminAlerts
```

The portal also makes unauthenticated `GET` requests to:

```text
/healthz
/readyz
```

Every protected request carries exactly one `Authorization: Bearer …` header
and an opaque `X-Request-ID`. The client exposes only generated read RPCs and
does not call customer-scoped billing or team methods as an admin shortcut.

## Backend gaps blocking a complete admin launch

The read projections are defined and consumed. The remaining contract gaps are:

- Collected versus recognized revenue. The current economics projection exposes
  one period revenue value.
- An admin audit-event list and privileged mutations with explicit confirmation,
  idempotency, founder authorization, and immutable audit records.

Protected responses should include
`Cache-Control: no-store`; GitHub Pages cannot set response headers, so the
static shell itself contains no protected data and every browser fetch opts out
of caching.

## Development and validation

Install pinned dependencies and run the same checks as CI:

```sh
npm ci
bundle install
script/validate-site
```

The validation command verifies vendored generated code and its revision,
TypeScript, the browser bundle, OAuth/storage controls, runtime-value validation,
JavaScript syntax, and rendered development and production builds.

For a local configured build, generate a public runtime file and serve Jekyll:

```sh
DEEP_NAVY_ENVIRONMENT=local \
ADMIN_URL=http://localhost:4000 \
ADMIN_API_BASE_URL=http://localhost:8080 \
ADMIN_COGNITO_DOMAIN=https://example.auth.us-west-2.amazoncognito.com \
ADMIN_COGNITO_ISSUER=https://cognito-idp.us-west-2.amazonaws.com/us-west-2_example \
ADMIN_COGNITO_CLIENT_ID=examplepublicclient \
ruby scripts/write_runtime_config.rb

bundle exec jekyll serve --config _config.yml,_config.runtime.yml
```

The local callback must also be allowlisted in Cognito. Never add a Cognito
client secret, AWS credential, Stripe key, GitHub App credential, OpenClaw
credential, or other secret to this repository or its GitHub variables.
