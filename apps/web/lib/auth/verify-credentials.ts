import { prisma } from "@regops-ai/database";
import bcryptjs from "bcryptjs";

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { passwordCredential: true },
  });

  if (!user) {
    return { success: false as const, error: "Invalid credentials." };
  }

  if (user.status !== "ACTIVE") {
    return { success: false as const, error: "Account is disabled or inactive." };
  }

  if (user.deletedAt) {
    return { success: false as const, error: "Invalid credentials." };
  }

  if (!user.passwordCredential) {
    return { success: false as const, error: "Invalid credentials." };
  }

  const valid = await bcryptjs.compare(
    password,
    user.passwordCredential.passwordHash
  );

  if (!valid) {
    return { success: false as const, error: "Invalid credentials." };
  }

  return {
    success: true as const,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  };
}
