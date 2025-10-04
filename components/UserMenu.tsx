'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  User,
  Settings,
  CreditCard,
  LogOut,
  ChevronDown,
  Zap,
  LayoutDashboard,
} from 'lucide-react';
import Image from 'next/image';

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const tierColors = {
    free: 'from-gray-400 to-gray-600',
    basic: 'from-blue-400 to-blue-600',
    premium: 'from-[#FF6B9D] to-[#A855F7]',
  };

  const tierLabels = {
    free: 'Free',
    basic: 'Basic',
    premium: 'Premium',
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-2 rounded-full hover:bg-gray-100 transition-colors"
      >
        {/* Avatar */}
        <div className="relative">
          {user.avatar ? (
            <Image
              src={user.avatar}
              alt={user.name}
              width={40}
              height={40}
              className="rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
          {/* Tier Badge */}
          <div
            className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-r ${tierColors[user.tier]} flex items-center justify-center border-2 border-white`}
          >
            <Zap className="w-3 h-3 text-white" />
          </div>
        </div>

        {/* User Info (Hidden on mobile) */}
        <div className="hidden md:block text-left">
          <p className="text-sm font-semibold text-[#1F2937] leading-tight">
            {user.name}
          </p>
          <p className="text-xs text-[#1F2937]/60">{tierLabels[user.tier]} Plan</p>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-gray-600 hidden md:block transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 animate-slideDown">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-[#1F2937]">{user.name}</p>
            <p className="text-sm text-[#1F2937]/60">{user.email}</p>

            {/* Credits Display */}
            <div className="mt-3 p-3 bg-gradient-to-r from-[#FFF5F7] to-white rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#FF6B9D]" />
                  <span className="text-sm font-medium text-[#1F2937]">
                    {user.credits} Credits
                  </span>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full bg-gradient-to-r ${tierColors[user.tier]} text-white`}
                >
                  {tierLabels[user.tier]}
                </span>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <a
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-3 hover:bg-[#FFF5F7] transition-colors text-[#1F2937]"
            >
              <LayoutDashboard className="w-5 h-5" />
              <div>
                <p className="font-medium">Dashboard</p>
                <p className="text-xs text-[#1F2937]/60">View your generations</p>
              </div>
            </a>

            <a
              href="/settings"
              className="flex items-center gap-3 px-4 py-3 hover:bg-[#FFF5F7] transition-colors text-[#1F2937]"
            >
              <Settings className="w-5 h-5" />
              <div>
                <p className="font-medium">Settings</p>
                <p className="text-xs text-[#1F2937]/60">Manage your account</p>
              </div>
            </a>

            <a
              href="/pricing"
              className="flex items-center gap-3 px-4 py-3 hover:bg-[#FFF5F7] transition-colors text-[#1F2937]"
            >
              <CreditCard className="w-5 h-5" />
              <div>
                <p className="font-medium">Billing & Plans</p>
                <p className="text-xs text-[#1F2937]/60">Upgrade or manage subscription</p>
              </div>
            </a>
          </div>

          {/* Sign Out */}
          <div className="border-t border-gray-100 pt-1">
            <button
              onClick={() => {
                signOut();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-red-600"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slideDown {
          animation: slideDown 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
