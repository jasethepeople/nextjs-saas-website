import { Crown, LayoutDashboard, LogOut, Settings2, Sparkles, CreditCard } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const nav = [{ label: "Overview", icon: LayoutDashboard, path: "/app" }, { label: "Subscription", icon: CreditCard, path: "/app/billing" }, { label: "Settings", icon: Settings2, path: "/app/settings" }];
const statusText: Record<string, string> = { inactive: "No active plan", trialing: "Trialing", active: "Active subscription", past_due: "Past due", canceled: "Canceled", unpaid: "Unpaid" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { data } = trpc.tenant.current.useQuery();
  const [location, setLocation] = useLocation();
  if (!data) return null;
  return <div className="app-shell"><aside className="app-sidebar"><div><button className="app-brand" onClick={() => setLocation("/app")}><span className="brand-mark"><Sparkles size={14} /></span><span>Northstar</span></button><div className="tenant-switcher"><span className="tenant-initial">{data.tenant.name.slice(0, 1).toUpperCase()}</span><span><strong>{data.tenant.name}</strong><small><i className={`sidebar-status sidebar-status-${data.tenant.subscriptionStatus}`} />{statusText[data.tenant.subscriptionStatus]}</small></span></div><nav className="app-nav">{nav.map(item => <button key={item.path} onClick={() => setLocation(item.path)} className={location === item.path ? "app-nav-active" : ""}><item.icon size={18} />{item.label}</button>)}</nav></div><div className="sidebar-bottom"><div className="sidebar-role"><Crown size={14} /><span className="capitalize">{data.membership.role}</span></div><div className="sidebar-user"><span className="avatar-letter">{user?.name?.slice(0, 1).toUpperCase() || "N"}</span><span><strong>{user?.name || "Workspace member"}</strong><small>{user?.email}</small></span><button onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button></div></div></aside><main className="app-main"><header className="app-mobile-header"><button className="app-brand" onClick={() => setLocation("/app")}><span className="brand-mark"><Sparkles size={14} /></span><span>Northstar</span></button><span className="capitalize text-sm text-muted-foreground">{data.membership.role}</span></header>{children}</main></div>;
}
