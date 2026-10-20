"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2,
  Cloud,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  MonitorDot,
  Share2,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import { Alert } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type FormValues = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  {
    role: "NIELIT Administrator",
    email: "admin@nielit-demo.local",
    icon: Shield,
    color: "bg-blue-50 border-blue-100 text-blue-600",
  },
  {
    role: "Department In-Charge",
    email: "department@nielit-demo.local",
    icon: Building2,
    color: "bg-emerald-50 border-emerald-100 text-emerald-600",
  },
  {
    role: "Learner",
    email: "learner@nielit-demo.local",
    icon: GraduationCap,
    color: "bg-purple-50 border-purple-100 text-purple-600",
  },
];

export function LoginScreen() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [forgotOpen, setForgotOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  React.useEffect(() => {
    if (!loading && user) router.replace(ROLE_HOME[user.role]);
  }, [user, loading, router]);

  const onSubmit = async (v: FormValues) => {
    setError(null);
    try {
      const me = await login(v.email, v.password);
      const next = params.get("next");
      const target =
        next &&
        next.startsWith(
          `/${me.role === "ADMIN" ? "admin" : me.role === "DEPARTMENT" ? "department" : "learner"}`
        )
          ? next
          : ROLE_HOME[me.role];
      window.location.href = target;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <div className="grid flex-1 lg:grid-cols-[1.38fr_1fr]">
        {/* Left Hero Section */}
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[#011431] px-10 py-10 text-white lg:flex xl:px-14">
          {/* Subtle Cyber Grid Matrix */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
            aria-hidden
          />

          {/* Background Graphic: Dome with Indian Flag + Glowing Cyber Shield */}
          <div
            className="pointer-events-none absolute bottom-0 right-0 top-0 w-[56%] bg-contain bg-right-bottom bg-no-repeat"
            style={{
              backgroundImage: "url('/hero-dome-shield.png')",
            }}
            aria-hidden
          />

          {/* Top Branding - Powered by i-Connectresources */}
          <div className="relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/20 p-2 backdrop-blur-sm shadow-md">
                <img
                  src="/iconnect-icon-white.png"
                  alt="i-Connectresources Logo"
                  className="h-8 w-auto object-contain"
                />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">
                  POWERED BY
                </p>
                <h2 className="text-[14.5px] font-bold tracking-wide text-white leading-snug">
                  I-CONNECTRESOURCES INTERNATIONAL PRIVATE LIMITED
                </h2>
              </div>
            </div>
          </div>

          {/* Main Hero Content */}
          <div className="relative z-10 max-w-[530px] my-auto py-6">
            <div className="h-1 w-12 rounded-full bg-amber-400" />

            <h1 className="mt-5 text-[34px] xl:text-[38px] font-extrabold leading-[1.18] text-white tracking-tight">
              Strengthening Digital<br />
              Security through<br />
              <span className="text-amber-400">Specialized Training</span>
            </h1>

            <p className="mt-4 text-[13px] leading-relaxed text-slate-300/90 max-w-[480px]">
              A dedicated learning and management portal for capacity building in Cyber Security and Digital
              Forensics, supporting nominated learners from authorized departments.
            </p>

            {/* Feature Card Shimmer Keyframe */}
            <style>{`
              @keyframes shimmer-sweep {
                0%   { transform: translateX(-120%) skewX(-15deg); opacity: 0; }
                40%  { opacity: 1; }
                100% { transform: translateX(220%) skewX(-15deg); opacity: 0; }
              }
              .feature-card:hover .card-shimmer {
                animation: shimmer-sweep 0.65s ease-in-out forwards;
              }
            `}</style>
            {/* 4 Feature Cards (2x2 Grid) */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[490px]">

              {/* Cyber Security Awareness */}
              <div className="feature-card group relative overflow-hidden flex items-start gap-3 rounded-xl border border-white/10 bg-[#071d3a]/80 p-3.5 backdrop-blur-sm shadow-sm cursor-default
                transition-all duration-300 ease-out
                hover:scale-[1.04] hover:border-emerald-500/50 hover:shadow-[0_0_18px_2px_rgba(16,185,129,0.18)] hover:bg-[#081f3d]/90">
                <span className="card-shimmer pointer-events-none absolute inset-0 w-[45%] bg-gradient-to-r from-transparent via-emerald-300/20 to-transparent" />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-950/60 text-emerald-400 transition-all duration-300 group-hover:border-emerald-400/70 group-hover:bg-emerald-900/60 group-hover:text-emerald-300 group-hover:scale-110">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[12.5px] font-semibold text-white leading-tight transition-colors duration-300 group-hover:text-emerald-200">
                    Cyber Security Awareness
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug transition-colors duration-300 group-hover:text-slate-300">
                    Build a safer digital workforce
                  </p>
                </div>
              </div>

              {/* IoT Forensics */}
              <div className="feature-card group relative overflow-hidden flex items-start gap-3 rounded-xl border border-white/10 bg-[#071d3a]/80 p-3.5 backdrop-blur-sm shadow-sm cursor-default
                transition-all duration-300 ease-out
                hover:scale-[1.04] hover:border-cyan-500/50 hover:shadow-[0_0_18px_2px_rgba(6,182,212,0.18)] hover:bg-[#081f3d]/90">
                <span className="card-shimmer pointer-events-none absolute inset-0 w-[45%] bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-950/60 text-cyan-400 transition-all duration-300 group-hover:border-cyan-400/70 group-hover:bg-cyan-900/60 group-hover:text-cyan-300 group-hover:scale-110">
                  <Share2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[12.5px] font-semibold text-white leading-tight transition-colors duration-300 group-hover:text-cyan-200">
                    IoT Forensics
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug transition-colors duration-300 group-hover:text-slate-300">
                    Investigate connected devices and systems
                  </p>
                </div>
              </div>

              {/* Cloud Forensics */}
              <div className="feature-card group relative overflow-hidden flex items-start gap-3 rounded-xl border border-white/10 bg-[#071d3a]/80 p-3.5 backdrop-blur-sm shadow-sm cursor-default
                transition-all duration-300 ease-out
                hover:scale-[1.04] hover:border-indigo-500/50 hover:shadow-[0_0_18px_2px_rgba(99,102,241,0.18)] hover:bg-[#081f3d]/90">
                <span className="card-shimmer pointer-events-none absolute inset-0 w-[45%] bg-gradient-to-r from-transparent via-indigo-300/20 to-transparent" />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-500/40 bg-indigo-950/60 text-indigo-400 transition-all duration-300 group-hover:border-indigo-400/70 group-hover:bg-indigo-900/60 group-hover:text-indigo-300 group-hover:scale-110">
                  <Cloud className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[12.5px] font-semibold text-white leading-tight transition-colors duration-300 group-hover:text-indigo-200">
                    Cloud Forensics
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug transition-colors duration-300 group-hover:text-slate-300">
                    Analyze cloud environments and evidence
                  </p>
                </div>
              </div>

              {/* Enterprise DFIR */}
              <div className="feature-card group relative overflow-hidden flex items-start gap-3 rounded-xl border border-white/10 bg-[#071d3a]/80 p-3.5 backdrop-blur-sm shadow-sm cursor-default
                transition-all duration-300 ease-out
                hover:scale-[1.04] hover:border-amber-500/50 hover:shadow-[0_0_18px_2px_rgba(245,158,11,0.18)] hover:bg-[#081f3d]/90">
                <span className="card-shimmer pointer-events-none absolute inset-0 w-[45%] bg-gradient-to-r from-transparent via-amber-300/20 to-transparent" />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-950/60 text-amber-400 transition-all duration-300 group-hover:border-amber-400/70 group-hover:bg-amber-900/60 group-hover:text-amber-300 group-hover:scale-110">
                  <MonitorDot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[12.5px] font-semibold text-white leading-tight transition-colors duration-300 group-hover:text-amber-200">
                    Enterprise DFIR
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug transition-colors duration-300 group-hover:text-slate-300">
                    Respond, investigate and recover
                  </p>
                </div>
              </div>

            </div>
          </div>

          <div className="relative z-10 text-[11px] text-slate-400/80">
            © I-CONNECTRESOURCES INTERNATIONAL PRIVATE LIMITED · Digital Training &amp; Forensics Capacity Building Platform
          </div>
        </section>

        {/* Right Section: Sign In Card */}
        <section className="flex items-center justify-center bg-[#f8fafc] px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-[430px] rounded-2xl bg-white p-7 sm:p-9 shadow-[0_4px_30px_rgba(0,0,0,0.06)] border border-slate-100">
            {/* Mobile Branding */}
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <img
                src="/iconnect-icon-blue.png"
                alt="i-Connectresources Logo"
                className="h-9 w-auto object-contain"
              />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600">POWERED BY</p>
                <p className="text-[13px] font-bold text-slate-900 leading-tight">
                  I-CONNECTRESOURCES INTERNATIONAL PVT. LTD.
                </p>
              </div>
            </div>

            <h2 className="text-[20px] font-bold tracking-tight text-slate-900">Sign in</h2>
            <p className="mt-1 text-[13px] text-slate-500">Use your portal account to continue.</p>

            {params.get("expired") && (
              <Alert tone="warn" className="mt-4">
                Your session expired. Please sign in again.
              </Alert>
            )}
            {error && (
              <Alert tone="bad" className="mt-4">
                {error}
              </Alert>
            )}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              {/* Email Field */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-[12.5px] font-semibold text-slate-700">
                  Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="Enter your email"
                    className={cn(
                      "h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13.5px] text-slate-800 placeholder:text-slate-400 transition-colors focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800",
                      errors.email && "border-red-500 focus:border-red-500 focus:ring-red-500"
                    )}
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="text-[11.5px] text-red-600">{errors.email.message}</p>}
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-[12.5px] font-semibold text-slate-700">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className={cn(
                      "h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 text-[13.5px] text-slate-800 placeholder:text-slate-400 transition-colors focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800",
                      errors.password && "border-red-500 focus:border-red-500 focus:ring-red-500"
                    )}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-[11.5px] text-red-600">{errors.password.message}</p>}
              </div>

              {/* Forgot Password Link */}
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-[12px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#07172f] hover:bg-[#0c2448] text-[13.5px] font-semibold text-white transition-colors shadow-sm disabled:opacity-70"
              >
                {isSubmitting ? (
                  "Signing in..."
                ) : (
                  <>
                    <span>Login</span>
                    <span className="text-base leading-none">→</span>
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <span className="relative bg-white px-3 text-[12px] text-slate-400">
                Or use a demo account
              </span>
            </div>

            {/* Demo Accounts List */}
            <div className="space-y-2.5">
              {DEMO_ACCOUNTS.map((a) => {
                const Icon = a.icon;
                return (
                  <div
                    key={a.email}
                    className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50/60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", a.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-[12.5px] font-semibold text-slate-800 leading-tight truncate">
                          {a.role}
                        </p>
                        <p className="text-[11.5px] text-slate-500 leading-tight mt-0.5 truncate">
                          {a.email}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setValue("email", a.email, { shouldValidate: true });
                        setValue("password", "Demo@12345", { shouldValidate: true });
                        onSubmit({ email: a.email, password: "Demo@12345" });
                      }}
                      className="ml-2 shrink-0 rounded-md bg-blue-50 hover:bg-blue-100 px-3 py-1.5 text-[12px] font-medium text-blue-600 transition-colors disabled:opacity-50"
                    >
                      Use
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
      <Dialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        size="sm"
        title="Reset your password"
        description="Password resets are handled by the programme administrator."
        footer={
          <button
            type="button"
            onClick={() => setForgotOpen(false)}
            className="h-9 rounded-lg bg-[#07172f] px-4 text-[13px] font-semibold text-white hover:bg-[#0c2448] transition-colors"
          >
            Close
          </button>
        }
      >
        <p className="text-[13px] text-slate-600">
          For password resets, please contact your portal administrator. They can issue a new
          temporary password from <span className="font-medium text-slate-800">Administrator → Users</span>.
        </p>
      </Dialog>
    </div>
  );
}
