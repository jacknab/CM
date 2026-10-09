/** Keep legacy Tap to Pay preferences from selecting a hidden payment route. */
export type NailCardMethod = "m2" | "frontdesk";

export function readNailCardMethod(value: string | null): NailCardMethod {
  return value === "frontdesk" ? "frontdesk" : "m2";
}

/** Front-desk checkout still owns tip confirmation; its native bridge charges the M2 reader. */
export function frontdeskReaderMethod(): "m2" {
  return "m2";
}
