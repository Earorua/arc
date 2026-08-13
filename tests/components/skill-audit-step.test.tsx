import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { createSkillAuditDraft, SkillAuditStep } from "../../app/components/setup/skill-audit-step";

afterEach(cleanup);

describe("SkillAuditStep", () => {
  it("renders the complete grouped self-assessment and supports quick-set plus override", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draft = createSkillAuditDraft(flagshipBlueprint);
    const { rerender } = render(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);

    expect(screen.getAllByRole("group", { name: /self-assessment$/i })).toHaveLength(16);
    expect(screen.getAllByRole("group", { name: /skills$/i })).toHaveLength(8);
    expect(screen.getByText(/Self-assessment, not Arc verification/i)).toBeInTheDocument();
    expect(screen.queryByText(/Verified|Demonstrated/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Set Foundations to Guided" }));
    const quickSetDraft = onChange.mock.lastCall?.[0];
    rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={quickSetDraft} />);
    const webPlatform = screen.getByRole("group", { name: "Web Platform self-assessment" });
    expect(within(webPlatform).getByRole("radio", { name: "Guided" })).toBeChecked();
    await user.click(within(webPlatform).getByRole("radio", { name: "Independent" }));
    expect(onChange.mock.lastCall?.[0].levels["web-platform"]).toBe("independent");
  });

  it("validates optional public evidence and caps each skill at three rows", async () => {
    const user = userEvent.setup();
    let draft = createSkillAuditDraft(flagshipBlueprint);
    const onChange = vi.fn((next) => { draft = next; });
    const view = render(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    const add = screen.getByRole("button", { name: "Add evidence link for Web Platform" });

    await user.click(add);
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    const url = screen.getByLabelText("Web Platform evidence URL 1");
    await user.type(url, "http://localhost/private");
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    expect(screen.getByRole("alert")).toHaveTextContent("public HTTPS");
    expect(url).toHaveAttribute("aria-describedby");
    expect(screen.getByLabelText("Web Platform evidence note 1")).toHaveAttribute("maxlength", "300");

    await user.clear(url);
    await user.type(url, "https://example.com/work");
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    await user.click(screen.getByRole("button", { name: "Add evidence link for Web Platform" }));
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    await user.click(screen.getByRole("button", { name: "Add evidence link for Web Platform" }));
    view.rerender(<SkillAuditStep blueprint={flagshipBlueprint} onChange={onChange} value={draft} />);
    expect(screen.getAllByLabelText(/Web Platform evidence URL/)).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Add evidence link for Web Platform" })).toBeDisabled();
  });
});
