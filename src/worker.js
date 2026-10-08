// toolkit-sec.com: static site (public/) plus the contact form, as one Cloudflare Worker.
//
// - www.toolkit-sec.com and plain http redirect to https://toolkit-sec.com
// - GET  /api/config   tells the page whether to show the Turnstile spam check
// - POST /api/contact  checks the form and emails it to CONTACT_TO through Cloudflare Email Routing
// - everything else is a static file from public/
//
// Settings (Worker → Settings → Variables and Secrets), never in this repo:
//   CONTACT_TO            secret     where enquiries go; must be a verified Email Routing destination
//   CONTACT_FROM          variable   optional, default website@toolkit-sec.com (an address on the zone)
//   TURNSTILE_SITE_KEY    variable   optional; with TURNSTILE_SECRET, turns the spam check on
//   TURNSTILE_SECRET      secret     optional
// Bindings (wrangler.jsonc): SEND_EMAIL (send_email), CONTACT_LIMITER (rate limit), ASSETS.

import { EmailMessage } from "cloudflare:email";

const APEX = "toolkit-sec.com";
const LIMITS = { name: 100, email: 254, company: 100, role: 100, tools: 500, message: 3000 };
const MAX_BODY = 32 * 1024; // bytes; the largest legitimate form is well under this
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const HSTS = "max-age=31536000";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "strict-transport-security": HSTS,
    },
  });
}

function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function oneLine(value) {
  return value.replace(/[\r\n]+/g, " ");
}

// RFC 2047 encoded-word, so names in any language survive the Subject line.
function encodeHeader(text) {
  return /^[\x20-\x7E]*$/.test(text) ? text : `=?UTF-8?B?${b64(text)}?=`;
}

function b64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function verifyTurnstile(token, ip, secret) {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const data = await r.json().catch(() => ({}));
  return data.success === true;
}

async function handleContact(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: `Method ${request.method} not allowed` }, 405);
  if (!env.SEND_EMAIL || !env.CONTACT_TO) {
    return json({ ok: false, error: "The contact form is not configured yet." }, 503);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (env.CONTACT_LIMITER) {
    const { success } = await env.CONTACT_LIMITER.limit({ key: ip || "unknown" });
    if (!success) return json({ ok: false, error: "Too many messages. Please try again in a minute." }, 429);
  }

  // Refuse oversized bodies before parsing them (Content-Length first, then the real size).
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) {
    return json({ ok: false, error: "That message is too large." }, 413);
  }
  let form;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY) return json({ ok: false, error: "That message is too large." }, 413);
    form = await new Response(raw, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
  } catch {
    return json({ ok: false, error: "Send the form as form data." }, 400);
  }

  // Honeypot: a field people never see. Bots that fill it get a polite "ok" and nothing is sent.
  if (clean(form.get("website"), 200)) return json({ ok: true, message: "Thanks, we'll reply within two working days." });

  if (env.TURNSTILE_SECRET) {
    if (!(await verifyTurnstile(form.get("cf-turnstile-response") || "", ip, env.TURNSTILE_SECRET))) {
      return json({ ok: false, error: "The spam check didn't pass. Reload the page and try again." }, 400);
    }
  }

  const entry = {};
  for (const [field, max] of Object.entries(LIMITS)) entry[field] = clean(form.get(field), max);
  for (const field of ["name", "email", "company", "role"]) entry[field] = oneLine(entry[field]);
  if (!entry.name || !EMAIL_RE.test(entry.email) || !entry.message) {
    return json({ ok: false, error: "Please fill in your name, a valid email address and a message." }, 400);
  }
  if (form.get("consent") !== "on" && form.get("consent") !== "yes") {
    return json({ ok: false, error: "Please tick the box so we can use your details to reply." }, 400);
  }
  const received = new Date().toISOString();
  const country = request.cf?.country || "unknown";

  const from = env.CONTACT_FROM || `website@${APEX}`;
  const subject = oneLine(`IT Sentinel enquiry: ${entry.name}${entry.company ? " (" + entry.company + ")" : ""}`).slice(0, 200);
  const text = [
    `New enquiry from the IT Sentinel website (${received}, country: ${country})`,
    "",
    `Name:    ${entry.name}`,
    `Email:   ${entry.email}`,
    `Company: ${entry.company || "-"}`,
    `Role:    ${entry.role || "-"}`,
    "",
    "Tools they run:",
    entry.tools || "-",
    "",
    "Message:",
    entry.message,
    "",
    "Reply to this email to answer them.",
  ].join("\r\n");
  const raw = [
    `From: "IT Sentinel website" <${from}>`,
    `To: <${env.CONTACT_TO}>`,
    `Reply-To: <${oneLine(entry.email)}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${APEX}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");

  try {
    await env.SEND_EMAIL.send(new EmailMessage(from, env.CONTACT_TO, raw));
  } catch (e) {
    console.error("contact email failed:", e && e.message);
    return json({ ok: false, error: "We couldn't send your message just now. Please try again later." }, 502);
  }

  // A plain HTML form (no JavaScript) gets redirected to a thank-you anchor.
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) return Response.redirect(`https://${APEX}/#thanks`, 303);
  return json({ ok: true, message: "Thanks, we'll reply within two working days." });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // One canonical address: https, no www.
    if (url.hostname === `www.${APEX}` || (url.hostname === APEX && url.protocol === "http:")) {
      url.hostname = APEX;
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api/contact") return handleContact(request, env);
    if (url.pathname === "/api/config") {
      return json({ turnstileSiteKey: (env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY) || "" });
    }

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set("strict-transport-security", HSTS);
    return out;
  },
};
