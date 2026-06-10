import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Clock, CheckSquare, ShieldCheck, Zap, ArrowRight, UserCheck, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";

export default async function LandingPage() {
  // Check auth - redirect to dashboard if already logged in
  const user = await currentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 bg-zinc-950 text-zinc-100 flex flex-col font-sans relative overflow-hidden">
      
      {/* Dynamic Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

      {/* Header / Navbar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between border-b border-zinc-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
            <Clock className="h-6 w-6 animate-pulse" />
          </div>
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
            ClockIn<span className="text-indigo-400">PWA</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/sign-in"
            className="text-sm font-semibold text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-indigo-500/20 transition-all duration-200 active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center max-w-7xl mx-auto px-6 py-20 text-center relative z-10">
        
        {/* Tagline Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/50 border border-indigo-900/50 text-indigo-400 text-xs font-semibold mb-6">
          <Activity className="h-3.5 w-3.5" />
          <span>Production-Ready Progressive Web App</span>
        </div>

        {/* Hero Headlines */}
        <h1 className="max-w-4xl text-5xl sm:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
          Enterprise Attendance Management,{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Simplified
          </span>
        </h1>
        
        <p className="max-w-2xl text-lg sm:text-xl text-zinc-400 leading-relaxed mb-10">
          A security-focused, geofenced employee clock-in application with offline synchronization, custom push notifications, and administrative reporting dashboards.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-20 w-full sm:w-auto">
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-8 py-4 rounded-2xl font-bold shadow-2xl shadow-indigo-500/30 transition-all duration-200 active:scale-95 text-base"
          >
            <span>Deploy as Employee</span>
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center border border-zinc-800 hover:bg-zinc-900 text-zinc-300 px-8 py-4 rounded-2xl font-bold transition-all duration-200 active:scale-95 text-base"
          >
            Admin Access
          </Link>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
          
          <Card className="border-zinc-800/80 bg-zinc-900/20 hover:border-zinc-700/60 transition-all duration-300">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-5 shadow-lg shadow-indigo-500/5">
                <CheckSquare className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100 mb-2">GPS Geofencing</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Verify clock-in locations with GPS coordinate checks matching office location coordinates and boundary limits.
              </p>
            </CardContent>
          </Card>

          <Card className="border-zinc-800/80 bg-zinc-900/20 hover:border-zinc-700/60 transition-all duration-300">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <div className="p-3.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-5 shadow-lg shadow-purple-500/5">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100 mb-2">Offline Capability</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Clock in or out even while offline. Action requests queue locally in IndexedDB and synchronize automatically when connection returns.
              </p>
            </CardContent>
          </Card>

          <Card className="border-zinc-800/80 bg-zinc-900/20 hover:border-zinc-700/60 transition-all duration-300">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <div className="p-3.5 rounded-2xl bg-pink-500/10 text-pink-400 border border-pink-500/20 mb-5 shadow-lg shadow-pink-500/5">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100 mb-2">RBAC Control</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Strict role hierarchy. Admins manage accounts, divisions, verify coordinates, audit logs, and export Excel reports.
              </p>
            </CardContent>
          </Card>

        </div>

        {/* Roles Details Grid */}
        <div className="mt-24 border-t border-zinc-900/80 pt-16 w-full text-left">
          <h2 className="text-3xl font-extrabold mb-10 text-center tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
            Supported Organizational Roles
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            
            {/* Employee Capabilities */}
            <div className="space-y-4 p-8 rounded-2xl border border-zinc-900 bg-zinc-950/40">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-lg mb-2">
                <UserCheck className="h-5 w-5" />
                <span>Employee Persona</span>
              </div>
              <ul className="space-y-3 text-sm text-zinc-400">
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span>Clock in/out daily using geolocated triggers</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span>Review monthly calendar attendance history</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span>Sync clock actions offline with IndexedDB queues</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span>Activate push notifications for record adjustments</span>
                </li>
              </ul>
            </div>

            {/* Admin Capabilities */}
            <div className="space-y-4 p-8 rounded-2xl border border-zinc-900 bg-zinc-950/40">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-lg mb-2">
                <ShieldCheck className="h-5 w-5" />
                <span>Administrator Persona</span>
              </div>
              <ul className="space-y-3 text-sm text-zinc-400">
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span>Interactive charts monitoring punctuality rates</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span>Filter attendance records by week, month, or employee</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span>Export reports to Excel or CSV downloading formats</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span>Lock employee profiles and assign organizational divisions</span>
                </li>
              </ul>
            </div>

          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 text-center text-xs text-zinc-600 bg-zinc-950">
        <p>© {new Date().getFullYear()} ClockInPWA. All rights reserved. Built for modern enterprise networks.</p>
      </footer>

    </div>
  );
}
