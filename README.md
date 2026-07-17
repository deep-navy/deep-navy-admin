# deep-navy-admin

Static, noindex Jekyll shell for Deep Navy internal operations. The current
launch surface performs browser-side requests only to the platform API's public
health and readiness endpoints. Customer data, billing data, authentication,
and mutating admin controls are explicitly not connected.

## Environment builds

The shared configuration lives in `_config.yml`. Deployment builds merge one
environment file:

- `develop` uses `_config.development.yml` and targets `admin.dev.deep.navy` /
  `api.dev.deep.navy`.
- `main` uses `_config.production.yml` and targets `admin.deep.navy` /
  `api.deep.navy`.

Build locally with:

```sh
bundle install
JEKYLL_ENV=development bundle exec jekyll serve \
  --config _config.yml,_config.development.yml
```

Run the same development and production validation used by CI:

```sh
script/validate-site
```

GitHub Pages exposes one active site per repository. During the development
launch, pushes to `develop` publish the development-configured artifact. A
later push to `main` replaces that active Pages artifact with the
production-configured build; it does not create a simultaneous second preview
URL.

## Security boundary

The repository contains no secrets. The static UI is not an authorization
boundary. Any future customer, billing, or infrastructure endpoint must enforce
administrator identity, MFA policy, role authorization, and audit logging on
the server before its frontend control is enabled.
