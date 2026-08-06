import { usePaywall } from '@/contexts/PaywallContext';

export const useApiErrorHandler = () => {
  const { showPaywall } = usePaywall();

  const handleError = (error: any) => {
    if (error?.message?.includes('TRIAL_EXPIRED') || error?.code === 'TRIAL_EXPIRED') {
      showPaywall();
      return;
    }

    // Handle other errors with console notification for now
    // In a real implementation, you'd use your toast system
    const message = error?.message || 'An error occurred';
    console.error('API Error:', message);
  };

  return { handleError };
};
