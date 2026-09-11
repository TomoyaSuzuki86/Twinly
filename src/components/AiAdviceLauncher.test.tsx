import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiAdviceProvider, AiAdviceTrigger } from "./AiAdviceLauncher";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { detectHorizontalSwipe, type SwipePoint } from "@/lib/horizontal-swipe";

const mock = vi.hoisted(() => ({ service: vi.fn() }));
vi.mock("@/lib/ai", () => ({ callService: mock.service }));

const premium = {
  plan: "premium",
  canPreview: true,
  features: { aiReview: true, aiChat: true, dailySummaryEmail: true },
};

describe("AI advice", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });
  beforeEach(() => mock.service.mockReset());

  it("places text and voice question controls below the generated advice", async () => {
    mock.service.mockImplementation(async (name, data) => {
      if (name === "getFamilyAccess") return premium;
      if (name === "twinlyAi" && data?.mode === "review") {
        return {
          observations: "最近は安定しています",
          checks: "今日も睡眠を確認してください",
          generatedAt: Date.now(),
        };
      }
      if (name === "twinlyAi" && data?.mode === "ask") {
        return {
          answer: "直近の集計では大きな変化はありません。",
          source: "review",
          generatedAt: Date.now(),
        };
      }
      return premium;
    });

    render(
      <AiAdviceProvider>
        <AiAdviceTrigger />
      </AiAdviceProvider>
    );

    const launcher = await screen.findByRole("button", { name: "AIアドバイスを見る" });
    fireEvent.click(launcher);
    expect(screen.queryByLabelText("AIへの質問")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "同意してアドバイスを見る" }));
    await screen.findByText("最近は安定しています");

    expect(screen.getByText("AIに質問する")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "start voice input" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("AIへの質問"), {
      target: { value: "最近、睡眠は減ってる？" },
    });
    fireEvent.click(screen.getByRole("button", { name: "質問する" }));
    expect(await screen.findByText("直近の集計では大きな変化はありません。")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        mock.service.mock.calls.some(
          ([name, data]) => name === "twinlyAi" && data?.mode === "ask"
        )
      ).toBe(true)
    );
  });

  it("keeps the trigger inside the baby panel so the normal parent swipe handler changes twins", async () => {
    mock.service.mockImplementation(async (name) =>
      name === "getFamilyAccess" ? premium : premium
    );

    function SwipeHarness() {
      const [selected, setSelected] = useState<"A" | "B">("A");
      const swipeStart = useRef<SwipePoint | null>(null);

      return (
        <Tabs value={selected} onValueChange={(value) => setSelected(value as "A" | "B")}>
          <TabsList className="twinly-baby-tabs-list">
            <TabsTrigger value="A">1人目</TabsTrigger>
            <TabsTrigger value="B">2人目</TabsTrigger>
          </TabsList>
          <div
            className="twinly-baby-tabs-panels"
            onTouchStart={(event) => {
              const touch = event.touches.item(0);
              swipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
            }}
            onTouchEnd={(event) => {
              const start = swipeStart.current;
              swipeStart.current = null;
              const touch = event.changedTouches.item(0);
              if (!start || !touch) return;
              const direction = detectHorizontalSwipe(start, {
                x: touch.clientX,
                y: touch.clientY,
              });
              if (direction === "left" && selected === "A") setSelected("B");
              if (direction === "right" && selected === "B") setSelected("A");
            }}
          >
            <TabsContent
              forceMount
              value="A"
              className="twinly-baby-tabs-content data-[state=inactive]:hidden"
            >
              <div data-testid="panel-a">
                <AiAdviceTrigger />
              </div>
            </TabsContent>
            <TabsContent
              forceMount
              value="B"
              className="twinly-baby-tabs-content data-[state=inactive]:hidden"
            >
              <div data-testid="panel-b">
                <AiAdviceTrigger />
              </div>
            </TabsContent>
          </div>
        </Tabs>
      );
    }

    render(
      <AiAdviceProvider>
        <SwipeHarness />
      </AiAdviceProvider>
    );

    await waitFor(() =>
      expect(document.querySelectorAll('button[aria-label="AIアドバイスを見る"]').length).toBe(2)
    );

    const activePanel = document.querySelector<HTMLElement>(
      '.twinly-baby-tabs-content[data-state="active"]'
    );
    const launcher = activePanel?.querySelector<HTMLButtonElement>(
      'button[aria-label="AIアドバイスを見る"]'
    );

    expect(launcher).not.toBeNull();
    expect(screen.getByTestId("panel-a")).toContainElement(launcher!);
    expect(document.querySelector("[data-twinly-ai-advice-mount]")).not.toBeInTheDocument();
    expect(launcher).not.toHaveStyle({ touchAction: "none" });

    fireEvent.touchStart(launcher!, {
      touches: [{ identifier: 1, clientX: 150, clientY: 40 }],
      changedTouches: [{ identifier: 1, clientX: 150, clientY: 40 }],
    });
    fireEvent.touchEnd(launcher!, {
      touches: [],
      changedTouches: [{ identifier: 1, clientX: 80, clientY: 43 }],
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "2人目" })).toHaveAttribute("data-state", "active")
    );
    expect(screen.queryByText("今日のAIアドバイス")).not.toBeInTheDocument();
  });
});
