/**
 * The Solo plans: the free Solo plan and its paid Plus upgrade (code "solo_plus"; Certxa Pro Plus). Both are an
 * independent professional — the Solo-only features (Work Places, built-in reviews, the pro's craft on their page)
 * belong to both. Buying Plus replaces the account's plan, so a check for exactly "solo" took those away from anyone
 * who upgraded (found 2026-11-02).
 */
export function isSoloPlanCode(code: string | null | undefined): boolean {
  return code === "solo" || code === "solo_plus";
}
