/**
 * Image Generation API Functions
 *
 * Handles all image generation operations
 */

import apiClient from '../api-client';
import {
  Generation,
  GenerationListParams,
  GenerationListResponse,
  GenerationRequest,
  GenerationResponse,
} from '../types/api';

// ============================================================================
// Text-to-Image Generation
// ============================================================================

/**
 * Generate image from text prompt
 *
 * @param prompt - Text description
 * @param settings - Generation settings
 * @returns Generation response with ID
 */
export async function generateTextToImage(
  prompt: string,
  settings: Partial<GenerationRequest> = {}
): Promise<GenerationResponse> {
  const request: GenerationRequest = {
    prompt: prompt.trim(),
    ...settings,
  };

  return await apiClient.createGeneration(request);
}

// ============================================================================
// Image-to-Image Generation
// ============================================================================

/**
 * Upload image for image-to-image generation
 *
 * @param file - Image file
 * @returns Upload URL or reference
 */
export async function uploadImageForGeneration(
  file: File
): Promise<{ image_url: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.request<{ image_url: string }>({
    method: 'POST',
    url: '/generate/upload',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response;
}

/**
 * Generate image from input image and prompt
 *
 * @param imageUrl - URL of uploaded image
 * @param prompt - Text description
 * @param settings - Generation settings
 * @returns Generation response with ID
 */
export async function generateImageToImage(
  imageUrl: string,
  prompt: string,
  settings: Partial<GenerationRequest> = {}
): Promise<GenerationResponse> {
  const response = await apiClient.request<GenerationResponse>({
    method: 'POST',
    url: '/generate/image-to-image',
    data: {
      image_url: imageUrl,
      prompt: prompt.trim(),
      ...settings,
    },
  });

  return response;
}

// ============================================================================
// Generation Status
// ============================================================================

/**
 * Get generation status
 *
 * @param generationId - Generation ID
 * @returns Current generation state
 */
export async function getGenerationStatus(
  generationId: string
): Promise<Generation> {
  return await apiClient.getGeneration(generationId);
}

/**
 * Poll generation status until complete
 *
 * @param generationId - Generation ID
 * @param options - Polling options
 * @returns Completed generation
 */
export async function pollGenerationStatus(
  generationId: string,
  options: {
    interval?: number;
    maxAttempts?: number;
    onProgress?: (generation: Generation) => void;
  } = {}
): Promise<Generation> {
  const { interval = 2000, maxAttempts = 60, onProgress } = options;

  let attempts = 0;

  const poll = async (): Promise<Generation> => {
    if (attempts >= maxAttempts) {
      throw new Error('Generation timeout');
    }

    attempts++;
    const generation = await getGenerationStatus(generationId);

    // Call progress callback
    if (onProgress) {
      onProgress(generation);
    }

    // Check if completed
    if (generation.status === 'completed') {
      return generation;
    }

    // Check if failed
    if (generation.status === 'failed') {
      throw new Error(generation.error_message || 'Generation failed');
    }

    // Check if cancelled
    if (generation.status === 'cancelled') {
      throw new Error('Generation was cancelled');
    }

    // Continue polling
    await new Promise((resolve) => setTimeout(resolve, interval));
    return poll();
  };

  return poll();
}

// ============================================================================
// Generation History
// ============================================================================

/**
 * Get generation history
 *
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 * @param filters - Additional filters
 * @returns Paginated generation list
 */
export async function getGenerationHistory(
  page = 1,
  limit = 20,
  filters: Partial<GenerationListParams> = {}
): Promise<GenerationListResponse> {
  return await apiClient.listGenerations({
    page,
    page_size: limit,
    ...filters,
  });
}

/**
 * Get single generation details
 *
 * @param generationId - Generation ID
 * @returns Generation details
 */
export async function getGeneration(generationId: string): Promise<Generation> {
  return await apiClient.getGeneration(generationId);
}

// ============================================================================
// Generation Management
// ============================================================================

/**
 * Delete generation
 *
 * @param generationId - Generation ID
 * @returns Success confirmation
 */
export async function deleteGeneration(
  generationId: string
): Promise<{ success: boolean }> {
  return await apiClient.deleteGeneration(generationId);
}

/**
 * Cancel running generation
 *
 * @param generationId - Generation ID
 * @returns Success confirmation
 */
export async function cancelGeneration(
  generationId: string
): Promise<{ success: boolean }> {
  return await apiClient.cancelGeneration(generationId);
}

/**
 * Download generated image
 *
 * @param imageUrl - Image URL
 * @param filename - Download filename
 */
export async function downloadImage(
  imageUrl: string,
  filename = 'generated-image.png'
): Promise<void> {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download image:', error);
    throw new Error('Failed to download image');
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Delete multiple generations
 *
 * @param generationIds - Array of generation IDs
 * @returns Results for each deletion
 */
export async function deleteMultipleGenerations(
  generationIds: string[]
): Promise<Array<{ id: string; success: boolean; error?: string }>> {
  const results = await Promise.allSettled(
    generationIds.map((id) => deleteGeneration(id))
  );

  return results.map((result, index) => ({
    id: generationIds[index],
    success: result.status === 'fulfilled',
    error: result.status === 'rejected' ? result.reason?.message : undefined,
  }));
}

/**
 * Download multiple images as ZIP
 *
 * @param imageUrls - Array of image URLs
 * @param zipFilename - ZIP file name
 */
export async function downloadMultipleImages(
  imageUrls: string[],
  zipFilename = 'generated-images.zip'
): Promise<void> {
  try {
    // Request backend to create ZIP
    const response = await apiClient.request<{ download_url: string }>({
      method: 'POST',
      url: '/generate/download-zip',
      data: { image_urls: imageUrls },
    });

    // Download ZIP
    const link = document.createElement('a');
    link.href = response.download_url;
    link.download = zipFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Failed to download images:', error);
    throw new Error('Failed to download images');
  }
}
