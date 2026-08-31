/**
 * POS function-button + Quick-Ticket translations.
 *
 * The button layouts in `configs/*.ts` are static English data structures shared
 * across the whole app, so their captions can't use the `pick()` hook directly.
 * This module maps every button `id` (and every Quick-Ticket guided step) to a
 * localised caption; the checkout sheet looks each one up at render time via
 * `pick(POS_BUTTON_TX[id] ?? …)`.
 *
 * `\n` in a caption forces a line break in the grid cell (same as the configs).
 * Dynamic ids (store add-ons: `dyn.addon.<n>`) are NOT listed here — those show
 * the salon's own service names untouched.
 */

export type PosTx = { en: string; vi: string; es: string; fr: string };

export const POS_BUTTON_TX: Record<string, PosTx> = {
  // ── Nail salon — top-level grid ─────────────────────────────────────────
  "nail.addon":       { en: "Add-Ons",        vi: "Dịch vụ\nthêm",     es: "Extras",          fr: "Suppléments" },
  "nail.retail":      { en: "Retail",         vi: "Bán lẻ",            es: "Tienda",          fr: "Boutique" },
  "nail.removal":     { en: "Removal",        vi: "Tháo gỡ",           es: "Retirar",         fr: "Dépose" },
  "nail.quickticket": { en: "Quick\nTicket",  vi: "Vé\nnhanh",         es: "Ticket\nrápido",  fr: "Ticket\nrapide" },
  "nail.loyalty":     { en: "Loyalty",        vi: "Tích điểm",         es: "Fidelidad",       fr: "Fidélité" },
  "nail.custom":      { en: "Custom\nCharge", vi: "Phụ thu\ntùy chỉnh", es: "Cargo\nmanual",  fr: "Frais\nmanuel" },
  "nail.grouppay":    { en: "Group\nPay",     vi: "Trả\nnhóm",         es: "Pago\ngrupal",    fr: "Paiement\ngroupe" },
  "nail.giftcard":    { en: "Gift\nCard",     vi: "Thẻ\nquà tặng",     es: "Tarjeta\nregalo", fr: "Carte\ncadeau" },

  // ── Nail salon — keypad row ────────────────────────────────────────────
  "nail.tip":         { en: "Tip\nAdjust",    vi: "Chỉnh\ntiền tip",   es: "Ajustar\npropina", fr: "Ajuster\npourboire" },
  "nail.discount":    { en: "Discount",       vi: "Giảm giá",          es: "Descuento",       fr: "Remise" },
  "nail.nosale":      { en: "No\nSale",       vi: "Mở\nngăn kéo",      es: "Sin\nventa",      fr: "Sans\nvente" },
  "nail.reprint":     { en: "Reprint",        vi: "In lại",            es: "Reimprimir",      fr: "Réimprimer" },

  // ── Removal submenu ───────────────────────────────────────────────────
  "nail.rm.polish":     { en: "Polish\nRemoval",        vi: "Tháo\nsơn thường",   es: "Quitar\nesmalte",       fr: "Retrait\nvernis" },
  "nail.rm.gelpolish":  { en: "Gel Polish\nRemoval",    vi: "Tháo\nsơn gel",      es: "Quitar\nesmalte gel",   fr: "Retrait\nvernis gel" },
  "nail.rm.acrylic":    { en: "Acrylic\nRemoval",       vi: "Tháo\nbột acrylic",  es: "Quitar\nacrílico",      fr: "Dépose\nacrylique" },
  "nail.rm.dip":        { en: "Dip Powder\nRemoval",    vi: "Tháo\nbột nhúng",    es: "Quitar\ndip",           fr: "Dépose\npoudre dip" },
  "nail.rm.gelx":       { en: "Gel-X\nRemoval",         vi: "Tháo\nGel-X",        es: "Quitar\nGel-X",         fr: "Dépose\nGel-X" },
  "nail.rm.builder":    { en: "Builder Gel\nRemoval",   vi: "Tháo\nbuilder gel",  es: "Quitar\nbuilder gel",   fr: "Dépose\nbuilder gel" },
  "nail.rm.hardgel":    { en: "Hard Gel\nRemoval",      vi: "Tháo\nhard gel",     es: "Quitar\nhard gel",      fr: "Dépose\nhard gel" },
  "nail.rm.softgel":    { en: "Soft Gel\nRemoval",      vi: "Tháo\nsoft gel",     es: "Quitar\nsoft gel",      fr: "Dépose\nsoft gel" },
  "nail.rm.polygel":    { en: "Polygel\nRemoval",       vi: "Tháo\npolygel",      es: "Quitar\npolygel",       fr: "Dépose\npolygel" },
  "nail.rm.othergel":   { en: "Other Gel\nEnh. Removal", vi: "Tháo gel\nloại khác", es: "Quitar\notro gel",     fr: "Dépose\nautre gel" },
  "nail.rm.ext":        { en: "Nail Ext.\nRemoval",     vi: "Tháo\nmóng nối",     es: "Quitar\nextensión",     fr: "Dépose\nextension" },
  "nail.rm.artificial": { en: "Artificial\nNail Removal", vi: "Tháo\nmóng giả",   es: "Quitar\nuña postiza",   fr: "Dépose\nfaux ongle" },

  // ── Discount submenu ─────────────────────────────────────────────────
  "nail.disc.10":       { en: "10% Off",     vi: "Giảm 10%",     es: "10% Dto.",   fr: "-10 %" },
  "nail.disc.15":       { en: "15% Off",     vi: "Giảm 15%",     es: "15% Dto.",   fr: "-15 %" },
  "nail.disc.20":       { en: "20% Off",     vi: "Giảm 20%",     es: "20% Dto.",   fr: "-20 %" },
  "nail.disc.employee": { en: "Employee",    vi: "Nhân viên",    es: "Empleado",   fr: "Employé" },
  "nail.disc.custom":   { en: "Custom",      vi: "Tùy chỉnh",    es: "Manual",     fr: "Manuel" },
  "nail.disc.comp":     { en: "Comp\n(100%)", vi: "Miễn phí\n(100%)", es: "Gratis\n(100%)", fr: "Offert\n(100%)" },

  // ── Gift card submenu ───────────────────────────────────────────────
  "nail.gc.sell":    { en: "Sell\nGift Card", vi: "Bán thẻ\nquà tặng", es: "Vender\ntarjeta", fr: "Vendre\ncarte" },
  "nail.gc.redeem":  { en: "Redeem",          vi: "Sử dụng",           es: "Canjear",        fr: "Utiliser" },
  "nail.gc.balance": { en: "Check\nBalance",  vi: "Kiểm tra\nsố dư",   es: "Ver\nsaldo",     fr: "Voir\nsolde" },

  // ── Reprint submenu ────────────────────────────────────────────────
  "nail.reprint.last":   { en: "Last\nReceipt",  vi: "Hóa đơn\ngần nhất", es: "Último\nrecibo", fr: "Dernier\nreçu" },
  "nail.reprint.select": { en: "Select…",        vi: "Chọn…",             es: "Elegir…",        fr: "Choisir…" },
  "nail.reprint.gift":   { en: "Gift\nReceipt",  vi: "Hóa đơn\nquà tặng", es: "Recibo\nregalo", fr: "Reçu\ncadeau" },

  // ── Generic / default layout ──────────────────────────────────────
  "def.discount": { en: "Discount",       vi: "Giảm giá",           es: "Descuento",        fr: "Remise" },
  "def.retail":   { en: "Retail",         vi: "Bán lẻ",             es: "Tienda",           fr: "Boutique" },
  "def.giftcard": { en: "Gift\nCard",     vi: "Thẻ\nquà tặng",      es: "Tarjeta\nregalo",  fr: "Carte\ncadeau" },
  "def.tip":      { en: "Tip\nAdjust",    vi: "Chỉnh\ntiền tip",    es: "Ajustar\npropina", fr: "Ajuster\npourboire" },
  "def.custom":   { en: "Custom\nCharge", vi: "Phụ thu\ntùy chỉnh", es: "Cargo\nmanual",    fr: "Frais\nmanuel" },
  "def.nosale":   { en: "No Sale",        vi: "Mở ngăn kéo",        es: "Sin venta",        fr: "Sans vente" },
  "def.reprint":  { en: "Reprint",        vi: "In lại",             es: "Reimprimir",       fr: "Réimprimer" },

  // ── Dynamic add-on grid — the "+Addon" custom-amount cell ─────────
  "dyn.addon.custom": { en: "+Addon", vi: "+Dịch vụ", es: "+Extra", fr: "+Suppl." },
};

/**
 * Quick-Ticket guided-wizard steps, keyed by the English step `label` from the
 * layout config's `guided-ticket` payload. `label` = the short tag shown mid-
 * flow / on the cart line; `prompt` = the instruction shown in the sheet header.
 */
export const POS_GUIDED_TX: Record<string, { label: PosTx; prompt: PosTx }> = {
  "Removal": {
    label:  { en: "Removal",      vi: "Tháo gỡ",       es: "Retirar",       fr: "Dépose" },
    prompt: { en: "Removal Amount", vi: "Số tiền tháo gỡ", es: "Importe de retirada", fr: "Montant dépose" },
  },
  "Nail Length": {
    label:  { en: "Nail Length",  vi: "Độ dài móng",   es: "Largo de uña",  fr: "Longueur ongle" },
    prompt: { en: "Nail Length Amount", vi: "Số tiền độ dài móng", es: "Importe del largo", fr: "Montant longueur" },
  },
  "Nail Shape": {
    label:  { en: "Nail Shape",   vi: "Dáng móng",     es: "Forma de uña",  fr: "Forme ongle" },
    prompt: { en: "Nail Shape Amount", vi: "Số tiền dáng móng", es: "Importe de la forma", fr: "Montant forme" },
  },
  "Nail Art": {
    label:  { en: "Nail Art",     vi: "Vẽ móng",       es: "Nail art",      fr: "Nail art" },
    prompt: { en: "Nail Art Amount", vi: "Số tiền vẽ móng", es: "Importe del nail art", fr: "Montant nail art" },
  },
  "Design": {
    label:  { en: "Design",       vi: "Thiết kế",      es: "Diseño",        fr: "Design" },
    prompt: { en: "Design Amount", vi: "Số tiền thiết kế", es: "Importe del diseño", fr: "Montant design" },
  },
  "Extra": {
    label:  { en: "Extra",        vi: "Phụ thu",       es: "Extra",         fr: "Extra" },
    prompt: { en: "Extra Amount", vi: "Số tiền phụ thu", es: "Importe extra", fr: "Montant extra" },
  },
};

/** POS chrome not covered by the sheet's `tPOS` object. */
export const POS_MISC_TX = {
  back:        { en: "Back",    vi: "Quay lại",  es: "Atrás",   fr: "Retour" },
  tabTicket:   { en: "Ticket",  vi: "Vé",        es: "Ticket",  fr: "Ticket" },
  tabKeypad:   { en: "Keypad",  vi: "Bàn phím",  es: "Teclado", fr: "Clavier" },
  tabActions:  { en: "Actions", vi: "Thao tác",  es: "Acciones", fr: "Actions" },
  tabPay:      { en: "Pay",     vi: "Thanh toán", es: "Pagar",  fr: "Payer" },
} satisfies Record<string, PosTx>;
