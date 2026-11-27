import type { ReactNode } from 'react';
import { ArrowLeftRight, CalendarDays, LayoutDashboard } from 'lucide-react';
import { Brand } from '@/components/Brand';

const highlights = [
  { label: 'Track spending across accounts', icon: ArrowLeftRight },
  { label: 'Plan budgets and upcoming bills', icon: CalendarDays },
  { label: 'See your finances in one dashboard', icon: LayoutDashboard },
];

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <aside className="auth-panel">
        <Brand />
        <div className="auth-panel-content">
          <p className="auth-panel-title">See where your money goes.</p>
          <ul>
            {highlights.map(({ label, icon: Icon }) => <li key={label}><Icon size={20} aria-hidden="true" />{label}</li>)}
          </ul>
        </div>
      </aside>
      <section className="auth-form-area" aria-labelledby="auth-title">
        <div className="auth-form">
          <div className="auth-mobile-brand"><Brand /></div>
          <h1 id="auth-title">{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
