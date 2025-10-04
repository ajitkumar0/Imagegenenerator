'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  tier: 'free' | 'basic' | 'premium';
  credits: number;
  apiKey?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = () => {
      const storedUser = localStorage.getItem('imagegen_user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (error) {
          console.error('Failed to parse user data:', error);
          localStorage.removeItem('imagegen_user');
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // Mock sign in function
  const signIn = async () => {
    setIsLoading(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock user data
    const mockUser: User = {
      id: 'user_' + Date.now(),
      email: 'demo@imagegen.ai',
      name: 'Demo User',
      avatar: `https://ui-avatars.com/api/?name=Demo+User&background=FF6B9D&color=fff`,
      tier: 'free',
      credits: 10,
    };

    setUser(mockUser);
    localStorage.setItem('imagegen_user', JSON.stringify(mockUser));
    setIsLoading(false);
  };

  // Sign out function
  const signOut = () => {
    setUser(null);
    localStorage.removeItem('imagegen_user');
  };

  // Update user function
  const updateUser = (updates: Partial<User>) => {
    if (!user) return;

    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    localStorage.setItem('imagegen_user', JSON.stringify(updatedUser));
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    signIn,
    signOut,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
