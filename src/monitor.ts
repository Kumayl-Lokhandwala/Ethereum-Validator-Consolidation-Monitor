// File: src/monitor.ts

import "dotenv/config";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import logger from "./lib/logger.js";
import { eventsDetectedCounter, dataFetchCounter } from "./lib/metrics.js";

const prisma = new PrismaClient();
const BEACON_URL = process.env.BEACON_NODE_URL;

if (!BEACON_URL) {
  logger.fatal("BEACON_NODE_URL is not defined in the .env file");
  process.exit(1);
}

let lastProcessedSlot = 0;

async function fetchAndProcessBlock() {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const fullUrl = `${BEACON_URL}/eth/v2/beacon/blocks/head`;
      logger.debug(`Fetching latest block from: ${fullUrl}`);

      const response = await axios.get(fullUrl, { timeout: 8000 });
      dataFetchCounter.inc({ status: "success" });

      const slot = parseInt(response.data.data.message.slot, 10);

      if (lastProcessedSlot === 0) {
        const state = await prisma.systemState.findUnique({
          where: { id: "lastProcessedSlot" },
        });
        lastProcessedSlot = state ? parseInt(state.value, 10) : slot - 1;
      }

      if (slot > lastProcessedSlot) {
        logger.info({ slot }, `🧩 New block found!`);
        lastProcessedSlot = slot;

        // Save the latest processed slot to the database
        await prisma.systemState.upsert({
          where: { id: "lastProcessedSlot" },
          update: { value: slot.toString() },
          create: { id: "lastProcessedSlot", value: slot.toString() },
        });

        const credentialChanges =
          response.data.data.message.body.bls_to_execution_changes;

        if (credentialChanges && credentialChanges.length > 0) {
          logger.info(
            { count: credentialChanges.length, slot },
            `Found credential change event(s)!`
          );
          for (const change of credentialChanges) {
            const validatorIndex = parseInt(change.message.validator_index, 10);
            const newRecord = await prisma.consolidationRequest.create({
              data: {
                sourceValidatorIndex: validatorIndex,
                targetValidatorIndex: validatorIndex,
                detectionEpoch: Math.floor(slot / 32),
                status: "credential_change_detected",
              },
            });
            eventsDetectedCounter.inc();
            logger.info(
              { recordId: newRecord.id, validatorIndex },
              `Saved event to database!`
            );
          }
        }
      }
      return; // Exit loop on success
    } catch (error) {
      dataFetchCounter.inc({ status: "failure" });
      logger.warn({ attempt }, `API fetch failed. Retrying...`);
      if (attempt === MAX_ATTEMPTS) {
        logger.error({ err: error }, "API fetch failed after all attempts.");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function startMonitoring() {
  logger.info("Starting Ethereum Validator Monitor...");
  fetchAndProcessBlock();
  setInterval(fetchAndProcessBlock, 12000);
}

process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

startMonitoring();
