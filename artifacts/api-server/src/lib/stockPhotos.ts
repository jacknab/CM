/**
 * Nail photos for websites without their own (owner, 2026-11-07): every Bloom and Lacquer site used to show the same
 * stock photo. Each salon now gets one of these, picked by its store number, so the same salon always shows the same
 * one and neighbouring salons differ. All from one Pexels nail-salon series (free to use), checked by eye.
 */
export const NAIL_PHOTO_IDS = [
  3997373, 3997374, 3997375, 3997377, 3997378, 3997379, 3997380, 3997381, 3997382, 3997383,
  3997384, 3997385, 3997386, 3997387, 3997388, 3997389, 3997390, 3997391, 3997392, 3997397,
] as const;

export const nailPhotoUrl = (id: number, width = 1600) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;

/** This salon's photo: a spread-out pick from the list by store number. */
export function salonStockPhoto(storeId: number, width = 1600): string {
  const n = Math.abs(Math.trunc(Number(storeId) || 0));
  const index = (Math.imul(n ^ 0x5bd1e995, 2654435761) >>> 0) % NAIL_PHOTO_IDS.length;
  return nailPhotoUrl(NAIL_PHOTO_IDS[index], width);
}
