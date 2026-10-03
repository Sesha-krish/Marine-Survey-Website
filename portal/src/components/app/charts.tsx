"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Status series colours mirror the status-pill tones so a status reads the same everywhere.
export const SERIES = [
  { key: "New", color: "#2f6fd6" },
  { key: "Accepted", color: "#2a9d8f" },
  { key: "In Progress", color: "#d99a00" },
  { key: "Completed", color: "#2f9e55" },
  { key: "Declined/Cancelled", color: "#c2453b" },
];

const axis = { fontSize: 12, fill: "var(--subtle)" };
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13 };

export function RfqStatusChart({ data }: { data: Record<string, string | number>[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="RFQs created per month over the last six months, stacked by current status">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {SERIES.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} stackId="1" fill={s.color} radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PerformanceChart({ data }: { data: { month: string; Created: number; Completed: number; "Reports issued": number }[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Job orders created and completed, and reports issued, per month">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          <Bar dataKey="Created" fill="#5b8def" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Completed" fill="#2a9d8f" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Reports issued" fill="#e0a526" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
