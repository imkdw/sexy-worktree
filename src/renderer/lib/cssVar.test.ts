/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cssVar } from "./cssVar";

describe("cssVar", () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty("--test-color");
  });

  it("reads a CSS custom property from :root", () => {
    // eslint-disable-next-line no-restricted-syntax -- 테스트 픽스처용 hex 리터럴, UI 색상 아님
    document.documentElement.style.setProperty("--test-color", "#ff00aa");
    // eslint-disable-next-line no-restricted-syntax -- 기대 반환값으로서의 hex 리터럴
    expect(cssVar("--test-color")).toBe("#ff00aa");
  });

  it("returns empty string when the variable is not defined", () => {
    expect(cssVar("--never-defined")).toBe("");
  });

  it("trims surrounding whitespace from the value", () => {
    // eslint-disable-next-line no-restricted-syntax -- 테스트 픽스처용 hex 리터럴, UI 색상 아님
    document.documentElement.style.setProperty("--test-color", "  #abc  ");
    // eslint-disable-next-line no-restricted-syntax -- 기대 반환값으로서의 hex 리터럴
    expect(cssVar("--test-color")).toBe("#abc");
  });
});
