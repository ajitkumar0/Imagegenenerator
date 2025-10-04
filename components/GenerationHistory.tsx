'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import Image from 'next/image';

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: Date;
  dimensions: string;
  seed?: string;
}

interface GenerationHistoryProps {
  images: GeneratedImage[];
  onImageClick?: (image: GeneratedImage) => void;
  onImageDelete?: (id: string) => void;
}

export default function GenerationHistory({
  images,
  onImageClick,
  onImageDelete,
}: GenerationHistoryProps) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

  const scroll = (direction: 'left' | 'right') => {
    const container = document.getElementById('history-scroll');
    if (!container) return;

    const scrollAmount = 300;
    const newPosition =
      direction === 'left'
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;

    container.scrollTo({ left: newPosition, behavior: 'smooth' });
    setScrollPosition(newPosition);
  };

  const handleImageClick = (image: GeneratedImage) => {
    setSelectedImage(image);
    onImageClick?.(image);
  };

  if (images.length === 0) {
    return (
      <div className="w-full py-8 text-center">
        <p className="text-[#1F2937]/50">
          Your generation history will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-[#1F2937]">
          Recent Generations ({images.length})
        </h3>

        {images.length > 4 && (
          <div className="flex gap-2">
            <button
              onClick={() => scroll('left')}
              disabled={scrollPosition === 0}
              className="p-2 rounded-lg bg-white border-2 border-gray-300 hover:border-[#FF6B9D] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-2 rounded-lg bg-white border-2 border-gray-300 hover:border-[#FF6B9D] transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Scrollable Gallery */}
      <div
        id="history-scroll"
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {images.map((image) => (
          <div
            key={image.id}
            className="group relative flex-shrink-0 w-48 h-48 rounded-xl overflow-hidden cursor-pointer border-2 border-gray-200 hover:border-[#FF6B9D] transition-all hover:shadow-xl"
            onClick={() => handleImageClick(image)}
          >
            <Image
              src={image.imageUrl}
              alt={image.prompt}
              fill
              className="object-cover"
            />

            {/* Overlay on Hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white text-xs line-clamp-2 mb-1">
                  {image.prompt}
                </p>
                <p className="text-white/70 text-xs">
                  {new Date(image.timestamp).toLocaleDateString()}
                </p>
              </div>

              {/* Delete Button */}
              {onImageDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onImageDelete(image.id);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 rounded-full transition-all"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              )}
            </div>

            {/* Gradient Border Effect */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] opacity-50" />
            </div>
          </div>
        ))}
      </div>

      {/* Detailed View Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-[#1F2937] mb-2">
                    Generation Details
                  </h3>
                  <p className="text-sm text-[#1F2937]/70">
                    {new Date(selectedImage.timestamp).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Image */}
              <div className="relative w-full aspect-square mb-4 rounded-xl overflow-hidden bg-gray-100">
                <Image
                  src={selectedImage.imageUrl}
                  alt={selectedImage.prompt}
                  fill
                  className="object-contain"
                />
              </div>

              {/* Details */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-[#1F2937]">
                    Prompt:
                  </label>
                  <p className="text-sm text-[#1F2937]/70 mt-1">
                    {selectedImage.prompt}
                  </p>
                </div>

                <div className="flex gap-4">
                  <div>
                    <label className="text-sm font-semibold text-[#1F2937]">
                      Dimensions:
                    </label>
                    <p className="text-sm text-[#1F2937]/70 mt-1">
                      {selectedImage.dimensions}
                    </p>
                  </div>

                  {selectedImage.seed && (
                    <div>
                      <label className="text-sm font-semibold text-[#1F2937]">
                        Seed:
                      </label>
                      <p className="text-sm text-[#1F2937]/70 mt-1">
                        {selectedImage.seed}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
