import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StackBrowser } from "../../app/components/stack/stack-browser";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import type { SkillEvidenceProjection } from "../../app/contracts/proof-ledger";

afterEach(cleanup);

describe("StackBrowser", () => {
  const emptyEvidence = { evidence: [], projections: [] };

  it("filters canonical skills and reveals complete resource evidence", async () => {
    const user = userEvent.setup();

    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);

    const ai = screen.getByRole("button", { name: "AI" });
    await user.click(ai);

    expect(ai).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Structured LLM Contracts" })).toBeInTheDocument();
    expect(screen.queryByText("React 19")).not.toBeInTheDocument();

    const skills = screen.getAllByRole("article");
    expect(skills).toHaveLength(2);
    const structuredContracts = screen
      .getByRole("heading", { name: "Structured LLM Contracts" })
      .closest("article");

    expect(structuredContracts).not.toBeNull();
    expect(within(structuredContracts!).getByText("Claim confidence")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("Free")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("English")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("Primary source")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("Documentation")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("Verified 2026-07-26")).toBeInTheDocument();
    expect(
      within(structuredContracts!).getByRole("link", { name: /official documentation/i }),
    ).toHaveAttribute("rel", "noreferrer");
  });

  it("gives every rendered skill two mastery criteria and a learning-resource link", () => {
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);

    screen.getAllByRole("article").forEach((skill) => {
      const mastery = within(skill).getByRole("list", { name: "Mastery criteria" });
      const resources = within(skill).getByRole("list", { name: "Learning resources" });

      expect(within(mastery).getAllByRole("listitem")).toHaveLength(2);
      expect(within(resources).getAllByRole("link").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("resolves prerequisite names instead of exposing internal ids", () => {
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);

    const foundation = screen.getByRole("heading", { name: "Web Platform" }).closest("article");
    const react = screen.getByRole("heading", { name: "React 19" }).closest("article");

    expect(foundation).not.toBeNull();
    expect(within(foundation!).getByText("Prerequisites")).toBeInTheDocument();
    expect(within(foundation!).getByText("None")).toBeInTheDocument();
    expect(within(react!).getByText("Web Platform, TypeScript")).toBeInTheDocument();
    expect(within(react!).queryByText("web-platform, typescript")).not.toBeInTheDocument();
  });

  it("degrades truthfully when linked resource metadata cannot resolve", () => {
    const skill = {
      ...flagshipBlueprint.skills[0],
      resourceIds: ["missing-resource"],
    };
    const blueprint = {
      ...flagshipBlueprint,
      skills: [skill],
    };

    render(<StackBrowser blueprint={blueprint} {...emptyEvidence} />);

    const evidence = screen.getByRole("list", { name: "Learning resources" });
    expect(within(evidence).getByText("Resource metadata unavailable")).toBeInTheDocument();
    expect(within(evidence).queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders repeated mastery and resource occurrences without duplicate React keys", () => {
    const repeatedCriterion = flagshipBlueprint.skills[0].masteryCriteria[0];
    const repeatedResourceId = flagshipBlueprint.skills[0].resourceIds[0];
    const repeatedResource = flagshipBlueprint.resources.find(
      (resource) => resource.id === repeatedResourceId,
    );

    if (!repeatedResource) throw new Error("Repeated-resource fixture is incomplete");

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(
        <StackBrowser
          blueprint={{
            ...flagshipBlueprint,
            skills: [{
              ...flagshipBlueprint.skills[0],
              masteryCriteria: [repeatedCriterion, repeatedCriterion],
              resourceIds: [repeatedResourceId, repeatedResourceId],
            }],
          }}
          {...emptyEvidence}
        />,
      );

      expect(screen.getAllByText(repeatedCriterion)).toHaveLength(2);
      expect(screen.getAllByRole("link", { name: repeatedResource.title })).toHaveLength(2);
      expect(
        consoleError.mock.calls.filter(([message]) =>
          String(message).includes("Encountered two children with the same key")),
      ).toHaveLength(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("renders distinct mastery claims and multilingual evidence for every linked resource", () => {
    const skill = flagshipBlueprint.skills.find((candidate) => candidate.id === "llm-contracts")!;
    const primaryResource = flagshipBlueprint.resources.find(
      (resource) => resource.id === skill.resourceIds[0],
    )!;
    const translatedResource = {
      ...primaryResource,
      id: "llm-contracts-field-guide",
      title: "Structured LLM Contracts field guide",
      url: "https://example.com/structured-llm-contracts-zh",
      provider: "Arc Learning Lab",
      language: "zh-CN" as const,
      cost: "mixed" as const,
      sourceTier: "institutional" as const,
      format: "guide" as const,
      purpose: "alternative" as const,
    };

    render(
      <StackBrowser
        blueprint={{
          ...flagshipBlueprint,
          skills: [{
            ...skill,
            resourceIds: [primaryResource.id, translatedResource.id],
          }],
          resources: [primaryResource, translatedResource],
        }}
        {...emptyEvidence}
      />,
    );

    expect(screen.getByText(skill.masteryCriteria[0])).toBeInTheDocument();
    expect(screen.getByText(skill.masteryCriteria[1])).toBeInTheDocument();

    const primaryLink = screen.getByRole("link", { name: primaryResource.title });
    expect(primaryLink).toHaveAttribute("href", primaryResource.url);
    expect(primaryLink).toHaveAttribute("target", "_blank");
    expect(primaryLink).toHaveAttribute("rel", "noreferrer");

    const translatedLink = screen.getByRole("link", { name: translatedResource.title });
    expect(translatedLink).toHaveAttribute("href", translatedResource.url);
    expect(translatedLink).toHaveAttribute("target", "_blank");
    expect(translatedLink).toHaveAttribute("rel", "noreferrer");
    expect(translatedLink).toHaveAttribute("lang", "zh-CN");
    expect(screen.getByText("Arc Learning Lab")).toBeInTheDocument();
    expect(screen.getByText("Chinese (Simplified)")).toBeInTheDocument();
    expect(screen.getByText("Free and paid")).toBeInTheDocument();
    expect(screen.getByText("Institutional source")).toBeInTheDocument();
    expect(screen.getByText("Guide")).toBeInTheDocument();
  });

  it("shows canonical learner status, evidence facts, and deterministic next actions", () => {
    const projections: SkillEvidenceProjection[] = [
      { skillId: "web-platform", audience: "internal", status: "exploring", completedUnitIds: [], strongestProofId: null, strongestVersionId: null, latestUsedAt: null },
      { skillId: "typescript", audience: "internal", status: "practicing", completedUnitIds: ["unit-1", "unit-2"], strongestProofId: null, strongestVersionId: null, latestUsedAt: "2026-08-20T10:00:00.000Z" },
      { skillId: "react", audience: "internal", status: "demonstrated", completedUnitIds: ["unit-3"], strongestProofId: "proof-react", strongestVersionId: "version-react", latestUsedAt: "2026-08-21T10:00:00.000Z" },
      { skillId: "design-systems", audience: "internal", status: "verified", completedUnitIds: [], strongestProofId: "proof-design", strongestVersionId: "version-design", latestUsedAt: "2026-08-22T10:00:00.000Z" },
    ];
    render(<StackBrowser blueprint={flagshipBlueprint} projections={projections} evidence={[
      { proofId: "proof-react", versionId: "version-react", title: "Accessible request trace" },
      { proofId: "proof-design", versionId: "version-design", title: "Keyboard-safe design system" },
    ]} />);

    const exploring = screen.getByRole("heading", { name: "Web Platform" }).closest("article")!;
    const practicing = screen.getByRole("heading", { name: "TypeScript" }).closest("article")!;
    const demonstrated = screen.getByRole("heading", { name: "React 19" }).closest("article")!;
    const verified = screen.getByRole("heading", { name: "Accessible Design Systems" }).closest("article")!;
    expect(within(exploring).getByText("Exploring")).toBeInTheDocument();
    expect(within(exploring).getByRole("link", { name: "Start Today" })).toHaveAttribute("href", "/today");
    expect(within(practicing).getByText("Practicing")).toBeInTheDocument();
    expect(within(practicing).getByText("2 completed units")).toBeInTheDocument();
    expect(within(practicing).getByRole("link", { name: "Continue Today" })).toHaveAttribute("href", "/today");
    expect(within(demonstrated).getByText("Demonstrated")).toBeInTheDocument();
    expect(within(demonstrated).getByRole("link", { name: "Accessible request trace" })).toHaveAttribute("href", "/proof?proof=proof-react");
    expect(within(demonstrated).getByRole("link", { name: "Add stronger proof" })).toBeInTheDocument();
    expect(within(verified).getByText("Verified")).toBeInTheDocument();
    expect(within(verified).getByRole("link", { name: "Maintain evidence" })).toBeInTheDocument();
    expect(within(verified).getByText("90% claim confidence")).toBeInTheDocument();
  });

  it("degrades unresolved strongest evidence without exposing internal identifiers", () => {
    const projection: SkillEvidenceProjection = {
      skillId: "react", audience: "internal", status: "demonstrated", completedUnitIds: [],
      strongestProofId: "secret-proof-id", strongestVersionId: "secret-version-id", latestUsedAt: null,
    };
    render(<StackBrowser blueprint={{ ...flagshipBlueprint, skills: [flagshipBlueprint.skills[2]] }} projections={[projection]} evidence={[]} />);
    expect(screen.getByText("Evidence unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/secret-proof-id|secret-version-id/u)).not.toBeInTheDocument();
  });
});
