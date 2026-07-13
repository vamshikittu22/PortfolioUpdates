# Technology Stack

**Analysis Date:** 2026-07-13

## Languages

**Primary:**
- TypeScript 5 - Frontend (React), backend (API routes), and build configuration
- JavaScript (ES2017 target) - Runtime transpile target

**HTML/CSS:**
- CSS via Tailwind CSS 4 - Styling and utility classes

## Runtime

**Environment:**
- Node.js (Next.js powered, v16+ recommended based on Next.js 16.2.9)

**Package Manager:**
- npm - Dependency management
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js 16.2.9 - Full-stack React framework with API routes, SSR, and middleware
- React 19.2.4 - UI library for component-based frontend

**UI & Styling:**
- Tailwind CSS 4 - Utility-first CSS framework (via `@tailwindcss/postcss`)
- Radix UI - Headless component library:
  - `@radix-ui/react-avatar` 1.2.0
  - `@radix-ui/react-dialog` 1.1.17
  - `@radix-ui/react-progress` 1.1.10
  - `@radix-ui/react-scroll-area` 1.2.12
  - `@radix-ui/react-select` 2.3.1
  - `@radix-ui/react-separator` 1.1.10
  - `@radix-ui/react-slot` 1.3.0
  - `@radix-ui/react-switch` 1.3.1
  - `@radix-ui/react-tabs` 1.1.15
  - `@radix-ui/react-tooltip` 1.2.10

**Animation:**
- Framer Motion 12.41.0 - Animation library for React components

**Data Visualization:**
- Recharts 3.9.0 - React chart library (used in price analysis and portfolio allocation charts)

**State Management:**
- Zustand 5.0.14 - Lightweight state management library for client-side state

**Icon Library:**
- lucide-react 1.21.0 - React icon components

**Utilities:**
- class-variance-authority 0.7.1 - CSS class composition library
- clsx 2.1.1 - Conditional classname utility
- tailwind-merge 3.6.0 - Tailwind class merging utility

**Data Processing:**
- youtube-transcript 1.3.1 - Extract YouTube video transcripts

## Key Dependencies

**AI & ML:**
- `@google/generative-ai` 0.24.1 - Google Gemini API client for video analysis and research report generation

**Database & Auth:**
- `@supabase/ssr` 0.12.0 - Supabase SSR utilities for Next.js (handles auth sessions and cookies)
- `@supabase/supabase-js` 2.108.2 - Supabase JavaScript client for database and auth

## Configuration

**Environment:**
- Configuration via environment variables in `.env.local`
- Public config: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ENABLE_RESEARCH_MODULE`
- Private config: API keys for Google Gemini, YouTube Data API, OpenAI, Claude, OpenRouter, Nvidia, HuggingFace

**Build:**
- `tsconfig.json` - TypeScript compiler configuration
  - Target: ES2017
  - Module resolution: bundler (Next.js)
  - Path alias: `@/*` → `./src/*`
  - Strict mode enabled
- `next.config.ts` - Next.js configuration (minimal, dev indicators disabled)

**Type Definitions:**
- `@types/node` 20 - Node.js type definitions
- `@types/react` 19 - React type definitions
- `@types/react-dom` 19 - React DOM type definitions

## Development Tools

**Linting:**
- ESLint 9 - JavaScript/TypeScript linting
- `eslint-config-next` 16.2.9 - Next.js ESLint configuration

**Build & Serving:**
- Next.js built-in dev server (`npm run dev`)
- Next.js production build (`npm run build`)
- Next.js production server (`npm run start`)

## Scripts

```bash
npm run dev       # Start development server on http://localhost:3000
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint
```

## Platform Requirements

**Development:**
- Node.js 18+ (recommended)
- npm 8+ for package management
- TypeScript knowledge for development
- Environment variables configured in `.env.local`

**Production:**
- Node.js runtime (serverless or self-hosted)
- Supabase account and project
- API keys for external integrations (Gemini, YouTube, optional LLM providers)

---

*Stack analysis: 2026-07-13*
