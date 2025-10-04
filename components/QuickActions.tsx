'use client';

import React from 'react';
import { Wand2, Image as ImageIcon, Settings, CreditCard } from 'lucide-react';

interface QuickAction {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  gradientFrom: string;
  gradientTo: string;
}

const quickActions: QuickAction[] = [
  {
    title: 'Create Text to Image',
    description: 'Generate images from text prompts',
    icon: <Wand2 className="w-6 h-6" />,
    href: '/generate/text-to-image',
    gradientFrom: '#FF6B9D',
    gradientTo: '#A855F7',
  },
  {
    title: 'Transform Image',
    description: 'Modify existing images with AI',
    icon: <ImageIcon className="w-6 h-6" />,
    href: '/generate/image-to-image',
    gradientFrom: '#A855F7',
    gradientTo: '#6366F1',
  },
  {
    title: 'Account Settings',
    description: 'Manage your profile and preferences',
    icon: <Settings className="w-6 h-6" />,
    href: '/settings',
    gradientFrom: '#6366F1',
    gradientTo: '#8B5CF6',
  },
  {
    title: 'Upgrade Plan',
    description: 'Get more credits and features',
    icon: <CreditCard className="w-6 h-6" />,
    href: '/pricing',
    gradientFrom: '#8B5CF6',
    gradientTo: '#FF6B9D',
  },
];

export default function QuickActions() {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Quick Actions</h2>
        <p className="text-gray-500 text-sm mt-1">
          Frequently used features at your fingertips
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <ActionCard key={action.title} action={action} />
        ))}
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: QuickAction }) {
  return (
    <a
      href={action.href}
      className="group block p-4 rounded-xl border-2 border-gray-100 hover:border-transparent hover:shadow-lg transition-all duration-300"
      style={{
        backgroundImage: `linear-gradient(white, white), linear-gradient(135deg, ${action.gradientFrom}, ${action.gradientTo})`,
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
      }}
    >
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300"
        style={{
          background: `linear-gradient(135deg, ${action.gradientFrom}, ${action.gradientTo})`,
        }}
      >
        <div className="text-white">{action.icon}</div>
      </div>

      {/* Content */}
      <h3 className="text-base font-bold text-gray-900 mb-1 group-hover:bg-gradient-to-r group-hover:from-[#FF6B9D] group-hover:to-[#A855F7] group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
        {action.title}
      </h3>
      <p className="text-sm text-gray-500">{action.description}</p>
    </a>
  );
}

// Loading skeleton component
export function QuickActionsSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 animate-pulse">
      <div className="mb-6">
        <div className="h-6 bg-gray-200 rounded w-32 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-56"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-xl border-2 border-gray-100">
            <div className="w-12 h-12 rounded-xl bg-gray-200 mb-3"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-full"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
