import { createContext, useContext, useState, type ReactNode } from 'react';

interface BookingPanelContextValue {
  isOpen: boolean;
  preSelectedServiceId: number | null;
  open: () => void;
  close: () => void;
  openWithService: (serviceId: number) => void;
}

export const BookingPanelContext = createContext<BookingPanelContextValue | null>(null);

export function BookingPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [preSelectedServiceId, setPreSelectedServiceId] = useState<number | null>(null);

  return (
    <BookingPanelContext.Provider
      value={{
        isOpen,
        preSelectedServiceId,
        open: () => { setPreSelectedServiceId(null); setIsOpen(true); },
        close: () => { setIsOpen(false); setPreSelectedServiceId(null); },
        openWithService: (id) => { setPreSelectedServiceId(id); setIsOpen(true); },
      }}
    >
      {children}
    </BookingPanelContext.Provider>
  );
}

export function useBookingPanel() {
  const context = useContext(BookingPanelContext);
  if (!context) {
    throw new Error('useBookingPanel must be used within a BookingPanelProvider');
  }
  return context;
}
