const FEATURES_WITHOUT_DISPLAYED_LIMIT = new Set([
  'online_booking_page',
  'domain',
]);

export function formatPricingFeatureLimit(featureId: string, limitValue: number): string | null {
  if (FEATURES_WITHOUT_DISPLAYED_LIMIT.has(featureId)) return null;
  if (featureId === 'ai_receptionist') return `${limitValue} calls`;
  if (featureId === 'sms_notifications') return `${limitValue} SMS credits`;
  return `Up to ${limitValue}`;
}

export function formatPricingFeatureName(
  featureId: string,
  featureName: string,
  limitValue: number | null,
): string {
  if (limitValue === null) return featureName;
  const limit = formatPricingFeatureLimit(featureId, limitValue);
  if (!limit) return featureName;
  const cardLimit =
    featureId === 'ai_receptionist' || featureId === 'sms_notifications'
      ? limit
      : `up to ${limitValue}`;
  return `${featureName} (${cardLimit})`;
}
