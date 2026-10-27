# Research learning materials

Owner requirement, 2026-10-24: prefer public free courses from leading US universities. For official company courses, prefer leading US companies, then leading Chinese companies; free or paid offerings are eligible. Geography is a preference among relevant courses at the right level, not a substitute for authority, availability or teaching quality. Publisher country is separate from course language, URL locale and hosting location. Every learning resource must have a credible publisher. The woshipm training page at https://www.woshipm.com/online/3569229.html is explicitly unsuitable.

`app/server/research/source-authority.ts` is the shared initial publisher catalog for generation guidance and local validation. It uses exact official hosts, teaching/reference paths, and known publisher names. Unknown sources are held for review; a model's `primary` or `institutional` label cannot establish authority. Do not admit an entire marketplace, university domain, personal hosting service or community forum merely because a reputable institution also uses it.

The catalog verifies publisher provenance, not current lesson availability, course relevance, pricing, or teaching quality. Research must still find direct substantive teaching, verify access, and label free/paid/mixed honestly. Prefer a relevant university course for foundations and official company instruction for applied skills. Official primary technical references can supplement instruction. Paid primary materials retain the free-alternative requirement.

Initial verified sources:
- [MIT OCW](https://ocw.mit.edu/pages/get-started/) — MIT's open course materials.
- [Harvard CS50](https://cs50.harvard.edu/x/) — public lectures and assignments.
- [Stanford SEE](https://see.stanford.edu/) and [CS229](https://cs229.stanford.edu/main_notes.pdf) — official course materials.
- [Open Yale Courses](https://oyc.yale.edu/) — public university lectures.
- [Google machine learning](https://developers.google.com/machine-learning) and [Google Skills](https://www.skills.google/paths) — official company instruction; check each offering's access and price.
- [Microsoft Learn](https://learn.microsoft.com/en-us/training/) — official training; select a concrete module/path.
- [Alibaba Cloud Academy](https://edu.alibabacloud.com/course/353/info) — a verified Chinese-company fallback, limited to official `/course/<id>` and `/course/<id>/info` entries. The canonical entries for [Big Data](https://edu.alibabacloud.com/course/767) and [MaxCompute SQL](https://edu.alibabacloud.com/course/860) were checked on 2026-10-25. The [company site](https://www.alibabacloud.com/en/about) links to this training service. Check lessons, price and separate cloud-service costs for each course. Preserve the actual searched URL; do not append `/info` to fit a catalog pattern.
- [Microsoft Research](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [dbt documentation](https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview), and [Kimball techniques](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/) — scoped primary technical references, not generic course endorsements.

Unknown does not mean inherently poor: expand this initial catalog after checking official publisher provenance and the specific teaching surface. Never infer that a famous platform or a third-party mirror inherits a university/company's authority.

New candidate validation and new plan generation/commit enforce this policy, including historically cached Research packages. Already saved plan replay remains immutable; old material has not been retroactively approved or silently rewritten. Prompt v6 and quality v5 separate new generation from prior cache identity. The change itself makes no model request or course purchase.

Every resource must still match a provider citation after the existing safe canonicalization. Official publisher eligibility does not supply that citation. Missing-citation diagnostics report only counts and up to 16 zero-based resource positions, never URLs, titles, credentials or raw model content. The r157 response is retained for review; independently visiting a page does not retroactively prove what its provider search returned.
