import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TrialPaywallModal } from '@/components/TrialPaywallModal';

interface PaywallContextType {
  showPaywall: () => void;
  hidePaywall: () => void;
  isPaywallOpen: boolean;
}

const PaywallContext = createContext<PaywallContextType | undefined>(undefined);

export const usePaywall = () => {
  const context = useContext(PaywallContext);
  if (!context) {
    throw new Error('usePaywall must be used within a PaywallProvider');
  }
  return context;
};

interface PaywallProviderProps {
  children: ReactNode;
}

export const PaywallProvider: React.FC<PaywallProviderProps> = ({ children }) => {
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  const showPaywall = () => setIsPaywallOpen(true);
  const hidePaywall = () => setIsPaywallOpen(false);

  return (
    <PaywallContext.Provider value={{ showPaywall, hidePaywall, isPaywallOpen }}>
      {children}
      <TrialPaywallModal 
        isOpen={isPaywallOpen}
        onClose={hidePaywall}
      />
    </PaywallContext.Provider>
  );
};
