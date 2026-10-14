import type { ResearchBudgetRepository } from "./budget";
import type { SiteAdmissionCoordinator } from "./site-admission";
import type { SiteBeginRepository } from "./site-begin-repository";
import type { SiteBridgeRepository, SiteExpiryRepository } from "./site-bridge-repository";
import type { SiteExpiryCoordinator } from "./site-expiry";
import type { SiteImportCoordinator } from "./site-import";
import type { SiteImportRepository } from "./site-import-repository";
import type { SiteExecutionIdentity } from "./site-execution-repository";

export type SiteBridgeOperations = Readonly<{
  bridge: SiteBridgeRepository;
  begin: SiteBeginRepository;
  admission: SiteAdmissionCoordinator;
  imports: SiteImportCoordinator;
  importJournal: SiteImportRepository;
  expiry: SiteExpiryCoordinator;
  recovery: Pick<SiteExpiryRepository, "read">;
  budget: Pick<ResearchBudgetRepository, "readReservation">;
  outboxEligibility: Readonly<{
    isEligible(identity: SiteExecutionIdentity, expectedVersion: number): Promise<boolean>;
  }>;
}>;
