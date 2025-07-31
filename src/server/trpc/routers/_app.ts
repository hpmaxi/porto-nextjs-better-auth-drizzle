import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";
import { db } from "@/server/db/drizzle";
import { user, walletAddress, userKeys } from "@/server/db/schema.db";
import { eq } from "drizzle-orm";
import { Key, Porto, ServerActions } from "porto";
import { ServerClient } from "porto/viem";
import { parseUnits, encodeFunctionData } from "viem";

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
    const key = Key.createSecp256k1({
      role: 'session', expiry: Date.now() + 86400000, permissions: {
        calls: [{
          to: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`,
          signature: 'transfer(address,uint256)',
        }]
      }
    });

    const publicKey = key.publicKey;
    const privateKeyFn = key.privateKey;
    const address = addresses[0]?.address || "";

    console.log("Full key object:", key);
    console.log("Public key:", key.publicKey);
    console.log("Address/ID:", key.id);

    if (!privateKeyFn) {
      throw new Error("Failed to generate private key");
    }

    const privateKeyHex = privateKeyFn();
    if (!privateKeyHex) {
      throw new Error("Failed to generate private key hex");
    }

    const privateKeyString = privateKeyHex.toString();

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
        privateKey: privateKeyString,
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


  transferUSDC: protectedProcedure
    .input(
      z.object({
        to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
        amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a valid number"),
        chainId: z.number().optional().default(84532), // Base Sepolia default
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      // Validate amount is positive
      const amountNumber = parseFloat(input.amount);
      if (amountNumber <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      // Get the latest active key for this user
      const latestKey = await db
        .select()
        .from(userKeys)
        .where(eq(userKeys.userId, userId))
        .orderBy(userKeys.createdAt)
        .limit(1);
      if (!latestKey.length || !latestKey[0].isActive) {
        throw new Error("No active key found. Please generate a key first.");
      }

      const key = latestKey[0];
      // Contract addresses by chain
      const USDC_CONTRACTS = {
        8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet
        84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
      };

      const contractAddress = USDC_CONTRACTS[input.chainId as keyof typeof USDC_CONTRACTS];
      if (!contractAddress) {
        throw new Error(`USDC contract not available on chain ${input.chainId}`);
      }

      // Convert amount to USDC units (6 decimals)
      const amountInWei = parseUnits(input.amount, 6);

      try {
        // Create Porto instance and server client
        const porto = Porto.create();
        const client = ServerClient.fromPorto(porto, { chainId: input.chainId });

        // Create Key object from stored private key
        const portoKey = Key.fromSecp256k1({
          privateKey: key.privateKey as `0x${string}`,
        });

        console.log({ portoKey: portoKey.publicKey, storedKey: key.publicKey })

        // Encode the ERC20 transfer function call
        const transferData = encodeFunctionData({
          abi: [
            {
              constant: false,
              inputs: [
                { name: "_to", type: "address" },
                { name: "_value", type: "uint256" }
              ],
              name: "transfer",
              outputs: [{ name: "", type: "bool" }],
              type: "function"
            }
          ],
          functionName: "transfer",
          args: [input.to as `0x${string}`, amountInWei],
        });

        console.log("Key object being sent:", {
          publicKey: key.publicKey,
          type: portoKey.type,
          prehash: portoKey.prehash
        });
        // Prepare the calls using Porto ServerActions

        const request = await ServerActions.prepareCalls(client, {
          calls: [
            {
              to: contractAddress as `0x${string}`,
              data: transferData,
            },
          ],
          account: key.address as `0x${string}`,
          key: {
            publicKey: portoKey.publicKey,
            type: portoKey.type,
            prehash: portoKey.prehash
          },
        });

        // Sign the digest
        const signature = await Key.sign(portoKey, { payload: request.digest });

        // Send the prepared calls
        const result = await ServerActions.sendPreparedCalls(client, {
          context: request.context,
          signature,
          key: {
            publicKey: portoKey.publicKey,
            type: portoKey.type,
            prehash: portoKey.prehash
          },
        });

        return {
          success: true,
          transactionHash: result.id,
          keyId: key.id,
          fromAddress: key.address,
          toAddress: input.to,
          amount: input.amount,
          amountInWei: amountInWei.toString(),
          contractAddress,
          chainId: input.chainId,
        };
      } catch (error) {
        console.error("Transfer failed:", error);
        throw new Error(`Transfer failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }),
});

export type AppRouter = typeof appRouter;
