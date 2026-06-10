"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  Download,
  Edit2,
  Lock,
  Unlock,
  Settings,
  FolderPlus,
  BarChart3,
  Calendar,
  Layers,
  Search,
  LogOut,
} from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";
import {
  adminToggleUserStatus,
  adminUpdateUserRole,
  adminCreateDepartment,
  adminAssignUserDepartment,
  adminEditAttendance,
} from "@/app/actions";
import { exportToCSV, exportToExcel } from "@/lib/export";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

interface Department {
  id: string;
  name: string;
  description: string | null;
  _count?: { users: number };
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  departmentId: string | null;
  department: { name: string } | null;
}

interface AttendanceRecord {
  id: string;
  date: string | Date;
  clockInTime: string | Date;
  clockOutTime: string | Date | null;
  status: string;
  hoursWorked: number | null;
  location: string | null;
  ipAddress: string | null;
  deviceInfo: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    department: { name: string } | null;
  };
}

interface AdminDashboardProps {
  initialUsers: User[];
  initialDepartments: Department[];
  initialAttendance: AttendanceRecord[];
}

export function AdminDashboard({
  initialUsers,
  initialDepartments,
  initialAttendance,
}: AdminDashboardProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);
  const [activeTab, setActiveTab] = useState<"analytics" | "attendance" | "users" | "departments">("analytics");

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Edit attendance record modal states
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editStatus, setEditStatus] = useState("PRESENT");
  const [editInTime, setEditInTime] = useState("");
  const [editOutTime, setEditOutTime] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(false);

  // New Department form
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptDesc, setNewDeptDesc] = useState("");
  const [loadingNewDept, setLoadingNewDept] = useState(false);

  // Quick stats
  const totalEmployees = users.length;
  
  // Today stats
  const getTodayStats = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const todayRecords = attendance.filter((rec) => {
      const recDate = new Date(rec.date).toISOString().split("T")[0];
      return recDate === todayStr;
    });

    const present = todayRecords.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
    const late = todayRecords.filter((r) => r.status === "LATE").length;
    const absent = totalEmployees - present;

    return { present, late, absent };
  };

  const todayStats = getTodayStats();

  // Handle edit attendance submission
  const handleEditAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setLoadingEdit(true);

    try {
      const res = await adminEditAttendance(editingRecord.id, {
        status: editStatus,
        clockInTime: editInTime || undefined,
        clockOutTime: editOutTime || undefined,
      });

      // Update local state
      setAttendance(
        attendance.map((rec) =>
          rec.id === editingRecord.id
            ? {
                ...rec,
                status: res.status,
                clockInTime: res.clockInTime,
                clockOutTime: res.clockOutTime,
                hoursWorked: res.hoursWorked,
              }
            : rec
        )
      );
      setEditingRecord(null);
    } catch (err: any) {
      alert("Failed to edit record: " + err.message);
    } finally {
      setLoadingEdit(false);
    }
  };

  // Create new department
  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setLoadingNewDept(true);

    try {
      const res = await adminCreateDepartment({
        name: newDeptName,
        description: newDeptDesc,
      });

      setDepartments([...departments, { ...res, _count: { users: 0 } }]);
      setNewDeptName("");
      setNewDeptDesc("");
      alert("Department created successfully!");
    } catch (err: any) {
      alert("Failed to create department: " + err.message);
    } finally {
      setLoadingNewDept(false);
    }
  };

  // Toggle user state
  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (!confirm(`Are you sure you want to set this user account to ${nextStatus}?`)) return;

    try {
      await adminToggleUserStatus(userId, nextStatus);
      setUsers(users.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u)));
    } catch (err: any) {
      alert("Failed to update user status: " + err.message);
    }
  };

  // Change user role
  const handleUserRoleChange = async (userId: string, currentRole: string) => {
    const nextRole = currentRole === "ADMIN" ? "EMPLOYEE" : "ADMIN";
    if (!confirm(`Confirm promotion/demotion to ${nextRole}?`)) return;

    try {
      await adminUpdateUserRole(userId, nextRole);
      setUsers(users.map((u) => (u.id === userId ? { ...u, role: nextRole } : u)));
    } catch (err: any) {
      alert("Failed to update role: " + err.message);
    }
  };

  // Assign user to department
  const handleAssignDept = async (userId: string, deptId: string) => {
    const actualDeptId = deptId === "NONE" ? null : deptId;
    try {
      await adminAssignUserDepartment(userId, actualDeptId);
      const matchedDept = departments.find((d) => d.id === actualDeptId) || null;
      setUsers(
        users.map((u) =>
          u.id === userId
            ? {
                ...u,
                departmentId: actualDeptId,
                department: matchedDept ? { name: matchedDept.name } : null,
              }
            : u
        )
      );
      alert("Department updated!");
    } catch (err: any) {
      alert("Failed to assign department: " + err.message);
    }
  };

  // Filter records
  const filteredAttendance = attendance.filter((rec) => {
    const matchSearch = rec.user.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === "ALL" || rec.status === statusFilter;
    const matchDept = deptFilter === "ALL" || rec.user.department?.name === deptFilter;
    
    let matchDate = true;
    if (startDate) {
      matchDate = matchDate && new Date(rec.date) >= new Date(startDate);
    }
    if (endDate) {
      matchDate = matchDate && new Date(rec.date) <= new Date(endDate);
    }

    return matchSearch && matchStatus && matchDept && matchDate;
  });

  // Export handlers
  const triggerExportCSV = () => {
    const exportData = filteredAttendance.map((rec) => ({
      Date: new Date(rec.date).toLocaleDateString(),
      Employee: rec.user.name,
      Email: rec.user.email,
      Department: rec.user.department?.name || "Unassigned",
      Status: rec.status,
      ClockIn: rec.clockInTime ? new Date(rec.clockInTime).toLocaleTimeString(undefined, { hour12: true }) : "",
      ClockOut: rec.clockOutTime ? new Date(rec.clockOutTime).toLocaleTimeString(undefined, { hour12: true }) : "",
      HoursWorked: rec.hoursWorked || 0,
      Location: rec.location || "",
      IPAddress: rec.ipAddress || "",
      Device: rec.deviceInfo || "",
    }));

    exportToCSV(exportData, `Attendance_Report_${new Date().toISOString().split("T")[0]}`);
  };

  const triggerExportExcel = () => {
    const exportData = filteredAttendance.map((rec) => ({
      Date: new Date(rec.date).toLocaleDateString(),
      Employee: rec.user.name,
      Email: rec.user.email,
      Department: rec.user.department?.name || "Unassigned",
      Status: rec.status,
      ClockIn: rec.clockInTime ? new Date(rec.clockInTime).toLocaleTimeString(undefined, { hour12: true }) : "",
      ClockOut: rec.clockOutTime ? new Date(rec.clockOutTime).toLocaleTimeString(undefined, { hour12: true }) : "",
      HoursWorked: rec.hoursWorked || 0,
      Location: rec.location || "",
      IPAddress: rec.ipAddress || "",
      Device: rec.deviceInfo || "",
    }));

    exportToExcel(exportData, `Attendance_Report_${new Date().toISOString().split("T")[0]}`);
  };

  // Analytics helper - present vs late over time
  const getChartData = () => {
    // Group records by date (last 7 active days)
    const dates: { [key: string]: { date: string; Present: number; Late: number; Absent: number } } = {};

    attendance.slice(0, 100).forEach((rec) => {
      const dateStr = new Date(rec.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (!dates[dateStr]) {
        dates[dateStr] = { date: dateStr, Present: 0, Late: 0, Absent: 0 };
      }
      if (rec.status === "PRESENT") dates[dateStr].Present += 1;
      if (rec.status === "LATE") dates[dateStr].Late += 1;
    });

    // Convert to array and reverse to chronological
    return Object.values(dates).reverse().slice(-7);
  };

  const chartData = getChartData();

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 text-zinc-100">
      
      {/* Dashboard title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
              Arible Estate & Properties Ltd
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Administration Control Panel
          </h1>
          <p className="text-zinc-400 mt-1">
            Monitor organizational attendance, verify geofencing, manage departments and security roles.
          </p>
        </div>
        
        <SignOutButton>
          <Button
            variant="outline"
            className="border-zinc-800 hover:border-rose-900/40 hover:bg-rose-950/10 hover:text-rose-400 text-zinc-300 font-semibold rounded-xl flex items-center gap-2 active:scale-[0.98] transition-all self-start md:self-auto"
          >
            <LogOut className="h-4 w-4" />
            <span>Log Out</span>
          </Button>
        </SignOutButton>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="border-zinc-800 bg-zinc-950/20">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Staff</p>
              <h3 className="text-3xl font-bold mt-1 text-zinc-100">{totalEmployees}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/20">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Present Today</p>
              <h3 className="text-3xl font-bold mt-1 text-emerald-400">{todayStats.present}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/20">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Late Arrivals</p>
              <h3 className="text-3xl font-bold mt-1 text-amber-400">{todayStats.late}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-amber-600/10 text-amber-400 border border-amber-500/20">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/20">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Absent Today</p>
              <h3 className="text-3xl font-bold mt-1 text-rose-400">{todayStats.absent}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-rose-600/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 mb-8 gap-1">
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-all duration-200 cursor-pointer ${
            activeTab === "analytics"
              ? "border-indigo-500 text-indigo-400 bg-zinc-900/30"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Analytics Overview</span>
        </button>

        <button
          onClick={() => setActiveTab("attendance")}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-all duration-200 cursor-pointer ${
            activeTab === "attendance"
              ? "border-indigo-500 text-indigo-400 bg-zinc-900/30"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Attendance Monitor</span>
        </button>

        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-all duration-200 cursor-pointer ${
            activeTab === "users"
              ? "border-indigo-500 text-indigo-400 bg-zinc-900/30"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Employee Directory</span>
        </button>

        <button
          onClick={() => setActiveTab("departments")}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-all duration-200 cursor-pointer ${
            activeTab === "departments"
              ? "border-indigo-500 text-indigo-400 bg-zinc-900/30"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Departments</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="space-y-8">
        
        {/* Tab 1: Analytics */}
        {activeTab === "analytics" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 border-zinc-800 bg-zinc-950/20">
              <CardHeader>
                <CardTitle>Attendance Trends (Last 7 Active Days)</CardTitle>
                <CardDescription>Daily comparison of punctual vs late check-ins.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                    Insufficient data to populate trends chart.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                      <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "#09090b", borderColor: "#27272a", borderRadius: "12px" }}
                        labelStyle={{ fontWeight: "bold", color: "#f4f4f5" }}
                      />
                      <Legend />
                      <Bar dataKey="Present" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Late" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-950/20">
              <CardHeader>
                <CardTitle>Punctuality Distribution</CardTitle>
                <CardDescription>Visual summary of today's attendance records.</CardDescription>
              </CardHeader>
              <CardContent className="h-80 flex flex-col justify-center gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Present (On Time)</span>
                    <span className="font-semibold text-emerald-400">
                      {todayStats.present - todayStats.late}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{
                        width: totalEmployees > 0 ? `${((todayStats.present - todayStats.late) / totalEmployees) * 100}%` : "0%"
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-sm pt-2">
                    <span className="text-zinc-400">Late Arrivals</span>
                    <span className="font-semibold text-amber-400">{todayStats.late}</span>
                  </div>
                  <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full"
                      style={{
                        width: totalEmployees > 0 ? `${(todayStats.late / totalEmployees) * 100}%` : "0%"
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-sm pt-2">
                    <span className="text-zinc-400">Absent / Not Logged</span>
                    <span className="font-semibold text-rose-400">{todayStats.absent}</span>
                  </div>
                  <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full"
                      style={{
                        width: totalEmployees > 0 ? `${(todayStats.absent / totalEmployees) * 100}%` : "0%"
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 leading-relaxed">
                  Tip: Work starts officially at 8:00 AM. Employees checking in after 8:15 AM are flagged automatically as "LATE".
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 2: Attendance Monitor */}
        {activeTab === "attendance" && (
          <div className="space-y-6">
            
            {/* Export and Filters Card */}
            <Card className="border-zinc-800 bg-zinc-950/40">
              <CardContent className="p-6">
                
                {/* Upper row: Search and Export */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/60 pb-6 mb-6">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search employee name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={triggerExportCSV}>
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={triggerExportExcel}>
                      <Download className="h-4 w-4 mr-2" />
                      Excel
                    </Button>
                  </div>
                </div>

                {/* Lower row: Filters inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="PRESENT">PRESENT</option>
                      <option value="LATE">LATE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Department</label>
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="ALL">All Departments</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* Logs Table */}
            <Card className="border-zinc-800">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-bold bg-zinc-950/40 uppercase tracking-wider">
                      <th className="p-4">Employee</th>
                      <th className="p-4">Department</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Clock In</th>
                      <th className="p-4">Clock Out</th>
                      <th className="p-4">Hours</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {filteredAttendance.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-zinc-500 text-sm">
                          No attendance records found matching filters.
                        </td>
                      </tr>
                    ) : (
                      filteredAttendance.map((record) => {
                        const recDate = new Date(record.date);
                        return (
                          <tr
                            key={record.id}
                            className="hover:bg-zinc-900/30 transition-colors text-sm text-zinc-300"
                          >
                            <td className="p-4">
                              <div className="font-semibold text-zinc-200">{record.user.name}</div>
                              <div className="text-xs text-zinc-500 font-mono mt-0.5">{record.user.email}</div>
                            </td>
                            <td className="p-4 text-zinc-400">
                              {record.user.department?.name || "Unassigned"}
                            </td>
                            <td className="p-4">
                              {recDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            </td>
                            <td className="p-4 font-mono text-xs text-zinc-400">
                              {record.clockInTime ? new Date(record.clockInTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                            </td>
                            <td className="p-4 font-mono text-xs text-zinc-400">
                              {record.clockOutTime ? new Date(record.clockOutTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                            </td>
                            <td className="p-4 font-semibold text-zinc-200">
                              {record.hoursWorked !== null ? `${record.hoursWorked} hrs` : "—"}
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                record.status === "PRESENT" 
                                  ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/60" 
                                  : record.status === "LATE"
                                  ? "bg-amber-950/40 text-amber-400 border-amber-900/60"
                                  : "bg-zinc-800/40 text-zinc-400 border-zinc-700/60"
                              }`}>
                                {record.status}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingRecord(record);
                                  setEditStatus(record.status);
                                  setEditInTime(
                                    record.clockInTime
                                      ? new Date(record.clockInTime).toISOString().slice(0, 16)
                                      : ""
                                  );
                                  setEditOutTime(
                                    record.clockOutTime
                                      ? new Date(record.clockOutTime).toISOString().slice(0, 16)
                                      : ""
                                  );
                                }}
                                className="border-zinc-800 hover:border-zinc-700 p-1.5 rounded-lg active:scale-95"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Attendance Record Edit Dialog */}
            {editingRecord && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                <Card className="w-full max-w-md bg-zinc-950 border-zinc-800 shadow-2xl relative">
                  <CardHeader>
                    <CardTitle>Adjust Attendance Log</CardTitle>
                    <CardDescription>Manually update times for {editingRecord.user.name}</CardDescription>
                  </CardHeader>
                  <form onSubmit={handleEditAttendance}>
                    <CardContent className="space-y-4">
                      
                      <Select
                        label="Attendance Status"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        options={[
                          { label: "PRESENT", value: "PRESENT" },
                          { label: "LATE", value: "LATE" },
                        ]}
                      />

                      <Input
                        label="Clock In Time"
                        type="datetime-local"
                        value={editInTime}
                        onChange={(e) => setEditInTime(e.target.value)}
                      />

                      <Input
                        label="Clock Out Time"
                        type="datetime-local"
                        value={editOutTime}
                        onChange={(e) => setEditOutTime(e.target.value)}
                      />

                    </CardContent>
                    <div className="p-6 border-t border-zinc-800/80 flex items-center justify-end gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setEditingRecord(null)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" variant="primary" loading={loadingEdit}>
                        Save Changes
                      </Button>
                    </div>
                  </form>
                </Card>
              </div>
            )}

          </div>
        )}

        {/* Tab 3: Employees Management */}
        {activeTab === "users" && (
          <Card className="border-zinc-800 bg-zinc-950/20">
            <CardHeader>
              <CardTitle>Employee Accounts</CardTitle>
              <CardDescription>Manage user departments, assign administrative permissions, or lock/unlock accounts.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-bold bg-zinc-950/40 uppercase tracking-wider">
                    <th className="p-4">Name</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Department</th>
                    <th className="p-4">Account Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {users.map((employee) => (
                    <tr
                      key={employee.id}
                      className="hover:bg-zinc-900/30 transition-colors text-sm text-zinc-300"
                    >
                      <td className="p-4">
                        <div className="font-semibold text-zinc-200">{employee.name}</div>
                        <div className="text-xs text-zinc-500 font-mono mt-0.5">{employee.email}</div>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => handleUserRoleChange(employee.id, employee.role)}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-85 ${
                            employee.role === "ADMIN" 
                              ? "bg-purple-950/40 text-purple-400 border-purple-900/60" 
                              : "bg-zinc-800/40 text-zinc-400 border-zinc-700/60"
                          }`}
                        >
                          {employee.role}
                        </button>
                      </td>
                      <td className="p-4">
                        <select
                          value={employee.departmentId || "NONE"}
                          onChange={(e) => handleAssignDept(employee.id, e.target.value)}
                          className="bg-zinc-900 text-zinc-300 text-xs rounded-lg border border-zinc-800 p-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="NONE">Unassigned</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          employee.status === "ACTIVE" 
                            ? "bg-emerald-950/30 text-emerald-400" 
                            : "bg-rose-950/30 text-rose-400"
                        }`}>
                          {employee.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          size="sm"
                          variant={employee.status === "ACTIVE" ? "danger" : "success"}
                          onClick={() => handleToggleUserStatus(employee.id, employee.status)}
                          className="px-2 py-1 text-xs rounded-lg active:scale-95 flex items-center gap-1.5 ml-auto"
                        >
                          {employee.status === "ACTIVE" ? (
                            <>
                              <Lock className="h-3 w-3" />
                              <span>Disable</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="h-3 w-3" />
                              <span>Enable</span>
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Tab 4: Departments Management */}
        {activeTab === "departments" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Create new Department form */}
            <Card className="border-zinc-800 bg-zinc-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderPlus className="h-5 w-5 text-indigo-400" />
                  <span>Create Department</span>
                </CardTitle>
                <CardDescription>Add new divisions for employee grouping.</CardDescription>
              </CardHeader>
              <form onSubmit={handleCreateDept}>
                <CardContent className="space-y-4">
                  <Input
                    label="Department Name"
                    type="text"
                    required
                    placeholder="e.g., Engineering, Marketing..."
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                  />
                  <Input
                    label="Description"
                    type="text"
                    placeholder="Brief description..."
                    value={newDeptDesc}
                    onChange={(e) => setNewDeptDesc(e.target.value)}
                  />
                </CardContent>
                <div className="p-6 border-t border-zinc-800/80">
                  <Button type="submit" className="w-full font-bold" variant="primary" loading={loadingNewDept}>
                    Create Division
                  </Button>
                </div>
              </form>
            </Card>

            {/* Departments list */}
            <Card className="lg:col-span-2 border-zinc-800">
              <CardHeader>
                <CardTitle>Organization Divisions</CardTitle>
                <CardDescription>Department listings and headcount totals.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-bold bg-zinc-950/40 uppercase tracking-wider">
                      <th className="p-4">Name</th>
                      <th className="p-4">Description</th>
                      <th className="p-4 text-right">Headcount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {departments.map((dept) => (
                      <tr
                        key={dept.id}
                        className="hover:bg-zinc-900/30 transition-colors text-sm text-zinc-300"
                      >
                        <td className="p-4 font-semibold text-zinc-200">{dept.name}</td>
                        <td className="p-4 text-zinc-400">{dept.description || "—"}</td>
                        <td className="p-4 text-right font-mono text-zinc-200 font-semibold">
                          {dept._count?.users || 0} users
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

          </div>
        )}

      </div>

    </div>
  );
}
export default AdminDashboard;
