/**
 * Kiosk Builder API (plans/kiosk-builder.md) — the owner's side of the check-in kiosk layout.
 *
 *   GET  /api/kiosk-builder                          draft, what is published, business type, presets
 *   PUT  /api/kiosk-builder/draft                    save the draft { layout }
 *   POST /api/kiosk-builder/publish                  the draft goes live as the next version { note? }
 *   GET  /api/kiosk-builder/versions                 published history, newest first
 *   POST /api/kiosk-builder/versions/:version/restore  an old version → the draft
 *   POST /api/kiosk-builder/reset                    a preset → the draft { preset }
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
import {
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

export default router;
