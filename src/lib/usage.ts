import { auth, clerkClient } from "@clerk/nextjs/server";
import { RateLimiterPrisma } from "rate-limiter-flexible";

import { prisma } from "@/lib/db";

const FREE_POINTS = 25;
const DURATION = 30 * 24 * 60 * 60; // 30 days
const GENERATION_COST = 1;

export async function getUsageTracker() {
  const usageTracker = new RateLimiterPrisma({
    storeClient: prisma,
    tableName: "Usage",
    points: FREE_POINTS,
    duration: DURATION,
  });

  return usageTracker;
};

export async function getUserApiKey(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const key = user.privateMetadata?.k2ThinkApiKey;
  return typeof key === "string" && key.length > 0 ? key : null;
}

/**
 * Consumes a credit or allows the request if user has their own API key.
 * Returns the user's API key when they're using their own (out of credits but have key).
 * Throws when out of credits and no API key.
 */
export async function consumeCredits(): Promise<{ userApiKey?: string }> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const usageTracker = await getUsageTracker();
  const status = await usageTracker.get(userId);

  // null = key not set yet (new user) = full credits available
  const hasCredits = status === null || (status.remainingPoints ?? 0) > 0;

  if (hasCredits) {
    await usageTracker.consume(userId, GENERATION_COST);
    return {};
  }

  const userApiKey = await getUserApiKey();
  if (userApiKey) {
    return { userApiKey };
  }

  throw new Error("TOO_MANY_REQUESTS");
}

export async function getUsageStatus() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const usageTracker = await getUsageTracker();
  const result = await usageTracker.get(userId);
  return result;
};
