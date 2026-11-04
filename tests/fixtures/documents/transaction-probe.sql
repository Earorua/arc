-- Phase 0 mechanism probe ONLY; not a migration or full application schema.
PRAGMA foreign_keys=ON;
CREATE TABLE documents(
 owner_id TEXT NOT NULL,id TEXT NOT NULL,generation INTEGER NOT NULL CHECK(generation>=0),
 lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active','revoked')),PRIMARY KEY(owner_id,id));
CREATE TABLE document_versions(
 owner_id TEXT NOT NULL,document_id TEXT NOT NULL,id TEXT NOT NULL,
 PRIMARY KEY(owner_id,document_id,id),
 FOREIGN KEY(owner_id,document_id) REFERENCES documents(owner_id,id));
CREATE TABLE document_confirmations(
 owner_id TEXT NOT NULL,document_id TEXT NOT NULL,document_version_id TEXT NOT NULL,id TEXT NOT NULL,
 PRIMARY KEY(owner_id,document_id,document_version_id,id),
 FOREIGN KEY(owner_id,document_id,document_version_id) REFERENCES document_versions(owner_id,document_id,id));
CREATE TABLE material_selections(
 owner_id TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=0),bound_goal_id TEXT,
 PRIMARY KEY(owner_id,id));
CREATE TABLE material_selection_entries(
 owner_id TEXT NOT NULL,selection_id TEXT NOT NULL,slot TEXT NOT NULL CHECK(slot IN ('resume','jd','supplement')),
 document_id TEXT NOT NULL,document_version_id TEXT NOT NULL,confirmation_id TEXT NOT NULL,
 PRIMARY KEY(owner_id,selection_id,document_id),
 FOREIGN KEY(owner_id,selection_id) REFERENCES material_selections(owner_id,id),
 FOREIGN KEY(owner_id,document_id,document_version_id,confirmation_id)
 REFERENCES document_confirmations(owner_id,document_id,document_version_id,id));
CREATE UNIQUE INDEX selection_main_slot ON material_selection_entries(owner_id,selection_id,slot) WHERE slot IN ('resume','jd');
CREATE TABLE planning_context_versions(
 owner_id TEXT NOT NULL,id TEXT NOT NULL,selection_id TEXT NOT NULL,selection_revision INTEGER NOT NULL,
 lifecycle TEXT NOT NULL CHECK(lifecycle IN ('ready','revoked')),PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,selection_id) REFERENCES material_selections(owner_id,id));
CREATE TABLE probe_workspaces(
 owner_id TEXT NOT NULL,goal_id TEXT NOT NULL,revision INTEGER NOT NULL,
 active_plan_id TEXT NOT NULL,pending_plan_id TEXT,active_slot INTEGER CHECK(active_slot IN (0,1)),last_mutation_id TEXT,
 PRIMARY KEY(owner_id,goal_id));
CREATE TABLE probe_sources(
 owner_id TEXT NOT NULL,id TEXT NOT NULL,state TEXT NOT NULL,fingerprint TEXT NOT NULL,expires_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,id));
CREATE TABLE probe_results(owner_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(owner_id,id));
CREATE TABLE document_usage_links(
 owner_id TEXT NOT NULL,context_id TEXT NOT NULL,result_id TEXT NOT NULL,PRIMARY KEY(owner_id,context_id,result_id),
 FOREIGN KEY(owner_id,context_id) REFERENCES planning_context_versions(owner_id,id),
 FOREIGN KEY(owner_id,result_id) REFERENCES probe_results(owner_id,id));
CREATE TABLE document_mutations(
 owner_id TEXT NOT NULL,mutation_id TEXT NOT NULL,body_digest TEXT NOT NULL,passed INTEGER NOT NULL CHECK(passed=1),
 PRIMARY KEY(owner_id,mutation_id));

