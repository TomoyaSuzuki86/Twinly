import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import "./baby-tab-swipe-animator";

describe("baby tab swipe animator", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    delete document.documentElement.dataset.twinlyLayout;
    vi.restoreAllMocks();
  });

  it("switches directly to the right twin when a touch swipe starts on AI advice", () => {
    document.body.innerHTML = `
      <div class="twinly-baby-tabs-list">
        <button role="tab" data-state="active" aria-selected="true">A</button>
        <button role="tab" data-state="inactive" aria-selected="false">B</button>
      </div>
      <div class="twinly-baby-tabs-panels">
        <div data-twinly-ai-advice-target="true">
          <button aria-label="AIアドバイスを見る">AIアドバイス</button>
        </div>
      </div>
    `;

    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const aiButton = document.querySelector<HTMLButtonElement>('button[aria-label="AIアドバイスを見る"]')!;
    const onSecondClick = vi.fn(() => {
      tabs[0].dataset.state = "inactive";
      tabs[0].setAttribute("aria-selected", "false");
      tabs[1].dataset.state = "active";
      tabs[1].setAttribute("aria-selected", "true");
    });
    tabs[1].addEventListener("click", onSecondClick);

    fireEvent.touchStart(aiButton, {
      touches: [{ identifier: 1, clientX: 140, clientY: 30 }],
      changedTouches: [{ identifier: 1, clientX: 140, clientY: 30 }],
    });
    fireEvent.touchMove(aiButton, {
      touches: [{ identifier: 1, clientX: 115, clientY: 32 }],
      changedTouches: [{ identifier: 1, clientX: 115, clientY: 32 }],
    });

    expect(onSecondClick).toHaveBeenCalledTimes(1);
    expect(tabs[1]).toHaveAttribute("data-state", "active");
  });
});
