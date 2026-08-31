import { ownerDashboardReviewFixturesEnabled } from "./ownerDashboardRuntime.ts";

export interface OwnerDashboardExportRateLimiter {
  consume(ownerSubject: string, now: number): Promise<"allowed" | "limited" | "unavailable">;
}

class ReviewOwnerDashboardExportRateLimiter implements OwnerDashboardExportRateLimiter {
  private readonly hits = new Map<string, number[]>();
  async consume(ownerSubject: string, now: number): Promise<"allowed" | "limited"> {
    const current = (this.hits.get(ownerSubject) || []).filter((timestamp) => timestamp > now - 60_000);
    if (current.length >= 5) return "limited";
    current.push(now);
    this.hits.set(ownerSubject, current);
    return "allowed";
  }
}

const reviewLimiter = new ReviewOwnerDashboardExportRateLimiter();

export function getOwnerDashboardExportRateLimiter(): OwnerDashboardExportRateLimiter | null {
  return ownerDashboardReviewFixturesEnabled ? reviewLimiter : null;
}
