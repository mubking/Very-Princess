/**
 * @file contract.ts
 * @description HTTP route definitions for the PayoutRegistry API.
 *
 * Routes are defined as a Fastify plugin so they can be registered with a
 * URL prefix. This file intentionally contains only routing concerns —
 * all business logic lives in `contractController.ts`.
 *
 * Registered at: /api/v1/contract (see src/index.ts)
 *
 * ## Available Endpoints
 *
 * GET  /orgs/:orgId                          — Get organization details
 * GET  /orgs/:orgId/maintainers              — List maintainers for an org
 * GET  /orgs/:orgId/budget                   — Get organization's available budget
 * POST /orgs/:orgId/fund                     — Fund an organization's budget
 * GET  /maintainers/:address/balance         — Get claimable balance
 * POST /payouts                              — Allocate a payout
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { contractController } from "../controllers/contractController.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

/** Validation for the POST /orgs registration request body. */
const RegisterOrgBody = z.object({
  id: z.string().min(1).max(9),
  name: z.string().min(1).max(64),
  admin: z.string().startsWith("G").length(56),
  signerSecret: z.string().startsWith("S").length(56),
});

/** Validation for the POST /orgs/:orgId/fund request body. */
const FundOrgBody = z.object({
  fromAddress: z.string().startsWith("G").length(56),
  amountStroops: z.string().regex(/^\d+$/, "Must be a positive integer string"),
  signerSecret: z.string().startsWith("S").length(56),
});

/** Validation for the POST /payouts request body. */
const AllocatePayoutBody = z.object({
  /** Organization Symbol ID (max 9 characters). */
  orgId: z.string().min(1).max(9),
  /** Recipient maintainer's Stellar address (G...). */
  maintainerAddress: z.string().startsWith("G").length(56),
  /**
   * Amount in stroops, supplied as a string to avoid JS number precision loss.
   * 1 XLM = 10,000,000 stroops.
   */
  amountStroops: z.string().regex(/^\d+$/, "Must be a positive integer string"),
  /**
   * Admin's Stellar secret key. See controller note — this is a scaffold
   * convenience and should be replaced with client-signed XDR in production.
   */
  signerSecret: z.string().startsWith("S").length(56),
});

// ─── Route Plugin ────────────────────────────────────────────────────────────

export const contractRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /orgs
   * Returns a paginated list of registered organizations.
   *
   * @example
   * GET /api/v1/contract/orgs?page=1&limit=10
   */
  fastify.get<{ Querystring: { page?: string; limit?: string } }>(
    "/orgs",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            page: { type: "string", default: "1" },
            limit: { type: "string", default: "10" },
          },
        },
      },
    },
    async (request, reply) => {
      const page = parseInt(request.query.page || "1", 10);
      const limit = parseInt(request.query.limit || "10", 10);
      const result = await contractController.getOrganizations(page, limit);
      return reply.send(result);
    }
  );

  /**
   * POST /orgs
   * Registers a new organization on-chain and indexes it in the local database.
   */
  fastify.post<{ Body: z.infer<typeof RegisterOrgBody> }>(
    "/orgs",
    {
      schema: {
        body: {
          type: "object",
          required: ["id", "name", "admin", "signerSecret"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 9 },
            name: { type: "string", minLength: 1, maxLength: 64 },
            admin: { type: "string" },
            signerSecret: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = RegisterOrgBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { id, name, admin, signerSecret } = parsed.data;
      const result = await contractController.registerOrganization(
        id,
        name,
        admin,
        signerSecret
      );
      return reply.status(201).send(result);
    }
  );

  /**
   * GET /orgs/:orgId
   * Returns the details of a registered organization.
   *
   * @example
   * GET /api/v1/contract/orgs/stellar
   */
  fastify.get<{ Params: { orgId: string } }>(
    "/orgs/:orgId",
    {
      schema: {
        // description: "Get a registered organization by its Symbol ID.",
        // tags: ["Organizations"],
        params: {
          type: "object",
          properties: {
            orgId: { type: "string", description: "Organization Symbol ID" },
          },
          required: ["orgId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              admin: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { orgId } = request.params;
      const org = await contractController.getOrganization(orgId);
      return reply.send(org);
    }
  );

  /**
   * GET /orgs/:orgId/maintainers
   * Returns the list of maintainer addresses registered under an organization.
   *
   * @example
   * GET /api/v1/contract/orgs/stellar/maintainers
   */
  fastify.get<{ Params: { orgId: string } }>(
    "/orgs/:orgId/maintainers",
    {
      schema: {
        // description: "List all maintainers for a given organization.",
        // tags: ["Maintainers"],
        params: {
          type: "object",
          properties: {
            orgId: { type: "string" },
          },
          required: ["orgId"],
        },
      },
    },
    async (request, reply) => {
      const { orgId } = request.params;
      const result = await contractController.getMaintainers(orgId);
      return reply.send(result);
    }
  );

  /**
   * GET /orgs/:orgId/budget
   * Returns the available budget for an organization.
   *
   * @example
   * GET /api/v1/contract/orgs/stellar/budget
   */
  fastify.get<{ Params: { orgId: string } }>(
    "/orgs/:orgId/budget",
    {
      schema: {
        // description: "Get the secure available budget for an organization.",
        // tags: ["Organizations"],
        params: {
          type: "object",
          properties: {
            orgId: { type: "string" },
          },
          required: ["orgId"],
        },
      },
    },
    async (request, reply) => {
      const { orgId } = request.params;
      const result = await contractController.getOrgBudget(orgId);
      return reply.send(result);
    }
  );

  /**
   * POST /orgs/:orgId/fund
   * Fund an organization's budget via SAC token transfer.
   */
  fastify.post<{ Params: { orgId: string } }>(
    "/orgs/:orgId/fund",
    {
      schema: {
        // description: "Fund an organization's budget using public Stellar Asset transfers.",
        // tags: ["Organizations", "Funding"],
        params: {
          type: "object",
          properties: { orgId: { type: "string" } },
          required: ["orgId"],
        },
        body: {
          type: "object",
          required: ["fromAddress", "amountStroops", "signerSecret"],
          properties: {
            fromAddress: { type: "string" },
            amountStroops: { type: "string" },
            signerSecret: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = FundOrgBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { orgId } = request.params;
      const { fromAddress, amountStroops, signerSecret } = parsed.data;

      const result = await contractController.fundOrg(
        orgId,
        fromAddress,
        amountStroops,
        signerSecret
      );
      return reply.status(201).send(result);
    }
  );

  /**
   * GET /maintainers/:address/balance
   * Returns the claimable balance (in stroops and XLM) for a maintainer.
   *
   * @example
   * GET /api/v1/contract/maintainers/GABC.../balance
   */
  fastify.get<{ Params: { address: string } }>(
    "/maintainers/:address/balance",
    {
      schema: {
        // description: "Get the claimable payout balance for a maintainer.",
        // tags: ["Maintainers"],
        params: {
          type: "object",
          properties: {
            address: { type: "string", description: "Stellar public key (G...)" },
          },
          required: ["address"],
        },
      },
    },
    async (request, reply) => {
      const { address } = request.params;
      const result = await contractController.getClaimableBalance(address);
      return reply.send(result);
    }
  );

  /**
   * POST /payouts
   * Allocate a payout from an organization to a specific maintainer.
   *
   * @example
   * POST /api/v1/contract/payouts
   * Body: { orgId, maintainerAddress, amountStroops, signerSecret }
   */
  fastify.post(
    "/payouts",
    {
      schema: {
        // description: "Allocate a payout to a maintainer (org admin only).",
        // tags: ["Payouts"],
        body: {
          type: "object",
          required: ["orgId", "maintainerAddress", "amountStroops", "signerSecret"],
          properties: {
            orgId: { type: "string" },
            maintainerAddress: { type: "string" },
            amountStroops: { type: "string" },
            signerSecret: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      // Parse and validate the request body with Zod.
      const parsed = AllocatePayoutBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { orgId, maintainerAddress, amountStroops, signerSecret } =
        parsed.data;
      const result = await contractController.allocatePayout(
        orgId,
        maintainerAddress,
        amountStroops,
        signerSecret
      );
      return reply.status(201).send(result);
    }
  );
};
