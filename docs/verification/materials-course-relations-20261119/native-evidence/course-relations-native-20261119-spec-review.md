PASS — independent Task B specification and evidence-reuse review, 2026-11-19.

The original fourteen cases remain usable as semantic evidence for their unchanged service and adoption boundaries, supplemented by the two newly collected cases for the changed course relations. The corrected checker accurately describes the recorded priority contract. No additional native case or probe is necessary for this bounded acceptance. This is not a claim that the fourteen cases ran again, that old and current serialization is identical, or that current live-model quality, the adapter binding, Gate authorization or release acceptance is complete.

Reviewed the Task B plan, prior `planning-integration-reuse-review.md`, Task A initial/03/04 specification history and final quality review, actual application and harness diffs, original fourteen-case assertions and inputs, and both new raw traces/snapshots. Task A remains frozen at handoff `course-relations-20261119-handoff-04-source.json`, SHA-256 `1cb8c9732eb0f9303f0ffcb170c49b8e543c1921eebe9071e6534d330034009e`. The final Task A specification/quality memos hash to `28ac05bc48bbf502fc294d4d8b86baaaea39035be9fe4583ab09f4cd4d0f7197` and `692fa8933d31ad2afee986f77146ff208f5b98276ade4cb764e9a26fad285c2a` respectively.

### Exact source comparison

I independently hashed the original manifest's 146 paths against the current checkout: 141 still match and exactly five product files differ. The original closure includes two historical harness files. The new closure has 147 paths: 139 unchanged common product dependencies, five changed common product files, one new product helper, and two new harness paths replacing the historical input/worker paths. All 147 hashes, the new infrastructure hashes, and all sixteen migration hashes match the new manifest; the reconstructed closure digest matches. The old harness files themselves remain unchanged on disk.

| Product path | Original native SHA-256 | Current SHA-256 |
| --- | --- | --- |
| `app/data/flagship-role.ts` | `e57cb6a20bb27ca2622fa43677f91be9c8c964cbd48847759007824ae9b37eef` | `7070068cd2edb6bb176b61f01e9e2e2f1800b24179c908e3619e11be5560572e` |
| `app/lib/materials/course-task-coverage.ts` | `dcf9d29f7b655217900094d67f5d5ca2b605285427f46d0f60cb704039b58d74` | `5cbca147cb1d8c707cd4e8eb32b1e02e04d6b1d6c5c16b0eb57dc635b68e640b` |
| `app/lib/materials/course-task-evidence.ts` | `ecf8aa41e10ee63ae55b91356c257a131b90e252ee0a4720c41e550f1c62e469` | `f21a983255129082788321455b8b5dfd8f574cbae370682680fb7e9bbe8cadd4` |
| `app/lib/materials/explanations.ts` | `9d953c2d15611c32062e2c98a126ad1ef65ebec8a71e24a863983ae6ea816534` | `4890a600779022b9a956682076d3a3cfddc5759a154e314fed41a6c18fb5d0b8` |
| `app/lib/materials/skill-mapper.ts` | `b42bd191f73a75577e2802a6eeb917824e50750b11c0e2dc6a74b485c0a617f4` | `2fb992337c5112856ee9253d2da843f5d5bd0be3d09de970c49023345e133b1c` |
| `app/lib/materials/course-relation-scope.ts` | New dependency | `461093918e389e2c5ba5b9d603e6c44f100172f0b009492e2a496295584caae3` |

The role delta is the five previously reviewed English display translations. Fixed explanations retain their conditions and projections and use version `2026.11.5`. The task-evidence delta combines the previously reviewed English support labels with Task A's two additional references to existing course leaves and the exact token-rubric guard. It does not add or rewrite teaching units. Coverage and the new helper introduce the reviewed bounded task/scope recognition, retain unknown remainder, and separate course-choice ambiguity from coverage. Mapping uses version `2026.11.7`, removes broad aliases that overclaimed equivalence, retains explicit older alias versions, and uses the actual retained source terms for contextual relations. These are behavioral changes; the prior three-file integration reuse memo alone is insufficient to accept them.

The following important contracts are byte-identical to the original native closure: `app/server/documents/context-builder.ts` (`aba0c2549dfb277486935db11e22ed716f3746c16db542dc006e6540a27fc09c`), `app/lib/materials/planning-priority.ts` (`9620b2a75b3826f7ccaa330bf95aab8ca5ef0608f2e4af4f3df80bdaa8dd154b`), `app/lib/materials/experience-evidence.ts` (`12f25330b1719338eec736881d2a19dc8635dbd1c71fa997059dd9bfc21debec`), planning service (`38ed8060e2405202afe83fdaa4d67362cc93f5b71f6f8174cd866007664f331b`) and D1 planning repository (`10cd6054818ef07db271a370acb1b71fedf57f752e12137ba660ddd6b24652b9`). Contracts, document lifecycle, ownership checks, selection/dependency verification, proposal acceptance, persistence, prerequisite/budget enforcement and Proof are among the unchanged common dependencies. Task A's UI sentence is outside this native dependency closure and retains its separate component evidence.

### Reuse decision for the fourteen historical cases

I checked all fourteen raw artifact hashes against the original collection and checked the original infrastructure hashes. The old input vocabulary is SQL, React and TypeScript, including explicit term exclusions and a supervised TypeScript statement; it does not exercise the newly removed CSS/tool aliases or new contextual task expressions. Inspection of the old checker shows that its declared behavioral assertions concern choices, priorities, lifecycle and persisted state, rather than the newly changed coverage answers.

| Historical case group | Reusable behavioral evidence and reason |
| --- | --- |
| Fact confirmation; guided setup choice; batch Independent rejection; single Independent choice | Confirmation remains separate from self-assessment adoption. Contract validation and explicit setup input precede real generation. No adoption endpoint or predicate changed. The setup UI evidence retains its original historical scope. |
| Unadopted intent; explicit soft-focus adoption; focus withdrawal; individual term exclusion | Intent eligibility, explicit choice, omitted-term handling, snapshot persistence and proposal acceptance remain unchanged. SQL/React literal destinations used by these inputs remain available. |
| Primary-JD replacement before acceptance; accepted replacement; secondary JD | Primary authority and current/proposed separation remain unchanged. The two new cases additionally exercise these boundaries with changed contextual relations. |
| Material deletion; unresolved confirmation conflict; stale-preview rejection | Revocation, source/selection version guards, confirmation validation and atomic acceptance paths are unchanged; new mapping output cannot authorize a deleted, unresolved or stale dependency. |

Completed work, audit, availability, prerequisites, full task durations, historical versions and Proof protection remain reusable as guarded service behavior. The new accepted replacement also exercises these protections with the changed relations. This decision does not reuse old concrete mapping/coverage values as answers for new inputs, nor claim a new fourteen-case run. The blueprint display digest, explanation version and mapping version can change fingerprints, context/proposal IDs, explanatory text and task order. An old preview/token is not automatically valid against the new source; existing version checks still apply. Historical snapshots and original evidence keep their original bytes and versions.

### New native observations and checker correction

The collector uses fresh local D1/R2 per case, actual migrations through 0015, and a workerd outbound handler that rejects external requests. It freezes source before collection, writes new artifacts exclusively, stops on a failed case or outbound attempt, and records source drift. The actual receipt contains exactly two unique collected cases, zero outbound attempts, zero source drift and no missing cases. The worker differs from the original only by a provenance comment and three policy-symbol substitutions from grounded terms v2 to retained source mentions v3. Inputs are separate fixed synthetic documents. Initial synthetic extraction/draft imports are explicitly identified upstream fixtures; documents, confirmation, selection, context building, generation, completion, Proof creation, proposal and acceptance execute real services. No evaluated after-state is seeded and no provider/job/consent execution is claimed.

In `accept-current-primary-jd-preview`, the raw preview maps semantic HTML forms to web-platform/full, SQL joins with business remainder to SQL/partial, and accessible form labels to an unresolved web-platform/design-systems choice with combined full narrow-task coverage. Mandatory skills are exactly SQL and web-platform. The persisted candidate leaves the old active plan/path and primary document link intact. A recorded explicit `planning.acceptReplan` returns accepted; only then does the candidate become active, pending becomes null, the proposal becomes accepted, and enabled links match the new context's exact JD/resume/supplement dependencies. The accepted snapshot records mapping `2026.11.7` and the unchanged audit.

In `secondary-jd-cannot-add-must`, the retained React component-state requirement maps contextually with full narrow-task coverage. Unadopted React remains rank 5; the explicit learning-intent preview changes it to rank 3. SQL remains the sole mandatory skill. The raw React priority names only the secondary requirement as an intent source and has an empty practice-source list. No proposal/acceptance call occurs; the active workspace and enabled links remain unchanged.

Both cases retain a real completed workspace event created by `planning.appendEvent`, a Proof created through `proof.create`, one Proof item/version, two review events, 32 skill-projection rows, and unchanged audit/availability/goal rows. Fresh repository/Proof reloads match the captured after-state, including tables and R2. The checker also verifies old path/plan/unit rows remain present, completed units retain their positions, prerequisites remain satisfied and new plan days obey their budgets. The legacy `learning_events` table is empty in these captures; completion evidence is the nonempty persisted planning-workspace event, not an inferred event from that empty table.

The initial checker failed both cases at the same erroneous assertion: it required the resume SQL ID in optional `practiceItemIds` on the winning SQL must row. The unchanged `context-builder.ts:300-307` emits winning requirement IDs for that tier and only emits the separate practice/intent disambiguation fields when qualifying intent sources exist. `createMaterialOverlay` first assigns practice rank 3, then takes the minimum with the primary must rank 0. Absence of `practiceItemIds` on this row is therefore expected, not a product failure.

Revision 02 correctly asserts SQL tier 0 with the exact primary requirement ID. It strengthens the other-person/CSS exclusions to inspect primary `itemIds` as well as optional `practiceItemIds`; required reference/mapping lookups make these checks non-vacuous. The raw colleague React mapping exists but contributes no practice source; CSS is actually uncovered with no support and contributes no priority source. All other checker assertions are unchanged. The initial failed checker and report remain preserved; only the independent checker/report changed, and the same two raw native artifacts were reused. The saved revised result is 2/2 cases and eleven assertion groups.

These native observations do **not** demonstrate a separate positive SQL practice tier beneath the dominating primary must. Positive practice support here relies on the unchanged source-specific experience predicate and practice-selection path plus accepted affected unit evidence: the 50-pass failure-only run includes all 32 real-context practice-priority tests (including positive SQL, bounded guidance and unchanged audit); the later 128-pass run includes all 26 practice-mapping tests (including contextual positive/other-person controls) and 89 contextual-mapping tests. The current relation test separately covers the exact SQL-joins sentence's contextual mapping/partial coverage. These are distinct layers, not a fabricated positive native practice result. The inspected source and saved evidence resolve the bounded requirement without another native capture.

### Exact evidence pins

New raw artifacts are under `work/grounded-verification/course-relations-native-20261119-01/`; tools are under `work/grounded-verification/course-relations-native-20261119-tools/`.

| Artifact/tool | SHA-256 |
| --- | --- |
| New `manifest.json` | `b3457d1329698e782a54cf34d2fe5dd2b85df5427420d5ed586ccd4c208f859f` |
| New closure digest | `082a0c57898cc92af1d1264dea9632d124b0db5139422d230cc64ef649fb0212` |
| New `collection.json` | `4484d5660fdd39a99fde3c6bc3323e68ec17641d8c5f68fde8a3b313f665aabe` |
| Accepted-replacement raw case | `6c3aab9d459127341b302f7ad310cfd499b10c6926974a84d59ca8725b864032` |
| Secondary-JD raw case | `8fd219e4ee68c9705237e1ae70eb39e19cd3eb670bcec63bb8f053a9ce37d37e` |
| Bundled `worker.mjs` | `f8279606331b061e778691295229ce086d1dc17a3536e074d7ae3b587da3ec2f` |
| New `planning-inputs.json` | `0031e1e0252303e1cefdc6c3714ba4696f32ec1217f45cfb2a286bc7e710e1c0` |
| New `planning-worker.ts` | `09fcc107091944215394f6f041bd5abf116b0242dafc808e91c1be23a357d3ca` |
| New `collect.mjs` | `c2faba2c738216dbad301f7432fb8d8c70d4df0e11d6cabf6a2bd59aaa2d48ca` |
| Initial `check.mjs` | `0be6ac72c6fcb5d5d0e7e18a9f9f5a9f61055fa289936036841bdbe28c80c2e6` |
| Initial failed `check.json` | `50ec4560eafeb722bdfdb1f52b49e0ad9922f20e5271fca8c47f698ab03efc37` |
| `check-revision-02.mjs` | `df2b741925f964374f0e2dd176ce33bc22fa6a56f1ca3f6238dc76e8e35ebacf` |
| `check-revision-02.json` | `896e2e16db55e0b0390ab26c74f78bfe9f323e77428db48aa45e548d3fd2d1e0` |
| Collector wrapper raw log | `d9ae04e08ccf9367387d1661505e27a350c7117ba65d7618325de82aef3c9896` |
| Initial failed-check wrapper raw log | `fccda646ca62af6c103086e459aba9242484e8e0a8bd8c00a94cb911251368ec` |
| Revised-check wrapper raw log | `ed900a2034d2cba566734f8365d72bfc750dba8e663fd588dde2807952c81319` |

The three wrapper exits are 0, 1 and 0 respectively; every raw-log hash matches its wrapper receipt. The old manifest remains `c65d84b1048dbad28f0eea7e21e81c77c4c577b43c0bb67ab77fb978fd1b6d4d`, closure digest `c82c4fb905f089c9f62ddd3280be5e51d1bd355d5bc756fd3823b8fb31a993a3`, collection `59dd39a5589d626cbc2074f58b1be9ee07df529495088090971a0535aa72401b`, check result `d9026957497342116e47e7c77071839fe669119b33958adf89c304fc216461de`, and checker `51ce03f02fceefb4fac44c1fe7b2f7f4176177760fc6442904fdd3b0a62ce124`. Its input and worker hashes remain `1dc54a3f857cf2d03940005e48bbe7e5a6993d83e6b659638e28eeb936c40064` and `7d82e3e0ac65c21bd8934b7d0f7e63e995849512371b0b08540c94dd9c72e201`.

The reused 50-test and 128-test raw logs independently match `9bc93564fecdc09e7b6a57ed1978e754ded21257ff84b6bc5b69d242f3619c10` and `5f456b627d18fd49756cec05e6ae0769652fac75fa49e4291d087c9728e53a48`. Later delimiter-only Task A corrections retain their separately reviewed targeted evidence; those counts are not presented as fresh runs on handoff 04.

Reviewer activity was read-only source/diff/hash/raw-record inspection and this new memo. No native matrix, checker, unit suite, model/network call or product probe was executed. No source/test edits, staging or commits were made. A final explicit adapter source/reuse binding must preserve these historical/new distinctions and continue rejecting unreviewed drift; that binding and final application acceptance remain separate work.
