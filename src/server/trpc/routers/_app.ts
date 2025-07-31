import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";
import { db } from "@/server/db/drizzle";
import { user, walletAddress, userKeys } from "@/server/db/schema.db";
import { eq } from "drizzle-orm";
import { Key } from "porto";

export const appRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string().optional() }).optional())
    .query(({ input }) => {
      return {
        greeting: `Hello ${input?.text ?? "world"}!`,
      };
    }),

  // Protected procedures
  profile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;

    const userProfile = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    return userProfile[0] || null;
  }),

  generateKey: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user!.id;

    const addresses = await db
      .select()
      .from(walletAddress)
      .where(eq(walletAddress.userId, userId))
      .orderBy(walletAddress.isPrimary, walletAddress.createdAt);

    // Generate Porto key pair
    const key = Key.createSecp256k1();
    const publicKey = key.publicKey;
    const privateKey = key.privateKey()?.toString();
    const address = addresses[0]?.address || "";

    if (!privateKey) {
      throw new Error("Failed to generate private key");
    }

    // Generate a unique ID for the key
    const keyId = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // TODO store encrypted.
    // Store in database
    const [newKey] = await db
      .insert(userKeys)
      .values({
        id: keyId,
        userId,
        publicKey,
        privateKey,
        address,
        isActive: true,
      })
      .returning();

    return {
      id: newKey.id,
      publicKey: newKey.publicKey,
      address: newKey.address,
      isActive: newKey.isActive,
      createdAt: newKey.createdAt,
    };
  }),

  getKeys: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;

    console.log(`getting keys for user ${userId}`)
    const keys = await db
      .select({
        id: userKeys.id,
        publicKey: userKeys.publicKey,
        privateKey: userKeys.privateKey,
        address: userKeys.address,
        isActive: userKeys.isActive,
        createdAt: userKeys.createdAt,
        updatedAt: userKeys.updatedAt,
      })
      .from(userKeys)
      .where(eq(userKeys.userId, userId))
      .orderBy(userKeys.createdAt);

    return keys;
  }),
  walletAddresses: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;

    const addresses = await db
      .select()
      .from(walletAddress)
      .where(eq(walletAddress.userId, userId))
      .orderBy(walletAddress.isPrimary, walletAddress.createdAt);

    return addresses;
  }),

  userStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;

    const [userInfo] = await db
      .select({
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        emailVerified: user.emailVerified,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const walletCount = await db
      .select()
      .from(walletAddress)
      .where(eq(walletAddress.userId, userId));

    return {
      ...userInfo,
      walletCount: walletCount.length,
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      const updated = await db
        .update(user)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.email && { email: input.email }),
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId))
        .returning();

      return updated[0];
    }),
});

export type AppRouter = typeof appRouter;
