/**
 * Call recordings are kept on this server, not at Twilio (owner, 2026-11-11). Each finished recording is downloaded
 * to CALL_RECORDINGS_DIR as <RecordingSid>.mp3 (plus <RecordingSid>.json with the call it belongs to), checked, and
 * only then deleted at Twilio. A sweep every 30 minutes takes every recording on the account, so one missed webhook
 * or a server that was down loses nothing; Autumn's recording webhook archives a call as soon as it finishes.
 * Playback (GET /api/ai-receptionist/recording/:callLogId) reads the local file first — localRecordingPath().
 */
import fs from "node:fs";
import path from "node:path";
import twilio from "twilio";

const DIR = process.env.CALL_RECORDINGS_DIR || "/var/lib/certxa/call-recordings";
const SWEEP_EVERY_MS = 30 * 60 * 1000;
const SID = /^RE[0-9a-f]{32}$/i;

type TwilioRecording = { sid: string; callSid: string; status: string; duration: string; channels: number; source: string; dateCreated: Date; uri: string };

function credentials() {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  return sid && token ? { sid, token } : null;
}

/** The saved file for a recording, or null when it isn't on this server. */
export function localRecordingPath(recordingSid: string): string | null {
  if (!SID.test(recordingSid)) return null;
  const file = path.join(DIR, `${recordingSid}.mp3`);
  return fs.existsSync(file) ? file : null;
}

/** An MP3 starts with an ID3 tag or an MPEG frame sync; anything else (an error page, an empty body) is not kept. */
function looksLikeMp3(buf: Buffer): boolean {
  return buf.length > 128 && ((buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
}

/** Download one recording to disk (unless it is already there), then delete it at Twilio. Never deletes without a good file. */
async function archiveOne(client: ReturnType<typeof twilio>, creds: { sid: string; token: string }, rec: TwilioRecording): Promise<"saved" | "skipped"> {
  if (!SID.test(rec.sid) || rec.status !== "completed") return "skipped";
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const file = path.join(DIR, `${rec.sid}.mp3`);
  if (!fs.existsSync(file)) {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Recordings/${rec.sid}.mp3`, {
      headers: { Authorization: `Basic ${Buffer.from(`${creds.sid}:${creds.token}`).toString("base64")}` },
    });
    if (!r.ok) throw new Error(`download ${rec.sid} failed: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const expected = Number(r.headers.get("content-length") ?? 0);
    if (!looksLikeMp3(buf) || (expected > 0 && expected !== buf.length)) throw new Error(`download ${rec.sid} incomplete (${buf.length} bytes)`);
    const tmp = `${file}.part-${process.pid}`;
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  fs.writeFileSync(path.join(DIR, `${rec.sid}.json`), JSON.stringify({
    recordingSid: rec.sid, callSid: rec.callSid, dateCreated: rec.dateCreated, durationSeconds: Number(rec.duration) || 0,
    channels: rec.channels, source: rec.source, bytes: fs.statSync(file).size, savedAt: new Date(),
  }, null, 2), { mode: 0o600 });
  // Read back what is on disk before Twilio's copy goes.
  if (!looksLikeMp3(fs.readFileSync(file))) throw new Error(`saved file for ${rec.sid} is not a recording; Twilio copy kept`);
  try {
    await client.recordings(rec.sid).remove();
  } catch (e: any) {
    if (e?.status !== 404) throw e; // already deleted (the sweep and the webhook can meet)
  }
  return "saved";
}

/** Autumn's recording webhook: archive this one now (the sweep catches it later if this fails). */
export async function archiveRecordingNow(recordingSid: string): Promise<void> {
  const creds = credentials();
  if (!creds || !SID.test(recordingSid)) return;
  try {
    const client = twilio(creds.sid, creds.token);
    const rec = (await client.recordings(recordingSid).fetch()) as unknown as TwilioRecording;
    await archiveOne(client, creds, rec);
    console.log(`[call-recordings] saved ${recordingSid} and deleted it at Twilio`);
  } catch (e: any) {
    console.error(`[call-recordings] ${recordingSid} not archived yet (the next sweep tries again):`, e?.message ?? e);
  }
}

let sweeping = false;
/** Every recording on the Twilio account: download, check, delete. */
export async function sweepCallRecordings(): Promise<{ saved: number; failed: number }> {
  const creds = credentials();
  if (!creds || sweeping) return { saved: 0, failed: 0 };
  sweeping = true;
  let saved = 0, failed = 0;
  try {
    const client = twilio(creds.sid, creds.token);
    const all = (await client.recordings.list({ pageSize: 1000 })) as unknown as TwilioRecording[];
    for (const rec of all) {
      try {
        if ((await archiveOne(client, creds, rec)) === "saved") saved++;
      } catch (e: any) {
        failed++;
        console.error(`[call-recordings] ${rec.sid}:`, e?.message ?? e);
      }
    }
    if (saved || failed) console.log(`[call-recordings] sweep: ${saved} saved to ${DIR} and deleted at Twilio, ${failed} kept at Twilio for the next try`);
  } catch (e: any) {
    console.error("[call-recordings] sweep failed:", e?.message ?? e);
  } finally {
    sweeping = false;
  }
  return { saved, failed };
}

export function startCallRecordingArchive(): void {
  setTimeout(() => { void sweepCallRecordings(); }, 2 * 60 * 1000);
  setInterval(() => { void sweepCallRecordings(); }, SWEEP_EVERY_MS);
}
