// src/test-db-insert.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Attempting to insert a test record into the database...");
  try {
    const testRecord = await prisma.consolidationRequest.create({
      data: {
        sourceValidatorIndex: 999999, // Fake data
        targetValidatorIndex: 888888, // Fake data
        detectionEpoch: 123456, // Fake data
        status: "test_entry",
      },
    });
    console.log(
      `✅ Successfully created test record! Record ID: ${testRecord.id}`
    );
  } catch (e) {
    console.error("❌ Failed to create test record:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
