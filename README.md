# deep-navy-admin

Static, noindex Jekyll application for deep.navy founders and administrators.
The browser uses Amazon Cognito authorization code with PKCE and calls the same
ConnectRPC platform API as the customer application. The repository contains no
secret and the browser is never treated as an authorization boundary.

The console is built on the deep.navy design system, which is **vendored** at
`assets/css/ds/` (18 files, entry point `assets/css/ds.css`) rather than
re-authored here. Those files are the system's own bytes and must never be
hand-edited: `scripts/check_vendored_design_system.mjs` hashes the tree against
`assets/css/ds.MANIFEST.sha256` and fails the build if one of them drifts. To
take a new version, copy the tree in and regenerate the manifest with
`REWRITE_DS_MANIFEST=1 node scripts/check_vendored_design_system.mjs`.

The four stylesheets load in this order, because each depends on the
one before it — and test/site_test.rb asserts that order in the built HTML:

| Layer | What it is |
| --- | --- |
| `assets/css/ds.css` | the vendored system, minus the two modules this CSP cannot reach (its CDN font import and its CDN icon module) |
| `assets/css/type.css` | the three faces, self-hosted, because `font-src 'self'` |
| `assets/css/theme.css` | the OS-preference default the system leaves to the site, plus the dark-mode chroma boost |
| `assets/css/admin.css` | the application layer: shell geometry, the mark, the icon sprite's stroke, state utilities |

The chrome is achromatic in both themes — colour appears only where it carries
meaning (lumen = live, kelp = success, brass = waiting on a human, coral =
failed) — evidence is set in JetBrains Mono, headings in Bricolage Grotesque,
voice in Instrument Sans (all three self-hosted under `font-src 'self'`; see
`assets/fonts/FONTS-LICENSE.md`), and the app layer breaks at exactly
1200/900/600. Both themes ship from one build: `:root` is light,
`data-theme="dark"` is dark, and the OS preference decides when no explicit
choice is present — that third state is why `theme.css` mirrors the system's
dark aliases under `:root:not([data-theme="light"])`.

Two CSP consequences shape every screen. `style-src 'self'` refuses inline style
ATTRIBUTES as well as `<style>` blocks, so there is not one `style="..."` in the
markup and every visual decision is a class. `script-src 'self'` with no hash
allowance — and `test/site_test.rb` forbidding inline script outright — means
the two pre-paint scripts (`callback-scrubber.js`, `theme.js`) are same-origin
files loaded without `defer`, not the usual inline snippet.

The design contract is enforced by `test/admin_app_security_test.cjs` and the
console's structure by `test/admin_console_structure_test.cjs`.

## Views

Seven surfaces behind one rail, registered in `VIEWS` in `assets/js/admin.js`
and mirrored by `[data-view]` sections in `_includes/admin-console.html`:
overview, customers, economics, operations, billing, metrics, audit. The rail
carries all seven; the bottom tab bar carries five. Both are mounted and the
breakpoint picks one, so no viewport gets two navs or none.

## The honesty contract

The admin API marks fields it cannot vouch for by name on
`projection_status.unavailable_fields`. Those fields still arrive as protobuf
scalar zeros, so a named field never renders its value: it renders the literal
word `unavailable`, in tertiary ink, through `projectionValue` →
`setValue` → `unavailableNode`. Never a zero, which is a claim; never a dash,
which in a numeric column reads as a measurement. Several fields are
permanently unavailable today by construction — production incidents, most
runtime-instance telemetry, upgrades and downgrades — and the screens are
expected to be calm about them.

## Implemented launch surface

- Cognito managed-login redirect with PKCE S256, nonce, state, issuer, audience,
  token-use, expiry, issue-time, and authentication-time validation.
- Forced fresh login and a browser-enforced session ceiling of at most 15
  minutes. Access and ID tokens are held only in JavaScript memory. Only the
  transient PKCE verifier, state, nonce, redirect URI, and creation time enter
  `sessionStorage`; no bearer or refresh token is persisted.
- `AdminService.GetAdminIdentity` is the authorization probe: a 200 is the
  platform authorizing this operator, and its answer is the operator the
  sidebar reports. It replaced `GetAdminOverview`, which was a stand-in — an
  overview answers "may I read this?", not "who am I?", so everything the
  console said about the operator had to be read out of the ID token in the
  browser's own hand, and the strongest honest claim it could make was that
  something had been authorized.
- The operator now comes from the verified principal, not from a self-supplied
  token: `subject`, the pool-asserted `email`/`email_verified` and
  `display_name`, any `platform_roles` the pool asserts, and
  `authorization_basis` — the server's own account of *why* this operator is
  permitted, which is a fact no token carries. The sidebar names that basis
  ("Allowlisted Google account", "Directory role with MFA") instead of the
  vaguer "Authorized by the platform". `platform_roles` is empty for an
  allowlisted Google account because that pool asserts no groups; that
  emptiness is ordinary and is not an absence of authorization, so it is simply
  not mentioned.
- There is still no client-side role gate. The roles are displayed, never
  tested: the API holds the address allowlist and re-checks permission on every
  admin request, and what an operator may do is decided per RPC rather than
  read off this message. A test holds that line — `platform_roles` may reach
  the sidebar and may not reach a conditional.
- `session_expires_at` is the server's own ceiling on the session, the earlier
  of the token's expiry and the maximum session age it enforces. The console
  adopts it in place of counting against an assumption of its own, and only
  ever tightens: a server saying "later" never extends a session whose token
  expires first.
- A response that is not an identity is refused rather than believed. The
  generated client answers `undefined` for a procedure it holds no case for
  instead of throwing, so the seam checks the shape before it authorizes
  anything — otherwise a probe pointed at an unserved name would fail open.
- A refusal is reported as one of three things a human acts on
  differently — credential rejected (sign in again), authenticated but not
  permitted (signing in again will not help), platform unreachable (retry) —
  always with the request reference the platform returned. These are keyed on
  the Connect code, not on which RPC produced it, so they carried over to the
  new probe unchanged: `UNAUTHENTICATED` means the token was rejected,
  `PERMISSION_DENIED` means the operator authenticated but is not permitted.
- The customer identity service is unreachable from this console by
  construction. It sits behind the customer authentication interceptor and the
  customer user pool, and this console holds an operator-pool credential, so it
  could only ever answer 401; the generated client no longer binds it.
- The read-only overview, customer, team economics, fleet, runtime, billing,
  reconciliation, and alert projections are consumed through TypeScript
  generated from `platform-protos` revision
  `5a3d34b92328aa4d222ae74ac70cb7699985e09d`.
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
- A metrics explorer reads the per-environment Prometheus workspaces through
  platform-api's closed PromQL proxy (`GET /admin/v1/metrics/query_range`):
  ten panel names — never raw PromQL — with the `service=` filter on the first
  five only, a window of at most 24h and a 30s step. A query bar (series,
  service, window, environment) drives a focused panel and echoes the exact
  request from the same URL builder the fetch uses. Empty is four different
  facts and each panel says which one: production 404s render as an absent
  environment, wired-but-silent `openclaw_*` series render as pending with the
  crew re-provision reason, `target_health` is empty by construction, and a
  failed request is a failure — nothing is invented browser-side.
- A reference section carries the data-planes audit verbatim beside the live
  panels: the four telemetry planes, the Platform API surface inventory
  (customer vs admin vs the one agent-originated write), webhook ingestion,
  the GitHub App grants, both check-run trust models, the PRD sign-off lock
  contract, the cross-plane join matrix (an em dash means that pivot cannot be
  built), the Langfuse read API, OTEL label dimensions, unsurfaced series, and
  the honest limits.
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
authentication for every protected admin RPC. It is the only thing that enforces
them: this console makes no authorization decision of its own.

## API routes

The generated browser client issues ConnectRPC JSON `POST` requests to:

```text
/deepnavy.v1.AdminService/GetAdminIdentity
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
