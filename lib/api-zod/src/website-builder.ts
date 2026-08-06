import * as z from "zod/v4";

// ── Templates ─────────────────────────────────────────────────────────────────

export const ListTemplatesQueryParams = z.object({
  category: z.string().optional(),
});

export const ImportTemplateBody = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1),
  description: z.string().optional(),
  zipBase64: z.string().min(1),
});

export const GetTemplateParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const DeleteTemplateParams = z.object({
  id: z.coerce.number().int().positive(),
});

// ── Websites ──────────────────────────────────────────────────────────────────

export const CheckSlugQueryParams = z.object({
  slug: z.string().min(1),
});

export const AutoSettingsSchema = z.object({
  brandColor: z.string().optional(),
  tagline: z.string().optional(),
  announcementBar: z.string().optional(),
  googleVerification: z.string().optional(),
  instagramUrl: z.string().optional(),
  facebookUrl: z.string().optional(),
  tiktokUrl: z.string().optional(),
  yelpUrl: z.string().optional(),
  showServices: z.boolean().optional(),
  showStaff: z.boolean().optional(),
  showHours: z.boolean().optional(),
  showReviews: z.boolean().optional(),
  showContact: z.boolean().optional(),
}).catchall(z.any());

export const CreateWebsiteBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  storeid: z.string().optional(),
  templateId: z.number().int().positive().optional(),
  content: z.any().optional(),
  publisherType: z.enum(["template", "auto"]).optional(),
  autoSettings: AutoSettingsSchema.optional(),
});

export const GetWebsiteParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const UpdateWebsiteParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const UpdateWebsiteBody = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  content: z.any().optional(),
  templateId: z.number().int().positive().nullable().optional(),
  storeid: z.string().nullable().optional(),
  publisherType: z.enum(["template", "auto"]).optional(),
  autoSettings: AutoSettingsSchema.optional(),
});

export const DeleteWebsiteParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const PublishWebsiteParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const UnpublishWebsiteParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const ResolveTenantParams = z.object({
  slug: z.string().min(1),
});
