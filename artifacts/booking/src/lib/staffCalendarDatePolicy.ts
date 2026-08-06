import { formatStoreDate } from "@/lib/timezone";

/**
 * Staff calendar dates are salon-local wall-clock dates. `storeNow` is the
 * wall-clock Date returned by getNowInTimezone(), so comparisons must use UTC
 * fields or local-date strings rather than the browser's timezone.
 */
export function isStaffDateSelectable(date: Date, storeNow: Date): boolean {
  return formatStoreDate(date, "yyyy-MM-dd") >= formatStoreDate(storeNow, "yyyy-MM-dd");
}

export function isStaffSlotBookable(
  date: Date,
  hour: number,
  minute: number,
  storeNow: Date,
): boolean {
  if (!isStaffDateSelectable(date, storeNow)) return false;

  const dateKey = formatStoreDate(date, "yyyy-MM-dd");
  // Compare salon wall-clock values. storeNow is intentionally a wall-clock
  // Date, so this remains independent of the browser's timezone.
  const slotWallClock = Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    hour,
    minute,
  );
  const nowWallClock = Date.UTC(
    storeNow.getUTCFullYear(),
    storeNow.getUTCMonth(),
    storeNow.getUTCDate(),
    storeNow.getUTCHours(),
    storeNow.getUTCMinutes(),
    storeNow.getUTCSeconds(),
  );

  return slotWallClock > nowWallClock;
}
