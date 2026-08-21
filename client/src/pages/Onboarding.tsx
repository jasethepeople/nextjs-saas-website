import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Building2, CircleAlert, KeyRound, Plus, Sparkles, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

const createSchema = z.object({ name: z.string().trim().min(2, "Use at least 2 characters.").max(120, "Workspace name is too long.") });
const joinSchema = z.object({ joinCode: z.string().trim().min(6, "Enter the invitation code.").max(24, "Invitation code is too long.") });

export default function Onboarding() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"create" | "join">("create");
  const current = trpc.tenant.current.useQuery(undefined, { enabled: Boolean(user) });
  const create = trpc.tenant.create.useMutation({ onSuccess: () => setLocation("/app") });
  const join = trpc.tenant.join.useMutation({ onSuccess: () => setLocation("/app") });
  const createForm = useForm<z.infer<typeof createSchema>>({ resolver: zodResolver(createSchema), defaultValues: { name: "" } });
  const joinForm = useForm<z.infer<typeof joinSchema>>({ resolver: zodResolver(joinSchema), defaultValues: { joinCode: "" } });
  useEffect(() => { if (!loading && !user) setLocation("/sign-in"); }, [loading, user, setLocation]);
  useEffect(() => { if (current.data) setLocation("/app"); }, [current.data, setLocation]);
  if (loading || current.isLoading) return <div className="min-h-screen bg-[#f7f5ef]" />;
  return <div className="onboarding-shell"><div className="absolute left-0 top-0 h-[420px] w-[420px] rounded-full bg-[#f3c486]/30 blur-[120px]" /><main className="relative w-full max-w-[880px] rounded-[30px] border border-[#e5e1d5] bg-white p-7 shadow-[0_24px_80px_rgba(24,35,51,0.10)] sm:p-11"><div className="flex items-center gap-2.5"><span className="brand-mark"><Sparkles size={15} /></span><span className="font-display text-lg font-semibold tracking-[-0.04em] text-ink">Northstar</span></div><div className="mt-11 max-w-xl"><p className="eyebrow">Set the foundation</p><h1 className="font-display mt-3 text-4xl font-medium tracking-[-0.055em] text-ink sm:text-5xl">Where does your team do its best work?</h1><p className="mt-4 text-base leading-7 text-muted-foreground">Create a fresh workspace, or use a team invitation code to join an existing one.</p></div><div className="mt-10 grid gap-4 sm:grid-cols-2"><button onClick={() => setMode("create")} className={`onboarding-choice ${mode === "create" ? "onboarding-choice-active" : ""}`}><span className="grid size-11 place-items-center rounded-xl bg-[#fff0de] text-[#c9643e]"><Plus size={20} /></span><span><strong>Create a workspace</strong><small>Start a new home for your team.</small></span></button><button onClick={() => setMode("join")} className={`onboarding-choice ${mode === "join" ? "onboarding-choice-active" : ""}`}><span className="grid size-11 place-items-center rounded-xl bg-[#e7f0ef] text-[#387270]"><Users size={20} /></span><span><strong>Join your team</strong><small>Use a code shared by a workspace owner.</small></span></button></div><div className="mt-7 rounded-2xl bg-[#fbfaf7] p-5 sm:p-7">{mode === "create" ? <form onSubmit={createForm.handleSubmit(values => create.mutate(values))}><div className="flex flex-col gap-5 sm:flex-row sm:items-end"><div className="flex-1"><label className="form-label" htmlFor="workspace">Workspace name</label><div className="relative"><Building2 className="form-icon" size={17} /><Input id="workspace" className="auth-input pl-11" placeholder="For example, Meridian Studio" {...createForm.register("name")} /></div>{createForm.formState.errors.name?.message && <p className="form-error">{createForm.formState.errors.name.message}</p>}</div><Button className="primary-action sm:mb-0" type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create workspace"}<ArrowRight size={17} /></Button></div>{create.error && <div className="form-alert mt-4"><CircleAlert size={16} />{create.error.message}</div>}<p className="mt-4 text-xs leading-5 text-muted-foreground">You’ll be the <strong className="text-ink">Owner</strong>, with workspace and billing control.</p></form> : <form onSubmit={joinForm.handleSubmit(values => join.mutate(values))}><div className="flex flex-col gap-5 sm:flex-row sm:items-end"><div className="flex-1"><label className="form-label" htmlFor="code">Team invitation code</label><div className="relative"><KeyRound className="form-icon" size={17} /><Input id="code" className="auth-input pl-11 uppercase tracking-[0.15em]" placeholder="EXAMPLECODE" {...joinForm.register("joinCode")} /></div>{joinForm.formState.errors.joinCode?.message && <p className="form-error">{joinForm.formState.errors.joinCode.message}</p>}</div><Button className="primary-action" type="submit" disabled={join.isPending}>{join.isPending ? "Joining…" : "Join workspace"}<ArrowRight size={17} /></Button></div>{join.error && <div className="form-alert mt-4"><CircleAlert size={16} />{join.error.message}</div>}<p className="mt-4 text-xs leading-5 text-muted-foreground">Ask an Owner for the invitation code shown in their workspace settings.</p></form>}</div></main></div>;
}
