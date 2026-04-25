import { prisma } from "../services/db.js";
import { Organization } from "@prisma/client";

export class OrganizationRepository {
  async findById(id: string): Promise<Organization | null> {
    return prisma.organization.findUnique({
      where: { id },
    });
  }

  async findMany(skip: number, take: number): Promise<Organization[]> {
    return prisma.organization.findMany({
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  async count(): Promise<number> {
    return prisma.organization.count();
  }

  async upsert(id: string, name: string, admin: string): Promise<Organization> {
    return prisma.organization.upsert({
      where: { id },
      update: { name, admin },
      create: { id, name, admin },
    });
  }
}

export const organizationRepository = new OrganizationRepository();
