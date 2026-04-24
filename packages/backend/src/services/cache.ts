import { Redis } from "ioredis";
import { env } from "../config/env.js";

// We'll assume REDIS_URL is in env, defaulting to localhost if not.
// For the sake of this task, we'll use a simple connection.
const REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});
