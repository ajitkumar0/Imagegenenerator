'use client';

import React, { useState, useRef, DragEvent } from 'react';
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react';
import Image from 'next/image';

interface ImageUploadProps {
  onImageSelect: (file: File, preview: string) => void;
  onImageRemove: () => void;
  uploadedImage?: string;
  disabled?: boolean;
  maxSizeMB?: number;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10;

export default function ImageUpload({
  onImageSelect,
  onImageRemove,
  uploadedImage,
  disabled = false,
  maxSizeMB = MAX_SIZE_MB,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file format. Please upload JPG, PNG, or WebP images only.';
    }

    // Check file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      return `File is too large. Maximum size is ${maxSizeMB}MB. Your file is ${sizeMB.toFixed(2)}MB.`;
    }

    return null;
  };

  const handleFile = async (file: File) => {
    setError(undefined);
    setUploading(true);
    setUploadProgress(0);

    // Validate file
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setUploading(false);
      return;
    }

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      const preview = reader.result as string;

      // Get image dimensions
      const img = document.createElement('img');
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        setUploadProgress(100);
        setTimeout(() => {
          setUploading(false);
          onImageSelect(file, preview);
        }, 300);
      };
      img.src = preview;
    };

    reader.readAsDataURL(file);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleBrowseClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleRemove = () => {
    setError(undefined);
    setImageDimensions(undefined);
    setUploadProgress(0);
    onImageRemove();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-[#1F2937] mb-2">
        Upload Reference Image
      </label>

      {!uploadedImage ? (
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleBrowseClick}
          className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer ${
            isDragging
              ? 'border-[#FF6B9D] bg-[#FF6B9D]/5'
              : error
              ? 'border-red-400 bg-red-50'
              : 'border-gray-300 hover:border-[#FF6B9D] bg-gray-50 hover:bg-gray-100'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {/* Upload Icon and Text */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-white" />
            </div>

            <p className="text-lg font-semibold text-[#1F2937] mb-2">
              {isDragging ? 'Drop your image here' : 'Drag & drop your image here'}
            </p>

            <p className="text-sm text-[#1F2937]/70 mb-4">or click to browse</p>

            <div className="flex items-center gap-4 text-xs text-[#1F2937]/50">
              <span>JPG, PNG, WebP</span>
              <span>•</span>
              <span>Max {maxSizeMB}MB</span>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileInput}
            className="hidden"
            disabled={disabled}
          />

          {/* Upload Progress */}
          {uploading && (
            <div className="absolute inset-0 bg-white/95 rounded-xl flex flex-col items-center justify-center">
              <div className="w-16 h-16 border-4 border-[#FF6B9D] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-[#1F2937] mb-2">Uploading...</p>
              <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-[#1F2937]/70 mt-2">{uploadProgress}%</p>
            </div>
          )}
        </div>
      ) : (
        <div className="relative border-2 border-gray-300 rounded-xl overflow-hidden bg-gray-100">
          {/* Image Preview */}
          <div className="relative w-full aspect-video">
            <Image src={uploadedImage} alt="Uploaded" fill className="object-contain" />
          </div>

          {/* Image Info Overlay */}
          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#FF6B9D]" />
              {imageDimensions && (
                <span className="text-xs font-semibold text-[#1F2937]">
                  {imageDimensions.width} × {imageDimensions.height}
                </span>
              )}
            </div>
          </div>

          {/* Remove Button */}
          <button
            onClick={handleRemove}
            className="absolute top-4 right-4 p-2 bg-red-500 hover:bg-red-600 rounded-full transition-all shadow-lg"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Helper Text */}
      {!error && !uploadedImage && (
        <p className="mt-2 text-xs text-[#1F2937]/50">
          Upload a reference image to transform it with AI
        </p>
      )}
    </div>
  );
}
