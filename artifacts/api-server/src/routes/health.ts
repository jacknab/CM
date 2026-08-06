import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getLastDriftResult } from "../startup/checkSchemaDrift";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const base = HealthCheckResponse.parse({ status: "ok" });
  const drift = getLastDriftResult();

  res.json({
    ...base,
    schemaDrift: drift ?? { checkedAt: null, ok: null, tables: [] },
  });
});

export default router;
