import { FastifyInstance } from "fastify";
import { prisma } from "../services/db.js";

export interface VerifyResponse {
  isVerified: boolean;
  riskLevel: "LOW" | "HIGH";
}

export const tokenController = {
  async verifyToken(address: string): Promise<VerifyResponse> {
    const verifiedContract = await prisma.verifiedContract.findUnique({
      where: { address },
    });

    if (verifiedContract) {
      return {
        isVerified: true,
        riskLevel: verifiedContract.riskLevel as "LOW" | "HIGH",
      };
    }

    return {
      isVerified: false,
      riskLevel: "HIGH",
    };
  },
};

export async function tokenRoutes(fastify: FastifyInstance) {
  fastify.get("/verify/:address", async (request, reply) => {
    const { address } = request.params as { address: string };
    
    if (!address) {
      return reply.status(400).send({ error: "Address is required" });
    }

    const result = await tokenController.verifyToken(address);
    return result;
  });
}
