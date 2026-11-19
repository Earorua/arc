import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { createSkillAuditDraft, isSkillAuditDraftValid, SkillAuditStep, type SkillAuditDraft } from "../../app/components/setup/skill-audit-step";

afterEach(cleanup);

describe("SkillAuditStep", () => {
  it("offers uncertainty separately from unseen and preserves evidence when selected", async () => {
    const user = userEvent.setup();
    const draft = createSkillAuditDraft(flagshipBlueprint);
    draft.evidence["web-platform"] = [{ id: "evidence-web-platform-1", kind: "project", url: "https://example.com/work", note: "Existing work" }];
    const onChange = vi.fn();
    const view = render(<SkillAuditStep blueprint={flagshipBlueprint} value={draft} onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Web Platform self-assessment" });
    expect(within(group).getByRole("radio", { name: "Not started" })).toBeChecked();
    await user.click(within(group).getByRole("radio", { name: "Uncertain" }));
    const next: SkillAuditDraft = onChange.mock.lastCall![0];
    expect(next.levels["web-platform"]).toBe("uncertain");
    expect(next.evidence).toEqual(draft.evidence);
    expect(isSkillAuditDraftValid(flagshipBlueprint, next)).toBe(true);
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} value={next} onChange={onChange} />);
    expect(within(group).getByRole("radio", { name: "Uncertain" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Not started" })).not.toBeChecked();
    expect(screen.getByText(/Uncertain skills start with a calibration task/)).toHaveTextContent(/completing it does not establish mastery or remove later learning/);
    expect(screen.getByLabelText("Web Platform Evidence link 1")).toHaveValue("https://example.com/work");
  });

  it("shows only the populated category and actual skill for a sparse research blueprint", async () => {
    const blueprint = {
      ...flagshipBlueprint,
      id: "data-product-manager",
      name: "Data Product Manager",
      skills: [{ ...flagshipBlueprint.skills.find(({ id }) => id === "sql")!, id: "data-modeling", name: "Data modeling" }],
    };
    render(<SkillAuditStep blueprint={blueprint} onChange={vi.fn()} value={createSkillAuditDraft(blueprint)} />);

    expect(screen.getAllByRole("group", { name: / skills$/ })).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Data skills" })).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: /self-assessment$/ })).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Data modeling self-assessment" })).toHaveAttribute("aria-describedby", "audit-disclosure");
    await userEvent.click(screen.getByText("Data bulk settings"));
    expect(screen.getAllByRole("button", { name: /^Set / })).toHaveLength(5);
    await userEvent.click(screen.getByText("Add evidence (optional)"));
    expect(screen.getAllByRole("button", { name: /^Add evidence link for .*$/ })).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "Foundations skills" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set Foundations to Need guidance" })).not.toBeInTheDocument();
  });

  it("keeps category order and quick-set draft boundaries when other categories are absent", async () => {
    const user = userEvent.setup();
    const blueprint = {
      ...flagshipBlueprint,
      skills: ["sql", "web-platform", "object-storage"].map((id) => flagshipBlueprint.skills.find((skill) => skill.id === id)!),
    };
    const draft = createSkillAuditDraft(blueprint);
    draft.evidence.sql = [{ id: "evidence-sql-1", kind: "project", url: "https://example.com/model", note: "Model evidence" }];
    const onChange = vi.fn();
    const view = render(<SkillAuditStep blueprint={blueprint} onChange={onChange} value={draft} />);

    const dataSummary = screen.getByText("Data skills", { selector: "summary" });
    if (!(dataSummary.parentElement as HTMLDetailsElement).open) await user.click(dataSummary);
    expect(screen.getAllByRole("group", { name: / skills$/ }).map((group) => group.querySelector("legend")?.textContent)).toEqual(["Foundations skills", "Data skills"]);
    await user.click(screen.getByText("Data bulk settings"));
    await user.click(screen.getByRole("button", { name: "Set Data to Need guidance" }));
    const dataDraft: SkillAuditDraft = onChange.mock.lastCall![0];
    expect(dataDraft.levels).toEqual({ sql: "guided", "web-platform": "unseen", "object-storage": "guided" });
    expect(dataDraft.evidence).toEqual(draft.evidence);
    view.rerender(<SkillAuditStep blueprint={blueprint} onChange={onChange} value={dataDraft} />);
    await user.click(screen.getByText("Foundations bulk settings"));
    await user.click(screen.getByRole("button", { name: "Set Foundations to Independent" }));
    const foundationsDraft: SkillAuditDraft = onChange.mock.lastCall![0];
    expect(foundationsDraft.levels).toEqual({ sql: "guided", "web-platform": "independent", "object-storage": "guided" });
    expect(foundationsDraft.evidence).toEqual(draft.evidence);
    view.rerender(<SkillAuditStep blueprint={blueprint} onChange={onChange} value={foundationsDraft} />);
    expect(within(screen.getByRole("group", { name: "SQL & Relational Modeling self-assessment" })).getByRole("radio", { name: "Need guidance" })).toBeChecked();
    expect(within(screen.getByRole("group", { name: "Web Platform self-assessment" })).getByRole("radio", { name: "Independent" })).toBeChecked();
    expect(screen.getByLabelText("SQL & Relational Modeling Evidence link 1")).toHaveValue("https://example.com/model");
  });

  it("renders the complete grouped self-assessment and supports quick-set plus override", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draft = createSkillAuditDraft(flagshipBlueprint);
    const { rerender } = render(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);

    expect(screen.getAllByRole("group", { name: /self-assessment$/ })).toHaveLength(4);
    for (const disclosure of document.querySelectorAll<HTMLDetailsElement>("details.audit-category-disclosure")) { if (!disclosure.open) await user.click(disclosure.querySelector("summary")!); }
    expect(screen.getAllByRole("group", { name: /self-assessment$/ })).toHaveLength(16);
    expect(screen.getAllByRole("group", { name: / skills$/ })).toHaveLength(8);
    expect(screen.getAllByRole("group", { name: / skills$/ }).map((group) => group.querySelector("legend")?.textContent)).toEqual(["Foundations skills", "Frontend skills", "Backend skills", "Data skills", "Quality skills", "Cloud skills", "AI skills", "Product skills"]);
    expect(screen.getByText(/This is your self-assessment, not an Arc verification/)).toBeInTheDocument();
    expect(screen.queryByText(/Verified|Demonstrated/i)).not.toBeInTheDocument();

    await user.click(screen.getByText("Foundations bulk settings"));
    await user.click(screen.getByRole("button", { name: "Set Foundations to Need guidance" }));
    const quickSetDraft = onChange.mock.lastCall?.[0];
    rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={quickSetDraft} />);
    const webPlatform = screen.getByRole("group", { name: "Web Platform self-assessment" });
    expect(within(webPlatform).getByRole("radio", { name: "Need guidance" })).toBeChecked();
    await user.click(within(webPlatform).getByRole("radio", { name: "Independent" }));
    expect(onChange.mock.lastCall?.[0].levels["web-platform"]).toBe("independent");
  });

  it("validates optional public evidence and caps each skill at three rows", async () => {
    const user = userEvent.setup();
    let draft = createSkillAuditDraft(flagshipBlueprint);
    const onChange = vi.fn((next) => { draft = next; });
    const view = render(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    await user.click(within(screen.getByRole("group", { name: "Web Platform self-assessment" }).parentElement!).getByText("Add evidence (optional)"));
    const add = screen.getByRole("button", { name: "Add evidence link for Web Platform" });

    await user.click(add);
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    const url = screen.getByLabelText("Web Platform Evidence link 1");
    fireEvent.change(url, { target: { value: "http://localhost/private" } });
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    expect(screen.getByText("Enter a public HTTPS link.")).toBeInTheDocument();
    expect(url).toHaveAttribute("aria-describedby");
    expect(screen.getByLabelText("Web Platform Evidence note 1")).toHaveAttribute("maxlength", "300");

    fireEvent.change(url, { target: { value: "https://example.com/work" } });
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    expect(screen.getByLabelText("Web Platform Evidence link 1")).toHaveAttribute("aria-invalid", "false");
    const note = screen.getByLabelText("Web Platform Evidence note 1");
    expect(note).toHaveAttribute("aria-invalid", "true");
    expect(note).toHaveAttribute("aria-describedby", "evidence-note-error-web-platform-0");
    expect(screen.getByText("Briefly describe the content at this link.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add evidence link for Web Platform" }));
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    await user.click(screen.getByRole("button", { name: "Add evidence link for Web Platform" }));
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    expect(screen.getAllByLabelText(/Web Platform Evidence link/)).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Add evidence link for Web Platform" })).toBeDisabled();
  });

  it("allocates a free deterministic evidence ID after a middle removal", async () => {
    const user = userEvent.setup();
    const initial = createSkillAuditDraft(flagshipBlueprint);
    initial.evidence["web-platform"] = [1, 2, 3].map((suffix) => ({ id: `evidence-web-platform-${suffix}`, kind: "project", url: `https://example.com/${suffix}`, note: `Evidence ${suffix}` }));
    let latest: SkillAuditDraft = initial;
    function Harness() {
      const [draft, setDraft] = useState(initial);
      latest = draft;
      return <><SkillAuditStep blueprint={flagshipBlueprint} onChange={setDraft} value={draft} /><button disabled={!isSkillAuditDraftValid(flagshipBlueprint, draft)} type="button">Continue</button></>;
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Remove Web Platform evidence 2" }));
    await user.click(screen.getByRole("button", { name: "Add evidence link for Web Platform" }));
    const ids = latest.evidence["web-platform"]!.map(({ id }) => id);
    expect(ids).toEqual(["evidence-web-platform-1", "evidence-web-platform-3", "evidence-web-platform-2"]);
    expect(new Set(ids).size).toBe(3);
    await user.type(screen.getByLabelText("Web Platform Evidence link 3"), "https://example.com/new");
    await user.type(screen.getByLabelText("Web Platform Evidence note 3"), "Replacement evidence");
    expect(isSkillAuditDraftValid(flagshipBlueprint, latest)).toBe(true);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();

    const duplicate = createSkillAuditDraft(flagshipBlueprint);
    duplicate.evidence["web-platform"] = [{ id: "evidence-shared-1", kind: "project", url: "https://example.com/a", note: "A" }];
    duplicate.evidence.typescript = [{ id: "evidence-shared-1", kind: "project", url: "https://example.com/b", note: "B" }];
    expect(isSkillAuditDraftValid(flagshipBlueprint, duplicate)).toBe(false);
  });
});
