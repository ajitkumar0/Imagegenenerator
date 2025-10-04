/**
 * Skeleton Loader Components
 *
 * Placeholder loading states that mimic content layout
 */

'use client';

import React from 'react';

// ============================================================================
// Base Skeleton
// ============================================================================

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const baseClasses = 'bg-gray-200';

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: '',
    rounded: 'rounded-lg',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
    />
  );
}

// ============================================================================
// Text Skeleton
// ============================================================================

interface SkeletonTextProps {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}

export function SkeletonText({
  lines = 3,
  className = '',
  lastLineWidth = '70%',
}: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={16}
          width={index === lines - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Card Skeleton
// ============================================================================

interface SkeletonCardProps {
  className?: string;
  showImage?: boolean;
  imageHeight?: number;
  showActions?: boolean;
}

export function SkeletonCard({
  className = '',
  showImage = true,
  imageHeight = 200,
  showActions = true,
}: SkeletonCardProps) {
  return (
    <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
      {/* Image */}
      {showImage && (
        <Skeleton variant="rounded" height={imageHeight} className="mb-4" />
      )}

      {/* Title */}
      <Skeleton height={24} width="60%" className="mb-3" />

      {/* Description */}
      <SkeletonText lines={2} className="mb-4" />

      {/* Actions */}
      {showActions && (
        <div className="flex space-x-2">
          <Skeleton height={36} width={100} variant="rounded" />
          <Skeleton height={36} width={100} variant="rounded" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// List Item Skeleton
// ============================================================================

interface SkeletonListItemProps {
  className?: string;
  showAvatar?: boolean;
  avatarSize?: number;
}

export function SkeletonListItem({
  className = '',
  showAvatar = true,
  avatarSize = 40,
}: SkeletonListItemProps) {
  return (
    <div className={`flex items-center space-x-3 p-4 ${className}`}>
      {showAvatar && (
        <Skeleton variant="circular" width={avatarSize} height={avatarSize} />
      )}
      <div className="flex-1">
        <Skeleton height={16} width="40%" className="mb-2" />
        <Skeleton height={12} width="60%" />
      </div>
      <Skeleton width={80} height={32} variant="rounded" />
    </div>
  );
}

// ============================================================================
// Table Skeleton
// ============================================================================

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  className = '',
}: SkeletonTableProps) {
  return (
    <div className={`overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
        <div className="flex space-x-4">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} height={16} width={`${100 / columns}%`} />
          ))}
        </div>
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="px-6 py-4 border-b border-gray-200"
        >
          <div className="flex space-x-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                height={16}
                width={`${100 / columns}%`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Generation Card Skeleton (Specific to app)
// ============================================================================

export function SkeletonGenerationCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Image Placeholder */}
      <Skeleton variant="rectangular" height={300} />

      {/* Content */}
      <div className="p-4">
        {/* Prompt */}
        <SkeletonText lines={2} className="mb-3" />

        {/* Meta */}
        <div className="flex items-center justify-between mb-3">
          <Skeleton width={80} height={20} variant="rounded" />
          <Skeleton width={100} height={20} />
        </div>

        {/* Actions */}
        <div className="flex space-x-2">
          <Skeleton height={36} width="50%" variant="rounded" />
          <Skeleton height={36} width="50%" variant="rounded" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Subscription Card Skeleton
// ============================================================================

export function SkeletonSubscriptionCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-lg p-6 ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <Skeleton height={32} width="60%" className="mb-2" />
        <Skeleton height={20} width="80%" />
      </div>

      {/* Credits */}
      <div className="bg-blue-50 rounded-lg p-4 mb-6">
        <Skeleton height={24} width="40%" className="mb-3" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Skeleton height={16} width="80%" className="mb-2" />
            <Skeleton height={20} width="60%" />
          </div>
          <div>
            <Skeleton height={16} width="80%" className="mb-2" />
            <Skeleton height={20} width="60%" />
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-3 mb-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center space-x-2">
            <Skeleton variant="circular" width={20} height={20} />
            <Skeleton height={16} width="70%" />
          </div>
        ))}
      </div>

      {/* Button */}
      <Skeleton height={44} variant="rounded" />
    </div>
  );
}

// ============================================================================
// Grid Skeleton
// ============================================================================

interface SkeletonGridProps {
  items?: number;
  columns?: 1 | 2 | 3 | 4;
  gap?: number;
  renderItem?: () => React.ReactNode;
  className?: string;
}

export function SkeletonGrid({
  items = 6,
  columns = 3,
  gap = 6,
  renderItem,
  className = '',
}: SkeletonGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-${gap} ${className}`}>
      {Array.from({ length: items }).map((_, index) => (
        <div key={index}>
          {renderItem ? renderItem() : <SkeletonCard />}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Page Skeleton (Full page loading)
// ============================================================================

export function SkeletonPage({ className = '' }: { className?: string }) {
  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${className}`}>
      {/* Header */}
      <div className="mb-8">
        <Skeleton height={36} width="40%" className="mb-4" />
        <Skeleton height={20} width="60%" />
      </div>

      {/* Content Grid */}
      <SkeletonGrid
        items={6}
        columns={3}
        renderItem={() => <SkeletonGenerationCard />}
      />
    </div>
  );
}

// Add shimmer animation to global CSS
export const shimmerStyles = `
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite linear;
  background: linear-gradient(
    to right,
    #f0f0f0 0%,
    #e0e0e0 20%,
    #f0f0f0 40%,
    #f0f0f0 100%
  );
  background-size: 1000px 100%;
}
`;
