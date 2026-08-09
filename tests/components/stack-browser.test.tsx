import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { StackBrowser } from "../../app/components/stack/stack-browser";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";

afterEach(cleanup);

describe("StackBrowser", () => {
  it("filters canonical skills and reveals complete resource evidence", async () => {
    const user = userEvent.setup();

    render(<StackBrowser blueprint={flagshipBlueprint} />);

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
    expect(within(structuredContracts!).getByText("Confidence")).toBeInTheDocument();
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
    render(<StackBrowser blueprint={flagshipBlueprint} />);

    screen.getAllByRole("article").forEach((skill) => {
      const mastery = within(skill).getByRole("list", { name: "Mastery criteria" });
      const resources = within(skill).getByRole("list", { name: "Learning resources" });

      expect(within(mastery).getAllByRole("listitem")).toHaveLength(2);
      expect(within(resources).getAllByRole("link").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("resolves prerequisite names instead of exposing internal ids", () => {
    render(<StackBrowser blueprint={flagshipBlueprint} />);

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

    render(<StackBrowser blueprint={blueprint} />);

    const evidence = screen.getByRole("list", { name: "Learning resources" });
    expect(within(evidence).getByText("Resource metadata unavailable")).toBeInTheDocument();
    expect(within(evidence).queryByRole("link")).not.toBeInTheDocument();
  });
});
