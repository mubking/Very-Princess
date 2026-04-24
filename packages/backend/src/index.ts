/**
 * @file index.ts
 * @description Fastify server entry point for the very-princess backend.
 *
 * This file is responsible for:
 *  1. Creating the Fastify instance with sensible defaults.
 *  2. Registering plugins (CORS, Helmet, etc.).
 *  3. Mounting route plugins under versioned prefixes.
 *  4. Starting the HTTP server.
 *
 * ## Architecture
 *
 * ```
 * index.ts (bootstrap)
 *   └─ routes/contract.ts (route plugin)
 *       └─ controllers/contractController.ts (business logic)
 *           └─ services/stellarService.ts (Stellar SDK + Soroban RPC)
 *               └─ config/env.ts (environment)
 * ```
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { SERVER_HOST, SERVER_PORT } from "./config/env.js";
import { contractRoutes } from "./routes/contract.js";
import { errorHandler } from "./plugins/errorHandler.js";

// ─── Server Setup ─────────────────────────────────────────────────────────────

const server = Fastify({
  logger: {
    level: process.env["NODE_ENV"] === "production" ? "warn" : "info",
    transport:
      process.env["NODE_ENV"] !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
});

// ─── Plugin Registration ──────────────────────────────────────────────────────

// Security headers — important even for internal APIs.
await server.register(helmet, {
  contentSecurityPolicy: false, // relaxed for development; tighten for production
});

// CORS — allows the Next.js frontend (port 3000) to call this API.
await server.register(cors, {
  origin:
    process.env["NODE_ENV"] === "production"
      ? process.env["FRONTEND_URL"] ?? false // restrict in production
      : true, // allow all origins in development
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

await server.register(errorHandler);

// ─── Route Registration ───────────────────────────────────────────────────────

// All contract-related routes are mounted under /api/v1/contract.
// The v1 prefix supports future API versioning without breaking changes.
await server.register(contractRoutes, { prefix: "/api/v1/contract" });

// Analytics routes (leaderboard, etc.)
await server.register(analyticsRoutes, { prefix: "/api/v1/analytics" });

// Health check — used by CI, load balancers, and monitoring.
server.get("/health", async () => ({
  status: "ok",
  version: "0.1.0",
  timestamp: new Date().toISOString(),
}));

// ─── Start ───────────────────────────────────────────────────────────────────

try {
  await server.listen({ port: SERVER_PORT, host: SERVER_HOST });
  server.log.info(
    `very-princess backend listening on http://${SERVER_HOST}:${SERVER_PORT}`
  );
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
