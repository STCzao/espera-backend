import type { Organization } from "@modules/organization/public-api";
import type { Business } from "../domain/Business";

export type CoherenceAlert = "CATEGORY_MISMATCH" | "MISSING_LEGAL_ID";

/**
 * Coherence check for HU-8.7: flags a reviewed Business against its
 * Organization. A missing Organization.categoryId is not itself an alert —
 * there's nothing to compare against — only a declared mismatch is flagged.
 */
export const computeBusinessCoherenceAlerts = (
  business: Business,
  organization: Organization,
): CoherenceAlert[] => {
  const alerts: CoherenceAlert[] = [];

  if (organization.categoryId && organization.categoryId !== business.categoryId) {
    alerts.push("CATEGORY_MISMATCH");
  }

  if (!organization.legalId) {
    alerts.push("MISSING_LEGAL_ID");
  }

  return alerts;
};
