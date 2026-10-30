'use client';

// Old path. NetBird is now a tab on the Settings page: /dashboard/settings/#netbird
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NetbirdRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/settings/#netbird'); }, [router]);
  return <p className="p-6 text-sm text-gray-500">NetBird moved to Settings &gt; NetBird…</p>;
}
