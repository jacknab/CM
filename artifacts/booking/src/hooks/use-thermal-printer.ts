import { useState, useRef, useCallback } from "react";
import {
  connectThermalPrinter,
  printBytes,
  type ThermalPrinterConn,
} from "@/lib/thermalPrinter";

export type ThermalStatus = "disconnected" | "connecting" | "connected" | "error";

export function useThermalPrinter() {
  const [status, setStatus]         = useState<ThermalStatus>("disconnected");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const connRef                     = useRef<ThermalPrinterConn | null>(null);

  const isAvailable  = typeof navigator !== "undefined" && "bluetooth" in navigator;
  const isConnected  = status === "connected";

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const conn = await connectThermalPrinter();
      connRef.current = conn;
      const name = conn.device.name ?? "Thermal Printer";
      setDeviceName(name);
      setStatus("connected");

      // Auto-update status if device disconnects
      conn.device.addEventListener("gattserverdisconnected", () => {
        connRef.current = null;
        setStatus("disconnected");
        setDeviceName(null);
      });
    } catch (err: any) {
      setStatus("error");
      setError(err.message ?? "Connection failed");
    }
  }, []);

  const disconnect = useCallback(() => {
    try { connRef.current?.device.gatt?.disconnect(); } catch {}
    connRef.current = null;
    setStatus("disconnected");
    setDeviceName(null);
    setError(null);
  }, []);

  const print = useCallback(async (bytes: Uint8Array) => {
    if (!connRef.current) throw new Error("Printer not connected");
    await printBytes(connRef.current, bytes);
  }, []);

  return {
    status,
    deviceName,
    error,
    isAvailable,
    isConnected,
    connect,
    disconnect,
    print,
  };
}
