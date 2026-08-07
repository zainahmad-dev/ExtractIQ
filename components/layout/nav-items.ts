import { LayoutDashboard, Upload, Table2, BarChart3, Download, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Top-level nav destinations shared by Sidebar and BottomNav. Processing and
 * Review are per-document detail routes reached contextually (from Dashboard
 * or Records), not primary nav destinations, so they're deliberately excluded.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/records', label: 'Records', icon: Table2 },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/export', label: 'Export', icon: Download },
  { href: '/settings', label: 'Settings', icon: Settings },
];
