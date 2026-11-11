export const TOM_ACCOUNT_SUPPORT_HANDOFF = "tom-account-support";
export const SHAVEZ_ACCOUNT_SUPPORT_GREETING = "Thanks for holding, this is Marel with Account Services."; // then Tom's note (lib/marelLastCall.ts)

export interface TransferTranscriptTurn {
  role: string;
  text: string;
}

const existingCustomer = /\b(?:customer|client|account holder|already|existing (?:account|customer|client)|current (?:customer|client)|(?:my|our)\s+(?:[\w'-]+\s+){0,3}account|account with (?:you|certxa)|signed up|registered|using certxa|use certxa|use your (?:system|software))\b/i;
const accountSupportIssue = /\b(?:account|billing|bill|invoice|charge|charged|payment|subscription|refund|payout|login|password|sign[ -]?in|locked out|renewal)\b/i;
const directAccountServicesRequest = /\b(?:speak|talk|connect|transfer|reach|get me|put me through)\b[\s\S]{0,100}\b(?:account services|account support|billing support|customer support)\b|\b(?:account services|account support)\b[\s\S]{0,80}\b(?:someone|person|representative|agent|team)\b/i;
const explicitTransferRefusal = /\b(?:don't transfer|do not transfer|don't connect me|do not connect me|please don't transfer|please do not transfer)\b/i;

export function isExistingCustomerAccountSupportRequest(turns: readonly TransferTranscriptTurn[]): boolean {
  const callerText = turns.filter((turn) => turn.role === "caller").map((turn) => turn.text).join(" ");
  return accountSupportIssue.test(callerText) && (existingCustomer.test(callerText) || directAccountServicesRequest.test(callerText));
}

export function mayTransferToAccountServices(turns: readonly TransferTranscriptTurn[]): boolean {
  const callerText = turns.filter((turn) => turn.role === "caller").map((turn) => turn.text).join(" ");
  return isExistingCustomerAccountSupportRequest(turns) && !explicitTransferRefusal.test(callerText);
}

export function shavezHandoffTwiML(webhookUrl: string, holdMusicUrl: string): string {
  const destination = `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}handoff=${TOM_ACCOUNT_SUPPORT_HANDOFF}`;
  const escaped = destination.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escapedMusic = holdMusicUrl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapedMusic}</Play><Redirect method="POST">${escaped}</Redirect></Response>`;
}
