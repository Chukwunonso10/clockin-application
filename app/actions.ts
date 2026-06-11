"use server";

import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getDistance, parseUserAgent } from "@/lib/geolocation";
import { sendPushNotification } from "@/lib/push";

// Define helper to verify auth and retrieve DB user
async function getAuthenticatedUser() {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    throw new Error("Unauthorized: No session found");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    include: { department: true },
  });

  if (!dbUser) {
    throw new Error("User record not found in database");
  }

  if (dbUser.status === "DISABLED") {
    throw new Error("Unauthorized: Your account has been disabled");
  }

  return dbUser;
}

// 1. Sync Clerk user with Database
export async function syncUser() {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error("Clerk user must have an email address");

  const name = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "Employee";

  // Check if user exists (database errors bubble up to dashboard/page.tsx)
  let dbUser = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    include: { department: true },
  });

  if (!dbUser) {
    // Check if user already exists by email (to handle Clerk account recreations or manual database seedings)
    dbUser = await prisma.user.findUnique({
      where: { email },
      include: { department: true },
    });

    if (dbUser) {
      // Reconnect existing user to the new Clerk session
      dbUser = await prisma.user.update({
        where: { id: dbUser.id },
        data: { clerkId: clerkUser.id, name },
        include: { department: true },
      });

      // Write Audit Log
      await prisma.auditLog.create({
        data: {
          userId: dbUser.id,
          action: "USER_SYNC_RECONNECT",
          metadata: JSON.stringify({ email, newClerkId: clerkUser.id }),
        },
      });
    } else {
      // If it's the very first user, let's make them ADMIN
      const userCount = await prisma.user.count();
      const role = userCount === 0 ? "ADMIN" : "EMPLOYEE";

      dbUser = await prisma.user.create({
        data: {
          clerkId: clerkUser.id,
          name,
          email,
          role,
          status: "ACTIVE",
        },
        include: { department: true },
      });

      // Write Audit Log
      await prisma.auditLog.create({
        data: {
          userId: dbUser.id,
          action: "USER_SYNC_REGISTER",
          metadata: JSON.stringify({ role, email, name }),
        },
      });
    }
  } else {
    // Keep DB synchronized with Clerk name / email changes
    if (dbUser.name !== name || dbUser.email !== email) {
      dbUser = await prisma.user.update({
        where: { id: dbUser.id },
        data: { name, email },
        include: { department: true },
      });
    }
  }

  return dbUser;
}

// 2. Clock In Operation
export async function clockIn(data: {
  location: string | null; // "lat,lng"
  ipAddress: string;
  deviceInfo: string;
}) {
  const user = await getAuthenticatedUser();
  const now = new Date();

  // Strip time from today's date
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Check if already clocked in today
  const existingAttendance = await prisma.attendance.findUnique({
    where: {
      userId_date: {
        userId: user.id,
        date: today,
      },
    },
  });

  if (existingAttendance) {
    throw new Error("You have already clocked in today.");
  }

  // Geofencing Check
  const configList = await prisma.systemConfig.findMany();
  const config = Object.fromEntries(configList.map((c) => [c.key, c.value]));

  const latConfig = config["office_latitude"] || process.env.NEXT_PUBLIC_OFFICE_LATITUDE;
  const lngConfig = config["office_longitude"] || process.env.NEXT_PUBLIC_OFFICE_LONGITUDE;
  const radiusConfig = config["office_radius"] || process.env.NEXT_PUBLIC_OFFICE_RADIUS_METERS;

  const geofenceEnabled = config["geofence_enabled"] !== undefined
    ? config["geofence_enabled"] === "true"
    : (!!latConfig && !!lngConfig && !!radiusConfig);

  if (geofenceEnabled && latConfig && lngConfig && radiusConfig) {
    const officeLat = parseFloat(latConfig);
    const officeLng = parseFloat(lngConfig);
    const allowedRadius = parseFloat(radiusConfig);

    if (data.location) {
      const [latStr, lngStr] = data.location.split(",");
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);

      if (!isNaN(lat) && !isNaN(lng)) {
        const distance = getDistance(lat, lng, officeLat, officeLng);
        if (distance > allowedRadius) {
          throw new Error(
            `Clock-in rejected: You are ${Math.round(distance)}m away from the office. Allowed radius: ${allowedRadius}m.`
          );
        }
      } else {
        throw new Error("Clock-in rejected: Invalid coordinates format.");
      }
    } else {
      throw new Error("Clock-in rejected: GPS coordinates are required for geofencing.");
    }
  }

  // Late Arrival Detection
  // Work Start Time is 8:00 AM. Grace period till 8:10 AM.
  // We check the local hours/minutes based on the server's current time.
  const hours = now.getHours();
  const minutes = now.getMinutes();
  let status = "PRESENT";

  if (hours > 8 || (hours === 8 && minutes > 10)) {
    status = "LATE";
  }

  // Record Attendance
  const attendance = await prisma.attendance.create({
    data: {
      userId: user.id,
      date: today,
      clockInTime: now,
      status,
      location: data.location,
      ipAddress: data.ipAddress,
      deviceInfo: data.deviceInfo,
    },
  });

  // Log Audit
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CLOCK_IN",
      metadata: JSON.stringify({
        attendanceId: attendance.id,
        status,
        time: now.toISOString(),
      }),
    },
  });

  return attendance;
}

// 3. Clock Out Operation
export async function clockOut(data: {
  ipAddress: string;
  deviceInfo: string;
}) {
  const user = await getAuthenticatedUser();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Find clock in record
  const attendance = await prisma.attendance.findUnique({
    where: {
      userId_date: {
        userId: user.id,
        date: today,
      },
    },
  });

  if (!attendance) {
    throw new Error("No clock-in record found for today.");
  }

  if (attendance.clockOutTime) {
    throw new Error("You have already clocked out today.");
  }

  const hoursWorked = (now.getTime() - new Date(attendance.clockInTime).getTime()) / (1000 * 60 * 60);

  const updatedAttendance = await prisma.attendance.update({
    where: { id: attendance.id },
    data: {
      clockOutTime: now,
      hoursWorked: parseFloat(hoursWorked.toFixed(2)),
    },
  });

  // Log Audit
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CLOCK_OUT",
      metadata: JSON.stringify({
        attendanceId: attendance.id,
        hoursWorked: parseFloat(hoursWorked.toFixed(2)),
        time: now.toISOString(),
      }),
    },
  });

  return updatedAttendance;
}

// 4. Save/Update Push Notification Subscription
export async function saveSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const user = await getAuthenticatedUser();

  const existing = await prisma.notificationSubscription.findUnique({
    where: { endpoint: sub.endpoint },
  });

  if (existing) {
    return { success: true };
  }

  await prisma.notificationSubscription.create({
    data: {
      userId: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });

  return { success: true };
}

// 5. Unsubscribe from Push Notifications
export async function unsubscribeUser() {
  const user = await getAuthenticatedUser();

  await prisma.notificationSubscription.deleteMany({
    where: { userId: user.id },
  });

  return { success: true };
}

// Helper to assert admin privileges
async function assertAdmin() {
  const user = await getAuthenticatedUser();
  if (user.role !== "ADMIN") {
    throw new Error("Unauthorized: Administrative privileges required");
  }
  return user;
}

// 6. Admin: Get Users
export async function adminGetUsers() {
  await assertAdmin();

  return prisma.user.findMany({
    include: {
      department: true,
      attendances: {
        orderBy: { date: "desc" },
        take: 30, // Get last 30 attendances per user
      },
    },
    orderBy: { name: "asc" },
  });
}

// 7. Admin: Toggle User Status (Disable/Enable Account)
export async function adminToggleUserStatus(userId: string, status: "ACTIVE" | "DISABLED") {
  const admin = await assertAdmin();

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { status },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ADMIN_TOGGLE_USER_STATUS",
      metadata: JSON.stringify({ targetUserId: userId, status }),
    },
  });

  return updatedUser;
}

// 8. Admin: Update User Role
export async function adminUpdateUserRole(userId: string, role: "ADMIN" | "EMPLOYEE") {
  const admin = await assertAdmin();

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ADMIN_UPDATE_USER_ROLE",
      metadata: JSON.stringify({ targetUserId: userId, role }),
    },
  });

  return updatedUser;
}

// 9. Admin: Departments Management
export async function adminGetDepartments() {
  await assertAdmin();
  return prisma.department.findMany({
    include: {
      _count: {
        select: { users: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function adminCreateDepartment(data: { name: string; description?: string }) {
  const admin = await assertAdmin();

  const dept = await prisma.department.create({
    data: {
      name: data.name,
      description: data.description,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ADMIN_CREATE_DEPARTMENT",
      metadata: JSON.stringify({ deptId: dept.id, name: dept.name }),
    },
  });

  return dept;
}

export async function adminAssignUserDepartment(userId: string, departmentId: string | null) {
  const admin = await assertAdmin();

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { departmentId },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ADMIN_ASSIGN_DEPARTMENT",
      metadata: JSON.stringify({ targetUserId: userId, departmentId }),
    },
  });

  return updatedUser;
}

// 10. Admin: Get all Attendance history
export async function adminGetAttendance(filters: {
  userId?: string;
  departmentId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}) {
  await assertAdmin();

  const whereClause: any = {};

  if (filters.userId) {
    whereClause.userId = filters.userId;
  }

  if (filters.departmentId) {
    whereClause.user = {
      departmentId: filters.departmentId,
    };
  }

  if (filters.startDate || filters.endDate) {
    whereClause.date = {};
    if (filters.startDate) {
      whereClause.date.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      whereClause.date.lte = new Date(filters.endDate);
    }
  }

  return prisma.attendance.findMany({
    where: whereClause,
    include: {
      user: {
        include: { department: true },
      },
    },
    orderBy: { date: "desc" },
  });
}

// 11. Admin: Edit Incorrect Attendance Records
export async function adminEditAttendance(
  attendanceId: string,
  data: {
    clockInTime?: string;
    clockOutTime?: string;
    status?: string;
  }
) {
  const admin = await assertAdmin();

  const updateData: any = {};
  
  if (data.status) {
    updateData.status = data.status;
  }

  if (data.clockInTime) {
    updateData.clockInTime = new Date(data.clockInTime);
  }

  if (data.clockOutTime) {
    updateData.clockOutTime = new Date(data.clockOutTime);
  }

  // Recalculate hours if times changed
  const currentRecord = await prisma.attendance.findUnique({
    where: { id: attendanceId },
  });

  if (!currentRecord) {
    throw new Error("Attendance record not found");
  }

  const finalClockIn = updateData.clockInTime || new Date(currentRecord.clockInTime);
  const finalClockOut = updateData.clockOutTime || (currentRecord.clockOutTime ? new Date(currentRecord.clockOutTime) : null);

  if (finalClockIn && finalClockOut) {
    const hours = (finalClockOut.getTime() - finalClockIn.getTime()) / (1000 * 60 * 60);
    updateData.hoursWorked = parseFloat(hours.toFixed(2));
  }

  const updated = await prisma.attendance.update({
    where: { id: attendanceId },
    data: updateData,
    include: { user: true },
  });

  // Notify Employee about manual edit
  try {
    const subs = await prisma.notificationSubscription.findMany({
      where: { userId: updated.userId },
    });

    for (const sub of subs) {
      await sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        {
          title: "Attendance Record Updated",
          body: `An administrator updated your record for ${new Date(updated.date).toLocaleDateString()}. Status: ${updated.status}`,
          url: "/dashboard",
        }
      );
    }
  } catch (err) {
    console.error("Failed to notify user of manual attendance update:", err);
  }

  // Log Audit
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ADMIN_EDIT_ATTENDANCE",
      metadata: JSON.stringify({
        attendanceId,
        targetUserId: updated.userId,
        changes: data,
      }),
    },
  });

  return updated;
}

// 12. Employee: Get personal Attendance history
export async function getPersonalAttendance() {
  const user = await getAuthenticatedUser();

  return prisma.attendance.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
  });
}

// 13. Admin: Update Geofence Config
export async function adminUpdateGeofenceConfig(data: {
  enabled: boolean;
  latitude: string;
  longitude: string;
  radius: string;
}) {
  const admin = await assertAdmin();

  const updates = [
    { key: "geofence_enabled", value: String(data.enabled) },
    { key: "office_latitude", value: data.latitude.trim() },
    { key: "office_longitude", value: data.longitude.trim() },
    { key: "office_radius", value: data.radius.trim() },
  ];

  for (const item of updates) {
    await prisma.systemConfig.upsert({
      where: { key: item.key },
      update: { value: item.value },
      create: { key: item.key, value: item.value },
    });
  }

  // Log Audit
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ADMIN_UPDATE_GEOFENCE_CONFIG",
      metadata: JSON.stringify(data),
    },
  });

  return { success: true };
}
