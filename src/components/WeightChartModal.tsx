
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BabyId, LogEvent } from "@/types";
import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fmtDate } from "@/lib/utils";

type WeightChartModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: LogEvent[];
  profiles: Record<BabyId, { displayName: string }>;
};

type ChartData = {
  date: string;
  A?: number;
  B?: number;
};

const processEventsForChart = (
  events: LogEvent[],
  days: number
): ChartData[] => {
  const now = new Date();
  const timeThreshold = now.getTime() - days * 24 * 60 * 60 * 1000;

  const weightEvents = events.filter(
    (e) =>
      e.type === "weight" &&
      e.weight !== undefined &&
      e.timestamp >= timeThreshold
  );

  // Sort events by timestamp ascending to process in order
  weightEvents.sort((a, b) => a.timestamp - b.timestamp);

  const dailyData = new Map<string, { A?: number; B?: number }>();

  for (const event of weightEvents) {
    const dateStr = fmtDate(new Date(event.timestamp));
    const day = dailyData.get(dateStr) ?? {};
    day[event.babyId] = event.weight;
    dailyData.set(dateStr, day);
  }

  const chartData: ChartData[] = Array.from(dailyData.entries()).map(
    ([date, weights]) => ({
      date,
      ...weights,
    })
  );

  // Sort by date for the chart
  return chartData.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
};

export function WeightChartModal({
  open,
  onOpenChange,
  events,
  profiles,
}: WeightChartModalProps) {
  const [timeRange, setTimeRange] = useState("1M");

  const chartData = useMemo(() => {
    const days =
      timeRange === "1W" ? 7 : timeRange === "1M" ? 30 : 365;
    return processEventsForChart(events, days);
  }, [events, timeRange]);

  const yDomain = useMemo(() => {
    const allWeights = chartData.flatMap(d => [d.A, d.B]).filter(w => w !== undefined) as number[];
    if (allWeights.length === 0) return [0, 10];
    const min = Math.min(...allWeights);
    const max = Math.max(...allWeights);
    return [Math.floor(min - 1), Math.ceil(max + 1)];
  }, [chartData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[60vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>体重グラフ</DialogTitle>
          <DialogDescription>
            日々の体重の推移（成長曲線）を確認できます。
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow pr-8">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{
                top: 5,
                right: 30,
                left: 0,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 12 }}
                label={{
                  value: "体重 (kg)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(2)} kg`, "体重"]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="A"
                name={profiles.A.displayName}
                stroke="#8884d8"
                strokeWidth={2}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="B"
                name={profiles.B.displayName}
                stroke="#82ca9d"
                strokeWidth={2}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center">
          <Tabs value={timeRange} onValueChange={setTimeRange}>
            <TabsList>
              <TabsTrigger value="1W">1週間</TabsTrigger>
              <TabsTrigger value="1M">1ヶ月</TabsTrigger>
              <TabsTrigger value="1Y">1年</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
