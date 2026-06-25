'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useAppStore();

  useEffect(() => {
    // Read from localStorage, fallback to dark
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    const initialTheme = savedTheme || 'dark';
    
    // Apply theme
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(initialTheme);
    
    setTheme(initialTheme);
  }, [setTheme]);

  return <>{children}</>;
}
