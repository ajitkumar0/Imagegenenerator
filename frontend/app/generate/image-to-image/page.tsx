/**
 * Image-to-Image Generation Page
 *
 * Features:
 * - Image upload with preview
 * - Prompt-based image transformation
 * - Real-time status updates
 * - Error handling and validation
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import apiClient from '@/lib/api-client';
import { useGenerationUpdates } from '@/lib/websocket-client';
import {
  GenerationRequest,
  GenerationResponse,
  Generation,
  FluxModel,
  UsageStats,
} from '@/lib/types/api';

export default function ImageToImagePage() {
  return (
    <ProtectedRoute>
      <ImageToImageContent />
    </ProtectedRoute>
  );
}

function ImageToImageContent() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [model, setModel] = useState<FluxModel>('flux-schnell');
  const [strength, setStrength] = useState(0.8); // How much to transform (0-1)
  const [guidanceScale, setGuidanceScale] = useState(7.5);

  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGeneration, setCurrentGeneration] = useState<Generation | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Usage stats
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  // Real-time updates
  const {
    isConnected: wsConnected,
    status: wsStatus,
    progress: wsProgress,
  } = useGenerationUpdates({
    generationId: currentGeneration?.id || '',
    enabled: !!currentGeneration && currentGeneration.status === 'processing',
    onUpdate: (update) => {
      console.log('Generation update:', update);
      if (update.status === 'completed' && update.blob_urls) {
        refreshCurrentGeneration();
      }
    },
  });

  // Load usage stats on mount
  useEffect(() => {
    loadUsageStats();
  }, []);

  // Handle file selection
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    // Cleanup
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  // ==========================================================================
  // Load Usage Stats
  // ==========================================================================

  const loadUsageStats = async () => {
    try {
      const stats = await apiClient.getUsageStats();
      setUsageStats(stats);
    } catch (error: any) {
      console.error('Failed to load usage stats:', error);
    }
  };

  // ==========================================================================
  // Handle File Selection
  // ==========================================================================

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be smaller than 10MB');
      return;
    }

    setSelectedFile(file);
    setUploadedImageUrl(null);
    setError(null);
  };

  // ==========================================================================
  // Handle Image Upload
  // ==========================================================================

  const uploadImage = async (): Promise<string> => {
    if (!selectedFile) {
      throw new Error('No file selected');
    }

    setIsUploading(true);
    setError(null);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Upload to backend
      const response = await apiClient.request<{ url: string }>({
        method: 'POST',
        url: '/generations/upload',
        data: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const imageUrl = response.url;
      setUploadedImageUrl(imageUrl);
      return imageUrl;
    } catch (error: any) {
      console.error('Upload failed:', error);
      throw new Error(error.detail || 'Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  // ==========================================================================
  // Refresh Current Generation
  // ==========================================================================

  const refreshCurrentGeneration = async () => {
    if (!currentGeneration) return;

    try {
      const updated = await apiClient.getGeneration(currentGeneration.id);
      setCurrentGeneration(updated);

      if (updated.status === 'completed') {
        setGeneratedImages((prev) => [updated, ...prev]);
        setIsGenerating(false);
        loadUsageStats();
      } else if (updated.status === 'failed') {
        setError(updated.error_message || 'Generation failed');
        setIsGenerating(false);
      }
    } catch (error: any) {
      console.error('Failed to refresh generation:', error);
    }
  };

  // ==========================================================================
  // Handle Generate
  // ==========================================================================

  const handleGenerate = async () => {
    // Validation
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    if (!selectedFile && !uploadedImageUrl) {
      setError('Please select an image');
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      // Check credits
      if (usageStats && !usageStats.is_unlimited && usageStats.credits_remaining <= 0) {
        setError('Insufficient credits. Please upgrade your subscription.');
        setIsGenerating(false);
        return;
      }

      // Upload image if not already uploaded
      let imageUrl = uploadedImageUrl;
      if (!imageUrl && selectedFile) {
        imageUrl = await uploadImage();
      }

      if (!imageUrl) {
        throw new Error('Failed to get image URL');
      }

      // Create generation request
      const request: GenerationRequest = {
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim() || undefined,
        image_url: imageUrl,
        prompt_strength: strength,
        model,
        guidance_scale: guidanceScale,
        output_format: 'png',
      };

      const response: GenerationResponse = await apiClient.createGeneration(request);

      // Get full generation details
      const generation = await apiClient.getGeneration(response.generation_id);
      setCurrentGeneration(generation);

      // Start polling if WebSocket not connected
      if (!wsConnected) {
        pollGenerationStatus(response.generation_id);
      }
    } catch (error: any) {
      console.error('Generation failed:', error);
      setError(error.message || error.detail || 'Failed to start generation');
      setIsGenerating(false);
    }
  };

  // ==========================================================================
  // Poll Generation Status
  // ==========================================================================

  const pollGenerationStatus = async (generationId: string) => {
    const maxAttempts = 90; // 3 minutes with 2s interval (img2img takes longer)
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setError('Generation timeout');
        setIsGenerating(false);
        return;
      }

      try {
        const generation = await apiClient.getGeneration(generationId);
        setCurrentGeneration(generation);

        if (generation.status === 'completed') {
          setGeneratedImages((prev) => [generation, ...prev]);
          setIsGenerating(false);
          loadUsageStats();
        } else if (generation.status === 'failed') {
          setError(generation.error_message || 'Generation failed');
          setIsGenerating(false);
        } else if (generation.status === 'processing' || generation.status === 'pending') {
          attempts++;
          setTimeout(poll, 2000);
        }
      } catch (error: any) {
        console.error('Polling error:', error);
        setError('Failed to check generation status');
        setIsGenerating(false);
      }
    };

    poll();
  };

  // ==========================================================================
  // Handle Cancel
  // ==========================================================================

  const handleCancel = async () => {
    if (!currentGeneration) return;

    try {
      await apiClient.cancelGeneration(currentGeneration.id);
      setCurrentGeneration(null);
      setIsGenerating(false);
    } catch (error: any) {
      console.error('Failed to cancel generation:', error);
    }
  };

  // ==========================================================================
  // Handle Clear Image
  // ==========================================================================

  const handleClearImage = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadedImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Image to Image</h1>
        <p className="mt-2 text-gray-600">
          Transform existing images with AI using your prompts
        </p>
      </div>

      {/* Usage Stats */}
      {usageStats && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">
                Credits: {usageStats.is_unlimited ? 'Unlimited' : usageStats.credits_remaining}
              </p>
              <p className="text-xs text-blue-700">
                Tier: {usageStats.tier} • Resets: {new Date(usageStats.period_end).toLocaleDateString()}
              </p>
            </div>
            {!usageStats.is_unlimited && (
              <div className="text-right">
                <p className="text-sm text-blue-900">
                  {usageStats.usage_percentage.toFixed(0)}% used
                </p>
                <div className="mt-1 w-32 h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600"
                    style={{ width: `${usageStats.usage_percentage}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto flex-shrink-0 text-red-400 hover:text-red-600"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Generation Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Settings</h2>

            {/* Image Upload */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source Image *
              </label>

              {previewUrl ? (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full rounded-lg border-2 border-gray-300"
                  />
                  <button
                    onClick={handleClearImage}
                    disabled={isGenerating || isUploading}
                    className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-lg hover:bg-red-700"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {uploadedImageUrl && (
                    <div className="absolute top-2 left-2 bg-green-600 text-white px-2 py-1 rounded text-xs">
                      ✓ Uploaded
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
                >
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">
                    Click to upload an image
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                disabled={isGenerating || isUploading}
                className="hidden"
              />
            </div>

            {/* Prompt */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transformation Prompt *
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating || isUploading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="Transform into a watercolor painting..."
              />
              <p className="mt-1 text-xs text-gray-500">
                {prompt.length}/500 characters
              </p>
            </div>

            {/* Negative Prompt */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Negative Prompt
              </label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                disabled={isGenerating || isUploading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
                placeholder="blurry, distorted..."
              />
            </div>

            {/* Model Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as FluxModel)}
                disabled={isGenerating || isUploading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="flux-schnell">FLUX Schnell (Fast)</option>
                <option value="flux-dev">FLUX Dev (Balanced)</option>
                <option value="flux-1.1-pro">FLUX Pro (Best Quality)</option>
              </select>
            </div>

            {/* Transformation Strength */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transformation Strength: {strength.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                disabled={isGenerating || isUploading}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Lower = closer to original, Higher = more creative
              </p>
            </div>

            {/* Guidance Scale */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Guidance Scale: {guidanceScale}
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(Number(e.target.value))}
                disabled={isGenerating || isUploading}
                className="w-full"
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isUploading || !prompt.trim() || !selectedFile}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? 'Uploading...' : isGenerating ? 'Transforming...' : 'Transform Image'}
            </button>

            {/* Cancel Button */}
            {isGenerating && (
              <button
                onClick={handleCancel}
                className="w-full mt-2 bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          {/* Current Generation */}
          {currentGeneration && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Current Generation</h2>

              {/* Status */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Status: <span className="capitalize">{wsStatus || currentGeneration.status}</span>
                  </span>
                  {wsConnected && (
                    <span className="text-xs text-green-600">● Connected</span>
                  )}
                </div>

                {(currentGeneration.status === 'processing' || currentGeneration.status === 'pending') && (
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${wsProgress || 0}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Comparison: Before & After */}
              {currentGeneration.blob_urls.length > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Before */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Before</p>
                      {previewUrl && (
                        <img
                          src={previewUrl}
                          alt="Original"
                          className="w-full rounded-lg border border-gray-300"
                        />
                      )}
                    </div>

                    {/* After */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">After</p>
                      <img
                        src={currentGeneration.blob_urls[0]}
                        alt={currentGeneration.prompt}
                        className="w-full rounded-lg border border-gray-300"
                      />
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <a
                      href={currentGeneration.blob_urls[0]}
                      download
                      className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-center hover:bg-blue-700"
                    >
                      Download Result
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Previous Generations */}
          {generatedImages.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Transformations</h2>
              <div className="grid grid-cols-2 gap-4">
                {generatedImages.map((gen) => (
                  <div key={gen.id} className="relative group">
                    {gen.blob_urls[0] && (
                      <img
                        src={gen.blob_urls[0]}
                        alt={gen.prompt}
                        className="w-full rounded-lg"
                      />
                    )}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded-lg flex items-center justify-center">
                      <a
                        href={gen.blob_urls[0]}
                        download
                        className="opacity-0 group-hover:opacity-100 bg-white text-gray-900 py-2 px-4 rounded-lg transition-opacity"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
