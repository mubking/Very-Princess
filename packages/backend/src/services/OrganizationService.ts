import { organizationRepository } from "../repositories/OrganizationRepository.js";
import { stellarService } from "../services/stellarService.js";
import { redis } from "../services/cache.js";

export interface PaginatedOrgsResponse {
  data: { id: string; name: string; admin: string }[];
  meta: {
    totalPages: number;
    currentPage: number;
    totalCount: number;
  };
}

export class OrganizationService {
  async getOrganizations(page: number, limit: number): Promise<PaginatedOrgsResponse> {
    const skip = (page - 1) * limit;
    const cacheKey = `orgs:page:${page}:limit:${limit}`;

    // 1. Try cache if it's the first page
    if (page === 1) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // 2. Fetch from Repo
    const [orgs, totalCount] = await Promise.all([
      organizationRepository.findMany(skip, limit),
      organizationRepository.count(),
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    const response: PaginatedOrgsResponse = {
      data: orgs.map((org) => ({
        id: org.id,
        name: org.name,
        admin: org.admin,
      })),
      meta: {
        totalPages,
        currentPage: page,
        totalCount,
      },
    };

    // 3. Cache the first page for 5 minutes
    if (page === 1) {
      await redis.set(cacheKey, JSON.stringify(response), "EX", 300);
    }

    return response;
  }

  async registerOrganization(
    id: string,
    name: string,
    admin: string,
    signerSecret: string
  ) {
    const result = await stellarService.registerOrg(id, name, admin, signerSecret);
    
    // Index in Repo for pagination
    if (result.success) {
      await organizationRepository.upsert(id, name, admin);

      // Invalidate the first page cache
      const cacheKey = "orgs:page:1:limit:10";
      await redis.del(cacheKey);
    }

    return result;
  }

  async getOrganization(orgId: string) {
    const org = await stellarService.readOrganization(orgId);
    return {
      id: String(org["id"]),
      name: String(org["name"]),
      admin: String(org["admin"]),
    };
  }

  async getMaintainers(orgId: string) {
    return stellarService.readMaintainers(orgId);
  }

  async getOrgBudget(orgId: string) {
    const stroops = await stellarService.readOrgBudget(orgId);
    const xlm = (Number(stroops) / 10_000_000).toFixed(7);
    return {
      orgId,
      budgetStroops: stroops.toString(),
      budgetXlm: xlm,
    };
  }
}

export const organizationService = new OrganizationService();
