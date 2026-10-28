import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcApiError } from "../../app/lib/cloud-client";

const mocks = vi.hoisted(() => ({ useSession: vi.fn(), replace: vi.fn(), social: vi.fn(), loadWorkspace: vi.fn(), search: "" }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: mocks.useSession, signIn: { social: mocks.social } } }));
vi.mock("../../app/lib/planning-client", () => ({ planningClient: { loadWorkspace: mocks.loadWorkspace } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.search) }));
import SignInPage from "../../app/sign-in/page";

beforeEach(() => {
  mocks.search = "";
  mocks.useSession.mockReturnValue({ data: null, isPending: false });
  mocks.loadWorkspace.mockReset();
  mocks.replace.mockReset();
  mocks.social.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ providers: ["google"] })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const signedIn = () => mocks.useSession.mockReturnValue({ data: { user: { id: "owner" } }, isPending: false });

describe("sign-in destination", () => {
  it("reopens provider authentication when a cached identity fails the plan lookup with 401", async () => {
    signedIn(); mocks.loadWorkspace.mockRejectedValue(new ArcApiError(401, "UNAUTHENTICATED", "expired", "test", "sign-in"));
    render(<SignInPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("登录已过期");
    expect(await screen.findByRole("button", { name: "使用 Google 继续" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("does not redirect a known expired session away from reauthentication", async () => {
    signedIn(); mocks.search = "next=%2Fstack%3Fskill%3Dweb&reauth=1";
    render(<SignInPage />);
    await userEvent.click(await screen.findByRole("button", { name: "使用 Google 继续" }));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: "/stack?skill=web" }));
  });
  it("retains source context in the provider callback and return link", async () => {
    mocks.search = "next=%2Fsetup%3Fmode%3Dedit%26section%3Dtime";
    render(<SignInPage />);
    expect(screen.getByRole("main")).toHaveAttribute("lang", "zh-CN");
    expect(screen.getByRole("link", { name: "返回来源页面" })).toHaveAttribute("href", "/setup?mode=edit&section=time");
    await userEvent.click(await screen.findByRole("button", { name: "使用 Google 继续" }));
    expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: "/setup?mode=edit&section=time" }));
  });

  it("restores an explicit safe destination for a signed-in account without another plan lookup", async () => {
    signedIn(); mocks.search = "next=%2Fcoach%3Fdraft%3D1";
    render(<SignInPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/coach?draft=1"));
    expect(mocks.loadWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    [{ workspace: { id: "existing-plan" } }, "/today"],
    [{ workspace: null }, "/setup"],
  ])("resolves the actual account plan after a source-free login", async (response, destination) => {
    signedIn(); mocks.search = "complete=1"; mocks.loadWorkspace.mockResolvedValue(response);
    render(<SignInPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(destination));
    expect(mocks.loadWorkspace).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("treats the supported missing-goal response as a first setup", async () => {
    signedIn(); mocks.loadWorkspace.mockRejectedValue(new ArcApiError(404, "NOT_FOUND", "Goal not found", "test"));
    render(<SignInPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/setup"));
  });

  it("keeps a failed plan read visible and retryable without assuming there is no plan", async () => {
    signedIn(); mocks.loadWorkspace.mockRejectedValueOnce(new Error("unavailable"));
    mocks.loadWorkspace.mockResolvedValueOnce({ workspace: { id: "existing-plan" } });
    render(<SignInPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法读取你的学习路线");
    expect(mocks.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/today"));
  });

  it("shows an OAuth failure while retaining next and never immediately redirects the error away", async () => {
    signedIn(); mocks.search = "next=%2Fproof%3Fcompose%3D1&error=oauth";
    render(<SignInPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("登录未完成");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.loadWorkspace).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "使用 Google 继续" }));
    expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: "/proof?compose=1" }));
  });

  it("does not navigate from a stale account lookup after logout", async () => {
    signedIn(); let resolve!: (value: unknown) => void;
    mocks.loadWorkspace.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { rerender } = render(<SignInPage />);
    await waitFor(() => expect(mocks.loadWorkspace).toHaveBeenCalledOnce());
    mocks.useSession.mockReturnValue({ data: null, isPending: false });
    rerender(<SignInPage />);
    await act(async () => { resolve({ workspace: { id: "old-plan" } }); });
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
