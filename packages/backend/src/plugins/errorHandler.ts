import { FastifyInstance } from "fastify";

export async function errorHandler(server: FastifyInstance) {
  server.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, reqId: request.id }, error.message);

    if (error.message?.includes("timeout") || (error as any).code === "ETIMEDOUT") {
      return reply.status(504).send({ statusCode: 504, error: "Gateway Timeout", message: "Blockchain service timed out." });
    }

    if (error.validation) {
      return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: error.message, details: error.validation });
    }

    return reply.status(500).send({ statusCode: 500, error: "Internal Server Error", message: "An unexpected error occurred." });
  });
}