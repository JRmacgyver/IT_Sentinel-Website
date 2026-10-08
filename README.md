# toolkit-sec.com

The public website for **IT Sentinel, built by Toolkit Security**: a static page plus one Cloudflare
Pages Function for the contact form. No build step, no dependencies.

```
index.html              the page
privacy.html            privacy notice (served at /privacy)
404.html                not-found page
assets/css/site.css     all styles; the theme is the :root block at the top
assets/js/site.js       contact form over fetch(), footer year, email link
assets/favicon.svg
assets/og-image.png     link preview image (1200×630)
infographics/*.svg      the five diagrams
functions/api/contact.js  POST /api/contact (Turnstile, KV storage, optional email via Resend)
_headers                security headers (CSP etc.) and caching
robots.txt, sitemap.xml
```

## Cloudflare Pages settings

- **Framework preset:** None. **Build command:** empty. **Build output directory:** `/`.
- **Custom domain:** `toolkit-sec.com`, plus `www.toolkit-sec.com` redirected to the apex. Turn on
  Always Use HTTPS and HSTS.
- **Web Analytics:** turn it on for the project. It's cookieless, and `_headers` already allows its script.
- **Turnstile:** create a widget for `toolkit-sec.com`, then put its **site key** in `index.html`,
  replacing `REPLACE_WITH_TURNSTILE_SITE_KEY`. The site key is public; the **secret** goes in the
  settings below.
- **Rate limit:** add a WAF rate-limiting rule on `/api/contact` (for example 5 requests per minute
  per IP).

Variables and bindings (Settings → Variables and Secrets / Bindings):

| Name | Type | Value |
|---|---|---|
| `TURNSTILE_SECRET` | secret | the Turnstile widget's secret key |
| `CONTACT_KV` | KV binding | a namespace, e.g. `contact-enquiries` |
| `RESEND_API_KEY` | secret, optional | for the email notification |
| `CONTACT_TO` | variable | where enquiries go |
| `CONTACT_FROM` | variable | e.g. `IT Sentinel website <hello@toolkit-sec.com>` (domain verified in Resend) |

Never commit a secret to this repository; it is public.

## Content rule

Nothing on this site may identify a customer or a deployment: no company names, host names, user
names, IP addresses, real numbers from a site, or screenshots of live data. Every claim must be true
of the product today.

## Local preview

```bash
python3 -m http.server 8080
```

The form needs the Pages Function, so it only works on Cloudflare: use a preview deployment, or
`npx wrangler pages dev .`.
