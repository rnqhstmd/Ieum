import AppShell from '@/components/sidebar/AppShell';
import { ToastProvider } from '@/components/states/ToastProvider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}
