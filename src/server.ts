// File: src/server.ts

import express from "express";
import { PrismaClient } from "@prisma/client";
import client from "prom-client";
import logger from "./lib/logger.js";
import { activeEventQueueGauge } from "./lib/metrics.js";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

client.collectDefaultMetrics();

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const state = await prisma.systemState.findUnique({
      where: { id: "lastProcessedSlot" },
    });
    const lastSlot = state ? parseInt(state.value, 10) : 0;
    const uptime = (Date.now() - startTime) / 1000;
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
    const fullUrl = `${process.env.BEACON_NODE_URL}/eth/v1/beacon/states/head/pending_consolidations`;
    const response = await axios.get(fullUrl);
    res.status(200).json(response.data.data);
  } catch (e) {
    logger.error(
      { err: e },
      "Failed to fetch active consolidations from Beacon API."
    );
    res.status(500).json({ error: "Failed to fetch active consolidations." });
  }
});

app.get("/validators/:id/history", async (req, res) => {
  try {
    const validatorIndex = parseInt(req.params.id, 10);
    if (isNaN(validatorIndex)) {
      return res.status(400).json({ error: "Invalid validator index." });
    }
    const history = await prisma.consolidationRequest.findMany({
      where: {
        OR: [
          { sourceValidatorIndex: validatorIndex },
          { targetValidatorIndex: validatorIndex },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(history);
  } catch (e) {
    logger.error({ err: e }, "Failed to fetch validator history.");
    res.status(500).json({ error: "Failed to fetch validator history." });
  }
});

app.get("/queue/stats", async (req, res) => {
  try {
    const fullUrl = `${process.env.BEACON_NODE_URL}/eth/v1/beacon/states/head/pending_consolidations`;
    const response = await axios.get(fullUrl);
    const queueLength = response.data.data.length;
    activeEventQueueGauge.set(queueLength);
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
    logger.error(
      { err: e },
      "Failed to fetch queue statistics from Beacon API."
    );
    res.status(500).json({ error: "Failed to fetch queue statistics." });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, `🚀 API Server is running`);
});
