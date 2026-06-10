import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // 1. Authenticate using Clerk
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify admin role
    const dbUser = await prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
    });

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    // 3. Fetch all users
    const users = await prisma.user.findMany({
      include: { department: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: users });
  } catch (error: any) {
    console.error("API users error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
