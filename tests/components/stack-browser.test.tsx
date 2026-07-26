import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { StackBrowser } from "../../app/components/stack/stack-browser";
import { flagshipRole } from "../../app/data/flagship-role";

afterEach(cleanup);

describe("StackBrowser", () => {
  it("reveals importance, confidence, and source evidence", async () => {
    const user = userEvent.setup();

    render(<StackBrowser skills={flagshipRole.skills} />);

    const ai = screen.getByRole("button", { name: "AI" });
    await user.click(ai);

    expect(ai).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Structured LLM Contracts")).toBeInTheDocument();
    expect(screen.queryByText("React 19")).not.toBeInTheDocument();

    const skills = screen.getAllByRole("article");
    expect(skills).toHaveLength(2);
    skills.forEach((skill) => {
      expect(within(skill).getByText("Confidence")).toBeInTheDocument();
      expect(within(skill).getByRole("link", { name: /official documentation/i })).toBeInTheDocument();
    });
  });

  it("degrades truthfully when a skill has no source", () => {
    render(<StackBrowser skills={[{ ...flagshipRole.skills[0], sources: [] }]} />);

    expect(screen.getByText("Source unavailable")).toBeInTheDocument();
  });
});
