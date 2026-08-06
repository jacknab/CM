here is the entire find/replace patch in one clean document format so you can copy it straight into Notepad/VSCode.

You only need to replace TWO sections in your file.

PATCH 1 — Replace the OpenAI message parser header
FIND THIS
openAiWs.on("message", (rawData: Buffer | string) => {
  let msg: Record<string, unknown>;
  try { msg = JSON.parse(rawData.toString()); } catch { return; }

  const type = msg.type as string;
REPLACE WITH THIS
openAiWs.on("message", (rawData: Buffer | string) => {
  // ────────────────────────────────────────────────────────────
  // RAW OPENAI DEBUGGING
  // ────────────────────────────────────────────────────────────
  console.log(
    `[OpenAI RAW] ${rawData.toString().slice(0, 1500)}`
  );

  let msg: Record<string, unknown>;

  try {
    msg = JSON.parse(rawData.toString());
  } catch (err) {
    console.error(
      "[AI Receptionist] Failed to parse OpenAI message:",
      err
    );
    return;
  }

  const type = msg.type as string;

  console.log(
    `[AI Receptionist] OpenAI event.type = ${type}`
  );
PATCH 2 — Replace the ENTIRE audio forwarding block
FIND THIS ENTIRE BLOCK
if (type === "response.audio.delta") {
  aiSpeaking = true;
  const delta = msg.delta as string | undefined;
  if (delta) {
    outboundAudioCount++;
    const payloadBytes = Buffer.byteLength(delta, "base64");
    if (outboundAudioCount === 1 || outboundAudioCount % 50 === 0) {
      console.log(
        `[AI Receptionist] Sending outbound audio packet #${outboundAudioCount} to Twilio` +
        ` | format=g711_ulaw (no transcoding) | payload=${payloadBytes} bytes` +
        ` | streamSid=${streamSid ?? "none"} | twilioWs=${twilioWs.readyState === WebSocket.OPEN ? "OPEN" : "CLOSED"}`
      );
    }
    if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
      const packet = JSON.stringify({ event: "media", streamSid, media: { payload: delta } });
      try {
        twilioWs.send(packet);
      } catch (sendErr) {
        console.error(`[AI Receptionist] ⚠️  WebSocket send failed on packet #${outboundAudioCount}:`, sendErr);
      }
    } else {
      console.warn(
        `[AI Receptionist] ⚠️  Audio delta DROPPED — packet #${outboundAudioCount}` +
        ` streamSid=${streamSid ?? "none"} twilioWs=${twilioWs.readyState}`
      );
    }
  }
  return;
}
REPLACE WITH THIS
// ─────────────────────────────────────────────────────────────
// OpenAI → Twilio realtime audio bridge (FIXED)
// Supports BOTH OpenAI Realtime audio event formats
// ─────────────────────────────────────────────────────────────
if (
  type === "response.audio.delta" ||
  type === "response.output_audio.delta"
) {
  aiSpeaking = true;

  console.log(
    `[AI Receptionist] 🔊 Audio delta received | type=${type}`
  );

  // Different OpenAI runtime versions may send
  // either `delta` or `audio`
  const delta =
    (msg.delta as string | undefined) ??
    (msg.audio as string | undefined);

  if (!delta) {
    console.warn(
      `[AI Receptionist] ⚠️ Audio delta had NO payload`
    );
    return;
  }

  outboundAudioCount++;

  const payloadBytes = Buffer.byteLength(
    delta,
    "base64"
  );

  console.log(
    `[AI Receptionist] ▶ Twilio send() #${outboundAudioCount}` +
      ` | payloadBytes=${payloadBytes}` +
      ` | streamSid=${streamSid ?? "NULL"}` +
      ` | twilioState=${twilioWs.readyState}`
  );

  // Ensure streamSid exists
  if (!streamSid) {
    console.error(
      `[AI Receptionist] ❌ streamSid NULL — dropping audio`
    );
    return;
  }

  // Ensure Twilio socket is open
  if (twilioWs.readyState !== WebSocket.OPEN) {
    console.error(
      `[AI Receptionist] ❌ Twilio WS not open — state=${twilioWs.readyState}`
    );
    return;
  }

  // EXACT Twilio media packet format
  const packet = {
    event: "media",
    streamSid,
    media: {
      payload: delta,
    },
  };

  try {
    twilioWs.send(
      JSON.stringify(packet)
    );

    console.log(
      `[AI Receptionist] ✅ Twilio media packet sent`
    );
  } catch (sendErr) {
    console.error(
      `[AI Receptionist] ❌ Twilio send failed:`,
      sendErr
    );
  }

  return;
}
WHAT THIS FIXES

Your original file only listened for:

response.audio.delta

But OpenAI Realtime frequently sends:

response.output_audio.delta

So the audio event was arriving but your handler never fired, meaning:

OpenAI generated audio ✔
Audio event received ✔
Twilio send() never happened ❌
Caller hears silence ❌

This patch fixes that without changing anything else in your production system.