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
    expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue(" RESPONSIVE ");
    expect(screen.getAllByRole("button", { name: /^查看 / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "查看 React 19" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "AI" }));
    expect(new URLSearchParams(window.location.search).get("q")).toBe(" RESPONSIVE ");
    expect(screen.getByRole("status")).toHaveTextContent("没有匹配的技能");
    expect(screen.queryByRole("button", { name: /^查看 / })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除搜索" }));
    expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("");
    expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveFocus();
    expect(window.location.search).toBe("?category=ai");
    expect(screen.getAllByRole("button", { name: /^查看 / })).toHaveLength(2);
  });

  it("replaces query history while typing and keeps keyboard focus when searching from a detail", async () => {
    const user = userEvent.setup();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    await user.click(screen.getByRole("button", { name: "查看 Web Platform" }));
    const length = window.history.length;
    const search = screen.getByRole("searchbox", { name: "搜索技能" });
    await user.type(search, "react 19");
    expect(window.history.length).toBe(length);
    expect(new URLSearchParams(window.location.search).get("q")).toBe("react 19");
    expect(new URLSearchParams(window.location.search).has("skill")).toBe(false);
    expect(search).toHaveFocus();
    expect(screen.getAllByRole("button", { name: /^查看 / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "查看 React 19" })).toBeInTheDocument();
  });

  it("searches only current blueprint skill names and descriptions", () => {
    const blueprint = { ...flagshipBlueprint, skills: flagshipBlueprint.skills.filter(({ id }) => id === "react") };
    render(<StackBrowser blueprint={blueprint} {...emptyEvidence} />);
    const search = screen.getByRole("searchbox", { name: "搜索技能" });
    fireEvent.change(search, { target: { value: "SQL" } });
    expect(screen.queryByRole("button", { name: /^查看 / })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "official documentation" } });
    expect(screen.queryByRole("button", { name: /^查看 / })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "ReAcT" } });
    expect(screen.getByRole("button", { name: "查看 React 19" })).toBeInTheDocument();
  });

  it("preserves search, category, scroll and focus when returning from a selected skill", () => {
    window.history.replaceState(null, "", "/stack?category=frontend&q=react");
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    const list = screen.getByRole("list", { name: "技能索引" });
    list.scrollTop = 90;
    fireEvent.click(screen.getByRole("button", { name: "查看 React 19" }));
    expect(window.location.search).toBe("?category=frontend&q=react&skill=react");
    fireEvent.click(screen.getByRole("button", { name: "返回技能列表" }));
    expect(window.location.search).toBe("?category=frontend&q=react");
    expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("react");
    expect(list.scrollTop).toBe(90);
    expect(screen.getByRole("button", { name: "查看 React 19" })).toHaveFocus();
  });

  it("restores searched selections through native Back, Forward and remount", async () => {
    window.history.replaceState(null, "", "/stack?category=frontend&q=react");
    const view = render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "查看 React 19" }));
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("button", { name: "查看 React 19" })).toHaveFocus());
    expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("react");
    expect(screen.getByRole("button", { name: "前端" })).toHaveAttribute("aria-pressed", "true");
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("heading", { name: "React 19" })).toHaveFocus());
    view.unmount();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("react");
    expect(screen.getByRole("heading", { name: "React 19" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^查看 / })).toHaveLength(1);
  });

  it("updates the search field and results when Back and Forward restore different queries", async () => {
    window.history.replaceState(null, "", "/stack?q=react");
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "前端" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "keyboard-safe" } });
    expect(screen.getByRole("button", { name: "查看 Accessible Design Systems" })).toBeInTheDocument();
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("react"));
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "查看 React 19" })).toBeInTheDocument();
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("keyboard-safe"));
    expect(screen.getByRole("button", { name: "前端" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "查看 Accessible Design Systems" })).toBeInTheDocument();
  });

  it("returns focus to search when a detail deep link returns to an empty search result", () => {
    window.history.replaceState(null, "", "/stack?category=frontend&q=unmatched&skill=react");
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "返回技能列表" }));
    expect(window.location.search).toBe("?category=frontend&q=unmatched");
    expect(screen.getByRole("status")).toHaveTextContent("没有匹配的技能");
    expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveFocus();
  });

  it("keeps a valid selection through filtering and returns focus to its index control", async () => {
    const user = userEvent.setup();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);
    const react = screen.getByRole("button", { name: "查看 React 19" });
    await user.click(react);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "React 19" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "返回技能列表" }));
    expect(react).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "前端" }));
    expect(react).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.queryByRole("heading", { name: "React 19" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Structured LLM Contracts" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "全部" }));
    expect(screen.getByRole("button", { name: "查看 Structured LLM Contracts" })).toHaveAttribute("aria-pressed", "true");
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
    expect(screen.getAllByRole("button", { name: /^查看 / })).toHaveLength(2);
    const structuredContracts = screen
      .getByRole("heading", { name: "Structured LLM Contracts" })
      .closest("article");

    expect(structuredContracts).not.toBeNull();
    expect(within(structuredContracts!).queryByText(/claim confidence/i)).not.toBeInTheDocument();
    expect(within(structuredContracts!).getByText("免费")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("英语")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("一手来源")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("文档")).toBeInTheDocument();
    expect(within(structuredContracts!).getByText("2026-07-26")).toBeInTheDocument();
    expect(
      within(structuredContracts!).getByRole("link", { name: /official documentation/i }),
    ).toHaveAttribute("rel", "noreferrer");
  });

  it("gives every selected skill two mastery criteria and a learning-resource link", async () => {
    const user = userEvent.setup();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);

    for (const sourceSkill of flagshipBlueprint.skills) {
      await user.click(screen.getByRole("button", { name: `查看 ${sourceSkill.name}` }));
      const skill = screen.getByRole("article");
      const mastery = within(skill).getByRole("list", { name: "掌握标准" });
      const resources = within(skill).getByRole("list", { name: "学习资料" });

      expect(within(mastery).getAllByRole("listitem")).toHaveLength(2);
      expect(within(resources).getAllByRole("link").length).toBeGreaterThanOrEqual(1);
    }
  });

  it("resolves prerequisite names instead of exposing internal ids", async () => {
    const user = userEvent.setup();
    render(<StackBrowser blueprint={flagshipBlueprint} {...emptyEvidence} />);

    const foundation = screen.getByRole("heading", { name: "Web Platform" }).closest("article");

    expect(foundation).not.toBeNull();
    expect(within(foundation!).getByText("前置技能")).toBeInTheDocument();
    expect(within(foundation!).getByText("无")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看 React 19" }));
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

    const evidence = screen.getByRole("list", { name: "学习资料" });
    expect(within(evidence).getByText("资料信息暂不可用")).toBeInTheDocument();
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
    expect(screen.getByText("简体中文")).toBeInTheDocument();
    expect(screen.getByText("免费与付费")).toBeInTheDocument();
    expect(screen.getByText("机构来源")).toBeInTheDocument();
    expect(screen.getByText("指南")).toBeInTheDocument();
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
    expect(within(exploring).getByText("待探索")).toBeInTheDocument();
    expect(within(exploring).getByRole("link", { name: "查看技能路线" })).toHaveAttribute("href", "/path?skill=web-platform");
    await user.click(screen.getByRole("button", { name: "查看 TypeScript" }));
    const practicing = screen.getByRole("article");
    expect(within(practicing).getByText("练习中")).toBeInTheDocument();
    expect(within(practicing).getByText("已完成 2 个学习单元")).toBeInTheDocument();
    expect(within(practicing).getByRole("link", { name: "查看技能路线" })).toHaveAttribute("href", "/path?skill=typescript");
    await user.click(screen.getByRole("button", { name: "查看 React 19" }));
    const demonstrated = screen.getByRole("article");
    expect(within(demonstrated).getByText("已有作品证明")).toBeInTheDocument();
    await user.click(within(demonstrated).getByText("技能要求与学习记录"));
    expect(within(demonstrated).getByRole("link", { name: "Accessible request trace" })).toHaveAttribute("href", "/proof?proof=proof-react");
    expect(within(demonstrated).getByRole("link", { name: "补充作品证明" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看 Accessible Design Systems" }));
    const verified = screen.getByRole("article");
    expect(within(verified).getByText("已通过验证")).toBeInTheDocument();
    expect(within(verified).getByRole("link", { name: "维护作品证明" })).toBeInTheDocument();
    expect(screen.queryAllByText(/claim confidence/i)).toHaveLength(0);
  });

  it("degrades unresolved strongest evidence without exposing internal identifiers", () => {
    const projection: SkillEvidenceProjection = {
      skillId: "react", audience: "internal", status: "demonstrated", completedUnitIds: [],
      strongestProofId: "secret-proof-id", strongestVersionId: "secret-version-id", latestUsedAt: null,
    };
    render(<StackBrowser blueprint={{ ...flagshipBlueprint, skills: [flagshipBlueprint.skills[2]] }} projections={[projection]} evidence={[]} />);
    expect(screen.getByText("作品信息暂不可用")).toBeInTheDocument();
    expect(screen.queryByText(/secret-proof-id|secret-version-id/u)).not.toBeInTheDocument();
  });
});
