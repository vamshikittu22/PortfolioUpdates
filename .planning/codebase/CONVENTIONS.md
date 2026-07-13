# Coding Conventions

**Analysis Date:** 2026-07-13

## Naming Patterns

**Files:**
- Component files: PascalCase (e.g., `KPICard.tsx`, `AlertsTable.tsx`)
- Hook files: kebab-case with `use-` prefix (e.g., `use-settings.ts`, `use-channels.ts`)
- Utility files: kebab-case (e.g., `cn.ts`, `mock-portfolio.ts`)
- Type/interface files: descriptive kebab-case (e.g., `research-types.ts`, `mock-research-data.ts`)
- API route files: `route.ts` in nested directories by endpoint (e.g., `src/app/api/research/analyze/route.ts`)

**Functions:**
- Regular functions: camelCase (e.g., `fetchYahooFinanceData`, `generateHybridFallbackReport`)
- React components: PascalCase (e.g., `KPICard`, `AlertsTable`, `CompanyHeader`)
- Hook functions: camelCase with `use` prefix (e.g., `useSettings`, `useChannels`, `useAppStore`)
- Event handlers: camelCase with action prefix (e.g., `handleClick`, `updateSettings`)

**Variables:**
- Local variables: camelCase (e.g., `selectedAccount`, `totalValueFormatted`, `normalisedTicker`)
- Constants: UPPER_SNAKE_CASE (e.g., `CACHE_DIR`, `DEFAULT_SETTINGS`, `REGISTERED_STOCKS`)
- React state variables: camelCase (e.g., `settings`, `isLoaded`, `serverKeys`)

**Types:**
- Interfaces: PascalCase (e.g., `KPICardProps`, `AppSettings`, `CompanyProfile`)
- Type aliases: PascalCase (e.g., `AIProvider`, `Broker`, `Sentiment`)
- Generic type parameters: Single uppercase letter (e.g., `T`)

## Code Style

**Formatting:**
- Uses ESLint 9 with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- No Prettier config; defaults to ESLint formatting rules
- Indentation: 2 spaces
- Line endings: LF (inferred from ESLint config)
- Semicolons: Required
- Single quotes for strings (observed in codebase)

**Linting:**
- ESLint config: `eslint.config.mjs` (flat config format)
- Ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`
- Run command: `npm run lint` (runs `eslint`)
- Core Web Vitals rules enforced for performance and accessibility
- TypeScript strict mode enabled via ESLint TypeScript extension

## Import Organization

**Order:**
1. React and Next.js imports (e.g., `import React`, `import type`, `import { NextResponse }`)
2. Third-party library imports (e.g., `lucide-react`, `zustand`, `@google/generative-ai`)
3. Relative imports from `@/` path aliases (components, hooks, utils, lib)
4. Inline styling or CSS imports

**Path Aliases:**
- `@/*` maps to `./src/*` (defined in `tsconfig.json`)
- All internal imports use `@/` prefix for absolute paths

**Example:**
```typescript
import React from 'react';
import { NextResponse } from 'next/server';
import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { create } from 'zustand';
import { KPICard } from '@/components/dashboard/KPICard';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { cn } from '@/utils/cn';
```

## Error Handling

**Patterns:**
- Try-catch blocks wrapping async operations and JSON parsing
- Fallback mechanisms for external API failures (e.g., Gemini → hybrid fallback)
- Early return on validation errors with descriptive error messages
- Console.error/warn for logging failures with context

**Example:**
```typescript
try {
  const body = await request.json();
  ticker = (body?.ticker || '').trim().toUpperCase();
} catch (e) {
  return NextResponse.json({ success: false, error: 'Invalid JSON request body' }, { status: 400 });
}

if (!ticker) {
  return NextResponse.json({ success: false, error: 'Ticker is required' }, { status: 400 });
}
```

**API Error Responses:**
- Structure: `{ success: boolean, error?: string, [data]?: any }`
- HTTP status codes: 400 (bad request), 404 (not found), 500 (internal error)
- Always include descriptive error messages

## Logging

**Framework:** Native `console` object

**Patterns:**
- `console.error()` for exceptions and critical issues
- `console.warn()` for non-critical failures (e.g., fallback triggers)
- Logs include context: function name, operation, error details

**Example:**
```typescript
console.warn(`Gemini compilation failed for ${ticker}, triggering hybrid fallback:`, err.message || err);
console.error('Failed to compile hybrid fallback:', fallbackErr);
console.error('Failed to load settings from local storage', e);
```

## Comments

**When to Comment:**
- Before complex algorithmic sections or non-obvious logic
- Explaining fallback mechanisms or workarounds
- Clarifying business logic for financial calculations
- Labeling major sections with divider comments

**JSDoc/TSDoc:**
- Used for public functions and hooks
- Includes `@param` and `@returns` annotations
- Single-line description plus parameter/return types

**Example:**
```typescript
/**
 * Analyze a video transcript using Gemini Flash.
 * Returns structured intelligence about financial topics discussed.
 */

/**
 * Search companies by ticker or name.
 * Returns matching results with fuzzy matching on both ticker and company name.
 *
 * @param query - partial ticker or company name
 * @returns matching CompanySearchResult[]
 */

/**
 * Generate a highly realistic fallback report using real Yahoo Finance stats.
 * Serves as an instant, zero-failure compilation if Gemini is down/overloaded.
 */
```

**Inline Comments:**
- Line comments (`//`) for clarifying intent, especially in complex sections
- Multi-line comment blocks with section dividers using ASCII art

**Example:**
```typescript
// 1. Ensure cache directory exists
// 2. Check if report already exists in local JSON file cache
// 3. Fallback: If it's one of the 3 primary mock stocks...

// ── Channel Handlers ──────────────────────────────────────────────
// ── Real Fetch ─────────────────────────────────────────────────────
```

## Function Design

**Size:** Typically 30-100 lines for business logic; larger for complex data transformations
- Server components can exceed 150 lines (e.g., research analysis route)
- Client components remain compact for reusability

**Parameters:**
- Props interfaces for components (e.g., `KPICardProps`, `CompanyHeaderProps`)
- Destructured in function signatures for clarity
- Optional parameters use `?` in interface definitions

**Return Values:**
- Explicit `NextResponse.json()` for API routes
- React components return JSX elements
- Hooks return objects with state and methods (e.g., `{ settings, updateSettings, updateKey }`)
- Utility functions have explicit return types

**Example:**
```typescript
export function KPICard({ title, value, icon, trend, subtitle, className, trendIsNeutral }: KPICardProps) {
  return (
    <div className={cn('glass-card rounded-2xl p-5 space-y-4 relative overflow-hidden', className)}>
      {/* JSX content */}
    </div>
  );
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  
  return {
    settings,
    updateSettings,
    updateKey,
  };
}
```

## Module Design

**Exports:**
- Named exports for components, hooks, utilities, and types
- Default exports for page components only (Next.js convention)

**Example:**
```typescript
// Named exports
export function KPICard({ ... }) { }
export type AIProvider = 'gemini' | 'openai' | ...;

// Default export (page components)
export default function DashboardPage() { }
```

**Barrel Files:**
- Not used; imports always target specific files
- Import from `@/components/dashboard/KPICard`, not `@/components`

## Client/Server Directive

**Pattern:**
- All interactive components marked with `'use client'` at top of file
- API routes and server-side utilities do not use directive
- Layout and page components are Server Components by default

**Example:**
```typescript
'use client';

import React from 'react';
// Component code
```

## TypeScript Configuration

**Compiler Options:**
- Target: ES2017
- Strict mode: true
- JSX: react-jsx (automatic runtime)
- Module resolution: bundler
- Path aliases: `@/*` → `./src/*`
- Incremental build enabled

## Conditional Rendering

**Pattern:**
- Ternary operators for simple conditions
- Early returns in server logic
- Optional chaining and nullish coalescing for safe access

**Example:**
```typescript
{trend && (
  <span className={cn(...)}>
    {!trendIsNeutral && (
      trend.isPositive ? <ArrowUpRight /> : <ArrowDownRight />
    )}
  </span>
)}

if (!selectedAccountId) return null;
```

## Class Names and Styling

**Pattern:**
- Tailwind CSS classes exclusively
- `cn()` utility from `@/utils/cn` for conditional classes (uses `clsx` + `tailwind-merge`)
- No inline styles or CSS modules

**Example:**
```typescript
className={cn(
  'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors',
  trendIsNeutral 
    ? 'bg-muted/50 text-muted-foreground'
    : trend.isPositive 
      ? 'bg-success/15 text-success' 
      : 'bg-danger/15 text-danger'
)}
```

## State Management

**Zustand Stores:**
- Defined in `src/store/` directory
- Stores use `create()` hook with typed interface
- State mutations via `set()` callback

**Local Component State:**
- React `useState()` for component-level state
- React `useEffect()` for side effects with dependency arrays

**Example:**
```typescript
export const useAppStore = create<AppState>((set) => ({
  theme: 'dark',
  setTheme: (theme) => {
    set({ theme });
  },
}));

const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
```

---

*Convention analysis: 2026-07-13*
