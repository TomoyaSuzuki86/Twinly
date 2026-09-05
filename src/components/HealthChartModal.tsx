import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BabyId, BabyProfile, LogEvent } from "@/types";
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
import { fmtDate, iconGradients } from "@/lib/utils";
import { Ruler, Weight } from "lucide-react";

type HealthChartModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: LogEvent[];
  profiles: Record<BabyId, BabyProfile>;
};

type ChartType = "weight" | "height";

type ChartData = {
  date: string;
  A?: number;
  B?: number;
};

const gradientStrokeMap: Record<string, string> = {
  "from-violet-500 to-fuchsia-500": "#8b5cf6",
  "from-sky-500 to-cyan-400": "#0ea5e9",
  "from-emerald-500 to-teal-400": "#10b981",
  "from-amber-500 to-orange-400": "#f59e0b",
  "from-rose-500 to-red-400": "#f43f5e",
  "from-indigo-500 to-blue-400": "#6366f1",
  "from-lime-500 to-green-400": "#84cc16",
  "from-pink-500 to-purple-400": "#ec4899",
};

const processEventsForChart = (
  events: LogEvent[],
  days: number,
  chartType: ChartType
): ChartData[] => {
  const now = new Date();
  const timeThreshold = now.getTime() - days * 24 * 60 * 60 * 1000;

  const filteredEvents = events.filter(
    (e) =>
      e.type === chartType &&
      (chartType === "weight" ? e.weight !== undefined : e.height !== undefined) &&
      e.timestamp >= timeThreshold
  );

  // Sort events by timestamp ascending to process in order
  filteredEvents.sort((a, b) => a.timestamp - b.timestamp);

  const dailyData = new Map<string, { A?: number; B?: number }>();

  for (const event of filteredEvents) {
    const dateStr = fmtDate(new Date(event.timestamp));
    const day = dailyData.get(dateStr) ?? {};
    if (chartType === "weight" && event.weight !== undefined) {
      day[event.babyId] = event.weight;
    } else if (chartType === "height" && event.height !== undefined) {
      day[event.babyId] = event.height;
    }
    dailyData.set(dateStr, day);
  }

  const chartData: ChartData[] = Array.from(dailyData.entries()).map(
    ([date, values]) => ({
      date,
      ...values,
    })
  );

  // Sort by date for the chart
  return chartData.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
};

export function HealthChartModal({
  open,
  onOpenChange,
  events,
  profiles,
}: HealthChartModalProps) {
  const [timeRange, setTimeRange] = useState("1M");
  const [chartType, setChartType] = useState<ChartType>("weight");

  const chartData = useMemo(() => {
    const days =
      timeRange === "1W" ? 7 : timeRange === "1M" ? 30 : 365;
    return processEventsForChart(events, days, chartType);
  }, [events, timeRange, chartType]);

  const yDomain = useMemo(() => {
    const allValues = chartData.flatMap(d => [d.A, d.B]).filter(v => v !== undefined) as number[];
    if (allValues.length === 0) return [0, 10]; // Default for weight
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    return [Math.floor(min - 1), Math.ceil(max + 1)];
  }, [chartData]);

  const yAxisLabel = chartType === "weight" ? "体重 (kg)" : "身長 (cm)";
  const tooltipFormatter = (value: number | undefined): [string, string] => [
    `${value === undefined ? "—" : value.toFixed(chartType === "weight" ? 2 : 1)} ${chartType === "weight" ? "kg" : "cm"}`,
    chartType === "weight" ? "体重" : "身長",
  ];

  const resolveStroke = (babyId: BabyId) => {
    const gradient = profiles[babyId].iconGradient;
    if (gradient && gradientStrokeMap[gradient]) return gradientStrokeMap[gradient];
    const fallback = iconGradients[0]?.value;
    return (fallback && gradientStrokeMap[fallback]) || "#8884d8";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[60vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Select
              value={chartType}
              onValueChange={(value) => setChartType(value as ChartType)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="グラフタイプを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weight">
                  <div className="flex items-center gap-2">
                    <Weight className="h-4 w-4" />
                    <span>体重グラフ</span>
                  </div>
                </SelectItem>
                <SelectItem value="height">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4" />
                    <span>身長グラフ</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </DialogTitle>
          <DialogDescription>
            日々の{chartType === "weight" ? "体重" : "身長"}の推移（成長曲線）を確認できます。
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
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip formatter={tooltipFormatter} />
              <Legend />
              <Line
                type="monotone"
                dataKey="A"
                name={profiles.A.displayName}
                stroke={resolveStroke("A")}
                strokeWidth={2}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="B"
                name={profiles.B.displayName}
                stroke={resolveStroke("B")}
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
