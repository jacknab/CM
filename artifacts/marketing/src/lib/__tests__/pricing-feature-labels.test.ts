import { describe, expect, it } from 'vitest';
import {
  formatPricingFeatureLimit,
  formatPricingFeatureName,
} from '../pricing-feature-labels';

describe('pricing feature labels', () => {
  it.each([
    ['online_booking_page', 'Online Booking Page'],
    ['domain', 'Custom Domain'],
  ])('does not show the configured count for %s', (featureId, featureName) => {
    expect(formatPricingFeatureName(featureId, featureName, 1)).toBe(featureName);
    expect(formatPricingFeatureLimit(featureId, 1)).toBeNull();
  });

  it('labels AI receptionist limits as calls', () => {
    expect(formatPricingFeatureName('ai_receptionist', 'AI Receptionist', 200))
      .toBe('AI Receptionist (200 calls)');
    expect(formatPricingFeatureLimit('ai_receptionist', 200)).toBe('200 calls');
  });

  it('labels SMS limits as credits', () => {
    expect(formatPricingFeatureName('sms_notifications', 'SMS Notifications', 1500))
      .toBe('SMS Notifications (1500 SMS credits)');
    expect(formatPricingFeatureLimit('sms_notifications', 1500)).toBe('1500 SMS credits');
  });

  it('keeps the existing generic limit label for other features', () => {
    expect(formatPricingFeatureName('staff', 'Staff Members', 3))
      .toBe('Staff Members (up to 3)');
    expect(formatPricingFeatureLimit('staff', 3)).toBe('Up to 3');
  });

  it('does not append a limit when no limit is configured', () => {
    expect(formatPricingFeatureName('staff', 'Staff Members', null)).toBe('Staff Members');
  });
});
