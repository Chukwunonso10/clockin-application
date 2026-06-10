"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Clock,
  LogIn,
  LogOut,
  MapPin,
  Calendar,
  Wifi,
  WifiOff,
  User,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  FileText,
  BarChart3,
} from "lucide-react";
import { clockIn, clockOut, saveSubscription, unsubscribeUser } from "@/app/actions";
import { SignOutButton } from "@clerk/nextjs";
import { getDistance } from "@/lib/geolocation";
import { saveOfflineAction, getOfflineActions, clearOfflineActions } from "@/lib/offline";

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
}

interface EmployeeDashboardProps {
  initialUser: {
    id: string;
    name: string;
    email: string;
    role: string;
    department: { name: string } | null;
  };
  initialHistory: AttendanceRecord[];
}

export function EmployeeDashboard({ initialUser, initialHistory }: EmployeeDashboardProps) {
  const [history, setHistory] = useState<AttendanceRecord[]>(initialHistory);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [location, setLocation] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [offlineQueueLength, setOfflineQueueLength] = useState(0);
  
  // Notification states
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [vapidSupported, setVapidSupported] = useState(false);

  // Office Config loaded from Env (in client components they must be prefixed with NEXT_PUBLIC_)
  const officeLat = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LATITUDE || "");
  const officeLng = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LONGITUDE || "");
  const officeRadius = parseFloat(process.env.NEXT_PUBLIC_OFFICE_RADIUS_METERS || "100");
  const hasGeofence = !isNaN(officeLat) && !isNaN(officeLng);

  // Sync online status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      triggerOfflineSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    // Check IndexedDB queue size
    checkOfflineQueue();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Update clock every second
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto request location on load if geofence is enabled
  useEffect(() => {
    if (hasGeofence && isOnline) {
      requestLocation();
    }
  }, [isOnline]);

  // Push notifications detection
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setVapidSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const checkOfflineQueue = async () => {
    try {
      const actions = await getOfflineActions();
      setOfflineQueueLength(actions.length);
    } catch (err) {
      console.error(err);
    }
  };

  const requestLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = "Geolocation is not supported by your browser.";
        setErrorMessage(msg);
        reject(msg);
        return;
      }

      setGpsLoading(true);
      setErrorMessage(null);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation(`${lat.toFixed(6)},${lng.toFixed(6)}`);

          if (hasGeofence) {
            const dist = getDistance(lat, lng, officeLat, officeLng);
            setDistance(dist);
            if (dist > officeRadius) {
              setErrorMessage(`Out of zone: You are ${Math.round(dist)}m away. Required < ${officeRadius}m.`);
            }
          }
          setGpsLoading(false);
          resolve({ lat, lng });
        },
        (err) => {
          setGpsLoading(false);
          let msg = "Failed to acquire location. Please enable GPS.";
          if (err.code === err.PERMISSION_DENIED) {
            msg = "Location permission denied. Please allow GPS to Clock In.";
          }
          setErrorMessage(msg);
          reject(msg);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  // Find today's record
  const getTodayRecord = () => {
    if (!currentTime) return null;
    return history.find((rec) => {
      const recDate = new Date(rec.date);
      return (
        recDate.getDate() === currentTime.getDate() &&
        recDate.getMonth() === currentTime.getMonth() &&
        recDate.getFullYear() === currentTime.getFullYear()
      );
    });
  };

  const todayRecord = getTodayRecord();

  const handleClockIn = async () => {
    setLoadingAction("in");
    setErrorMessage(null);

    const clientIp = "127.0.0.1"; // Will fallback in server or retrieved via client endpoints
    const userAgent = navigator.userAgent;

    try {
      let currentCoords: string | null = null;
      
      if (hasGeofence) {
        // Force GPS check
        const coords = await requestLocation();
        currentCoords = `${coords.lat},${coords.lng}`;
      } else {
        // Try getting coordinates if permitted, but don't fail
        try {
          const coords = await new Promise<{lat: number, lng: number}>((res, rej) => {
            navigator.geolocation.getCurrentPosition(p => res({lat: p.coords.latitude, lng: p.coords.longitude}), rej, {timeout: 3000});
          });
          currentCoords = `${coords.lat},${coords.lng}`;
        } catch {}
      }

      if (!isOnline) {
        // Save to IndexedDB
        await saveOfflineAction({
          type: "in",
          timestamp: new Date().toISOString(),
          location: currentCoords,
          deviceInfo: userAgent,
          ipAddress: clientIp,
        });
        await checkOfflineQueue();
        
        // Mock offline history record
        const mockRecord: AttendanceRecord = {
          id: `offline-in-${Date.now()}`,
          date: new Date().toISOString().split("T")[0],
          clockInTime: new Date(),
          clockOutTime: null,
          status: "PRESENT", // Default to present offline, server verifies late threshold
          hoursWorked: null,
          location: currentCoords,
          ipAddress: clientIp,
          deviceInfo: userAgent,
        };
        setHistory([mockRecord, ...history]);
        setLoadingAction(null);
        return;
      }

      const res = await clockIn({
        location: currentCoords,
        ipAddress: clientIp,
        deviceInfo: userAgent,
      });

      // Update UI history
      setHistory([res as any, ...history]);
    } catch (err: any) {
      setErrorMessage(err.message || "Clock-in failed. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleClockOut = async () => {
    setLoadingAction("out");
    setErrorMessage(null);

    const clientIp = "127.0.0.1";
    const userAgent = navigator.userAgent;

    try {
      if (!isOnline) {
        // Save to IndexedDB
        await saveOfflineAction({
          type: "out",
          timestamp: new Date().toISOString(),
          location: null,
          deviceInfo: userAgent,
          ipAddress: clientIp,
        });
        await checkOfflineQueue();

        // Update local history mock
        setHistory(
          history.map((rec) => {
            if (rec.id.startsWith("offline-in-") || (!rec.clockOutTime && new Date(rec.date).getDate() === new Date().getDate())) {
              const clockInDate = new Date(rec.clockInTime);
              const now = new Date();
              const hrs = (now.getTime() - clockInDate.getTime()) / (1000 * 60 * 60);
              return {
                ...rec,
                clockOutTime: now,
                hoursWorked: parseFloat(hrs.toFixed(2)),
              };
            }
            return rec;
          })
        );
        setLoadingAction(null);
        return;
      }

      const res = await clockOut({
        ipAddress: clientIp,
        deviceInfo: userAgent,
      });

      // Update UI history
      setHistory(history.map((h) => (h.id === res.id ? (res as any) : h)));
    } catch (err: any) {
      setErrorMessage(err.message || "Clock-out failed. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  };

  const triggerOfflineSync = async () => {
    if (!isOnline) return;
    const actions = await getOfflineActions();
    if (actions.length === 0) return;

    setSyncing(true);
    try {
      for (const action of actions) {
        if (action.type === "in") {
          await clockIn({
            location: action.location,
            ipAddress: action.ipAddress,
            deviceInfo: action.deviceInfo,
          });
        } else {
          await clockOut({
            ipAddress: action.ipAddress,
            deviceInfo: action.deviceInfo,
          });
        }
      }
      await clearOfflineActions();
      
      // Refresh real db logs
      window.location.reload();
    } catch (err: any) {
      setErrorMessage(`Background Sync failed: ${err.message}. Manual action required.`);
    } finally {
      setSyncing(false);
      checkOfflineQueue();
    }
  };

  const subscribePush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        alert("VAPID keys not configured in system environment.");
        return;
      }

      // Convert VAPID key
      const padding = "=".repeat((4 - (key.length % 4)) % 4);
      const base64 = (key + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: outputArray,
      });

      const serializedSub = JSON.parse(JSON.stringify(subscription));
      await saveSubscription(serializedSub);
      setIsSubscribed(true);
    } catch (err: any) {
      console.error(err);
      alert("Failed to subscribe for notifications: " + err.message);
    }
  };

  const unsubscribePush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
      await unsubscribeUser();
      setIsSubscribed(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Calculate quick stats
  const totalWorkedThisWeek = () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return history
      .filter((rec) => new Date(rec.date) >= oneWeekAgo && rec.hoursWorked)
      .reduce((sum, rec) => sum + (rec.hoursWorked || 0), 0)
      .toFixed(1);
  };

  const totalWorkedThisMonth = () => {
    const currentMonth = new Date().getMonth();
    return history
      .filter((rec) => new Date(rec.date).getMonth() === currentMonth && rec.hoursWorked)
      .reduce((sum, rec) => sum + (rec.hoursWorked || 0), 0)
      .toFixed(1);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 text-zinc-100">
      
      {/* Header and Sync Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
              Arible Estate & Properties Ltd
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Welcome back, {initialUser.name}
          </h1>
          <p className="text-zinc-400 mt-1">
            {initialUser.department?.name || "General Staff"} • {initialUser.role} Account
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Offline Sync State */}
          {offlineQueueLength > 0 && (
            <div className="bg-amber-950/60 border border-amber-800/80 px-3 py-1.5 rounded-xl flex items-center gap-2 text-amber-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>{offlineQueueLength} actions cached offline</span>
              {isOnline && (
                <Button
                  size="sm"
                  variant="success"
                  onClick={triggerOfflineSync}
                  loading={syncing}
                  className="py-1 px-2 text-xs rounded-lg active:scale-95"
                >
                  Sync Now
                </Button>
              )}
            </div>
          )}

          {/* Online Indicator */}
          <div
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-sm ${
              isOnline
                ? "bg-emerald-950/40 border-emerald-900/60 text-emerald-400"
                : "bg-rose-950/40 border-rose-900/60 text-rose-400"
            }`}
          >
            {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            <span>{isOnline ? "Connected" : "Offline Mode"}</span>
          </div>

          {/* Web Push Toggle */}
          {vapidSupported && (
            <Button
              variant="outline"
              size="sm"
              onClick={isSubscribed ? unsubscribePush : subscribePush}
              className="border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-xl"
            >
              {isSubscribed ? "Disable Push" : "Enable Alerts"}
            </Button>
          )}

          {/* Log Out Button */}
          <SignOutButton>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-800 hover:border-rose-900/40 hover:bg-rose-950/10 hover:text-rose-400 text-zinc-300 rounded-xl flex items-center gap-2 active:scale-[0.98] transition-all"
            >
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </Button>
          </SignOutButton>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left/Middle Columns: Actions and Map */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Geofencing Coordinates and IP Check */}
          {hasGeofence && (
            <Card className="overflow-hidden border-zinc-800/50 bg-zinc-950/50 shadow-inner">
              <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${distance !== null && distance <= officeRadius ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}`}>
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-zinc-200">Office Radius Check</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {location ? `My GPS: ${location}` : "GPS Coordinates: Pending request..."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-auto">
                  {distance !== null ? (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                      distance <= officeRadius 
                        ? "bg-emerald-950/50 text-emerald-400 border-emerald-800/60" 
                        : "bg-rose-950/50 text-rose-400 border-rose-800/60"
                    }`}>
                      {distance <= officeRadius 
                        ? `Within Zone (${Math.round(distance)}m)` 
                        : `Outside Zone (${Math.round(distance)}m)`}
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800/50 text-zinc-400 border border-zinc-700/50">
                      Coordinates Unknown
                    </span>
                  )}
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => requestLocation()}
                    loading={gpsLoading}
                    className="border-zinc-800 hover:bg-zinc-900 py-1.5 rounded-lg text-xs"
                  >
                    Refresh GPS
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Clock In / Out Console */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-900 to-indigo-950/30 border-zinc-800">
            <CardContent className="p-8 flex flex-col items-center text-center">
              
              {/* Dynamic Clock UI */}
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-xl shadow-indigo-500/5">
                <Clock className="h-8 w-8 animate-pulse" />
              </div>
              <h2 className="text-4xl font-extrabold tracking-widest text-zinc-100 font-mono">
                {currentTime ? currentTime.toLocaleTimeString(undefined, { hour12: true }) : "00:00:00"}
              </h2>
              <p className="text-sm text-zinc-400 mt-2 font-medium">
                {currentTime ? currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : "Loading date..."}
              </p>

              {/* Status Indicator Bar */}
              <div className="my-6">
                {!todayRecord ? (
                  <span className="bg-amber-950/60 border border-amber-900 text-amber-400 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider">
                    Not Checked In Today
                  </span>
                ) : !todayRecord.clockOutTime ? (
                  <span className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                    todayRecord.status === "LATE" 
                      ? "bg-amber-950/60 border-amber-800 text-amber-400" 
                      : "bg-emerald-950/60 border-emerald-800 text-emerald-400"
                  }`}>
                    Checked In: {todayRecord.status} ({new Date(todayRecord.clockInTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })})
                  </span>
                ) : (
                  <span className="bg-zinc-800/80 border border-zinc-700 text-zinc-300 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider">
                    Shift Ended Today ({todayRecord.hoursWorked} hrs worked)
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row w-full max-w-md gap-4 mt-2">
                <Button
                  className="flex-1 py-4 text-base font-bold shadow-indigo-500/10"
                  variant="success"
                  disabled={!!todayRecord || (hasGeofence && distance !== null && distance > officeRadius)}
                  loading={loadingAction === "in"}
                  onClick={handleClockIn}
                >
                  <LogIn className="mr-2 h-5 w-5" />
                  Clock In
                </Button>
                
                <Button
                  className="flex-1 py-4 text-base font-bold shadow-rose-500/10"
                  variant="danger"
                  disabled={!todayRecord || !!todayRecord.clockOutTime}
                  loading={loadingAction === "out"}
                  onClick={handleClockOut}
                >
                  <LogOut className="mr-2 h-5 w-5" />
                  Clock Out
                </Button>
              </div>

              {/* Error messages */}
              {errorMessage && (
                <div className="w-full max-w-md bg-rose-950/40 border border-rose-900/60 rounded-xl p-4 mt-6 text-rose-400 text-xs flex items-start gap-2.5 text-left">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

            </CardContent>
          </Card>

          {/* Personal Logs Table */}
          <Card className="border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-400" />
                <span>Attendance Log History</span>
              </CardTitle>
              <CardDescription>Your personal check-ins and check-outs for the past 30 days.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-bold bg-zinc-950/40 uppercase tracking-wider">
                    <th className="p-4">Date</th>
                    <th className="p-4">Clock In</th>
                    <th className="p-4">Clock Out</th>
                    <th className="p-4">Worked Hours</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-zinc-500 text-sm">
                        No attendance history found. Check in to get started!
                      </td>
                    </tr>
                  ) : (
                    history.map((record) => {
                      const recDate = new Date(record.date);
                      return (
                        <tr
                          key={record.id}
                          className="hover:bg-zinc-900/30 transition-colors text-sm text-zinc-300"
                        >
                          <td className="p-4 font-medium">
                            {recDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
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
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

        </div>

        {/* Right Column: Statistics & User Profile */}
        <div className="space-y-8">
          
          {/* User Profile Summary Card */}
          <Card className="border-zinc-800 bg-zinc-950/20 shadow-xl">
            <CardContent className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 mx-auto mb-4 relative">
                <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center text-zinc-100 text-2xl font-bold">
                  {initialUser.name.charAt(0)}
                </div>
              </div>
              <h3 className="text-xl font-bold text-zinc-100">{initialUser.name}</h3>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">{initialUser.email}</p>
              
              <div className="mt-4 pt-4 border-t border-zinc-800/80 grid grid-cols-2 text-left gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Department</span>
                  <p className="text-sm font-semibold text-zinc-300 truncate">{initialUser.department?.name || "Unassigned"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Role</span>
                  <p className="text-sm font-semibold text-zinc-300">{initialUser.role}</p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-800/80">
                <SignOutButton>
                  <Button
                    variant="outline"
                    className="w-full border-zinc-800 hover:border-rose-900/40 hover:bg-rose-950/10 hover:text-rose-400 text-zinc-300 font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Log Out</span>
                  </Button>
                </SignOutButton>
              </div>
            </CardContent>
          </Card>

          {/* Quick Metrics / Analytics Card */}
          <Card className="border-zinc-800 bg-gradient-to-b from-zinc-950/40 to-zinc-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-400" />
                <span>Shift Metrics</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Weekly Stats */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-zinc-400">Total Hours (Past 7 Days)</h4>
                  <p className="text-2xl font-bold text-zinc-100 mt-1">{totalWorkedThisWeek()} hrs</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <BarChart3 className="h-5 w-5" />
                </div>
              </div>

              {/* Monthly Stats */}
              <div className="flex items-center justify-between pt-4 border-t border-zinc-800/60">
                <div>
                  <h4 className="text-sm font-medium text-zinc-400">Total Hours (Current Month)</h4>
                  <p className="text-2xl font-bold text-zinc-100 mt-1">{totalWorkedThisMonth()} hrs</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <FileText className="h-5 w-5" />
                </div>
              </div>

              {/* Performance Indicator Ring (Present vs Late) */}
              <div className="pt-4 border-t border-zinc-800/60 text-xs text-zinc-400">
                <div className="flex justify-between mb-1.5 font-medium">
                  <span>Punctuality Rate</span>
                  <span className="text-zinc-200">
                    {history.length > 0 
                      ? `${Math.round((history.filter(h => h.status === "PRESENT").length / history.length) * 100)}%` 
                      : "100%"}
                  </span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{
                      width: history.length > 0 
                        ? `${(history.filter(h => h.status === "PRESENT").length / history.length) * 100}%` 
                        : "100%"
                    }}
                  />
                </div>
              </div>

            </CardContent>
          </Card>

        </div>

      </div>

    </div>
  );
}
export default EmployeeDashboard;
