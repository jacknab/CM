import { Link } from "react-router-dom";
import { ArrowLeft, Key, Zap, Webhook, MessageSquare, Phone, Mail, Star, Shield, Code2, BookOpen } from "lucide-react";

const Section = ({ id, icon: Icon, title, children }: { id: string; icon: any; title: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-20">
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-5 h-5 text-violet-600" />
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
    </div>
    {children}
  </section>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <pre className="bg-gray-950 text-green-300 rounded-xl p-4 text-xs overflow-x-auto font-mono leading-relaxed">
    {children}
  </pre>
);

const InlineCode = ({ children }: { children: React.ReactNode }) => (
  <code className="bg-gray-100 text-violet-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
);

const Table = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
  <div className="overflow-x-auto rounded-xl border border-gray-200">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>{headers.map(h => <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row, i) => (
          <tr key={i} className="hover:bg-gray-50">
            {row.map((cell, j) => <td key={j} className="px-4 py-3 text-gray-700 font-mono text-xs">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function EliteApiDocs() {
  const sections = [
    { id: "authentication", label: "Authentication" },
    { id: "rate-limits", label: "Rate Limits" },
    { id: "appointments", label: "Appointments API" },
    { id: "chatbot", label: "Chatbot API" },
    { id: "dialer", label: "Dialer API" },
    { id: "sms", label: "SMS / Twilio" },
    { id: "email", label: "Email / Mailgun" },
    { id: "google", label: "Google Reviews" },
    { id: "webhooks", label: "Webhooks" },
    { id: "errors", label: "Error Codes" },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link to="/api-keys" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-violet-600" />
              <h1 className="text-2xl font-bold text-gray-900">Elite API — Integration Guide</h1>
              <span className="text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Elite Plan</span>
            </div>
            <p className="text-gray-500 text-sm mt-1">REST API for appointments, messaging, reviews, webhooks, and more.</p>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Sidebar TOC */}
          <nav className="hidden lg:block w-52 shrink-0 sticky top-6 self-start">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contents</p>
            <ul className="space-y-1">
              {sections.map(s => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block text-sm text-gray-600 hover:text-violet-600 py-1 transition-colors">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-5 border-t border-gray-100">
              <Link to="/api-keys" className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium">
                <Key className="w-3.5 h-3.5" /> Manage API Keys
              </Link>
            </div>
          </nav>

          {/* Main content */}
          <div className="flex-1 space-y-12 min-w-0">

            {/* ── Authentication ── */}
            <Section id="authentication" icon={Key} title="Authentication">
              <p className="text-sm text-gray-600 mb-4">
                All API requests must include your API key in the <InlineCode>Authorization</InlineCode> header using the Bearer scheme. Generate keys from the <Link to="/api-keys" className="text-violet-600 hover:underline">API Keys</Link> page.
              </p>
              <Code>{`curl https://your-domain.com/api/v1/appointments \\
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxx"`}</Code>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <strong>Security note:</strong> Never expose API keys in client-side code or public repositories. Each key is scoped to a single store.
              </div>
            </Section>

            {/* ── Rate Limits ── */}
            <Section id="rate-limits" icon={Zap} title="Rate Limits">
              <p className="text-sm text-gray-600 mb-4">Elite plan keys receive elevated rate limits. All limits are per-key, per-minute.</p>
              <Table
                headers={["Plan", "Requests / min", "Burst", "Daily cap"]}
                rows={[
                  ["Professional", "60", "100", "10,000"],
                  ["Elite", "1,000", "2,000", "Unlimited"],
                ]}
              />
              <p className="text-sm text-gray-600 mt-4">When you exceed the rate limit the API returns <InlineCode>429 Too Many Requests</InlineCode>. Inspect the response headers:</p>
              <Code>{`X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 743
X-RateLimit-Reset: 1714752060`}</Code>
            </Section>

            {/* ── Appointments ── */}
            <Section id="appointments" icon={Code2} title="Appointments API">
              <p className="text-sm text-gray-600 mb-4">Read your store's appointment data in real time.</p>
              <Table
                headers={["Method", "Endpoint", "Description"]}
                rows={[
                  ["GET", "/api/v1/appointments", "List appointments (paginated)"],
                  ["GET", "/api/v1/appointments/:id", "Get a single appointment"],
                ]}
              />
              <p className="text-sm font-semibold text-gray-700 mt-5 mb-2">Query parameters</p>
              <Table
                headers={["Parameter", "Type", "Description"]}
                rows={[
                  ["limit", "integer", "Max records to return (default 50, max 200)"],
                  ["status", "string", "Filter by status: pending · confirmed · completed · cancelled"],
                  ["date_from", "ISO 8601", "Return appointments on or after this date"],
                  ["date_to", "ISO 8601", "Return appointments on or before this date"],
                ]}
              />
              <p className="text-sm font-semibold text-gray-700 mt-5 mb-2">Example response</p>
              <Code>{`{
  "data": [
    {
      "id": 1042,
      "date": "2026-05-10T14:00:00.000Z",
      "status": "confirmed",
      "serviceId": 3,
      "staffId": 7,
      "customerId": 88,
      "totalPaid": "65.00",
      "notes": ""
    }
  ],
  "count": 1
}`}</Code>
            </Section>

            {/* ── Chatbot ── */}
            <Section id="chatbot" icon={MessageSquare} title="Chatbot API">
              <p className="text-sm text-gray-600 mb-4">
                Send messages to the AI booking assistant on behalf of a customer session. Useful for embedding the chatbot in your own website or mobile app.
              </p>
              <Table
                headers={["Method", "Endpoint", "Description"]}
                rows={[
                  ["POST", "/api/v1/chatbot/message", "Send a chat message and receive a reply"],
                  ["DELETE", "/api/v1/chatbot/session/:id", "Clear a conversation session"],
                ]}
              />
              <p className="text-sm font-semibold text-gray-700 mt-5 mb-2">Request body</p>
              <Code>{`{
  "sessionId": "user-abc-123",
  "message": "I'd like to book a haircut for Saturday morning"
}`}</Code>
              <p className="text-sm font-semibold text-gray-700 mt-4 mb-2">Response</p>
              <Code>{`{
  "reply": "I found 3 openings on Saturday. Would 9 AM, 10 AM, or 11 AM work for you?",
  "sessionId": "user-abc-123",
  "actions": []
}`}</Code>
            </Section>

            {/* ── Dialer ── */}
            <Section id="dialer" icon={Phone} title="Outbound Dialer API">
              <p className="text-sm text-gray-600 mb-4">
                Trigger automated outbound calls or listen to call events via webhook. Requires Twilio credentials configured in your store settings.
              </p>
              <Table
                headers={["Method", "Endpoint", "Description"]}
                rows={[
                  ["POST", "/api/v1/dialer/call", "Initiate an outbound call"],
                  ["GET", "/api/v1/dialer/calls", "List recent call logs"],
                ]}
              />
              <p className="text-sm font-semibold text-gray-700 mt-5 mb-2">Initiate a call</p>
              <Code>{`curl -X POST https://your-domain.com/api/v1/dialer/call \\
  -H "Authorization: Bearer sk_live_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+12125551234",
    "message": "Hi, this is a reminder about your appointment tomorrow at 2 PM."
  }'`}</Code>
            </Section>

            {/* ── SMS ── */}
            <Section id="sms" icon={MessageSquare} title="SMS / Twilio">
              <p className="text-sm text-gray-600 mb-4">
                Send SMS messages directly via your store's Twilio number. Elite plan includes 50,000 SMS credits per month.
              </p>
              <Table
                headers={["Method", "Endpoint", "Description"]}
                rows={[
                  ["POST", "/api/v1/sms/send", "Send an SMS to one recipient"],
                  ["GET", "/api/v1/sms/logs", "Retrieve sent message logs"],
                ]}
              />
              <Code>{`curl -X POST https://your-domain.com/api/v1/sms/send \\
  -H "Authorization: Bearer sk_live_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+12125551234",
    "body": "Your appointment is confirmed for tomorrow at 2 PM."
  }'`}</Code>
            </Section>

            {/* ── Email ── */}
            <Section id="email" icon={Mail} title="Email / Mailgun">
              <p className="text-sm text-gray-600 mb-4">
                Send transactional or marketing emails via your store's Mailgun domain.
              </p>
              <Table
                headers={["Method", "Endpoint", "Description"]}
                rows={[
                  ["POST", "/api/v1/email/send", "Send an email"],
                  ["GET", "/api/v1/email/logs", "Retrieve sent email logs"],
                ]}
              />
              <Code>{`{
  "to": "client@example.com",
  "subject": "Your booking confirmation",
  "html": "<h1>You're confirmed!</h1><p>See you tomorrow at 2 PM.</p>"
}`}</Code>
            </Section>

            {/* ── Google Reviews ── */}
            <Section id="google" icon={Star} title="Google Business Reviews">
              <p className="text-sm text-gray-600 mb-4">
                Fetch and respond to Google Business Profile reviews programmatically. Requires Google OAuth connected in your store settings.
              </p>
              <Table
                headers={["Method", "Endpoint", "Description"]}
                rows={[
                  ["GET", "/api/v1/reviews/google", "List Google reviews (paginated)"],
                  ["POST", "/api/v1/reviews/google/:reviewId/reply", "Post a reply to a review"],
                  ["DELETE", "/api/v1/reviews/google/:reviewId/reply", "Delete your reply"],
                ]}
              />
            </Section>

            {/* ── Webhooks ── */}
            <Section id="webhooks" icon={Webhook} title="Webhooks">
              <p className="text-sm text-gray-600 mb-4">
                Subscribe to real-time events. Certxa will POST a JSON payload to your endpoint within seconds of each event.
              </p>
              <p className="text-sm font-semibold text-gray-700 mb-2">Supported events</p>
              <Table
                headers={["Event", "Trigger"]}
                rows={[
                  ["appointment.created", "A new appointment is booked"],
                  ["appointment.updated", "An appointment is rescheduled or status changes"],
                  ["appointment.cancelled", "An appointment is cancelled"],
                  ["review.received", "A new Google/Facebook review arrives"],
                  ["sms.delivered", "An SMS is delivered to the recipient"],
                  ["sms.failed", "An SMS delivery fails"],
                ]}
              />
              <p className="text-sm font-semibold text-gray-700 mt-5 mb-2">Payload structure</p>
              <Code>{`{
  "event": "appointment.created",
  "timestamp": "2026-05-10T14:00:00.000Z",
  "storeId": 42,
  "data": {
    "id": 1042,
    "date": "2026-05-10T14:00:00.000Z",
    "status": "confirmed",
    "customerId": 88
  }
}`}</Code>
              <p className="text-sm font-semibold text-gray-700 mt-5 mb-2">Verifying signatures</p>
              <p className="text-sm text-gray-600 mb-3">Each request includes an <InlineCode>X-Certxa-Signature</InlineCode> header — an HMAC-SHA256 of the raw body signed with your webhook secret.</p>
              <Code>{`const crypto = require("crypto");

function verify(rawBody, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}`}</Code>
            </Section>

            {/* ── Error Codes ── */}
            <Section id="errors" icon={Shield} title="Error Codes">
              <Table
                headers={["HTTP Status", "Code", "Meaning"]}
                rows={[
                  ["400", "invalid_request", "Missing or malformed parameters"],
                  ["401", "unauthorized", "API key missing or invalid"],
                  ["403", "forbidden", "Key lacks the required scope"],
                  ["404", "not_found", "Resource does not exist"],
                  ["429", "rate_limit_exceeded", "Too many requests — back off and retry"],
                  ["500", "internal_error", "Unexpected server error"],
                ]}
              />
              <p className="text-sm text-gray-600 mt-4">All error responses follow this structure:</p>
              <Code>{`{
  "error": "rate_limit_exceeded",
  "message": "You have exceeded 1000 requests per minute.",
  "retryAfter": 47
}`}</Code>
            </Section>

            {/* Footer */}
            <div className="pt-6 border-t border-gray-100 flex items-center justify-between text-sm text-gray-400">
              <span>Elite API · Certxa</span>
              <Link to="/api-keys" className="flex items-center gap-1.5 text-violet-600 hover:text-violet-800 font-medium">
                <Key className="w-3.5 h-3.5" /> Manage API Keys
              </Link>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
