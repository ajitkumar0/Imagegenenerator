'use client';

import React from 'react';
import { Sparkles, Wand2, Image } from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'Text-to-Image',
    description:
      'Transform your words into stunning visual art. Simply describe what you want, and watch our AI bring it to life in seconds.',
    gradient: 'from-[#FF6B9D] to-[#FF8FB3]',
  },
  {
    icon: Wand2,
    title: 'Image-to-Image',
    description:
      'Upload an image and reimagine it in different styles. Apply artistic filters, change moods, or completely transform your visuals.',
    gradient: 'from-[#FF8FB3] to-[#C77BF3]',
  },
  {
    icon: Image,
    title: 'High-Quality Results',
    description:
      'Get professional-grade images powered by advanced AI technology. Fast generation with stunning detail and artistic quality.',
    gradient: 'from-[#C77BF3] to-[#A855F7]',
  },
];

export default function FeatureCards() {
  return (
    <section className="w-full py-20 px-4 md:px-8 lg:px-16" id="features">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-[#1F2937]">
            Powerful Features
          </h2>
          <p className="text-lg text-[#1F2937]/70 max-w-2xl mx-auto">
            Everything you need to create stunning AI-generated images with ease
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border border-gray-100"
              >
                {/* Icon */}
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon className="w-7 h-7 text-white" />
                </div>

                {/* Title */}
                <h3 className="text-2xl font-bold text-[#1F2937] mb-4">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-[#1F2937]/70 leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover Effect - Learn More Link */}
                <div className="mt-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <a
                    href="#"
                    className={`inline-flex items-center text-sm font-semibold bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent`}
                  >
                    Learn more
                    <svg
                      className="w-4 h-4 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
