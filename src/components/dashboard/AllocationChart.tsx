'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

interface AllocationChartProps {
  data: { name: string; value: number }[];
}

const COLORS = ['#00d4aa', '#22c55e', '#f3ba2f', '#0052ff', '#a855f7', '#64748b'];

export function AllocationChart({ data }: AllocationChartProps) {
  return (
    <div className="glass-card rounded-2xl p-5 border border-border/50 h-full flex flex-col">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
        <PieChartIcon className="h-5 w-5 text-primary" />
        Allocation
      </h2>
      
      <div className="flex-1 min-h-[250px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(21, 25, 35, 0.9)', 
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '0.5rem',
                color: '#f8fafc'
              }}
              itemStyle={{ color: '#f8fafc' }}
              formatter={(value: any) => [`${value}%`, 'Allocation']}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: '12px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
