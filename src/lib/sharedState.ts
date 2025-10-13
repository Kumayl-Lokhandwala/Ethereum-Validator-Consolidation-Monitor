// File: src/lib/sharedState.ts
let lastProcessedSlot = 0;
const startTime = Date.now();

export const setLastProcessedSlot = (slot: number) => {
  lastProcessedSlot = slot;
};

export const getLastProcessedSlot = () => lastProcessedSlot;
export const getStartTime = () => startTime;
