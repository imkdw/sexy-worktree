import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("filters out falsy values", () => {
    // eslint-disable-next-line no-constant-binary-expression -- falsy 단락 평가 입력을 의도적으로 테스트
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c");
  });

  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("px-2 px-4")).toBe("px-4");
  });

  it("merges across arguments", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("supports conditional objects via clsx", () => {
    expect(cn("a", { b: true, c: false })).toBe("a b");
  });
});
