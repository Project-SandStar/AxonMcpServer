'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Server,
  FolderOpen,
  FileText,
  Database,
  BarChart3,
  Terminal,
  BookOpen,
  Cable,
  LogOut,
  User,
  Users,
  Key,
  Archive,
  Search,
  GraduationCap,
  GitBranch,
  SlidersHorizontal,
  FolderTree,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'MCP Explorer', href: '/explorer', icon: Terminal },
  { name: 'Tool Search', href: '/tool-search', icon: Search },
  { name: 'Project Explorer', href: '/project-explorer', icon: FolderTree },
  { name: 'Graph Viewer', href: '/graph', icon: GitBranch },
  { name: 'Vector Search', href: '/vector-search', icon: Sparkles },
  { name: 'Documentation', href: '/docs', icon: BookOpen },
  { name: 'Workflows', href: '/workflows', icon: Workflow },
  { name: 'Instances', href: '/instances', icon: Server },
  { name: 'Project Sync', href: '/projects', icon: FolderOpen },
  { name: 'Usage', href: '/usage', icon: BarChart3 },
  { name: 'Cache', href: '/cache', icon: Database },
  { name: 'Logs', href: '/logs', icon: FileText },
  { name: 'Connections', href: '/connections', icon: Cable },
  { name: 'Sessions', href: '/sessions', icon: Key },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Settings', href: '/settings', icon: SlidersHorizontal },
  { name: 'API Keys', href: '/api-keys', icon: Key },
  { name: 'Backups', href: '/backups', icon: Archive },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { username, logout } = useAuth();

  return (
    <div className="flex h-screen w-64 flex-col bg-gray-900">
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">Axon MCP</h1>
      </div>
      <nav className="flex-1 overflow-y-auto space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-gray-800 pt-3 px-4">
        <Link
          href="/documentation"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            pathname === '/documentation' || pathname?.startsWith('/documentation')
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }`}
        >
          <GraduationCap className="h-5 w-5" />
          Documentation
        </Link>
      </div>
      <div className="border-t border-gray-800 p-4 space-y-3">
        {/* User info */}
        <div className="flex items-center gap-2 text-gray-400">
          <User className="h-4 w-4" />
          <span className="text-sm">{username || 'admin'}</span>
        </div>
        {/* Logout button */}
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
        <p className="text-xs text-gray-500">v1.0.0</p>
      </div>
    </div>
  );
}
