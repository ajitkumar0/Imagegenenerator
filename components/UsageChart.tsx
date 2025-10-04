'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface UsageDataPoint {
  date: string;
  generations: number;
}

interface UsageChartProps {
  data: UsageDataPoint[];
}

export default function UsageChart({ data }: UsageChartProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Usage Over Time</h2>
        <p className="text-gray-500 text-sm mt-1">
          Your generation activity in the last 7 days
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <defs>
            <linearGradient id="colorGenerations" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FF6B9D" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#A855F7" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
          />
          <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
            labelStyle={{ color: '#1F2937', fontWeight: 'bold' }}
          />
          <Line
            type="monotone"
            dataKey="generations"
            stroke="url(#gradient)"
            strokeWidth={3}
            dot={{ fill: '#FF6B9D', r: 4 }}
            activeDot={{ r: 6, fill: '#A855F7' }}
            fill="url(#colorGenerations)"
          />
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#FF6B9D" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
          </defs>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Loading skeleton component
export function UsageChartSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 animate-pulse">
      <div className="mb-6">
        <div className="h-6 bg-gray-200 rounded w-40 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-64"></div>
      </div>
      <div className="h-[300px] bg-gray-100 rounded"></div>
    </div>
  );
}
