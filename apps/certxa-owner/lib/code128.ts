/**
 * Code 128 (subset B) for the check-in slip on the BIXOLON SRP-275III dot-matrix printer, which has no QR or barcode
 * command (owner, 2026-10-24): the slip's code ("TN:271", "BK:417") is drawn as a barcode image instead of a QR.
 * Pure — returns the bars as module widths, so it can be tested and drawn at any size.
 */

// The 107 Code 128 symbols as bar/space widths (b s b s b s; the stop symbol has a 7th bar).
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const STOP = 106;

/** The symbol values for `text` in subset B (printable ASCII 32–126 only), with start, check digit and stop. */
export function code128Values(text: string): number[] {
  const values = [START_B];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error(`Code 128 B cannot encode "${ch}"`);
    values.push(c - 32);
  }
  let sum = START_B;
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, STOP);
  return values;
}

/** The barcode as a row of modules: true = bar, false = space (no quiet zones). */
export function code128Modules(text: string): boolean[] {
  const out: boolean[] = [];
  for (const v of code128Values(text)) {
    PATTERNS[v].split("").forEach((w, i) => { for (let k = 0; k < Number(w); k++) out.push(i % 2 === 0); });
  }
  return out;
}
