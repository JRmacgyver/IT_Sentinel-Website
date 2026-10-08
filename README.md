# toolkit-sec.com

The public website for **IT Sentinel, built by Toolkit Security**. It's one Cloudflare Worker: the
static site in `public/`, plus a small script that emails the contact form to us. No build step and
no npm dependencies.

```
public/                 the site: index, privacy (/privacy), 404, CSS/JS, favicon, link preview,
                        infographics, _headers (security headers), robots.txt, sitemap.xml
src/worker.js           www/http → https://toolkit-sec.com, HSTS, /api/config, /api/contact
wrangler.jsonc          Worker config: static assets, custom domains, email + rate-limit bindings
```

## How the contact form works

The browser posts the form to `/api/contact`. The Worker checks it:
- size, length and field limits;
- a hidden honeypot field that bots fill in;
- 5 posts per minute per visitor;
- Cloudflare Turnstile, if it's turned on.

It then emails the enquiry through **Cloudflare Email Routing**, with Reply-To set to the visitor,
so you can answer straight from your mailbox. Nothing is stored on the website.

## One-time setup in Cloudflare

1. **Email Routing:** go to toolkit-sec.com → Email → Email Routing.
   - Enable it. This adds the MX and SPF records.
   - Under **Destination addresses**, add the mailbox that should receive enquiries, then click the
     link in the verification email. Workers can only send to verified destinations.
   - Optionally, add routing rules so `privacy@` and `hello@` forward to the same mailbox.
2. **Worker settings:** go to Workers & Pages → `it-sentinel-website` → Settings →
   Variables and Secrets.
   - `CONTACT_TO`: add it as a **Secret**, set to that same mailbox. It isn't in this repo on
     purpose: the repo is public.
   - `CONTACT_FROM` (optional variable): the sender address. The default is
     `website@toolkit-sec.com`; it must be on toolkit-sec.com.
3. **Turnstile (optional, recommended if spam appears):**
   - Create a widget for toolkit-sec.com.
   - Add `TURNSTILE_SITE_KEY` as a variable and `TURNSTILE_SECRET` as a secret.
   - The page shows the widget by itself once both are set. No code change is needed.
4. **Web Analytics (optional):** turn it on for the site. It's cookieless, and `_headers` already
   allows its script.

`wrangler.jsonc` attaches **toolkit-sec.com and www.toolkit-sec.com** as custom domains, so their
DNS records and certificates are created on deploy. The Worker redirects www and plain http to
`https://toolkit-sec.com` and sends HSTS.

The `name` in `wrangler.jsonc` must match the Worker's name in the dashboard.

## Content rule

Nothing on this site may identify a customer or a deployment: no company names, host names, user
names, IP addresses, real numbers from a site, or screenshots of live data. Every claim must be true
of the product today. **Never commit an email address, key or secret here; this repo is public.**

## Local preview

```bash
npx wrangler dev
```

Without Node: `python3 -m http.server 8080 --directory public` shows the pages; the form needs the
Worker.
