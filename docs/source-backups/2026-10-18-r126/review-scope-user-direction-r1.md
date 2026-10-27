# User direction: necessary, proportionate review

On 2026-10-18, during Task2 successor QUALITY review, the user requested: "继续任务，并回答问题：还有多少步的审核未完成？进行必要的审核，但不要过度审核".

Root explained the currently planned code-review rounds before the new cloud simulation: the active Task2 QUALITY review, then Task3 SPEC and a different Task3 QUALITY review. Cloud simulation, real Research and release acceptance are functional verification, not a reason to repeat already completed code reviews.

Apply this direction to all remaining work:

- Reuse accepted evidence for unchanged code, schema, artifacts and dependencies. Verify relevant current identities/bytes where the actual operation requires it, without rerunning the original broad suites simply to produce another count.
- Review the actual new changes and their necessary integration boundaries. Prioritize real correctness, credential handling, one-shot execution, deadlines and recovery risks.
- After a small fix, perform targeted regression and targeted review of that fix; do not automatically restart the entire review program.
- Do not create additional review rounds for formatting, optional strengthening or speculative risks. Once required checks pass, advance to the next concrete implementation or functional acceptance step.
- Preserve original failed records and report actual limitations. This instruction does not permit fabricating native proof, skipping a demonstrated failure, weakening live guards, exposing credentials or expanding paid-model permission.

This note records user intent, not a new operational gate or approval requirement. It does not change any frozen Task2 candidate or accepted plan bytes.
