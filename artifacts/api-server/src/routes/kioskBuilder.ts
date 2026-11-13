/**
 * Kiosk Builder API (plans/kiosk-builder.md) — the owner's side of the check-in kiosk layout.
 *
 *   GET  /api/kiosk-builder                          draft, what is published, business type, presets
 *   PUT  /api/kiosk-builder/draft                    save the draft { layout }
 *   POST /api/kiosk-builder/publish                  the draft goes live as the next version { note? }
 *   GET  /api/kiosk-builder/versions                 published history, newest first
 *   POST /api/kiosk-builder/versions/:version/restore  an old version → the draft
 *   POST /api/kiosk-builder/reset                    a preset → the draft { preset }
 *   Saved configurations (named designs; loading one only changes the draft):
 *   GET    /api/kiosk-builder/configs                   the list
 *   POST   /api/kiosk-builder/configs                   save the draft as a configuration { name }
 *   POST   /api/kiosk-builder/configs/:id/load          a configuration → the draft
 *   PATCH  /api/kiosk-builder/configs/:id               rename { name }
 *   DELETE /api/kiosk-builder/configs/:id
 *   GET    /api/kiosk-builder/configs/:id/export        the configuration as a file (shared/kiosk/configFile.ts)
 *   POST   /api/kiosk-builder/configs/import            a file → a new configuration { file } → { config, unmatched }
 *   POST /api/kiosk-builder/image                    upload a picture: welcome screen, a screen button (multipart "image") → { url }
 *
 * Needs the store-settings permission (owners and managers by default). The kiosk itself reads the published
 * layout from /api/public/kiosk/:slug/config.
 */
import { Router, type Request, type Response } from "express";
import { isAuthenticated } from "../auth";
import { requirePermission } from "../middleware/permissions";
import { PERMISSIONS } from "@shared/permissions";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { memoryUpload, uploadToR2 } from "../lib/r2";
import { businessTypeOf, BUSINESS_TYPES, isBusinessTypeKey } from "@shared/kiosk/businessTypes";
import { validateKioskLayout } from "@shared/kiosk/layout";
import { KIOSK_PRESETS, presetLayout } from "@shared/kiosk/presets";
import { KIOSK_TEXT_KEYS } from "@shared/kiosk/text";
import { buildKioskConfigFile, cleanConfigName, KIOSK_CONFIG_FILE_MAX_BYTES, parseKioskConfigFile, remapKioskLayout } from "@shared/kiosk/configFile";
import {
  createKioskConfig, deleteKioskConfig, kioskCatalogRefs, kioskConfigLayout, listKioskConfigs, renameKioskConfig, KIOSK_CONFIGS_MAX,
  draftKioskLayout, kioskContext, kioskVersionLayout, listKioskVersions, publishedKioskLayout,
  publishKioskDraft, sameKioskLayout, saveKioskDraft, type StoreKioskContext,
} from "../lib/kioskLayouts";

const router = Router();
const guard = [isAuthenticated, requirePermission(PERMISSIONS.STORE_SETTINGS)];

async function storeContext(req: Request, res: Response): Promise<StoreKioskContext | null> {
  const storeId = await resolveSessionStoreId(req);
  const ctx = storeId ? await kioskContext(storeId) : null;
  if (!ctx) { res.status(400).json({ error: "No store selected" }); return null; }
  return ctx;
}

const userIdOf = (req: Request): number | null => {
  const id = Number((req.session as any)?.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
};

async function builderState(ctx: StoreKioskContext) {
  const [draft, published] = await Promise.all([draftKioskLayout(ctx), publishedKioskLayout(ctx)]);
  return {
    businessType: businessTypeOf(ctx.category),
    draft: draft.layout,
    draftSavedAt: draft.savedAt,
    published: published.layout,
    publishedVersion: published.version,
    unpublishedChanges: !sameKioskLayout(draft.layout, published.layout),
  };
}

router.get("/api/kiosk-builder", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    res.json({
      ...(await builderState(ctx)),
      businessTypes: BUSINESS_TYPES,
      presets: Object.values(KIOSK_PRESETS).map((p) => ({ key: p.key, name: p.name, description: p.description })),
      textKeys: KIOSK_TEXT_KEYS,
    });
  } catch (err) {
    console.error("[kiosk-builder] load", err);
    res.status(500).json({ error: "Couldn't load the kiosk builder." });
  }
});

router.put("/api/kiosk-builder/draft", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const errors = validateKioskLayout(req.body?.layout);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    await saveKioskDraft(ctx, req.body.layout, userIdOf(req));
    res.json(await builderState(ctx));
  } catch (err) {
    console.error("[kiosk-builder] save", err);
    res.status(500).json({ error: "Couldn't save the kiosk." });
  }
});

router.post("/api/kiosk-builder/publish", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const version = await publishKioskDraft(ctx, userIdOf(req), typeof req.body?.note === "string" ? req.body.note : null);
    if (version == null) return res.status(409).json({ error: "Nothing to publish yet: save a change first." });
    res.json({ version, ...(await builderState(ctx)) });
  } catch (err) {
    console.error("[kiosk-builder] publish", err);
    res.status(500).json({ error: "Couldn't publish the kiosk." });
  }
});

router.get("/api/kiosk-builder/versions", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    res.json({ versions: await listKioskVersions(ctx.storeId) });
  } catch (err) {
    console.error("[kiosk-builder] versions", err);
    res.status(500).json({ error: "Couldn't load the kiosk history." });
  }
});

router.post("/api/kiosk-builder/versions/:version/restore", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const layout = await kioskVersionLayout(ctx, Number(req.params.version));
    if (!layout) return res.status(404).json({ error: "That version doesn't exist." });
    await saveKioskDraft(ctx, layout, userIdOf(req));
    res.json(await builderState(ctx));
  } catch (err) {
    console.error("[kiosk-builder] restore", err);
    res.status(500).json({ error: "Couldn't restore that version." });
  }
});

router.post("/api/kiosk-builder/reset", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const key = req.body?.preset;
    if (!isBusinessTypeKey(key)) return res.status(400).json({ error: "Choose a starting design." });
    await saveKioskDraft(ctx, presetLayout(key), userIdOf(req));
    res.json(await builderState(ctx));
  } catch (err) {
    console.error("[kiosk-builder] reset", err);
    res.status(500).json({ error: "Couldn't start from that design." });
  }
});

// A picture for the kiosk (the welcome screen, a button on a screen). Only stored as a file here; the builder puts
// its address in the draft. (/welcome-image is the first name it had.)
router.post(["/api/kiosk-builder/image", "/api/kiosk-builder/welcome-image"], ...guard, memoryUpload({ maxSizeMb: 10 }).single("image"), async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const file = (req as any).file as { buffer: Buffer; originalname: string; mimetype: string } | undefined;
    if (!file) return res.status(400).json({ error: "Choose a picture to upload." });
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return res.status(400).json({ error: "The picture must be a JPG, PNG or WebP." });
    const url = await uploadToR2(file.buffer, "kiosk", file.originalname, file.mimetype);
    res.json({ url });
  } catch (err) {
    console.error("[kiosk-builder] welcome image", err);
    res.status(500).json({ error: "Couldn't upload the picture." });
  }
});

// ── Saved configurations ──
const configId = (req: Request) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : 0; };
const tooMany = `You can keep up to ${KIOSK_CONFIGS_MAX} configurations. Delete one first.`;

router.get("/api/kiosk-builder/configs", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    res.json({ configs: await listKioskConfigs(ctx.storeId) });
  } catch (err) {
    console.error("[kiosk-builder] configs", err);
    res.status(500).json({ error: "Couldn't load your configurations." });
  }
});

router.post("/api/kiosk-builder/configs", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const name = cleanConfigName(req.body?.name);
    if (!name) return res.status(400).json({ error: "Give the configuration a name." });
    const config = await createKioskConfig(ctx, name, (await draftKioskLayout(ctx)).layout, "saved", userIdOf(req));
    if (!config) return res.status(409).json({ error: tooMany });
    res.json({ config });
  } catch (err) {
    console.error("[kiosk-builder] config save", err);
    res.status(500).json({ error: "Couldn't save the configuration." });
  }
});

router.post("/api/kiosk-builder/configs/:id/load", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const found = await kioskConfigLayout(ctx, configId(req));
    if (!found) return res.status(404).json({ error: "That configuration doesn't exist." });
    await saveKioskDraft(ctx, found.layout, userIdOf(req));
    res.json(await builderState(ctx));
  } catch (err) {
    console.error("[kiosk-builder] config load", err);
    res.status(500).json({ error: "Couldn't load the configuration." });
  }
});

router.patch("/api/kiosk-builder/configs/:id", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const name = cleanConfigName(req.body?.name);
    if (!name) return res.status(400).json({ error: "Give the configuration a name." });
    const config = await renameKioskConfig(ctx.storeId, configId(req), name);
    if (!config) return res.status(404).json({ error: "That configuration doesn't exist." });
    res.json({ config });
  } catch (err) {
    console.error("[kiosk-builder] config rename", err);
    res.status(500).json({ error: "Couldn't rename the configuration." });
  }
});

router.delete("/api/kiosk-builder/configs/:id", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    if (!(await deleteKioskConfig(ctx.storeId, configId(req)))) return res.status(404).json({ error: "That configuration doesn't exist." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[kiosk-builder] config delete", err);
    res.status(500).json({ error: "Couldn't delete the configuration." });
  }
});

router.get("/api/kiosk-builder/configs/:id/export", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const found = await kioskConfigLayout(ctx, configId(req));
    if (!found) return res.status(404).json({ error: "That configuration doesn't exist." });
    const file = buildKioskConfigFile(found.name, found.layout, await kioskCatalogRefs(ctx.storeId));
    const fileName = `${file.name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "kiosk"}.certxa-kiosk.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Cache-Control", "no-store");
    res.type("application/json").send(JSON.stringify(file, null, 2));
  } catch (err) {
    console.error("[kiosk-builder] config export", err);
    res.status(500).json({ error: "Couldn't export the configuration." });
  }
});

// The file comes in as JSON ({ file }), already read by the app's body parser; a file may be up to 2 MB.
router.post("/api/kiosk-builder/configs/import", ...guard, async (req: Request, res: Response) => {
  try {
    const ctx = await storeContext(req, res); if (!ctx) return;
    const size = ((req as any).rawBody as Buffer | undefined)?.length ?? 0;
    if (size > KIOSK_CONFIG_FILE_MAX_BYTES + 64 * 1024) return res.status(413).json({ error: "That file is too big for a kiosk configuration (2 MB at most)." });
    const parsed = parseKioskConfigFile(req.body?.file);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { layout, unmatched } = remapKioskLayout(parsed.file, await kioskCatalogRefs(ctx.storeId));
    const config = await createKioskConfig(ctx, parsed.file.name, layout, "imported", userIdOf(req));
    if (!config) return res.status(409).json({ error: tooMany });
    res.json({ config, unmatched });
  } catch (err) {
    console.error("[kiosk-builder] config import", err);
    res.status(500).json({ error: "Couldn't import the file." });
  }
});

export default router;
