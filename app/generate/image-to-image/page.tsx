'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import PromptInput from '@/components/PromptInput';
import AdvancedSettings from '@/components/AdvancedSettings';
import ImageOutput from '@/components/ImageOutput';
import GenerationHistory from '@/components/GenerationHistory';
import CreditsDisplay from '@/components/CreditsDisplay';
import ImageUpload from '@/components/ImageUpload';
import StrengthSlider from '@/components/StrengthSlider';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import { Wand2, AlertCircle } from 'lucide-react';

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: Date;
  dimensions: string;
  seed?: string;
  originalImage?: string;
  strength?: number;
}

export default function ImageToImagePage() {
  // Form State
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [dimensions, setDimensions] = useState('1024x1024');
  const [steps, setSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [seed, setSeed] = useState('');
  const [strength, setStrength] = useState(0.5);

  // Image Upload State
  const [uploadedFile, setUploadedFile] = useState<File>();
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string>();

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentImage, setCurrentImage] = useState<string>();
  const [error, setError] = useState<string>();
  const [showComparison, setShowComparison] = useState(false);

  // History State
  const [generationHistory, setGenerationHistory] = useState<GeneratedImage[]>([
    // Mock data with original images
    {
      id: '1',
      imageUrl: 'https://placehold.co/1024x1024/A855F7/FFFFFF?text=Transformed+1',
      originalImage: 'https://placehold.co/1024x1024/666666/FFFFFF?text=Original+1',
      prompt: 'Transform into a watercolor painting',
      timestamp: new Date(Date.now() - 3600000),
      dimensions: '1024x1024',
      strength: 0.7,
    },
  ]);

  // Credits State
  const [credits, setCredits] = useState({
    current: 8,
    max: 10,
    tier: 'free' as 'free' | 'basic' | 'premium',
  });

  // Validation
  const isFormValid =
    prompt.length >= 3 &&
    prompt.length <= 500 &&
    uploadedImagePreview &&
    !isGenerating &&
    credits.current > 0;

  // Handle Image Upload
  const handleImageSelect = (file: File, preview: string) => {
    setUploadedFile(file);
    setUploadedImagePreview(preview);
    setError(undefined);
  };

  const handleImageRemove = () => {
    setUploadedFile(undefined);
    setUploadedImagePreview(undefined);
    setCurrentImage(undefined);
    setShowComparison(false);
  };

  // Generate Function
  const handleGenerate = async () => {
    if (!isFormValid) return;

    setIsGenerating(true);
    setError(undefined);
    setShowComparison(false);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Mock response
      const mockImageUrl = `https://placehold.co/1024x1024/${
        Math.random() > 0.5 ? 'FF6B9D' : 'A855F7'
      }/FFFFFF?text=Transformed+Image`;

      setCurrentImage(mockImageUrl);
      setShowComparison(true);

      // Add to history
      const newGeneration: GeneratedImage = {
        id: Date.now().toString(),
        imageUrl: mockImageUrl,
        originalImage: uploadedImagePreview,
        prompt,
        timestamp: new Date(),
        dimensions,
        seed: seed || undefined,
        strength,
      };

      setGenerationHistory([newGeneration, ...generationHistory]);

      // Deduct credits
      setCredits((prev) => ({
        ...prev,
        current: Math.max(0, prev.current - 2), // Image-to-image costs more
      }));
    } catch (err) {
      setError('Failed to transform image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = () => {
    handleGenerate();
  };

  const handleDownload = () => {
    console.log('Download image');
    alert('Download functionality will be implemented with backend integration');
  };

  const handleShare = () => {
    console.log('Share image');
    alert('Share functionality will be implemented with backend integration');
  };

  const handleImageClick = (image: GeneratedImage) => {
    setCurrentImage(image.imageUrl);
    setUploadedImagePreview(image.originalImage);
    setPrompt(image.prompt);
    if (image.seed) setSeed(image.seed);
    if (image.strength) setStrength(image.strength);
    setShowComparison(true);
  };

  const handleImageDelete = (id: string) => {
    setGenerationHistory(generationHistory.filter((img) => img.id !== id));
  };

  const handleUpgrade = () => {
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
              <Wand2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-[#1F2937]">
              Image to Image
            </h1>
          </div>
          <p className="text-[#1F2937]/70">
            Transform your images with AI - reimagine photos in new styles and variations
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

            {/* Image Upload */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <ImageUpload
                onImageSelect={handleImageSelect}
                onImageRemove={handleImageRemove}
                uploadedImage={uploadedImagePreview}
                disabled={isGenerating}
              />
            </div>

            {/* Prompt Input */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                disabled={isGenerating || !uploadedImagePreview}
                maxLength={500}
                minLength={3}
              />

              {!uploadedImagePreview && prompt.length > 0 && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">
                    Please upload a reference image first
                  </p>
                </div>
              )}
            </div>

            {/* Strength Slider */}
            {uploadedImagePreview && (
              <div className="bg-white rounded-2xl p-6 shadow-lg">
                <StrengthSlider
                  value={strength}
                  onChange={setStrength}
                  disabled={isGenerating}
                />
              </div>
            )}

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
                disabled={isGenerating || !uploadedImagePreview}
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
              <Wand2 className="w-6 h-6" />
              {isGenerating ? 'Transforming...' : 'Transform Image'}
            </button>

            {/* Credit Cost Notice */}
            <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <p className="text-sm text-blue-800 text-center">
                <strong>Note:</strong> Image-to-image uses 2 credits per generation
              </p>
            </div>

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
          <div className="lg:sticky lg:top-8 lg:self-start space-y-6">
            {/* Image Output or Comparison */}
            <div className="bg-white rounded-2xl p-6 shadow-lg min-h-[600px]">
              {showComparison && currentImage && uploadedImagePreview ? (
                <BeforeAfterSlider
                  beforeImage={uploadedImagePreview}
                  afterImage={currentImage}
                />
              ) : (
                <ImageOutput
                  imageUrl={currentImage}
                  isLoading={isGenerating}
                  error={error}
                  onRegenerate={handleRegenerate}
                  onDownload={handleDownload}
                  onShare={handleShare}
                  prompt={prompt}
                />
              )}
            </div>

            {/* Toggle Comparison View */}
            {currentImage && uploadedImagePreview && !isGenerating && (
              <button
                onClick={() => setShowComparison(!showComparison)}
                className="w-full px-6 py-3 bg-white border-2 border-gray-300 text-[#1F2937] rounded-xl font-semibold hover:border-[#FF6B9D] hover:shadow-lg transition-all duration-300"
              >
                {showComparison ? 'Show Result Only' : 'Show Comparison'}
              </button>
            )}
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
