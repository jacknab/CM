import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

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

  // A link to "/?book=<serviceId>" (a service category page's Book button) opens the booking panel with that service
  // chosen. The parameter is removed from the address so a refresh doesn't open it again.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const id = url.searchParams.get('book');
      if (!id || !/^\d+$/.test(id)) return;
      url.searchParams.delete('book');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      openBooking(Number(id));
    } catch { /* an unusual address: leave the page as it is */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
