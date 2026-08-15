import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Booking = {
  reference: string;
  safari: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  accommodation: string;
  budget: string;
  requests: string;
  name: string;
  email: string;
  phone: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character] ?? character);
}

async function sendEmail(to: string[], subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("BOOKING_FROM_EMAIL");
  if (!apiKey || !from) throw new Error("Email secrets are not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const booking = await request.json() as Booking;
    if (!booking.reference || !booking.email || !booking.name) throw new Error("Invalid booking payload");
    const teamEmail = Deno.env.get("BOOKING_TEAM_EMAIL");
    const rootEmail = Deno.env.get("BOOKING_ROOT_EMAIL");
    if (!teamEmail && !rootEmail) throw new Error("No notification recipients configured");

    const safeInput = (value: string, max: number) => escapeHtml(value).slice(0, max);
    const safe = Object.fromEntries(Object.entries(booking).map(([key, value]) => [key, safeInput(String(value), key === "requests" ? 4000 : 300)])) as Record<string, string>;
    const sharedHtml = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#20251e">
        <p style="letter-spacing:3px;font-size:11px">OLKINYEI EXPEDITIONS</p>
        <h1 style="font-family:Georgia,serif;font-size:42px;font-weight:normal">Your journey has begun.</h1>
        <p>Reference <strong>${safe.reference}</strong></p>
        <hr style="border:0;border-top:1px solid #d8ccb8">
        <p><strong>Journey:</strong> ${safe.safari}</p>
        <p><strong>Dates:</strong> ${safe.startDate} to ${safe.endDate}</p>
        <p><strong>Party:</strong> ${safe.adults} adults, ${safe.children} children</p>
        <p><strong>Accommodation:</strong> ${safe.accommodation}</p>
        <p><strong>Budget:</strong> ${safe.budget}</p>
        <p>One of our East Africa journey designers will respond within one business day.</p>
      </div>`;

    // Deliver to: the customer, the reservation manager, and (optionally) the
    // Root Super Admin. Each send is isolated — one failure never blocks
    // another, and the booking itself was already saved before this fn ran.
    const teamHtml = `${sharedHtml}<p>Guest: ${safe.name} / ${safe.phone}</p><p>Requests: ${safe.requests}</p>`;
    const sends: Promise<unknown>[] = [
      sendEmail([booking.email], `Your Olkinyei safari request ${booking.reference}`, sharedHtml)
        .then(() => console.log(`booking email delivered to customer ${booking.reference}`)),
      ...(teamEmail
        ? [sendEmail([teamEmail], `New safari request: ${booking.reference}`, teamHtml)
          .then(() => console.log(`booking email delivered to team ${booking.reference}`))]
        : []),
      ...(rootEmail
        ? [sendEmail([rootEmail], `New booking received: ${booking.reference}`, teamHtml)
          .then(() => console.log(`booking email delivered to root ${booking.reference}`))]
        : []),
    ];

    const results = await Promise.allSettled(sends);
    const failures = results.filter((r) => r.status === "rejected");
    failures.forEach((failure) => console.error(`booking email failure ${booking.reference}:`, (failure as PromiseRejectedResult).reason));

    // Always succeed overall if at least the customer copy attempted —
    // callers already stored the booking; partial delivery is logged.
    return new Response(JSON.stringify({
      delivered: results.some((r) => r.status === "fulfilled"),
      failures: failures.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    console.error("send-booking-confirmation failed:", message);
    return new Response(JSON.stringify({ error: "Email delivery failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});