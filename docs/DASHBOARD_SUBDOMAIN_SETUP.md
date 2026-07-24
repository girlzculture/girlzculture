# Dashboard subdomain setup

This repository prepares, but does not make, DNS or production configuration changes.
Keep `DASHBOARD_SUBDOMAINS_ENABLED=false` until every step below is complete.

## Netlify

1. Open the Girlz Culture site in Netlify.
2. Open **Site configuration → Domain management → Production domains**.
3. Choose **Add a domain alias** and add `dashboard.girlzculture.com`.
4. Add a second alias: `mothership.girlzculture.com`.
5. Copy the site's exact default Netlify hostname, shown in the same panel as
   `<your-site>.netlify.app`. Do not guess this value.
6. Leave the primary production domain as `girlzculture.com`.

## GoDaddy DNS

In the DNS zone for `girlzculture.com`, add these records, replacing
`<your-site>.netlify.app` with the exact hostname copied from Netlify:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `dashboard` | `<your-site>.netlify.app` | 1 hour |
| CNAME | `mothership` | `<your-site>.netlify.app` | 1 hour |

Do not add an A record for either subdomain, do not change the apex records, and
do not proxy these names through another provider during certificate issuance.

## TLS and environment

1. Return to Netlify Domain management and wait until both aliases show
   **Netlify DNS verified** or **External DNS verified**.
2. Open **HTTPS** and choose **Verify DNS configuration**, then
   **Provision certificate** if Netlify has not done so automatically.
3. Verify an HTTPS request to each alias has a valid certificate before enabling
   routing.
4. Add these production environment variables in Netlify:

```text
NEXT_PUBLIC_SITE_HOST=girlzculture.com
NEXT_PUBLIC_SALON_DASHBOARD_HOST=dashboard.girlzculture.com
NEXT_PUBLIC_ADMIN_HOST=mothership.girlzculture.com
NEXT_PUBLIC_ADMIN_IDLE_TIMEOUT_MINUTES=30
NEXT_PUBLIC_ADMIN_ABSOLUTE_SESSION_HOURS=8
DASHBOARD_SUBDOMAINS_ENABLED=true
```

5. Trigger a founder-approved deploy only after preview and DNS verification.

## Expected routes

- `https://dashboard.girlzculture.com/salon` is the salon dashboard.
- `https://dashboard.girlzculture.com/login` is salon sign-in.
- `https://mothership.girlzculture.com/superadmin` is platform administration.
- Existing `/salon/dashboard/*`, `/salon/login`, and `/admin/*` URLs permanently
  redirect only after the enable flag is true.

The subdomains are routing boundaries, not authorization boundaries. Every
protected request still requires its role-specific token, server-side role
resolution, RLS/RBAC, and—on the admin surface—a verified company-domain
identity and MFA. Admin pages are always sent with `noindex`.
