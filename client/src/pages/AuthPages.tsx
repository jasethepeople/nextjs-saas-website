import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, CircleAlert, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

const signInSchema = z.object({ email: z.string().email("Enter a valid email address."), password: z.string().min(8, "Password must be at least 8 characters.") });
const signUpSchema = signInSchema.extend({ name: z.string().trim().min(2, "Enter at least 2 characters.").max(80, "Name is too long."), terms: z.boolean().refine(value => value, "Please accept the terms to continue.") });
type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

function BrandMark() {
  return <div className="flex items-center gap-2.5"><span className="brand-mark"><Sparkles size={15} strokeWidth={2.4} /></span><span className="font-display text-lg font-semibold tracking-[-0.04em] text-ink">Northstar</span></div>;
}

function AuthFrame({ children, mode }: { children: React.ReactNode; mode: "sign-in" | "sign-up" }) {
  return <div className="auth-page"><div className="auth-panel"><section className="auth-aside"><div className="absolute inset-0 opacity-80 hero-noise" /><div className="relative flex justify-between"><div className="flex items-center gap-2.5"><span className="brand-mark brand-mark-light"><Sparkles size={15} strokeWidth={2.4} /></span><span className="font-display text-lg font-semibold tracking-[-0.04em]">Northstar</span></div><Link href="/" className="text-sm text-white/60 transition hover:text-white">Back home</Link></div><div className="relative my-auto max-w-md pb-8"><p className="eyebrow text-apricot">A clearer way forward</p><h1 className="mt-5 font-display text-[3.6rem] font-medium leading-[0.96] tracking-[-0.065em]">A workspace built for your next good decision.</h1><p className="mt-7 max-w-sm text-base leading-7 text-white/65">Bring your team, plans, and billing together in one composed operating space.</p><div className="mt-10 space-y-3 text-sm text-white/75">{["Purpose-built workspaces", "Calm, useful context", "Control that stays human"].map(item => <p key={item} className="flex items-center gap-3"><span className="flex size-5 items-center justify-center rounded-full bg-white/10"><Check size={12} className="text-apricot" /></span>{item}</p>)}</div></div><p className="relative text-xs text-white/35">© 2026 Northstar. Crafted for intentional teams.</p></section><section className="auth-content"><div className="auth-mobile-brand"><BrandMark /><Link href="/" className="text-sm text-muted-foreground">Back home</Link></div><div className="auth-form">{children}</div></section></div></div>;
}

function PasswordInput({ register, error, name = "password" }: { register: any; error?: string; name?: "password" }) {
  return <div><label className="form-label" htmlFor={name}>Password</label><div className="relative"><LockKeyhole className="form-icon" size={17} /><Input id={name} type="password" autoComplete={name === "password" ? "current-password" : "new-password"} className="auth-input pl-11" placeholder="At least 8 characters" {...register(name)} /></div>{error && <p className="form-error">{error}</p>}</div>;
}

function GoogleButton({ available }: { available?: boolean }) {
  if (available === false) return <div className="rounded-xl border border-dashed border-[#ddd8cb] bg-[#fbfaf7] px-4 py-3 text-center text-xs leading-5 text-muted-foreground">Google sign-in is ready to activate when OAuth credentials are configured.</div>;
  return <a className="auth-google" href="/api/auth/google"><span className="grid size-5 place-items-center rounded-full bg-white text-[11px] font-bold text-[#4285f4] shadow-sm">G</span>Continue with Google</a>;
}

export function SignIn() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: googleAvailable } = trpc.auth.googleAvailable.useQuery();
  const signIn = trpc.auth.signIn.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); setLocation("/app"); } });
  const form = useForm<SignInValues>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  return <AuthFrame mode="sign-in"><div><Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-ink"><ArrowLeft size={15} />Home</Link><p className="eyebrow mt-9">Welcome back</p><h2 className="font-display mt-3 text-4xl font-medium tracking-[-0.055em] text-ink">Make room for what matters.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Sign in to return to your workspace.</p></div><div className="mt-8"><GoogleButton available={googleAvailable} /><div className="auth-divider">or continue with email</div><form className="space-y-5" onSubmit={form.handleSubmit(values => signIn.mutate(values))}><div><label className="form-label" htmlFor="email">Email address</label><div className="relative"><Mail className="form-icon" size={17} /><Input id="email" type="email" autoComplete="email" className="auth-input pl-11" placeholder="you@company.com" {...form.register("email")} /></div>{form.formState.errors.email?.message && <p className="form-error">{form.formState.errors.email.message}</p>}</div><PasswordInput register={form.register} error={form.formState.errors.password?.message} />{signIn.error && <div className="form-alert"><CircleAlert size={16} />{signIn.error.message}</div>}<Button className="auth-submit" disabled={signIn.isPending} type="submit">{signIn.isPending ? "Signing you in…" : "Sign in"}<ArrowRight size={17} /></Button></form><p className="mt-7 text-center text-sm text-muted-foreground">New to Northstar? <Link href="/sign-up" className="font-semibold text-ink underline decoration-[#f2a762] underline-offset-4">Create your account</Link></p></div></AuthFrame>;
}

export function SignUp() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: googleAvailable } = trpc.auth.googleAvailable.useQuery();
  const signUp = trpc.auth.signUp.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); setLocation("/onboarding"); } });
  const form = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema), defaultValues: { name: "", email: "", password: "", terms: false } });
  return <AuthFrame mode="sign-up"><div><Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-ink"><ArrowLeft size={15} />Home</Link><p className="eyebrow mt-9">Get started</p><h2 className="font-display mt-3 text-4xl font-medium tracking-[-0.055em] text-ink">Your work, well held.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Create an account, then set up your workspace.</p></div><div className="mt-8"><GoogleButton available={googleAvailable} /><div className="auth-divider">or create with email</div><form className="space-y-4" onSubmit={form.handleSubmit(({ terms, ...values }) => signUp.mutate(values))}><div><label className="form-label" htmlFor="name">Full name</label><Input id="name" autoComplete="name" className="auth-input" placeholder="Avery Morgan" {...form.register("name")} />{form.formState.errors.name?.message && <p className="form-error">{form.formState.errors.name.message}</p>}</div><div><label className="form-label" htmlFor="email">Email address</label><Input id="email" type="email" autoComplete="email" className="auth-input" placeholder="you@company.com" {...form.register("email")} />{form.formState.errors.email?.message && <p className="form-error">{form.formState.errors.email.message}</p>}</div><PasswordInput register={form.register} error={form.formState.errors.password?.message} /> <label className="flex cursor-pointer items-start gap-3 pt-0.5 text-xs leading-5 text-muted-foreground"><input type="checkbox" className="mt-1 size-3.5 accent-[#d96f3f]" {...form.register("terms")} />I agree to the Terms of Service and Privacy Policy.</label>{form.formState.errors.terms?.message && <p className="form-error">{form.formState.errors.terms.message}</p>}{signUp.error && <div className="form-alert"><CircleAlert size={16} />{signUp.error.message}</div>}<Button className="auth-submit" disabled={signUp.isPending} type="submit">{signUp.isPending ? "Creating account…" : "Create account"}<ArrowRight size={17} /></Button></form><p className="mt-7 text-center text-sm text-muted-foreground">Already have an account? <Link href="/sign-in" className="font-semibold text-ink underline decoration-[#f2a762] underline-offset-4">Sign in</Link></p></div></AuthFrame>;
}
