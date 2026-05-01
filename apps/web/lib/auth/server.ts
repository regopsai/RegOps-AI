"use server";

import { auth } from "@/auth";
import { prisma, type OrganizationRole } from "@regops-ai/database";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission, type Permission } from "./rbac";

const ACTIVE_ORG_COOKIE = "regops_active_org";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  return user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function getUserMemberships(userId: string) {
  return prisma.organizationMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      organization: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function getActiveOrganizationId(): Promise<string | null> {
  const cookieStore = await cookies();
  const user = await getCurrentUser();

  if (!user) return null;

  const memberships = await getUserMemberships(user.id);

  if (memberships.length === 0) {
    return null;
  }

  const cookieValue = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  if (cookieValue) {
    const isValid = memberships.some(
      (m: { organizationId: string; status: string }) => m.organizationId === cookieValue && m.status === "ACTIVE"
    );
    if (isValid) {
      return cookieValue;
    }
  }

  return memberships[0].organizationId;
}

export async function setActiveOrganizationId(organizationId: string) {
  const user = await requireCurrentUser();
  const memberships = await getUserMemberships(user.id);

  const isMember = memberships.some(
    (m: { organizationId: string; status: string }) => m.organizationId === organizationId && m.status === "ACTIVE"
  );

  if (!isMember) {
    throw new Error("User is not an active member of this organization.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export interface OrganizationContext {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  membership: {
    id: string;
    role: OrganizationRole;
    status: string;
  };
}

export async function requireOrganizationContext(): Promise<OrganizationContext> {
  const user = await requireCurrentUser();
  const orgId = await getActiveOrganizationId();

  if (!orgId) {
    redirect("/no-organization");
  }

  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: user.id,
      organizationId: orgId,
      status: "ACTIVE",
    },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    redirect("/no-organization");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
    },
    membership: {
      id: membership.id,
      role: membership.role as OrganizationRole,
      status: membership.status,
    },
  };
}

export async function requirePermission(permission: Permission) {
  const context = await requireOrganizationContext();

  if (!hasPermission(context.membership.role, permission)) {
    redirect("/dashboard");
  }

  return context;
}
