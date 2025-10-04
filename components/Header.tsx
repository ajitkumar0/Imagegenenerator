'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from './AuthModal';
import UserMenu from './UserMenu';

export default function Header() {
  const { isAuthenticated } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <>
      <header className="w-full py-6 px-4 md:px-8 lg:px-16">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FF6B9D] to-[#A855F7] flex items-center justify-center">
              <span className="text-white font-bold text-xl">IG</span>
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] bg-clip-text text-transparent">
              ImageGen AI
            </span>
          </a>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <a
              href="/#features"
              className="text-[#1F2937] hover:text-[#FF6B9D] transition-colors duration-300 font-medium"
            >
              Features
            </a>
            <a
              href="/pricing"
              className="text-[#1F2937] hover:text-[#FF6B9D] transition-colors duration-300 font-medium"
            >
              Pricing
            </a>
            <div className="relative group">
              <button className="text-[#1F2937] hover:text-[#FF6B9D] transition-colors duration-300 font-medium">
                Generate
              </button>
              <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
                <a
                  href="/generate/text-to-image"
                  className="block px-4 py-3 text-[#1F2937] hover:bg-[#FFF5F7] hover:text-[#FF6B9D] transition-colors font-medium rounded-t-lg"
                >
                  Text to Image
                </a>
                <a
                  href="/generate/image-to-image"
                  className="block px-4 py-3 text-[#1F2937] hover:bg-[#FFF5F7] hover:text-[#FF6B9D] transition-colors font-medium rounded-b-lg"
                >
                  Image to Image
                </a>
              </div>
            </div>

            {/* Auth-aware button */}
            {isAuthenticated ? (
              <UserMenu />
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-6 py-2 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-full font-semibold hover:shadow-lg hover:scale-105 transition-all duration-300"
              >
                Sign In
              </button>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <button className="md:hidden p-2 text-[#1F2937]">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );
}
