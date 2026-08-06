import { Router } from "express";
import { isAuthenticated } from "../auth.js";
import { resolveSessionStoreId } from "../lib/sessionStore.js";
import {
  getTranslations,
  getStoreTranslations,
  upsertTranslation,
  triggerTranslation,
  deleteTranslationsForEntity,
  type EntityType,
  type LangCode,
} from "../lib/translationService.js";
import { pool } from "../db.js";

const router = Router();

const VALID_ENTITY_TYPES: EntityType[] = ["category", "service", "addon", "product"];
const VALID_LANGS: LangCode[] = ["es", "vi", "zh", "ko"];

function validateEntityType(t: string): t is EntityType {
  return VALID_ENTITY_TYPES.includes(t as EntityType);
}
function validateLang(l: string): l is LangCode {
  return VALID_LANGS.includes(l as LangCode);
}

// GET /api/translations/store — all translations for the current store, grouped by entity type
router.get("/store", isAuthenticated, async (req, res) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const data = await getStoreTranslations(storeId);
    return res.json(data);
  } catch (err) {
    console.error("[translations/store]", err);
    return res.status(500).json({ message: "Failed to load translations" });
  }
});

// GET /api/translations/:entityType/:entityId — translations for one entity
router.get("/:entityType/:entityId", isAuthenticated, async (req, res) => {
  try {
    const { entityType, entityId } = req.params as Record<string, string>;
    if (!validateEntityType(entityType))
      return res.status(400).json({ message: "Invalid entity type" });
    const id = Number(entityId);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid entity id" });

    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });

    const rows = await getTranslations(entityType, id);
    return res.json(rows);
  } catch (err) {
    console.error("[translations/get]", err);
    return res.status(500).json({ message: "Failed to load translations" });
  }
});

// PUT /api/translations/:entityType/:entityId/:lang — manual override
router.put("/:entityType/:entityId/:lang", isAuthenticated, async (req, res) => {
  try {
    const { entityType, entityId, lang } = req.params as Record<string, string>;
    if (!validateEntityType(entityType))
      return res.status(400).json({ message: "Invalid entity type" });
    if (!validateLang(lang))
      return res.status(400).json({ message: `Invalid language. Must be one of: ${VALID_LANGS.join(", ")}` });

    const id = Number(entityId);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid entity id" });

    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "name is required" });

    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });

    await upsertTranslation(entityType, id, lang, name, description);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[translations/put]", err);
    return res.status(500).json({ message: "Failed to save translation" });
  }
});

// POST /api/translations/:entityType/:entityId/regenerate — re-trigger AI for one entity
router.post("/:entityType/:entityId/regenerate", isAuthenticated, async (req, res) => {
  try {
    const { entityType, entityId } = req.params as Record<string, string>;
    if (!validateEntityType(entityType))
      return res.status(400).json({ message: "Invalid entity type" });
    const id = Number(entityId);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid entity id" });

    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });

    // Fetch the entity's English name/description
    let name = "";
    let description: string | null = null;

    if (entityType === "category") {
      const { rows } = await pool.query(
        `SELECT name FROM service_categories WHERE id = $1 AND store_id = $2`, [id, storeId]
      );
      if (!rows[0]) return res.status(404).json({ message: "Category not found" });
      name = rows[0].name;
    } else if (entityType === "service") {
      const { rows } = await pool.query(
        `SELECT name, description FROM services WHERE id = $1 AND store_id = $2`, [id, storeId]
      );
      if (!rows[0]) return res.status(404).json({ message: "Service not found" });
      name = rows[0].name;
      description = rows[0].description;
    } else if (entityType === "addon") {
      const { rows } = await pool.query(
        `SELECT name, description FROM addons WHERE id = $1 AND store_id = $2`, [id, storeId]
      );
      if (!rows[0]) return res.status(404).json({ message: "Addon not found" });
      name = rows[0].name;
      description = rows[0].description;
    } else if (entityType === "product") {
      const { rows } = await pool.query(
        `SELECT name FROM products WHERE id = $1 AND store_id = $2`, [id, storeId]
      );
      if (!rows[0]) return res.status(404).json({ message: "Product not found" });
      name = rows[0].name;
    }

    triggerTranslation({ entityType, entityId: id, name, description });
    return res.json({ ok: true, message: "Translation job queued" });
  } catch (err) {
    console.error("[translations/regenerate]", err);
    return res.status(500).json({ message: "Failed to queue translation" });
  }
});

// POST /api/translations/store/regenerate-all — regenerate all translations for the store
router.post("/store/regenerate-all", isAuthenticated, async (req, res) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });

    const { rows: cats } = await pool.query(
      `SELECT id, name FROM service_categories WHERE store_id = $1`, [storeId]
    );
    const { rows: svcs } = await pool.query(
      `SELECT id, name, description FROM services WHERE store_id = $1 AND is_active = TRUE`, [storeId]
    );
    const { rows: addonsData } = await pool.query(
      `SELECT id, name, description FROM addons WHERE store_id = $1 AND is_active = TRUE`, [storeId]
    );
    const { rows: prods } = await pool.query(
      `SELECT id, name FROM products WHERE store_id = $1`, [storeId]
    );

    let total = 0;
    for (const r of cats) {
      triggerTranslation({ entityType: "category", entityId: r.id, name: r.name });
      total++;
    }
    for (const r of svcs) {
      triggerTranslation({ entityType: "service", entityId: r.id, name: r.name, description: r.description });
      total++;
    }
    for (const r of addonsData) {
      triggerTranslation({ entityType: "addon", entityId: r.id, name: r.name, description: r.description });
      total++;
    }
    for (const r of prods) {
      triggerTranslation({ entityType: "product", entityId: r.id, name: r.name });
      total++;
    }

    return res.json({ ok: true, queued: total });
  } catch (err) {
    console.error("[translations/regenerate-all]", err);
    return res.status(500).json({ message: "Failed to queue translations" });
  }
});

export default router;
