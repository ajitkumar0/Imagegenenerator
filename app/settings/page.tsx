'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import {
  User,
  Bell,
  Key,
  Save,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, updateUser, isAuthenticated } = useAuth();

  // Profile Settings
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');

  // Notification Settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [generationComplete, setGenerationComplete] = useState(true);
  const [creditsLow, setCreditsLow] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  // API Key Settings
  const [apiKey, setApiKey] = useState(user?.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedApiKey, setCopiedApiKey] = useState(false);

  // Loading States
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#FFF5F7] to-white">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-bold text-[#1F2937] mb-4">
            Please Sign In
          </h1>
          <p className="text-[#1F2937]/70 mb-8">
            You need to be signed in to access settings.
          </p>
          <button
            onClick={() => (window.location.href = '/')}
            className="px-6 py-3 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-xl font-semibold hover:shadow-xl transition-all"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    updateUser({ name, email });
    setIsSavingProfile(false);
  };

  const handleSaveNotifications = async () => {
    setIsSavingNotifications(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Save notification preferences
    setIsSavingNotifications(false);
  };

  const handleGenerateApiKey = async () => {
    setIsGeneratingKey(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const newKey = 'ig_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    setApiKey(newKey);
    updateUser({ apiKey: newKey });
    setIsGeneratingKey(false);
  };

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedApiKey(true);
    setTimeout(() => setCopiedApiKey(false), 2000);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F7] to-white">
      <Header />

      <div className="max-w-4xl mx-auto px-4 md:px-8 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1F2937] mb-2">
            Settings
          </h1>
          <p className="text-[#1F2937]/70">
            Manage your account settings and preferences
          </p>
        </div>

        {/* Profile Settings */}
        <section className="bg-white rounded-2xl p-6 md:p-8 shadow-lg mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] rounded-lg">
              <User className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[#1F2937]">Profile</h2>
          </div>

          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-[#FF6B9D] focus:outline-none transition-colors"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-[#FF6B9D] focus:outline-none transition-colors"
              />
              <p className="mt-2 text-xs text-[#1F2937]/60">
                This email is used for sign-in and notifications
              </p>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="px-6 py-3 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-xl font-semibold hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSavingProfile ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </section>

        {/* Notification Preferences */}
        <section className="bg-white rounded-2xl p-6 md:p-8 shadow-lg mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] rounded-lg">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[#1F2937]">Notifications</h2>
          </div>

          <div className="space-y-4">
            {/* Email Notifications Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="font-semibold text-[#1F2937]">Email Notifications</p>
                <p className="text-sm text-[#1F2937]/60">
                  Receive notifications via email
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#FF6B9D]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#FF6B9D] peer-checked:to-[#A855F7]"></div>
              </label>
            </div>

            {/* Individual Notification Options */}
            {emailNotifications && (
              <div className="ml-4 space-y-3 pl-4 border-l-2 border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#1F2937]">
                    Generation completed
                  </span>
                  <input
                    type="checkbox"
                    checked={generationComplete}
                    onChange={(e) => setGenerationComplete(e.target.checked)}
                    className="w-4 h-4 text-[#FF6B9D] rounded focus:ring-[#FF6B9D]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#1F2937]">Credits running low</span>
                  <input
                    type="checkbox"
                    checked={creditsLow}
                    onChange={(e) => setCreditsLow(e.target.checked)}
                    className="w-4 h-4 text-[#FF6B9D] rounded focus:ring-[#FF6B9D]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#1F2937]">Weekly digest</span>
                  <input
                    type="checkbox"
                    checked={weeklyDigest}
                    onChange={(e) => setWeeklyDigest(e.target.checked)}
                    className="w-4 h-4 text-[#FF6B9D] rounded focus:ring-[#FF6B9D]"
                  />
                </div>
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={handleSaveNotifications}
              disabled={isSavingNotifications}
              className="px-6 py-3 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-xl font-semibold hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSavingNotifications ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Preferences
                </>
              )}
            </button>
          </div>
        </section>

        {/* API Key Management (Premium Only) */}
        {(user?.tier === 'premium' || user?.tier === 'basic') && (
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] rounded-lg">
                <Key className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-[#1F2937]">API Key</h2>
                {user?.tier === 'basic' && (
                  <p className="text-sm text-[#1F2937]/60">
                    Upgrade to Premium for full API access
                  </p>
                )}
              </div>
              {user?.tier === 'premium' && (
                <span className="px-3 py-1 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white text-xs font-semibold rounded-full">
                  Premium Feature
                </span>
              )}
            </div>

            <div className="space-y-4">
              <p className="text-sm text-[#1F2937]/70">
                Use your API key to programmatically generate images. Keep your
                key secure and never share it publicly.
              </p>

              {apiKey ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        readOnly
                        className="w-full px-4 py-3 pr-12 rounded-xl border-2 border-gray-300 bg-gray-50 font-mono text-sm"
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
                      >
                        {showApiKey ? (
                          <EyeOff className="w-5 h-5 text-gray-600" />
                        ) : (
                          <Eye className="w-5 h-5 text-gray-600" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={handleCopyApiKey}
                      className="px-4 py-3 bg-white border-2 border-gray-300 rounded-xl hover:border-[#FF6B9D] transition-colors flex items-center gap-2"
                    >
                      {copiedApiKey ? (
                        <>
                          <Check className="w-5 h-5 text-green-600" />
                          <span className="text-sm font-medium text-green-600">
                            Copied!
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-5 h-5" />
                          <span className="text-sm font-medium">Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  <button
                    onClick={handleGenerateApiKey}
                    disabled={isGeneratingKey}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Regenerate API Key (this will invalidate the old key)
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerateApiKey}
                  disabled={isGeneratingKey || user?.tier !== 'premium'}
                  className="px-6 py-3 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-xl font-semibold hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGeneratingKey ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Key className="w-5 h-5" />
                      Generate API Key
                    </>
                  )}
                </button>
              )}

              {user?.tier !== 'premium' && (
                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> API access requires a Premium plan.{' '}
                    <a href="/pricing" className="underline font-semibold">
                      Upgrade now
                    </a>
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
