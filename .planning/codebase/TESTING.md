# Testing Patterns

**Analysis Date:** 2026-07-13

## Test Framework

**Status:** Not configured

**Current State:**
- No test framework installed (Jest, Vitest, or similar)
- No test configuration files present (`jest.config.js`, `vitest.config.ts`, etc.)
- No test scripts in `package.json`
- Zero test files in source tree (`src/` directory)

**Installed Dependencies:**
- `package.json` contains only ESLint 9 for linting
- No testing libraries in `devDependencies`

## Test File Organization

**Current Practice:**
- No tests exist in the codebase
- No established test file location pattern
- No naming convention for test files (no `.test.ts` or `.spec.ts` files)

**Recommendation for Future Implementation:**
- Co-locate test files with source: `ComponentName.tsx` → `ComponentName.test.tsx`
- Alternative: Separate `__tests__` directory per module
- Naming: `[FileName].test.ts` or `[FileName].spec.ts`

## Test Structure

**Current:** Not applicable (no tests implemented)

**Recommended Structure for Future Tests:**

```typescript
describe('ComponentName', () => {
  let component: ReturnType<typeof render>;

  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('rendering', () => {
    test('should render with required props', () => {
      // Test code
    });
  });

  describe('interactions', () => {
    test('should handle click events', () => {
      // Test code
    });
  });
});
```

## Mocking

**Current:** Not applicable

**Recommended Approach for Future:**

**Framework:** Vitest (recommended for Next.js) or Jest with `jest-mock-extended`

**What to Mock:**
- External API calls (Gemini, Yahoo Finance, Supabase)
- Zustand stores for isolated component testing
- Utility functions that have side effects
- `localStorage` and `sessionStorage`
- Next.js router and navigation

**What NOT to Mock:**
- Utility functions like `cn()` that provide core value
- Taildwind CSS class composition
- React hooks (useState, useEffect) unless testing custom hooks
- Component composition hierarchy

**Pattern:**
```typescript
vi.mock('@/lib/research/yahoo-finance', () => ({
  fetchYahooFinanceData: vi.fn().mockResolvedValue({
    currentPrice: 150.0,
    peRatio: 22.0,
    // ...
  })
}));

vi.mock('zustand', () => ({
  create: vi.fn((creator) => creator(vi.fn(), vi.fn()))
}));
```

## Fixtures and Factories

**Current:** Mock data defined in source

**Data Locations:**
- `src/lib/mock-portfolio.ts`: Holdings, watchlist, news, allocation data
- `src/lib/mock-youtube-data.ts`: YouTube channel and video fixtures
- `src/lib/research/mock-research-data.ts`: Research report templates

**Usage Pattern:**
```typescript
// Import mock data for testing
import { MOCK_HOLDINGS, MOCK_WATCHLIST } from '@/lib/mock-portfolio';
import { MOCK_RESEARCH_REPORTS } from '@/lib/research/mock-research-data';
```

**Recommendation for Future Tests:**
- Create `src/__tests__/fixtures/` directory for centralized test data
- Use factory functions for generating variable test data:
```typescript
export function createMockHolding(overrides?: Partial<Holding>): Holding {
  return {
    id: '1',
    ticker: 'TCS',
    name: 'Tata Consultancy Services',
    broker: 'Groww',
    sector: 'IT',
    quantity: 15,
    avgPrice: 3850,
    currentPrice: 4120.50,
    dayChange: 1.2,
    totalChange: 7.03,
    ...overrides,
  };
}
```

## Coverage

**Requirements:** Not enforced

**Current Status:**
- No coverage configuration
- No minimum coverage threshold
- No coverage reporting setup

**Recommendation:**
- Target minimum 80% line coverage for critical paths
- Critical areas (API routes, data transformations): 100%
- UI components: 70%+

## Test Types

**Unit Tests (Recommended Focus):**
- Scope: Individual functions, hooks, and components
- Approach: Test behavior in isolation with mocked dependencies
- Examples:
  - `useSettings` hook state updates and localStorage persistence
  - `cn()` utility Tailwind class merging
  - `fetchYahooFinanceData()` data transformation
  - Component rendering with different prop combinations

**Integration Tests (Not Implemented):**
- Scope: Multiple modules working together
- Approach: Test data flow between store → component → API
- Examples:
  - Research report fetch → display pipeline
  - Authentication flow with Supabase
  - Multi-step user workflows

**E2E Tests (Not Implemented):**
- Framework: Not selected
- Candidates: Playwright, Cypress, or native Next.js testing
- Scope: Full user journeys across pages and features
- Examples:
  - User login → portfolio view → research analysis
  - Watchlist alert creation → notification delivery

## Common Patterns for Future Implementation

**Async Testing:**
```typescript
test('should fetch research report successfully', async () => {
  const result = await fetchResearchReport('HDFCBANK');
  expect(result).toHaveProperty('companyProfile');
});

test('should handle network errors', async () => {
  const promise = fetchResearchReport('INVALID');
  await expect(promise).rejects.toThrow('Ticker is required');
});
```

**Error Testing:**
```typescript
test('should return 400 error for missing ticker', async () => {
  const response = await POST(new Request('http://localhost', { 
    method: 'POST', 
    body: JSON.stringify({}) 
  }));
  expect(response.status).toBe(400);
  const data = await response.json();
  expect(data.error).toBe('Ticker is required');
});

test('should catch JSON parse errors', () => {
  expect(() => {
    JSON.parse('invalid json');
  }).toThrow();
});
```

**Component Rendering:**
```typescript
test('KPICard renders with positive trend', () => {
  const { getByText } = render(
    <KPICard
      title="Portfolio Value"
      value="₹100,000"
      icon={<Wallet />}
      trend={{ value: '+2.5%', isPositive: true }}
    />
  );
  expect(getByText('Portfolio Value')).toBeInTheDocument();
  expect(getByText('+2.5%')).toBeInTheDocument();
});
```

**Hook Testing:**
```typescript
test('useSettings persists to localStorage', () => {
  const { result } = renderHook(() => useSettings());
  
  act(() => {
    result.current.updateSettings({ preferredProvider: 'openai' });
  });
  
  expect(localStorage.getItem('folio_intel_settings')).toContain('openai');
});
```

## Setup Recommendations for Future Testing

**Step 1: Install Testing Stack**
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitest/ui
npm install -D @types/jest jsdom
```

**Step 2: Create Configuration File**
Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/__tests__/']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Step 3: Create Setup File**
Create `src/__tests__/setup.ts`:
```typescript
import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock next/router
vi.mock('next/router', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  })),
}));
```

**Step 4: Add Test Scripts to package.json**
```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage"
  }
}
```

## Critical Areas Needing Tests

**High Priority (100% coverage target):**
- `src/app/api/research/analyze/route.ts` - Complex API logic with fallbacks
- `src/lib/research/scoring-engine.ts` - Financial scoring calculations
- `src/lib/research/yahoo-finance.ts` - External data transformation
- `src/lib/gemini.ts` - AI integration and transcript analysis

**Medium Priority (80% coverage target):**
- `src/store/useAppStore.ts` - State management
- `src/store/usePortfolioStore.ts` - Portfolio state mutations
- `src/hooks/use-settings.ts` - Settings persistence
- `src/components/dashboard/*` - Core UI components

**Lower Priority (70% coverage target):**
- `src/components/research/*` - Display components
- `src/components/youtube/*` - YouTube UI
- `src/utils/*` - Basic utilities

---

*Testing analysis: 2026-07-13*

**Note:** This codebase currently has no tests implemented. These recommendations are for establishing a testing practice going forward.
