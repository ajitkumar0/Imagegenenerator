'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import StatsCard, { StatsCardSkeleton } from '@/components/StatsCard';
import UsageChart, { UsageChartSkeleton } from '@/components/UsageChart';
import RecentGenerations, {
  RecentGenerationsSkeleton,
} from '@/components/RecentGenerations';
import QuickActions, { QuickActionsSkeleton } from '@/components/QuickActions';
import { Sparkles, Wallet, Calendar } from 'lucide-react';

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, authLoading, router]);

  // Simulate data loading
  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  // Mock data
  const statsData = {
    generationsUsed: user?.tier === 'free' ? 3 : user?.tier === 'basic' ? 45 : 127,
    totalGenerations: user?.tier === 'free' ? 10 : user?.tier === 'basic' ? 200 : 999999,
    creditsRemaining: user?.credits || 0,
    daysUntilRenewal: user?.tier === 'free' ? null : 23,
  };

  const usageData = [
    { date: 'Mon', generations: 5 },
    { date: 'Tue', generations: 8 },
    { date: 'Wed', generations: 12 },
    { date: 'Thu', generations: 6 },
    { date: 'Fri', generations: 15 },
    { date: 'Sat', generations: 10 },
    { date: 'Sun', generations: 7 },
  ];

  const recentGenerations = user?.tier === 'free' && statsData.generationsUsed === 0
    ? []
    : [
        {
          id: '1',
          imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500',
          prompt: 'A mystical forest with glowing mushrooms at twilight',
          createdAt: '2 hours ago',
          type: 'text-to-image' as const,
        },
        {
          id: '2',
          imageUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=500',
          prompt: 'Futuristic city with flying cars and neon lights',
          createdAt: '5 hours ago',
          type: 'text-to-image' as const,
        },
        {
          id: '3',
          imageUrl: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=500',
          prompt: 'Steampunk robot playing violin',
          createdAt: '1 day ago',
          type: 'image-to-image' as const,
        },
        {
          id: '4',
          imageUrl: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=500',
          prompt: 'Abstract watercolor galaxy with nebula clouds',
          createdAt: '1 day ago',
          type: 'text-to-image' as const,
        },
        {
          id: '5',
          imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500',
          prompt: 'Underwater coral reef with bioluminescent creatures',
          createdAt: '2 days ago',
          type: 'text-to-image' as const,
        },
        {
          id: '6',
          imageUrl: 'https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=500',
          prompt: 'Mountain landscape in low-poly art style',
          createdAt: '3 days ago',
          type: 'image-to-image' as const,
        },
      ];

  // Mock action handlers
  const handleView = (id: string) => {
    console.log('View generation:', id);
    // TODO: Implement view modal or navigate to detail page
  };

  const handleDownload = (id: string) => {
    console.log('Download generation:', id);
    // TODO: Implement download functionality
  };

  const handleDelete = (id: string) => {
    console.log('Delete generation:', id);
    // TODO: Implement delete with confirmation
  };

  // Show loading state while checking auth
  if (authLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF5F7] to-[#FFFFFF]">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-8 lg:px-16 py-8">
        {/* Welcome section */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Welcome back, {user?.name?.split(' ')[0] || 'there'}! 👋
          </h1>
          <p className="text-gray-600">
            Here's what's happening with your AI image generation
          </p>
        </div>

        {/* Stats Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatsCard
              title="Generations Used"
              value={`${statsData.generationsUsed}/${
                statsData.totalGenerations === 999999
                  ? '∞'
                  : statsData.totalGenerations
              }`}
              icon={<Sparkles className="w-6 h-6" />}
              subtitle={
                user?.tier === 'premium'
                  ? 'Unlimited generations'
                  : `${
                      statsData.totalGenerations - statsData.generationsUsed
                    } remaining this month`
              }
              trend={
                user?.tier !== 'free'
                  ? { value: 12, isPositive: true }
                  : undefined
              }
              gradientFrom="#FF6B9D"
              gradientTo="#A855F7"
            />
            <StatsCard
              title="Credits Balance"
              value={statsData.creditsRemaining}
              icon={<Wallet className="w-6 h-6" />}
              subtitle={
                user?.tier === 'free'
                  ? 'Upgrade for more credits'
                  : '1 credit per generation'
              }
              gradientFrom="#A855F7"
              gradientTo="#6366F1"
            />
            <StatsCard
              title={user?.tier === 'free' ? 'Free Plan' : 'Plan Renewal'}
              value={
                statsData.daysUntilRenewal
                  ? `${statsData.daysUntilRenewal} days`
                  : 'Active'
              }
              icon={<Calendar className="w-6 h-6" />}
              subtitle={
                user?.tier === 'free'
                  ? 'Upgrade for more features'
                  : `Your ${user?.tier} plan renews soon`
              }
              gradientFrom="#6366F1"
              gradientTo="#8B5CF6"
            />
          </div>
        )}

        {/* Usage Chart */}
        {isLoading ? (
          <div className="mb-8">
            <UsageChartSkeleton />
          </div>
        ) : (
          <div className="mb-8">
            <UsageChart data={usageData} />
          </div>
        )}

        {/* Quick Actions */}
        {isLoading ? (
          <div className="mb-8">
            <QuickActionsSkeleton />
          </div>
        ) : (
          <div className="mb-8">
            <QuickActions />
          </div>
        )}

        {/* Recent Generations */}
        {isLoading ? (
          <div className="mb-8">
            <RecentGenerationsSkeleton />
          </div>
        ) : (
          <div className="mb-8">
            <RecentGenerations
              generations={recentGenerations}
              onView={handleView}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          </div>
        )}
      </main>
    </div>
  );
}
