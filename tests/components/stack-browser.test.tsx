import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackBrowser } from "../../app/components/stack/stack-browser";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import type { SkillEvidenceProjection } from "../../app/contracts/proof-ledger";

beforeEach(() => window.history.replaceState(null, "", "/stack"));
afterEach(cleanup);

describe("StackBrowser", () => {
  const emptyEvidence = { evidence: [], projections: [] };

  it("restores search from the URL and combines skill description matching with category filters", async () => {
    window.history.replaceState(null, "", "/stack?category=frontend&q=%20RESPONSIVE%20");
    const user = userEvent.setup();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    expect(screen.getByRole("searchbox", { name: "Search skills" })).toHaveValue(" RESPONSIVE ");
    expect(screen.getAllByRole("button", { name: /^View / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "View React 19" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "AI" }));
    expect(new URLSearchParams(window.location.search).get("q")).toBe(" RESPONSIVE ");
    expect(screen.getByRole("status")).toHaveTextContent("No matching skills");
    expect(screen.queryByRole("button", { name: /^View / })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("searchbox", { name: "Search skills" })).toHaveValue("");
    expect(screen.getByRole("searchbox", { name: "Search skills" })).toHaveFocus();
    expect(window.location.search).toBe("?category=ai");
    expect(screen.getAllByRole("button", { name: /^View / })).toHaveLength(2);
  });

  it("replaces query history while typing and keeps keyboard focus when searching from a detail", async () => {
    const user = userEvent.setup();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    await user.click(screen.getByRole("button", { name: "View Web Platform" }));
    const length = window.history.length;
    const search = screen.getByRole("searchbox", { name: "Search skills" });
    await user.type(search, "react 19");
    expect(window.history.length).toBe(length);
    expect(new URLSearchParams(window.location.search).get("q")).toBe("react 19");
    expect(new URLSearchParams(window.location.search).has("skill")).toBe(false);
    expect(search).toHaveFocus();
    expect(screen.getAllByRole("button", { name: /^View / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "View React 19" })).toBeInTheDocument();
  });

  it("searches only current blueprint skill names and descriptions", () => {
    const blueprint = { ...flagshipBlueprint, skills: flagshipBlueprint.skills.filter(({ id }) => id === "react") };
    render(<StackBrowser blueprint={blueprint} {...emptyEvidence} />);
    const search = screen.getByRole("searchbox", { name: "Search skills" });
    fireEvent.change(search, { target: { value: "SQL" } });
    expect(screen.queryByRole("button", { name: /^View / })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "official documentation" } });
    expect(screen.queryByRole("button", { name: /^View / })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "ReAcT" } });
    expect(screen.getByRole("button", { name: "View React 19" })).toBeInTheDocument();
  });

  it("preserves search, category, scroll and focus when returning from a selected skill", () => {
    window.history.replaceState(null, "", "/stack?category=frontend&q=react");
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    const list = screen.getByRole("list", { name: "Skill index" });
    list.scrollTop = 90;
    fireEvent.click(screen.getByRole("button", { name: "View React 19" }));
    expect(window.location.search).toBe("?category=frontend&q=react&skill=react");
    fireEvent.click(screen.getByRole("button", { name: "Back to skills" }));
    expect(window.location.search).toBe("?category=frontend&q=react");
    expect(screen.getByRole("searchbox", { name: "Search skills" })).toHaveValue("react");
    expect(list.scrollTop).toBe(90);
    expect(screen.getByRole("button", { name: "View React 19" })).toHaveFocus();
  });

  it("restores searched selections through native Back, Forward and remount", async () => {
    window.history.replaceState(null, "", "/stack?category=frontend&q=react");
    const view = render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "View React 19" }));
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("button", { name: "View React 19" })).toHaveFocus());
    expect(screen.getByRole("searchbox", { name: "Search skills" })).toHaveValue("react");
    expect(screen.getByRole("button", { name: "Frontend" })).toHaveAttribute("aria-pressed", "true");
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("heading", { name: "React 19" })).toHaveFocus());
    view.unmount();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    expect(screen.getByRole("searchbox", { name: "Search skills" })).toHaveValue("react");
    expect(screen.getByRole("heading", { name: "React 19" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^View / })).toHaveLength(1);
  });

  it("updates the search field and results when Back and Forward restore different queries", async () => {
    window.history.replaceState(null, "", "/stack?q=react");
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "Frontend" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search skills" }), { target: { value: "keyboard-safe" } });
    expect(screen.getByRole("button", { name: "View Accessible Design Systems" })).toBeInTheDocument();
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search skills" })).toHaveValue("react"));
    expect(screen.getByRole("button", { name: "All categories" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "View React 19" })).toBeInTheDocument();
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search skills" })).toHaveValue("keyboard-safe"));
    expect(screen.getByRole("button", { name: "Frontend" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "View Accessible Design Systems" })).toBeInTheDocument();
  });

  it("returns focus to search when a detail deep link returns to an empty search result", () => {
    window.history.replaceState(null, "", "/stack?category=frontend&q=unmatched&skill=react");
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to skills" }));
    expect(window.location.search).toBe("?category=frontend&q=unmatched");
    expect(screen.getByRole("status")).toHaveTextContent("No matching skills");
    expect(screen.getByRole("searchbox", { name: "Search skills" })).toHaveFocus();
  });

  it("keeps a valid selection through filtering and returns focus to its index control", async () => {
    const user = userEvent.setup();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    const react = screen.getByRole("button", { name: "View React 19" });
    await user.click(react);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "React 19" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Back to skills" }));
    expect(react).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Frontend" }));
    expect(react).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.queryByRole("heading", { name: "React 19" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Structured LLM Contracts" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All categories" }));
    expect(screen.getByRole("button", { name: "View Structured LLM Contracts" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters canonical skills and reveals complete resource evidence", async () => {
    const user = userEvent.setup();

    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);

    const ai = screen.getByRole("button", { name: "AI" });
    await user.click(ai);

    expect(ai).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Structured LLM Contracts" })).toBeInTheDocument();
    expect(screen.queryByText("React 19")).not.toBeInTheDocument();

    const skills = screen.getAllByRole("article");
    expect(skills).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^View / })).toHaveLength(2);
    const structuredContracts = screen
      .getByRole("heading", { name: "Structured LLM Contracts" })
      .closest("article");

    expect(structuredContracts).not.toBeNull();
    expect(within(structuredContracts!).queryByText(/claim confidence/i)).not.toBeInTheDocument();
    expect(within(structuredContracts!).getByText("Free")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("English")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("Primary")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("Documentation")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("2026-07-26")).toBeInTheDocument();
    expect(
      within(structuredContracts!).getByRole("link", { name: /official documentation/i }),
    ).toHaveAttribute("rel", "noreferrer");
  });

  it("gives every selected skill two mastery criteria and a learning-resource link", async () => {
    const user = userEvent.setup();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);

    for (const sourceSkill of flagshipBlueprint.skills) {
      await user.click(screen.getByRole("button", { name: `View ${sourceSkill.name}` }));
      const skill = screen.getByRole("article");
      const mastery = within(skill).getByRole("list", { name: "Mastery criteria" });
      const resources = within(skill).getByRole("list", { name: "Learning resources" });

      expect(within(mastery).getAllByRole("listitem")).toHaveLength(2);
      expect(within(resources).getAllByRole("link").length).toBeGreaterThanOrEqual(1);
    }
  });

  it("resolves prerequisite names instead of exposing internal ids", async () => {
    const user = userEvent.setup();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);

    const foundation = screen.getByRole("heading", { name: "Web Platform" }).closest("article");

    expect(foundation).not.toBeNull();
    expect(within(foundation!).getByText("Prerequisites")).toBeInTheDocument();
    expect(within(foundation!).getByText("None")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View React 19" }));
    const react = screen.getByRole("article");
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
    expect(within(evidence).getByText("Resource details are temporarily unavailable")).toBeInTheDocument();
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
    expect(screen.getByText(/Arc Learning Lab/)).toBeInTheDocument();
    expect(screen.getByText("Simplified Chinese")).toBeInTheDocument();
    expect(screen.getByText("Free and paid")).toBeInTheDocument();
    expect(screen.getByText("Institutional")).toBeInTheDocument();
    expect(screen.getByText("Guide")).toBeInTheDocument();
  });

  it("shows canonical learner status, evidence facts, and deterministic next actions", async () => {
    const user = userEvent.setup();
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
    expect(within(exploring).getByText("Exploring")).toBeInTheDocument();
    expect(within(exploring).getByRole("link", { name: "View skill path" })).toHaveAttribute("href", "/path?skill=web-platform");
    await user.click(screen.getByRole("button", { name: "View TypeScript" }));
    const practicing = screen.getByRole("article");
    expect(within(practicing).getByText("Practicing")).toBeInTheDocument();
    expect(within(practicing).getByText("2 learning units complete")).toBeInTheDocument();
    expect(within(practicing).getByRole("link", { name: "View skill path" })).toHaveAttribute("href", "/path?skill=typescript");
    await user.click(screen.getByRole("button", { name: "View React 19" }));
    const demonstrated = screen.getByRole("article");
    expect(within(demonstrated).getByText("Demonstrated")).toBeInTheDocument();
    await user.click(within(demonstrated).getByText("Skill requirements and progress"));
    expect(within(demonstrated).getByRole("link", { name: "Accessible request trace" })).toHaveAttribute("href", "/proof?proof=proof-react&returnTo=%2Fstack%3Fskill%3Dreact");
    expect(within(demonstrated).getByRole("link", { name: "Add to your proof" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Accessible Design Systems" }));
    const verified = screen.getByRole("article");
    expect(within(verified).getByText("Verified")).toBeInTheDocument();
    expect(within(verified).getByRole("link", { name: "Maintain your proof" })).toBeInTheDocument();
    expect(screen.queryAllByText(/claim confidence/i)).toHaveLength(0);
  });

  it("degrades unresolved strongest evidence without exposing internal identifiers", () => {
    const projection: SkillEvidenceProjection = {
      skillId: "react", audience: "internal", status: "demonstrated", completedUnitIds: [],
      strongestProofId: "secret-proof-id", strongestVersionId: "secret-version-id", latestUsedAt: null,
    };
    render(<StackBrowser blueprint={{ ...flagshipBlueprint, skills: [flagshipBlueprint.skills[2]] }} projections={[projection]} evidence={[]} />);
    expect(screen.getByText("Proof details are temporarily unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/secret-proof-id|secret-version-id/u)).not.toBeInTheDocument();
  });
});
