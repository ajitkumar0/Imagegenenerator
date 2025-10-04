'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

export default function Hero() {
  return (
    <section className="w-full py-20 px-4 md:px-8 lg:px-16">
      <div className="max-w-7xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center space-x-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full shadow-md mb-8">
          <Sparkles className="w-4 h-4 text-[#A855F7]" />
          <span className="text-sm font-medium text-[#1F2937]">
            Powered by Advanced AI
          </span>
        </div>

        {/* Main Heading */}
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
          Transform Your Ideas Into{' '}
          <span className="bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] bg-clip-text text-transparent">
            Stunning Images
          </span>{' '}
          with Magical AI
        </h1>

        {/* Subheading */}
        <p className="text-lg md:text-xl text-[#1F2937]/70 mb-12 max-w-3xl mx-auto">
          Create breathtaking AI-generated images from text descriptions or transform
          existing images with the power of cutting-edge AI technology.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button className="px-8 py-4 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-full font-semibold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 w-full sm:w-auto">
            Start Creating Free
          </button>
          <button className="px-8 py-4 bg-white text-[#1F2937] rounded-full font-semibold text-lg hover:shadow-xl hover:scale-105 transition-all duration-300 border-2 border-gray-200 w-full sm:w-auto">
            View Examples
          </button>
        </div>

        {/* Stats or Social Proof */}
        <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-8 text-[#1F2937]/60">
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] bg-clip-text text-transparent">
              10K+
            </span>
            <span className="text-sm">Images Generated</span>
          </div>
          <div className="hidden sm:block w-1 h-1 rounded-full bg-[#1F2937]/20"></div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] bg-clip-text text-transparent">
              5K+
            </span>
            <span className="text-sm">Happy Users</span>
          </div>
          <div className="hidden sm:block w-1 h-1 rounded-full bg-[#1F2937]/20"></div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] bg-clip-text text-transparent">
              4.9/5
            </span>
            <span className="text-sm">User Rating</span>
          </div>
        </div>
      </div>
    </section>
  );
}
