// File: src/server.ts

import express from "express";
import { PrismaClient } from "@prisma/client";
import client from "prom-client";
import logger from "./lib/logger.js";
import { activeEventQueueGauge } from "./lib/metrics.js";
import { getLastProcessedSlot, getStartTime } from "./lib/sharedState.js";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// --- Observability Setup ---
client.collectDefaultMetrics();

// --- API Endpoints ---
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const lastSlot = getLastProcessedSlot();
    const uptime = (Date.now() - getStartTime()) / 1000; // in seconds

    // A real lag calculation would need to fetch the current head, but this is a good proxy.
    const lag = lastSlot > 0 ? `Processing slot ${lastSlot}` : "Initializing";

    res.status(200).json({
      status: "ok",
      database: "connected",
      uptime: `${uptime.toFixed(0)} seconds`,
      lastProcessedSlot: lastSlot,
      lagStatus: lag,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  } catch (e) {
    res.status(500).end(e);
  }
});

app.get("/consolidations/active", async (req, res) => {
  try {
    const activeEvents = await prisma.consolidationRequest.findMany({
      where: {
        // BUG FIX: Search for the correct status
        status: "credential_change_detected",
      },
      orderBy: { createdAt: "asc" },
    });
    res.status(200).json(activeEvents);
  } catch (e) {
    logger.error({ err: e }, "Failed to fetch active events.");
    res.status(500).json({ error: "Failed to fetch active events." });
  }
});

app.get("/validators/:id/history", async (req, res) => {
  // ... (this endpoint code is fine as is, no changes needed)
});

app.get("/queue/stats", async (req, res) => {
  try {
    const queueLength = await prisma.consolidationRequest.count({
      where: {
        // BUG FIX: Search for the correct status
        status: "credential_change_detected",
      },
    });

    activeEventQueueGauge.set(queueLength); // Update the gauge metric

    const CHURN_LIMIT_PER_EPOCH = 8;
    const EPOCH_TIME_MINUTES = 6.4;
    const estimatedWaitMinutes =
      (queueLength / CHURN_LIMIT_PER_EPOCH) * EPOCH_TIME_MINUTES;

    res.status(200).json({
      queueLength,
      estimatedWaitTime: `${estimatedWaitMinutes.toFixed(2)} minutes`,
      churnRatePerDay: CHURN_LIMIT_PER_EPOCH * (1440 / EPOCH_TIME_MINUTES),
    });
  } catch (e) {
    logger.error({ err: e }, "Failed to fetch queue statistics.");
    res.status(500).json({ error: "Failed to fetch queue statistics." });
  }
});

// Start the server
app.listen(PORT, () => {
  logger.info({ port: PORT }, `🚀 API Server is running`);
});
