'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TrendingUp, Key, Mail, AlertTriangle, Eye, EyeOff, CheckCircle, Info } from 'lucide-react';

function LoginFormContent() {
  const [email, setEmail] = useState('abc@g.com');
  const [password, setPassword] = useState('asdfg');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if error is in URL
    const err = searchParams.get('error');
    if (err) {
      setErrorMessage(err);
    }
  }, [searchParams]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Artificial network lag
    await new Promise((resolve) => setTimeout(resolve, 600));

    if (isSignUp) {
      setErrorMessage('Sign up is disabled for this development build. Please sign in using the demo account details.');
      setLoading(false);
      return;
    }

    if (email === 'abc@g.com' && password === 'asdfg') {
      // Set local cookie for Next.js middleware authorization check
      document.cookie = `foliointel-session=abc@g.com; path=/; max-age=604800; SameSite=Lax`;
      
      // Redirect
      router.replace('/');
      router.refresh();
    } else {
      setErrorMessage('Invalid credentials. Please use the username and password listed below.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md glass-card rounded-2xl p-8 glass-card-glow transition-all duration-300 relative z-10">
      <div className="flex flex-col items-center mb-6">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3">
          <TrendingUp className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground bg-gradient-to-r from-white via-slate-100 to-primary bg-clip-text text-transparent">
          FolioIntel
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 text-center">
          Portfolio Intelligence Dashboard
        </p>
      </div>

      {/* Demo Credentials Banner */}
      <div className="mb-6 flex items-start gap-2.5 p-3.5 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Local Demo Account Details</p>
          <p className="mt-1 font-mono">Username: <span className="underline">abc@g.com</span></p>
          <p className="font-mono">Password: <span className="underline">asdfg</span></p>
        </div>
      </div>

      <form onSubmit={handleAuth} className="space-y-5">
        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3.5 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger animate-in fade-in slide-in-from-top-1">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-start gap-2.5 p-3.5 bg-success/10 border border-success/20 rounded-lg text-sm text-success animate-in fade-in slide-in-from-top-1">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60"
              placeholder="abc@g.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Password
            </label>
          </div>
          <div className="relative">
            <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-background/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60"
              placeholder="asdfg"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground outline-none cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary hover:bg-primary/95 disabled:bg-primary/50 text-primary-foreground font-semibold rounded-xl text-sm transition-all transform hover:-translate-y-0.5 active:translate-y-0 shadow-lg shadow-primary/20 flex items-center justify-center cursor-pointer"
        >
          {loading ? (
            <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : isSignUp ? (
            'Create Account'
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-border/50 text-center">
        <button
          onClick={() => {
            setIsSignUp(!isSignUp);
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer"
        >
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-background px-4 overflow-hidden">
      {/* Background Neon Glow Orbs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-crypto/10 blur-[120px] pointer-events-none" />

      <Suspense fallback={
        <div className="w-full max-w-md glass-card rounded-2xl p-8 glass-card-glow flex flex-col items-center justify-center min-h-[400px] relative z-10">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <LoginFormContent />
      </Suspense>
    </div>
  );
}
