/**
 * @file stats.ts
 * @description Global ecosystem statistics endpoint.
 *
 * Registered at: /api/stats (see src/index.ts)
 *
 * ## Available Endpoints
 *
 * GET /api/stats/global  — Aggregated platform-wide statistics (1-minute cache)
 */

import type { FastifyPluginAsync } from "fastify";
import { statsController } from "../controllers/statsController.js";

// --- In-memory cache ---------------------------------------------------

interface CacheEntry {
  data: Awaited<ReturnType<typeof statsController.getGlobalStats>>;
  expiresAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

// --- Route Plugin ------------------------------------------------------

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /global
   * Returns aggregated platform statistics, cached for 1 minute.
   *
   * @example
   * GET /api/stats/global
   */
  fastify.get(
    "/global",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              totalOrganizations: { type: "number" },
              totalFundedStroops: { type: "string" },
              totalFundedXlm: { type: "string" },
              totalClaimedStroops: { type: "string" },
              totalClaimedXlm: { type: "string" },
              cachedAt: { type: "string" },
              cacheExpiresAt: { type: "string" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const now = Date.now();

      if (cache && now < cache.expiresAt) {
        return reply.send(cache.data);
      }

      const data = await statsController.getGlobalStats();
      cache = { data, expiresAt: now + CACHE_TTL_MS };

      return reply.send(data);
    }
  );
};