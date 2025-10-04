'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import PromptInput from '@/components/PromptInput';
import AdvancedSettings from '@/components/AdvancedSettings';
import ImageOutput from '@/components/ImageOutput';
import GenerationHistory from '@/components/GenerationHistory';
import CreditsDisplay from '@/components/CreditsDisplay';
import { Sparkles } from 'lucide-react';

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: Date;
  dimensions: string;
  seed?: string;
}

export default function TextToImagePage() {
  // Form State
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [dimensions, setDimensions] = useState('1024x1024');
  const [steps, setSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [seed, setSeed] = useState('');

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentImage, setCurrentImage] = useState<string>();
  const [error, setError] = useState<string>();

  // History State
  const [generationHistory, setGenerationHistory] = useState<GeneratedImage[]>([
    // Mock data for demonstration
    {
      id: '1',
      imageUrl: 'https://placehold.co/1024x1024/FF6B9D/FFFFFF?text=Sample+1',
      prompt: 'A beautiful sunset over mountains',
      timestamp: new Date(Date.now() - 3600000),
      dimensions: '1024x1024',
    },
    {
      id: '2',
      imageUrl: 'https://placehold.co/1024x1024/A855F7/FFFFFF?text=Sample+2',
      prompt: 'A futuristic city with flying cars',
      timestamp: new Date(Date.now() - 7200000),
      dimensions: '1024x1024',
    },
  ]);

  // Credits State (mock data)
  const [credits, setCredits] = useState({
    current: 8,
    max: 10,
    tier: 'free' as 'free' | 'basic' | 'premium',
  });

  // Validation
  const isFormValid = prompt.length >= 3 && prompt.length <= 500 && !isGenerating;

  // Placeholder Functions
  const handleGenerate = async () => {
    if (!isFormValid) return;

    setIsGenerating(true);
    setError(undefined);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Mock response
      const mockImageUrl = `https://placehold.co/1024x1024/${Math.random() > 0.5 ? 'FF6B9D' : 'A855F7'}/FFFFFF?text=Generated+Image`;

      setCurrentImage(mockImageUrl);

      // Add to history
      const newGeneration: GeneratedImage = {
        id: Date.now().toString(),
        imageUrl: mockImageUrl,
        prompt,
        timestamp: new Date(),
        dimensions,
        seed: seed || undefined,
      };

      setGenerationHistory([newGeneration, ...generationHistory]);

      // Deduct credits
      setCredits((prev) => ({
        ...prev,
        current: Math.max(0, prev.current - 1),
      }));
    } catch (err) {
      setError('Failed to generate image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = () => {
    handleGenerate();
  };

  const handleDownload = () => {
    // Placeholder for download functionality
    console.log('Download image');
    alert('Download functionality will be implemented with backend integration');
  };

  const handleShare = () => {
    // Placeholder for share functionality
    console.log('Share image');
    alert('Share functionality will be implemented with backend integration');
  };

  const handleImageClick = (image: GeneratedImage) => {
    setCurrentImage(image.imageUrl);
    setPrompt(image.prompt);
    if (image.seed) setSeed(image.seed);
  };

  const handleImageDelete = (id: string) => {
    setGenerationHistory(generationHistory.filter((img) => img.id !== id));
  };

  const handleUpgrade = () => {
    // Redirect to pricing page
    window.location.href = '/pricing';
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F7] to-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-16 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] rounded-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-[#1F2937]">
              Text to Image
            </h1>
          </div>
          <p className="text-[#1F2937]/70">
            Transform your words into stunning visual art with Magical AI
          </p>
        </div>

        {/* Main Content - Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Left Panel - Input */}
          <div className="space-y-6">
            {/* Credits Display */}
            <CreditsDisplay
              currentCredits={credits.current}
              maxCredits={credits.max}
              tier={credits.tier}
              onUpgrade={handleUpgrade}
            />

            {/* Prompt Input */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                disabled={isGenerating}
                maxLength={500}
                minLength={3}
              />
            </div>

            {/* Advanced Settings */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <AdvancedSettings
                dimensions={dimensions}
                setDimensions={setDimensions}
                steps={steps}
                setSteps={setSteps}
                guidanceScale={guidanceScale}
                setGuidanceScale={setGuidanceScale}
                seed={seed}
                setSeed={setSeed}
                negativePrompt={negativePrompt}
                setNegativePrompt={setNegativePrompt}
                disabled={isGenerating}
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!isFormValid}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-3 ${
                isFormValid
                  ? 'bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white hover:shadow-2xl hover:scale-105'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-6 h-6" />
              {isGenerating ? 'Generating...' : 'Generate Image'}
            </button>

            {credits.current === 0 && (
              <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                <p className="text-sm text-yellow-800 text-center">
                  You're out of credits!{' '}
                  <button
                    onClick={handleUpgrade}
                    className="font-semibold underline hover:text-yellow-900"
                  >
                    Upgrade your plan
                  </button>{' '}
                  to continue generating.
                </p>
              </div>
            )}
          </div>

          {/* Right Panel - Output */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="bg-white rounded-2xl p-6 shadow-lg min-h-[600px]">
              <ImageOutput
                imageUrl={currentImage}
                isLoading={isGenerating}
                error={error}
                onRegenerate={handleRegenerate}
                onDownload={handleDownload}
                onShare={handleShare}
                prompt={prompt}
              />
            </div>
          </div>
        </div>

        {/* Generation History */}
        <div className="bg-white rounded-2xl p-6 shadow-lg">
          <GenerationHistory
            images={generationHistory}
            onImageClick={handleImageClick}
            onImageDelete={handleImageDelete}
          />
        </div>
      </div>
    </main>
  );
}
