/**
 * Sends email through Resend (resend.com, free plan: 3,000 emails a month).
 * Needs RESEND_API_KEY. REPORT_FROM is the sender, e.g. "Rider Trace <reports@yourdomain.com>"
 * once your domain is verified in Resend; until then Resend's test sender only delivers to the
 * email address you signed up to Resend with.
 */
export const mailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendMail(input: { to: string[]; subject: string; html: string; text: string; attachments?: { filename: string; content: string }[] }): Promise<{ ok: boolean; message: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, message: "Email is not set up yet: add RESEND_API_KEY in Vercel and redeploy." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.REPORT_FROM || "Rider Trace <onboarding@resend.dev>",
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "utf8").toString("base64") })),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
  if (!res.ok) return { ok: false, message: `Email service said: ${body.message ?? res.statusText}` };
  return { ok: true, message: `Sent to ${input.to.join(", ")}.` };
}
