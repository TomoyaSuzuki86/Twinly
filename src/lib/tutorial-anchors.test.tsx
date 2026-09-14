import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveTutorialTargetKeys,
  useTutorialAnchors,
  type TutorialAnchorRegistry,
} from "./tutorial-anchors";

afterEach(cleanup);

describe("tutorial anchors", () => {
  it("maps tutorial steps to explicit semantic anchors", () => {
    expect(resolveTutorialTargetKeys(0, "B")).toEqual(["baby-tabs"]);
    expect(resolveTutorialTargetKeys(1, "B")).toEqual([
      "primary:B:milk",
      "primary:B:diaper",
      "primary:B:sleep",
    ]);
    expect(resolveTutorialTargetKeys(8, "B")).toEqual(["log-summary:B"]);
    expect(resolveTutorialTargetKeys(11, "B")).toEqual(["settings"]);
    expect(resolveTutorialTargetKeys(10, "B")).toEqual([]);
  });

  it("registers elements without querying the document", () => {
    const registryRef: { current: TutorialAnchorRegistry | null } = { current: null };
    const Harness = () => {
      const anchors = useTutorialAnchors();
      registryRef.current = anchors;
      return <button ref={anchors.ref("settings")}>設定</button>;
    };

    render(<Harness />);
    const button = screen.getByRole("button", { name: "設定" });
    const registry = registryRef.current as TutorialAnchorRegistry;
    expect(registry.get("settings")).toBe(button);
  });
});
