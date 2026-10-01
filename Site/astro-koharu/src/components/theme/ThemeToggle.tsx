/**
 * ThemeToggle Component
 *
 * A sun/moon toggle for switching between light and dark themes.
 * Features View Transitions API for smooth theme changes.
 *
 * Inspired by https://codepen.io/aaroniker/pen/raaMMGx
 */

import { useCallback } from 'react';
import { useIsDarkTheme } from '@/hooks/useIsDarkTheme';
import './theme-toggle.css';

/**
 * Hook to manage theme state
 */
function useTheme() {
  const isDark = useIsDarkTheme();

  const applyTheme = useCallback((dark: boolean) => {
    const root = document.documentElement;
    const theme = dark ? 'dark' : 'light';

    root.classList.toggle('dark', dark);
    root.dataset.theme = theme; // For astro-mermaid autoTheme
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Keep the toggle functional when storage is unavailable.
    }
  }, []);

  const toggle = useCallback(() => {
    const newIsDark = !isDark;
    const rootElement = document.documentElement;

    // Add theme transition class
    rootElement.classList.add('theme-transition');

    // Use View Transitions API if available
    if (!document.startViewTransition) {
      // Fallback for browsers without View Transitions API
      applyTheme(newIsDark);
      setTimeout(() => {
        rootElement.classList.remove('theme-transition');
      }, 100);
      return;
    }

    const transition = document.startViewTransition(() => {
      applyTheme(newIsDark);
    });

    transition.finished.finally(() => {
      rootElement.classList.remove('theme-transition');
    });
  }, [isDark, applyTheme]);

  return { isDark, toggle };
}

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const { isDark, toggle } = useTheme();

  return (
    <button
      className={`theme-toggle scale-80 cursor-pointer transition duration-300 hover:scale-90 ${className || ''}`}
      aria-label={isDark ? '切换到浅色模式' : '切换到暗色模式'}
      aria-pressed={isDark}
      onClick={toggle}
      type="button"
    >
      <span className="toggle block" aria-hidden="true">
        <span className="toggle-indicator block" />
      </span>
    </button>
  );
}
