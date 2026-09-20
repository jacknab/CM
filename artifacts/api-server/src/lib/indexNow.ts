/**
 * IndexNow — pings Bing/Yandex/Seznam (and any other participating search
 * engine) the moment a URL is created or changed, instead of waiting for
 * their crawlers to rediscover it on their own schedule. Most valuable here
 * for the ~50k-page salon directory, where a freshly-claimed listing or a
 * newly published blog post can otherwise sit unindexed for a long time.
 *
 * Key file lives at artifacts/booking/public/<key>.txt, served statically at
 * https://certxa.com/<key>.txt — IndexNow requires the key be reachable at
 * that exact path before it will accept a submission using it.
 */

import { logger } from "./logger";

const INDEXNOW_KEY = "7b38e41964b7464d87071d9c66f87649";
const INDEXNOW_HOST = "certxa.com";
const KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;

/**
 * Submit one or more absolute URLs to IndexNow. Fire-and-forget: failures
 * are logged, never thrown — indexing is a nice-to-have, not something that
 * should ever block or fail the request that triggered it.
 */
export async function pingIndexNow(urls: string | string[]): Promise<void> {
  const urlList = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (!urlList.length) return;

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key: INDEXNOW_KEY,
        keyLocation: KEY_LOCATION,
        urlList,
      }),
    });
    if (!res.ok && res.status !== 202) {
      logger.warn({ status: res.status, count: urlList.length }, "[indexNow] submission rejected");
    }
  } catch (err) {
    logger.warn({ err, count: urlList.length }, "[indexNow] submission failed");
  }
}
