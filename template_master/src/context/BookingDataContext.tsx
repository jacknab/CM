import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { BookingRecord, generateTempId, getAllBookings, putBooking } from '../lib/indexedDB';

/**
 * Context that holds the list of bookings (including walk‑ins) stored locally.
 * It provides helpers to create a walk‑in instantly and to sync later.
 */
interface BookingDataContextValue {
  bookings: BookingRecord[];
  addWalkIn: () => Promise<void>;
  // placeholder for future actions like check‑in/out, sync etc.
}

const BookingDataContext = createContext<BookingDataContextValue | undefined>(undefined);

export function BookingDataProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);

  // Load persisted bookings on mount
  useEffect(() => {
    (async () => {
      const stored = await getAllBookings();
      setBookings(stored);
    })();
  }, []);

  const addWalkIn = async () => {
    const now = new Date().toISOString();
    const newRecord: BookingRecord = {
      id: generateTempId(),
      type: 'walkin',
      status: 'active',
      data: {},
      synced: false,
      created_at: now,
    };
    await putBooking(newRecord);
    setBookings((prev) => [...prev, newRecord]);
  };

  return (
    <BookingDataContext.Provider value={{ bookings, addWalkIn }}>
      {children}
    </BookingDataContext.Provider>
  );
}

export function useBookingData() {
  const ctx = useContext(BookingDataContext);
  if (!ctx) throw new Error('useBookingData must be used within BookingDataProvider');
  return ctx;
}

