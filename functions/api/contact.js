// Cloudflare Pages Function: POST /api/contact (IT Sentinel website, toolkit-sec.com)
//
// No dependencies. Pages project settings (see README.md):
//   TURNSTILE_SECRET  secret    Turnstile widget secret key (required)
//   CONTACT_KV        KV binding  stores each enquiry for 90 days (required)
//   RESEND_API_KEY    secret    optional: email each enquiry via Resend
//   CONTACT_TO        variable  where the email goes
//   CONTACT_FROM      variable  e.g. "IT Sentinel website <hello@toolkit-sec.com>"
//
// The form posts as application/x-www-form-urlencoded or multipart (a plain HTML <form>), with
// fields: name, email, company, role, tools, message, consent, cf-turnstile-response.
// A JavaScript fetch() with the same fields also works; the response is JSON either way.

const LIMITS = { name: 100, email: 254, company: 100, role: 100, tools: 500, message: 3000 };
const MAX_BODY = 32 * 1024;   // bytes; the largest legitimate form is well under this
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
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

export async function onRequestPost({ request, env }) {
  if (!env.TURNSTILE_SECRET || !env.CONTACT_KV) {
    return json({ ok: false, error: "The contact form is not configured yet." }, 503);
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

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await verifyTurnstile(form.get("cf-turnstile-response") || "", ip, env.TURNSTILE_SECRET))) {
    return json({ ok: false, error: "The spam check didn't pass. Reload the page and try again." }, 400);
  }

  const entry = {};
  for (const [field, max] of Object.entries(LIMITS)) entry[field] = clean(form.get(field), max);
  if (!entry.name || !EMAIL_RE.test(entry.email) || !entry.message) {
    return json({ ok: false, error: "Please fill in your name, a valid email address and a message." }, 400);
  }
  if (form.get("consent") !== "on" && form.get("consent") !== "yes") {
    return json({ ok: false, error: "Please tick the box so we can use your details to reply." }, 400);
  }
  entry.received = new Date().toISOString();
  entry.country = request.cf?.country || "";

  // Store first, so nothing is lost if the email step fails.
  const key = `enquiry:${entry.received}:${crypto.randomUUID()}`;
  await env.CONTACT_KV.put(key, JSON.stringify(entry), { expirationTtl: 60 * 60 * 24 * 90 });

  if (env.RESEND_API_KEY && env.CONTACT_TO && env.CONTACT_FROM) {
    const text = [
      `New enquiry from the IT Sentinel website (${entry.received}, ${entry.country || "country unknown"})`,
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
    ].join("\n");
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env.CONTACT_FROM,
          to: [env.CONTACT_TO],
          reply_to: entry.email,
          subject: `IT Sentinel enquiry: ${entry.name}${entry.company ? " (" + entry.company + ")" : ""}`,
          text,
        }),
      });
    } catch {
      // Stored in KV already; the email is a convenience.
    }
  }

  // A plain HTML form (no JavaScript) gets redirected to a thank-you anchor.
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    return Response.redirect(new URL("/#thanks", request.url).toString(), 303);
  }
  return json({ ok: true, message: "Thanks, we'll reply within two working days." });
}

export async function onRequest({ request }) {
  // Anything other than POST
  return json({ ok: false, error: `Method ${request.method} not allowed` }, 405);
}
