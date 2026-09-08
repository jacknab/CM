/**
 * The "I have read and agree to the cancellation policy" box shown on the
 * confirm step of the public booking themes when the salon has turned on
 * "Require policy acknowledgement". The server (POST /api/public/store/:slug/book)
 * also enforces this — the checkbox is the friendly front door.
 */
export function CancellationPolicyConsent({
  text,
  accepted,
  onChange,
}: {
  text: string;
  accepted: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-600 whitespace-pre-wrap mb-3">{text}</p>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer shrink-0"
        />
        <span className="text-sm font-medium text-gray-800 leading-snug">
          I have read and agree to the cancellation policy
        </span>
      </label>
    </div>
  );
}
