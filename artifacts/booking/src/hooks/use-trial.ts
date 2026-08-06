import { useState, useEffect } from 'react';
import { useAuth } from './use-auth';

interface TrialStatus {
  isActive: boolean;
  daysRemaining: number | null;
  subscriptionStatus: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
}

export const useTrial = () => {
  const { user } = useAuth();
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setTrialStatus(null);
      setLoading(false);
      return;
    }

    const fetchTrialStatus = async () => {
      try {
        const response = await fetch('/api/trial/status');
        if (!response.ok) {
          throw new Error('Failed to fetch trial status');
        }
        const data = await response.json();
        setTrialStatus(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchTrialStatus();
  }, [user]);

  return {
    trialStatus,
    loading,
    error,
    isActive: trialStatus?.isActive ?? false,
    daysRemaining: trialStatus?.daysRemaining ?? null,
    subscriptionStatus: trialStatus?.subscriptionStatus ?? 'unknown'
  };
};
