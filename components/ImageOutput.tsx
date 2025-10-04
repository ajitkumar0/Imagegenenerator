'use client';

import React, { useState } from 'react';
import { Download, RefreshCw, Share2, Maximize2, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface ImageOutputProps {
  imageUrl?: string;
  isLoading?: boolean;
  error?: string;
  onRegenerate?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  prompt?: string;
}

export default function ImageOutput({
  imageUrl,
  isLoading = false,
  error,
  onRegenerate,
  onDownload,
  onShare,
  prompt,
}: ImageOutputProps) {
  const [isEnlarged, setIsEnlarged] = useState(false);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Main Image Container */}
      <div className="flex-1 relative bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl overflow-hidden flex items-center justify-center">
        {/* Loading State */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <div className="relative w-full h-full">
              {/* Animated Gradient Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#FF6B9D]/20 via-[#A855F7]/20 to-[#FF6B9D]/20 animate-gradient-shift" />

              {/* Skeleton Loader */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-16 h-16 text-[#FF6B9D] animate-spin mx-auto mb-4" />
                  <p className="text-lg font-semibold text-[#1F2937] mb-2">
                    Creating your masterpiece...
                  </p>
                  <p className="text-sm text-[#1F2937]/70">
                    This may take 10-30 seconds
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <p className="text-lg font-semibold text-red-600 mb-2">
              Generation Failed
            </p>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="px-6 py-2 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-full font-semibold hover:shadow-lg transition-all"
              >
                Try Again
              </button>
            )}
          </div>
        )}

        {/* Empty State */}
        {!imageUrl && !isLoading && !error && (
          <div className="text-center p-8">
            <div className="w-24 h-24 bg-gradient-to-br from-[#FF6B9D] to-[#A855F7] rounded-2xl flex items-center justify-center mx-auto mb-4 opacity-50">
              <span className="text-5xl">🎨</span>
            </div>
            <p className="text-lg font-semibold text-[#1F2937] mb-2">
              Your image will appear here
            </p>
            <p className="text-sm text-[#1F2937]/70">
              Enter a prompt and click Generate to create an image
            </p>
          </div>
        )}

        {/* Generated Image */}
        {imageUrl && !isLoading && (
          <>
            <Image
              src={imageUrl}
              alt={prompt || 'Generated image'}
              fill
              className="object-contain"
              priority
            />

            {/* Enlarge Button */}
            <button
              onClick={() => setIsEnlarged(true)}
              className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-sm rounded-lg hover:bg-white transition-all shadow-lg"
            >
              <Maximize2 className="w-5 h-5 text-[#1F2937]" />
            </button>
          </>
        )}
      </div>

      {/* Action Buttons */}
      {imageUrl && !isLoading && (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={onDownload}
            className="flex-1 min-w-[140px] px-6 py-3 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-xl font-semibold hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            Download
          </button>

          <button
            onClick={onRegenerate}
            className="flex-1 min-w-[140px] px-6 py-3 bg-white border-2 border-gray-300 text-[#1F2937] rounded-xl font-semibold hover:border-[#FF6B9D] hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            Regenerate
          </button>

          <button
            onClick={onShare}
            className="px-6 py-3 bg-white border-2 border-gray-300 text-[#1F2937] rounded-xl font-semibold hover:border-[#FF6B9D] hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
          >
            <Share2 className="w-5 h-5" />
            Share
          </button>
        </div>
      )}

      {/* Enlarged Image Modal */}
      {isEnlarged && imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsEnlarged(false)}
        >
          <div className="relative max-w-7xl max-h-[90vh] w-full h-full">
            <Image
              src={imageUrl}
              alt={prompt || 'Generated image'}
              fill
              className="object-contain"
              priority
            />
            <button
              onClick={() => setIsEnlarged(false)}
              className="absolute top-4 right-4 p-3 bg-white/90 rounded-full hover:bg-white transition-all text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes gradient-shift {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }

        .animate-gradient-shift {
          background-size: 200% 200%;
          animation: gradient-shift 3s ease infinite;
        }
      `}</style>
    </div>
  );
}
