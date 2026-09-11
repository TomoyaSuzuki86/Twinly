import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import "./baby-tab-swipe-animator";

describe("baby tab swipe animator", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    delete document.documentElement.dataset.twinlyLayout;
    vi.restoreAllMocks();
  });

  it("does not imperatively change tabs when a swipe starts on the AI advice area", () => {
    document.body.innerHTML = `
      <div class="twinly-baby-tabs-list">
        <button role="tab" data-state="active" aria-selected="true">A</button>
        <button role="tab" data-state="inactive" aria-selected="false">B</button>
      </div>
      <div class="twinly-baby-tabs-panels">
        <button aria-label="AIアドバイスを見る">AIアドバイス</button>
      </div>
    `;

    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const aiButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="AIアドバイスを見る"]'
    )!;
    const onSecondClick = vi.fn();
    tabs[1].addEventListener("click", onSecondClick);

    fireEvent.touchStart(aiButton, {
      touches: [{ identifier: 1, clientX: 140, clientY: 30 }],
      changedTouches: [{ identifier: 1, clientX: 140, clientY: 30 }],
    });
    fireEvent.touchMove(aiButton, {
      touches: [{ identifier: 1, clientX: 90, clientY: 32 }],
      changedTouches: [{ identifier: 1, clientX: 90, clientY: 32 }],
    });

    expect(onSecondClick).not.toHaveBeenCalled();
    expect(tabs[0]).toHaveAttribute("data-state", "active");
    expect(tabs[1]).toHaveAttribute("data-state", "inactive");
  });
});
