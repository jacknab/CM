/** A register's notifications WebSocket accepts unauthenticated senders. Never
 * turn a customer-screen result into a POS tender until Stripe confirms capture. */
export async function verifyCardCharge(paymentIntentId: unknown, appointmentId: number, amount: unknown): Promise<number> {
  if (typeof paymentIntentId !== "string" || !/^pi_[a-zA-Z0-9]+$/.test(paymentIntentId) || !Number.isSafeInteger(appointmentId) || appointmentId <= 0) {
    throw new Error("Card payment result is missing its transaction ID");
  }
  const r = await fetch(`/api/payments/terminal/verify-payment-intent?paymentIntentId=${encodeURIComponent(paymentIntentId)}&appointmentId=${appointmentId}`, { credentials: "include" });
  if (!r.ok) throw new Error("Card payment could not be verified. Check Stripe before retrying.");
  const confirmed = await r.json();
  const cents = Number(confirmed.amountCents);
  if (!Number.isSafeInteger(cents) || cents < 50 || Math.round(Number(amount) * 100) !== cents || confirmed.paymentIntentId !== paymentIntentId) {
    throw new Error("Card payment amount does not match the captured charge. Check Stripe before retrying.");
  }
  return cents / 100;
}
