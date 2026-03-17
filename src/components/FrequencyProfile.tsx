import React from 'react';

interface FrequencyProfileProps {
  profile: number[];
  color?: string;
  height?: number;
  label?: string;
}

export function FrequencyProfile({
  profile,
  color = '#6366f1',
  height = 60,
  label,
}: FrequencyProfileProps) {
  if (!profile || profile.length === 0) return null;

  const barWidth = 100 / profile.length;

  return (
    <div className="w-full">
      {label && (
        <p className="text-xs text-gray-500 mb-1">{label}</p>
      )}
      <div
        className="w-full flex items-end gap-px bg-gray-50 rounded-lg overflow-hidden p-2"
        style={{ height: `${height}px` }}
      >
        {profile.map((value, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-sm transition-all duration-300"
            style={{
              height: `${Math.max(2, value * 100)}%`,
              backgroundColor: color,
              opacity: 0.3 + value * 0.7,
            }}
          />
        ))}
      </div>
    </div>
  );
}
