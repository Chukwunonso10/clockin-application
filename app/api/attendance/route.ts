import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  userId: z.string().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "startDate must be in YYYY-MM-DD format" })
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "endDate must be in YYYY-MM-DD format" })
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate using Clerk
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch user from DB
    const dbUser = await prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User record not found" }, { status: 404 });
    }

    if (dbUser.status === "DISABLED") {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 });
    }

    // 3. Parse and validate query params
    const searchParams = req.nextUrl.searchParams;
    const rawQueryParams = {
      userId: searchParams.get("userId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    };

    const validation = querySchema.safeParse(rawQueryParams);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { userId, startDate, endDate } = validation.data;

    // 4. Role-based constraints
    // Employees cannot access other employees' records
    if (dbUser.role !== "ADMIN") {
      if (userId && userId !== dbUser.id) {
        return NextResponse.json(
          { error: "Forbidden: You cannot access other employee records" },
          { status: 403 }
        );
      }
    }

    // 5. Construct query filter
    const whereClause: any = {};

    // For employee, lock query to their own ID
    if (dbUser.role !== "ADMIN") {
      whereClause.userId = dbUser.id;
    } else if (userId) {
      whereClause.userId = userId;
    }

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) {
        whereClause.date.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.date.lte = new Date(endDate);
      }
    }

    // 6. Query DB
    const records = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            role: true,
            department: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ data: records });
  } catch (error: any) {
    console.error("API attendance error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
