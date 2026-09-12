import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
  Legend, LineChart, Line, CartesianGrid,
} from "recharts";

export interface Count {
  key: string;
  count: number;
}

const AXIS = { fill: "#666", fontSize: 10, fontFamily: "monospace" } as const;
const TOOLTIP_STYLE = {
  background: "#0a0a0a",
  border: "1px solid #2a2a2a",
  fontFamily: "monospace",
  fontSize: 11,
  color: "#fff",
} as const;

export function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-border bg-card p-4 ${className}`} data-testid="chart-card">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs uppercase font-bold tracking-wider">{title}</h3>
        {subtitle && <span className="text-[10px] text-muted-foreground font-mono">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

/** Vertical bar chart — great for categorical counts. Clickable bars filter the page. */
export function CountBarChart({
  data,
  height = 220,
  onSelect,
  selected,
  maxBars = 12,
  layout = "vertical",
}: {
  data: Count[];
  height?: number;
  onSelect?: (key: string) => void;
  selected?: string;
  maxBars?: number;
  layout?: "vertical" | "horizontal";
}) {
  const shown = useMemo(() => data.slice(0, maxBars), [data, maxBars]);
  if (!shown.length) {
    return <p className="text-xs text-muted-foreground font-mono py-8 text-center uppercase">No data</p>;
  }
  const isH = layout === "horizontal";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={shown} layout={isH ? "vertical" : "horizontal"} margin={{ top: 4, right: 12, left: isH ? 60 : -18, bottom: 0 }}>
        {isH ? (
          <>
            <XAxis type="number" stroke="#444" tick={AXIS} allowDecimals={false} />
            <YAxis type="category" dataKey="key" width={110} tick={{ ...AXIS, fontSize: 9 }} tickFormatter={(v) => String(v).slice(0, 22)} />
          </>
        ) : (
          <>
            <XAxis type="category" dataKey="key" stroke="#444" tick={{ ...AXIS, fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={54} tickFormatter={(v) => String(v).slice(0, 14)} />
            <YAxis type="number" stroke="#444" tick={AXIS} allowDecimals={false} />
          </>
        )}
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
        <Bar
          dataKey="count"
          radius={0}
          cursor={onSelect ? "pointer" : undefined}
          onClick={(entry: { key?: string }) => entry?.key && onSelect?.(entry.key)}
        >
          {shown.map((d) => (
            <Cell
              key={d.key}
              fill={selected === d.key ? "#ffffff" : "rgba(255,255,255,0.55)"}
              stroke={selected === d.key ? "#fff" : "transparent"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Monochrome pie/donut chart with legend. Clickable slices filter the page. */
export function CountPieChart({
  data,
  height = 220,
  onSelect,
  selected,
  maxSlices = 8,
}: {
  data: Count[];
  height?: number;
  onSelect?: (key: string) => void;
  selected?: string;
  maxSlices?: number;
}) {
  const shown = useMemo(() => {
    const top = data.slice(0, maxSlices);
    const rest = data.slice(maxSlices).reduce((acc, d) => acc + d.count, 0);
    return rest > 0 ? [...top, { key: "other", count: rest }] : top;
  }, [data, maxSlices]);
  if (!shown.length) {
    return <p className="text-xs text-muted-foreground font-mono py-8 text-center uppercase">No data</p>;
  }
  // Monochrome greyscale palette
  const shades = ["#ffffff", "#c8c8c8", "#969696", "#707070", "#525252", "#3a3a3a", "#2a2a2a", "#1c1c1c", "#101010"];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={shown}
          dataKey="count"
          nameKey="key"
          innerRadius={height * 0.22}
          outerRadius={height * 0.38}
          stroke="#000"
          strokeWidth={1}
          cursor={onSelect ? "pointer" : undefined}
          onClick={(entry: { key?: string }) => entry?.key && onSelect?.(entry.key)}
        >
          {shown.map((d, i) => (
            <Cell
              key={d.key}
              fill={selected === d.key ? "#fff" : shades[i % shades.length]}
              stroke={selected === d.key ? "#fff" : "#000"}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend
          verticalAlign="middle"
          align="right"
          layout="vertical"
          formatter={(value) => <span style={{ color: "#999", fontSize: 10, fontFamily: "monospace" }}>{String(value).slice(0, 18)}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Histogram over numeric buckets (pre-bucketed server-side). */
export function HistogramChart({
  data,
  height = 200,
}: {
  data: Array<{ bucket: string; count: number }>;
  height?: number;
}) {
  if (!data.length) {
    return <p className="text-xs text-muted-foreground font-mono py-8 text-center uppercase">No data</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
        <XAxis type="category" dataKey="bucket" stroke="#444" tick={{ ...AXIS, fontSize: 9 }} interval={0} />
        <YAxis type="number" stroke="#444" tick={AXIS} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
        <Bar dataKey="count" fill="rgba(255,255,255,0.55)" radius={0} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Timeline line chart (dates / months on X). */
export function TimelineChart({
  data,
  xKey,
  height = 200,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  height?: number;
}) {
  if (!data.length) {
    return <p className="text-xs text-muted-foreground font-mono py-8 text-center uppercase">No data</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#1c1c1c" vertical={false} />
        <XAxis dataKey={xKey} stroke="#444" tick={{ ...AXIS, fontSize: 9 }} />
        <YAxis stroke="#444" tick={AXIS} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line type="monotone" dataKey="count" stroke="#fff" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#fff" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
