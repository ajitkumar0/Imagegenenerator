'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MoveHorizontal } from 'lucide-react';
import Image from 'next/image';

interface BeforeAfterSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export default function BeforeAfterSlider({
  beforeImage,
  afterImage,
  beforeLabel = 'Original',
  afterLabel = 'Generated',
}: BeforeAfterSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = (x / rect.width) * 100;

    setSliderPosition(percentage);
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-[#1F2937]">Before & After Comparison</h3>
        <p className="text-sm text-[#1F2937]/70">
          Drag the slider to compare
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-900 select-none cursor-ew-resize"
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        {/* After Image (Background) */}
        <div className="absolute inset-0">
          <Image src={afterImage} alt={afterLabel} fill className="object-contain" />
          <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full">
            <span className="text-xs font-semibold text-white">{afterLabel}</span>
          </div>
        </div>

        {/* Before Image (Clipped) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <Image src={beforeImage} alt={beforeLabel} fill className="object-contain" />
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full">
            <span className="text-xs font-semibold text-white">{beforeLabel}</span>
          </div>
        </div>

        {/* Slider Handle */}
        <div
          className="absolute inset-y-0 w-1 bg-white shadow-lg"
          style={{ left: `${sliderPosition}%` }}
        >
          {/* Handle Circle */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center cursor-ew-resize">
            <div className="flex items-center gap-1">
              <div className="w-0.5 h-6 bg-gradient-to-b from-[#FF6B9D] to-[#A855F7]" />
              <MoveHorizontal className="w-5 h-5 text-[#FF6B9D]" />
              <div className="w-0.5 h-6 bg-gradient-to-b from-[#FF6B9D] to-[#A855F7]" />
            </div>
          </div>
        </div>

        {/* Hover Hint */}
        {!isDragging && sliderPosition === 50 && (
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full animate-pulse">
            <p className="text-xs text-white font-medium">
              ← Drag to compare →
            </p>
          </div>
        )}
      </div>

      {/* Percentage Indicator */}
      <div className="mt-3 flex items-center justify-between text-xs text-[#1F2937]/60">
        <span className={sliderPosition < 50 ? 'font-semibold text-[#FF6B9D]' : ''}>
          {beforeLabel} ({(sliderPosition).toFixed(0)}%)
        </span>
        <span className={sliderPosition >= 50 ? 'font-semibold text-[#A855F7]' : ''}>
          {afterLabel} ({(100 - sliderPosition).toFixed(0)}%)
        </span>
      </div>

      {/* Quick Jump Buttons */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setSliderPosition(0)}
          className="flex-1 px-3 py-2 text-xs font-medium text-[#1F2937] bg-white border-2 border-gray-300 hover:border-[#FF6B9D] rounded-lg transition-all"
        >
          Show Original
        </button>
        <button
          onClick={() => setSliderPosition(50)}
          className="flex-1 px-3 py-2 text-xs font-medium text-[#1F2937] bg-white border-2 border-gray-300 hover:border-[#FF6B9D] rounded-lg transition-all"
        >
          50/50
        </button>
        <button
          onClick={() => setSliderPosition(100)}
          className="flex-1 px-3 py-2 text-xs font-medium text-[#1F2937] bg-white border-2 border-gray-300 hover:border-[#A855F7] rounded-lg transition-all"
        >
          Show Generated
        </button>
      </div>
    </div>
  );
}
