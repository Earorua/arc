import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import NotFound from "../../app/not-found";

afterEach(cleanup);
it("gives an unknown route the Arc identity and safe recovery destinations", () => {
  render(<NotFound />);
  expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  expect(screen.getByRole("heading", { name: "We couldn't find this page." })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Arc. home" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Back to today" })).toHaveAttribute("href", "/today");
  expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
});
