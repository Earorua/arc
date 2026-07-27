import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "../../app/page";

afterEach(cleanup);

describe("Arc home", () => {
  it("presents one promise, one primary action, and the product loop", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Learn only what moves you forward/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Build my precise path/i }),
    ).toHaveAttribute("href", "/setup");
    expect(screen.getByText("Understand")).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Prove")).toBeInTheDocument();
  });

  it("marks each bilingual part with its spoken language", () => {
    render(<Home />);

    const heroHeading = screen.getByRole("heading", {
      level: 1,
      name: /Learn only what moves you forward/i,
    });
    expect(heroHeading.closest("section")).toHaveAttribute("lang", "en");
    expect(
      screen.getByText("把任意岗位拆成清晰、可信、每天都能完成的成长路径。"),
    ).toHaveAttribute("lang", "zh-CN");

    expect(
      screen.getByRole("list", { name: "Arc learning method" }),
    ).toHaveAttribute("lang", "en");
    expect(screen.getByText("看清岗位真正需要什么")).toHaveAttribute(
      "lang",
      "zh-CN",
    );

    expect(screen.getByText("01 · Method")).toHaveAttribute("lang", "en");
    expect(screen.getByRole("link", { name: /Explore the method/i })).toHaveAttribute(
      "lang",
      "en",
    );
    expect(screen.getByText("Today")).toHaveAttribute("lang", "en");
    expect(screen.getByText("Path")).toHaveAttribute("lang", "en");
    expect(screen.getByText("Proof")).toHaveAttribute("lang", "en");
    expect(
      screen.getByRole("heading", { name: /Start with direction/i }).closest("section"),
    ).toHaveAttribute("lang", "en");
  });
});
