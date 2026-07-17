# deep-navy-admin

Static, noindex Jekyll application for Deep Navy founders and administrators.
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
- `AdminService.GetAdminOverview` is consumed through TypeScript generated from
  `platform-protos` revision
  `fa01d7cc4c68c1e7ee606a44677ad70d16f4c563`.
- MRR, ARR, active customers, active teams, gross margin, production incidents,
  and merged pull requests render only from a successful API response. Missing
  contracts and failed responses stay visibly unavailable; the UI has no demo
  records or fallback business data.
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

The workflow obtains `ADMIN_URL` from `actions/configure-pages`. The writer
derives the only accepted callback and logout URLs from that deployed URL:

```text
<ADMIN_URL>/auth/callback/
<ADMIN_URL>/
```

For the current GitHub Pages project URL those are:

```text
https://deep-navy.github.io/deep-navy-admin/auth/callback/
https://deep-navy.github.io/deep-navy-admin/
```

After the custom domain is active they become:

```text
https://admin.dev.deep.navy/auth/callback/
https://admin.dev.deep.navy/
```

Both exact callback/logout pairs must be registered on the development Cognito
app client before the corresponding Pages URL is deployed. The current platform
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
```

The portal also makes unauthenticated `GET` requests to:

```text
/healthz
/readyz
```

Every protected request carries exactly one `Authorization: Bearer …` header
and an opaque `X-Request-ID`. The client exposes only these two generated RPCs;
it does not call customer-scoped billing or team methods as an admin shortcut.

## Backend gaps blocking a complete admin launch

`platform-protos` currently defines only the seven-field aggregate admin
overview, and `platform-api` does not yet register or implement even that
`AdminService`. The following requirements therefore remain unavailable by
design, not simulated in this frontend:

- Admin customer list/detail, users, repositories, activity, support state,
  reliability, churn risk, and customer health.
- Economics by customer, team, agent, initiative, model, provider, issue, and
  pull request.
- Fleet instances, agent/session state, heartbeats, model, volume, backup,
  event-stream, OpenClaw/operator/template versions, and alerts.
- Subscription/invoice lifecycle, payment failures, renewals, credits,
  overages, Stripe/local mismatches, and subscription/provisioning mismatches.
- Audited privileged mutations with explicit confirmation and idempotency.

Those capabilities need resource-oriented protobuf methods, generated clients,
and server-side founder/admin authorization. Protected responses should include
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
JavaScript syntax, and rendered development, production, and GitHub Pages path
builds.

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
