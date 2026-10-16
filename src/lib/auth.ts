import { compare } from "bcryptjs";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { loginSchema } from "@/lib/validators/auth";
import { connectToDatabase } from "@/lib/db";
import UserModel from "@/models/user";

declare module "next-auth" {
  interface User {
    id: string;
    role: "owner" | "staff";
    businessId?: string | null;
    staffProfileId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: "owner" | "staff";
      businessId?: string | null;
      staffProfileId?: string | null;
    };
  }
}

const authConfig: NextAuthConfig = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        await connectToDatabase();

        const user = await UserModel.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");

        if (!user || !user.passwordHash) {
          return null;
        }

        const valid = await compare(parsed.data.password, user.passwordHash);

        if (!valid) {
          return null;
        }

        return {
          id: String(user._id),
          name: user.name,
          email: user.email,
          role: user.role || "owner",
          businessId: user.businessId ? String(user.businessId) : null,
          staffProfileId: user.staffProfileId ? String(user.staffProfileId) : null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const customToken = token as typeof token & {
        userId?: string;
        role?: "owner" | "staff";
        businessId?: string | null;
        staffProfileId?: string | null;
      };

      if (user) {
        customToken.userId = String(user.id);
        customToken.role = user.role ?? "owner";
        customToken.businessId = user.businessId ?? null;
        customToken.staffProfileId = user.staffProfileId ?? null;
      }

      return customToken;
    },
    async session({ session, token }) {
      const customToken = token as typeof token & {
        userId?: string;
        role?: "owner" | "staff";
        businessId?: string | null;
        staffProfileId?: string | null;
      };

      if (session.user) {
        session.user.id = customToken.userId ?? token.sub ?? "";
        session.user.role = customToken.role ?? "owner";
        session.user.businessId = customToken.businessId ?? null;
        session.user.staffProfileId = customToken.staffProfileId ?? null;
      }

      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export async function requireRole(roles: Array<"owner" | "staff">) {
  const session = await auth();

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  if (!roles.includes(session.user.role)) {
    throw new Error("FORBIDDEN");
  }

  return session.user;
}
