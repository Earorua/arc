import type {DocumentWorkflowArgs} from "./workflow-policy";
export interface DocumentExecutorEnvironment{
 DOCUMENT_EXECUTOR_DB:D1Database;DOCUMENT_JOB_ASSETS:R2Bucket;DOCUMENT_WORKFLOW:Workflow<DocumentWorkflowArgs>;
 DOCUMENT_SITE:Fetcher;ARC_DOCUMENT_BRIDGE_SECRET:string;
 /** All synthetic calls, including receipt reads, use this private binding. */
 DOCUMENT_PROVIDER_TRANSPORT?:Fetcher;
 ARC_ENVIRONMENT?:string;ARC_DOCUMENT_ACCEPTANCE_MODE?:string;ARC_DOCUMENT_ACCEPTANCE_RUN_ID?:string;
 ARC_DOCUMENT_PROVIDER_QUALIFICATION?:string;ARC_DOCUMENT_MAINTENANCE_ENABLED?:string;
 [setting:string]:unknown;
}
