import { redirect } from "next/navigation";
import { syncUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { EmployeeDashboard } from "@/components/dashboard/EmployeeDashboard";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let user = null;

  try {
    user = await syncUser();
  } catch (dbError) {
    console.error("Database connection error in Dashboard:", dbError);
    // Display helpful warning if database is not configured
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 p-6">
        <Card className="w-full max-w-lg border-rose-900 bg-rose-950/20 text-zinc-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-6 w-6" />
              <span>Database Connection Error</span>
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Prisma is unable to connect to your Supabase PostgreSQL database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-zinc-300">
            <p>
              Please make sure your database is running and verify that the <strong>DATABASE_URL</strong> environment variable is correctly defined in your <code>.env</code> file.
            </p>
            <p className="text-xs text-zinc-500 font-mono p-3 bg-zinc-950/60 rounded-xl border border-zinc-900 overflow-x-auto">
              {String(dbError)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Redirect if not signed in (Clerk middleware handles this generally, but as backup)
  if (!user) {
    redirect("/sign-in");
  }

  if (user.status === "DISABLED") {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 p-6">
        <Card className="w-full max-w-md border-amber-900 bg-amber-950/20 text-zinc-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-6 w-6" />
              <span>Account Disabled</span>
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Your employee attendance account has been deactivated.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-zinc-300 leading-relaxed">
            Please contact an administrator or HR department representative to reactivate your credentials and restore clock-in privileges.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin Dashboard Render
  if (user.role === "ADMIN") {
    // Run queries in parallel for efficiency
    const [dbUsers, dbDepartments, dbAttendance] = await Promise.all([
      prisma.user.findMany({
        include: { department: true },
        orderBy: { name: "asc" },
      }),
      prisma.department.findMany({
        include: {
          _count: {
            select: { users: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.attendance.findMany({
        include: {
          user: {
            include: { department: true },
          },
        },
        orderBy: { date: "desc" },
      }),
    ]);

    // Format fields (e.g. serialize Date objects to work with Client components cleanly)
    const serializedUsers = dbUsers.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));

    const serializedDepts = dbDepartments.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));

    const serializedAttendance = dbAttendance.map((a) => ({
      ...a,
      date: a.date.toISOString(),
      clockInTime: a.clockInTime.toISOString(),
      clockOutTime: a.clockOutTime ? a.clockOutTime.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));

    return (
      <div className="flex-1 bg-zinc-950 min-h-screen">
        <AdminDashboard
          initialUsers={serializedUsers}
          initialDepartments={serializedDepts}
          initialAttendance={serializedAttendance}
        />
      </div>
    );
  }

  // Employee Dashboard Render
  const dbHistory = await prisma.attendance.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
  });

  const serializedHistory = dbHistory.map((a) => ({
    ...a,
    date: a.date.toISOString(),
    clockInTime: a.clockInTime.toISOString(),
    clockOutTime: a.clockOutTime ? a.clockOutTime.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  const serializedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department ? { name: user.department.name } : null,
  };

  return (
    <div className="flex-1 bg-zinc-950 min-h-screen">
      <EmployeeDashboard
        initialUser={serializedUser}
        initialHistory={serializedHistory}
      />
    </div>
  );
}
