import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IntelligencePage from "../../app/intelligence/page";
import MethodPage from "../../app/method/page";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

afterEach(cleanup);

describe("public trust pages", () => {
  it("explains the deterministic learning loop", () => {
    render(<MethodPage />);
    const heading = screen.getByRole("heading", { name: /A path is a decision system/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("lang", "en");
    expect(screen.getByText(/Understand → Build → Prove/i)).toBeInTheDocument();
  });

  it("redirects the retired public intelligence page to the account skill workspace", () => {
    expect(() => IntelligencePage()).toThrow("redirect:/stack");
    expect(redirect).toHaveBeenCalledWith("/stack");
  });
});
