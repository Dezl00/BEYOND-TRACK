// Server-only credentials. This module must never be imported by client components.
export function whatsappConfigured() {
  return !!process.env.WHATSAPP_API_KEY?.trim();
}

export async function sendWhatsApp(
  to: string,
  text: string,
  idempotencyKey: string,
) {
  if (!whatsappConfigured()) throw new Error("WhatsApp not configured");
  if (!/^\+(?:201[0125]\d{8}|9665\d{8})$/.test(to))
    throw new Error("Invalid WhatsApp recipient");
  const response = await fetch("https://beyoondgroup.com/api/v1/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_API_KEY!.trim()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ to, text }),
    signal: AbortSignal.timeout(8000),
    redirect: "error",
    cache: "no-store",
  });
  // Never include the gateway body or credentials in an error or an application log.
  if (!response.ok)
    throw new Error(`WhatsApp delivery failed (${response.status})`);
  let message: { id?: unknown; state?: unknown };
  try {
    message = await response.json();
  } catch {
    throw new Error("Invalid WhatsApp gateway response");
  }
  if (
    typeof message?.id !== "string" ||
    !message.id ||
    !["queued", "sending", "sent", "delivered"].includes(String(message.state))
  )
    throw new Error("WhatsApp message was not accepted");
  return { id: message.id, state: String(message.state) };
}
