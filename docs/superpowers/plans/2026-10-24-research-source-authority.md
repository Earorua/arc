# Research learning-source authority

User requirement (2026-10-24): all recommended learning materials must have a credible publisher; prefer free open courses from leading universities, then official free or paid courses from major technology companies. Exclude the cited woshipm training page and similarly unverified training/marketing sources.

Implement a small, explicit publisher registry shared by the provider prompt and deterministic validation. Match exact official hosts and bounded teaching/reference paths, not arbitrary .edu domains, self-declared sourceTier, provider names, community posts, or course marketplaces. Unknown sources remain needs-review; they are not silently approved or substituted. Registry admission confirms publisher provenance only, not current availability, pricing, relevance or pedagogical quality. Provider search still has to verify the actual lesson, syllabus and cost. Retain honest free/paid/mixed labels and the existing free-alternative requirement.

Seed university courses from verified MIT OCW, Harvard CS50, Stanford SEE/CS229, and Open Yale Courses. Seed official company teaching surfaces from Google and Microsoft; keep separately scoped primary technical references (dbt/Kimball/Microsoft Research). Prefer a university course for foundations and official company instruction for applied skills. A well-known marketplace alone is not a publisher endorsement; new partner courses require verified provenance before registry expansion.

Changes: authority registry; new bounded quality issue; provider instructions and prompt/quality version bump; needs-review message; realistic fixtures. Recheck historical Research resources before new plan generation and commit so an old Ready cache cannot bypass the current policy; immutable replay of an already saved plan is preserved. No new database schema, paid model invocation, course purchase, or modification to a user's saved plan.

Verification: red regression for the real rejected URL, forged labels, unknown hosts, official-community paths, host/path lookalikes and permitted free/paid official teaching; focused existing source/quality/orchestration/component tests; type/lint; one scoped independent review. Integrate to canonical source after verification and prepare a new closed deployment. Previous build/deploy helpers remain consumed.

Official references checked 2026-10-24:
- https://ocw.mit.edu/pages/get-started/
- https://cs50.harvard.edu/x/
- https://see.stanford.edu/
- https://cs229.stanford.edu/main_notes.pdf
- https://oyc.yale.edu/
- https://developers.google.com/machine-learning
- https://www.skills.google/paths
- https://learn.microsoft.com/en-us/training/
- https://www.microsoft.com/en-us/microsoft-learn
- https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview
- https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/
- https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/
