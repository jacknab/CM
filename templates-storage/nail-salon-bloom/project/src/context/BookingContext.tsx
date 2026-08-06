import { createContext, useContext, useState, ReactNode } from 'react';

interface BookingContextValue {
  isOpen: boolean;
  selectedServiceId: number | string | null;
  selectedServiceName: string | null;
  openBooking: (serviceId?: number | string, serviceName?: string) => void;
  closeBooking: () => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | string | null>(null);
  const [selectedServiceName, setSelectedServiceName] = useState<string | null>(null);

  const openBooking = (serviceId?: number | string, serviceName?: string) => {
    setSelectedServiceId(serviceId ?? null);
    setSelectedServiceName(serviceName?.trim() ? serviceName : null);
    setIsOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeBooking = () => {
    setIsOpen(false);
    setSelectedServiceId(null);
    setSelectedServiceName(null);
    document.body.style.overflow = '';
  };

  return (
    <BookingContext.Provider value={{ isOpen, selectedServiceId, selectedServiceName, openBooking, closeBooking }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used inside BookingProvider');
  return ctx;
}
