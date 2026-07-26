import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "../../app/page";

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
});
