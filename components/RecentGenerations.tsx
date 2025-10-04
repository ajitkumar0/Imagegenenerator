'use client';

import React from 'react';
import Image from 'next/image';
import { Download, Trash2, Eye } from 'lucide-react';

interface Generation {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: string;
  type: 'text-to-image' | 'image-to-image';
}

interface RecentGenerationsProps {
  generations: Generation[];
  onView?: (id: string) => void;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function RecentGenerations({
  generations,
  onView,
  onDownload,
  onDelete,
}: RecentGenerationsProps) {
  if (generations.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Recent Generations</h2>
          <p className="text-gray-500 text-sm mt-1">
            Your latest AI-generated images
          </p>
        </div>
        <a
          href="/generate/text-to-image"
          className="text-sm font-semibold text-[#FF6B9D] hover:text-[#A855F7] transition-colors"
        >
          View All →
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {generations.map((generation) => (
          <GenerationCard
            key={generation.id}
            generation={generation}
            onView={onView}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function GenerationCard({
  generation,
  onView,
  onDownload,
  onDelete,
}: {
  generation: Generation;
  onView?: (id: string) => void;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="group relative bg-gray-50 rounded-xl overflow-hidden hover:shadow-lg transition-shadow duration-300">
      {/* Image */}
      <div className="relative aspect-square">
        <Image
          src={generation.imageUrl}
          alt={generation.prompt}
          fill
          className="object-cover"
        />

        {/* Overlay with actions */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          {onView && (
            <button
              onClick={() => onView(generation.id)}
              className="p-2 bg-white rounded-full hover:bg-gray-100 transition-colors"
              aria-label="View image"
            >
              <Eye className="w-5 h-5 text-gray-700" />
            </button>
          )}
          {onDownload && (
            <button
              onClick={() => onDownload(generation.id)}
              className="p-2 bg-white rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Download image"
            >
              <Download className="w-5 h-5 text-gray-700" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(generation.id)}
              className="p-2 bg-white rounded-full hover:bg-red-50 transition-colors"
              aria-label="Delete image"
            >
              <Trash2 className="w-5 h-5 text-red-600" />
            </button>
          )}
        </div>

        {/* Type badge */}
        <div className="absolute top-2 right-2">
          <span className="px-2 py-1 bg-white bg-opacity-90 rounded-md text-xs font-semibold text-gray-700">
            {generation.type === 'text-to-image' ? 'Text' : 'Image'}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm text-gray-900 font-medium truncate">
          {generation.prompt}
        </p>
        <p className="text-xs text-gray-500 mt-1">{generation.createdAt}</p>
      </div>
    </div>
  );
}

// Empty state for new users
function EmptyState() {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-12 border border-gray-100 text-center">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FF6B9D] to-[#A855F7] bg-opacity-10 flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-10 h-10 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">
        No generations yet
      </h3>
      <p className="text-gray-500 mb-6">
        Start creating stunning AI images to see them here
      </p>
      <div className="flex gap-3 justify-center">
        <a
          href="/generate/text-to-image"
          className="px-6 py-2 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-full font-semibold hover:shadow-lg hover:scale-105 transition-all duration-300"
        >
          Create Text to Image
        </a>
        <a
          href="/generate/image-to-image"
          className="px-6 py-2 border-2 border-[#FF6B9D] text-[#FF6B9D] rounded-full font-semibold hover:bg-[#FFF5F7] transition-all duration-300"
        >
          Transform Image
        </a>
      </div>
    </div>
  );
}

// Loading skeleton component
export function RecentGenerationsSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 animate-pulse">
      <div className="mb-6">
        <div className="h-6 bg-gray-200 rounded w-40 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-48"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-50 rounded-xl overflow-hidden">
            <div className="aspect-square bg-gray-200"></div>
            <div className="p-3">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
