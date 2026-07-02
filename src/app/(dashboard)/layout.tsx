'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import {
  LayoutDashboard,
  Briefcase,
  Newspaper,
  Bell,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  User,
  ChevronDown,
  Check
} from 'lucide-react';

const Youtube = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
  </svg>
);

interface SidebarItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  badge?: number;
}

const navigationItems: SidebarItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Holdings', href: '/holdings', icon: Briefcase },
  { name: 'News', href: '/news', icon: Newspaper },
  { name: 'YouTube Intel', href: '/youtube', icon: Youtube },
  { name: 'Alerts', href: '/alerts', icon: Bell, badge: 3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  
  const { theme, toggleTheme, sidebarCollapsed, toggleSidebar } = useAppStore();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const { accounts, selectedAccountId, switchAccount } = usePortfolioStore();
  const selectedAccount = selectedAccountId ? accounts[selectedAccountId] : null;

  useEffect(() => {
    // Get user email
    const getUser = async () => {
      try {
        const match = document.cookie.match(new RegExp('(^| )' + 'foliointel-session' + '=([^;]+)'));
        if (match) {
          setUserEmail(decodeURIComponent(match[2]));
        } else {
          setUserEmail('abc@g.com');
        }
      } catch {
        setUserEmail('abc@g.com');
      }
    };
    getUser();
  }, [pathname]);

  const handleLogout = async () => {
    try {
      // Clear cookie
      document.cookie = "foliointel-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    } catch (e) {
      console.warn("Logout cookie deletion failed:", e);
    }
    router.replace('/login');
    router.refresh();
  };

  const getPageTitle = () => {
    const activeItem = navigationItems.find(item => item.href === pathname);
    return activeItem ? activeItem.name : 'FolioIntel';
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col h-full bg-card border-r border-border/50 transition-all duration-300 relative z-20 ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border/30 h-16">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          {!sidebarCollapsed && (
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-primary bg-clip-text text-transparent">
              FolioIntel
            </span>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group relative cursor-pointer ${
                  isActive
                    ? 'bg-primary/10 text-primary border-l-2 border-primary'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 transition-transform group-hover:scale-105 ${
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                }`} />
                {!sidebarCollapsed && <span>{item.name}</span>}
                
                {/* Badge */}
                {item.badge && !sidebarCollapsed && (
                  <span className="ml-auto bg-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
                {item.badge && sidebarCollapsed && (
                  <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-danger border-2 border-card" />
                )}
                
                {/* Tooltip for collapsed mode */}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-4 px-2 py-1 bg-popover border border-border text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-md">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse Button */}
        <button
          onClick={toggleSidebar}
          className="absolute top-1/2 -right-3.5 -translate-y-1/2 h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:text-primary transition-colors z-30 cursor-pointer shadow-md"
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* User profile / Logout at bottom */}
        <div className="p-4 border-t border-border/30">
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-muted/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary shrink-0">
                  <User className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{selectedAccount ? selectedAccount.profile.name : 'FolioIntel'}</p>
                  <p className="text-[10px] text-muted-foreground truncate uppercase tracking-wider font-semibold">Active Portfolio</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="h-8 w-8 rounded-lg hover:bg-danger/10 hover:text-danger flex items-center justify-center text-muted-foreground transition-colors cursor-pointer"
                title="Log Out"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-xl hover:bg-danger/10 hover:text-danger flex items-center justify-center text-muted-foreground transition-colors cursor-pointer"
              title="Log Out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top Header */}
        <header className="h-16 border-b border-border/50 bg-card/65 backdrop-blur-md flex items-center justify-between px-4 md:px-6 relative z-10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Toggler */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 hover:bg-muted/50 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground tracking-tight">
                  {getPageTitle()}
                </h2>
                {pathname === '/' && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 border border-success/20 text-[10px] font-bold text-success uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    Market Open
                  </span>
                )}
              </div>
              {pathname === '/' && (
                <span className="text-[10px] text-muted-foreground font-medium hidden sm:block">
                  Updated 2m ago
                </span>
              )}
            </div>
          </div>

          {/* Search bar placeholder & Right actions */}
          <div className="flex items-center gap-3">
            {/* Command Palette Search Trigger */}
            <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-background border border-border/60 hover:border-primary/40 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-all w-52 md:w-64 cursor-pointer">
              <Search className="h-3.5 w-3.5" />
              <span>Search tickers, companies, news...</span>
              <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[9px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </button>

            {/* Account Switcher */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border border-border/60 hover:bg-muted/50 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                {selectedAccount ? selectedAccount.profile.name : 'Select Account'}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              
              {accountDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setAccountDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-card border border-border/80 rounded-xl shadow-lg py-1.5 z-40 animate-in fade-in slide-in-from-top-1">
                    <div className="px-3 py-1.5 border-b border-border/30 mb-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Portfolios</p>
                    </div>
                    {Object.values(accounts).map((acc) => (
                      <button
                        key={acc.accountId}
                        onClick={() => {
                          switchAccount(acc.accountId);
                          setAccountDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors cursor-pointer text-left"
                      >
                        {acc.profile.name}
                        {selectedAccountId === acc.accountId && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-muted/50 rounded-xl text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary cursor-pointer hover:bg-primary/15 transition-colors border border-primary/20"
              >
                <User className="h-4.5 w-4.5" />
              </button>

              {profileDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setProfileDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-card border border-border/80 rounded-xl shadow-lg py-1.5 z-40 animate-in fade-in slide-in-from-top-1">
                    <div className="px-4 py-2 border-b border-border/30">
                      <p className="text-xs text-muted-foreground">Logged in as</p>
                      <p className="text-xs font-semibold text-foreground truncate">{userEmail}</p>
                    </div>
                    <Link
                      href="/settings"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-danger/10 transition-colors cursor-pointer text-left"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Panel */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>

        {/* Mobile Bottom Tab Bar (Width < 768px) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/90 backdrop-blur-lg border-t border-border/50 flex items-center justify-around z-20 px-2">
          {navigationItems.slice(0, 5).map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 py-1 text-center cursor-pointer transition-colors relative ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] mt-1 font-medium scale-90 truncate max-w-full">
                  {item.name.split(' ')[0]}
                </span>
                {item.badge && (
                  <span className="absolute top-1 right-2 h-2 w-2 rounded-full bg-danger border border-card" />
                )}
              </Link>
            );
          })}
          <Link
            href="/settings"
            className={`flex flex-col items-center justify-center flex-1 py-1 text-center cursor-pointer transition-colors ${
              pathname === '/settings' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Settings className="h-5 w-5" />
            <span className="text-[10px] mt-1 font-medium scale-90 truncate max-w-full">
              Settings
            </span>
          </Link>
        </nav>
      </div>

      {/* Mobile Drawer Navigation overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed top-0 left-0 bottom-0 w-64 bg-card border-r border-border/50 z-50 flex flex-col p-5 md:hidden animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-primary bg-clip-text text-transparent">
                  FolioIntel
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 hover:bg-muted/50 rounded-lg text-muted-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.name}</span>
                    {item.badge && (
                      <span className="ml-auto bg-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border/30 pt-4 mt-auto">
              <div className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-muted/30">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary">
                    <User className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{selectedAccount ? selectedAccount.profile.name : 'FolioIntel'}</p>
                    <p className="text-[10px] text-muted-foreground truncate uppercase tracking-wider font-semibold">Active Portfolio</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="h-8 w-8 rounded-lg hover:bg-danger/10 hover:text-danger flex items-center justify-center text-muted-foreground transition-colors cursor-pointer"
                >
                  <LogOut className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
