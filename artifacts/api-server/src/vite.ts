import { type Express } from "express";
import { type Server } from "http";

export async function setupVite(_server: Server, _app: Express): Promise<void> {
  // In this monorepo, the frontend is served by its own artifact (artifacts/booking).
  // The api-server does not need to host Vite middleware.
}
