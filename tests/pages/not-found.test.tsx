import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import NotFound from "../../app/not-found";

afterEach(cleanup);
it("gives an unknown route the Arc identity and safe recovery destinations", () => {
  render(<NotFound />);
  expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  expect(screen.getByRole("heading", { name: "这个页面暂时找不到了" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Arc. 首页" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "回到今日学习" })).toHaveAttribute("href", "/today");
  expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/");
});
