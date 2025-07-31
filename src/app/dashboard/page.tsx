"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { Skeleton } from "@/components/ui/skeleton";

import { useTRPC } from "../trpc/client";
import { useDisconnect, useWalletClient } from "wagmi";

export default function Dashboard() {
  const trpc = useTRPC();
  const session = useSession();
  const router = useRouter();
  const { disconnectAsync } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const queryClient = useQueryClient();

  // Get keys query
  const {
    data: keys,
    isLoading: keysLoading,
    refetch: refetchKeys,
  } = useQuery(trpc.getKeys.queryOptions());
  // tRPC queries
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery(trpc.profile.queryOptions());
  const {
    data: walletAddresses,
    isLoading: walletsLoading,
    error: walletsError,
  } = useQuery(trpc.walletAddresses.queryOptions());
  const {
    data: userStats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery(trpc.userStats.queryOptions());

  // tRPC mutations
  const updateProfileMutation = useMutation({
    ...trpc.updateProfile.mutationOptions(),
    onSuccess: async () => {
      setIsEditing(false);
      await queryClient.invalidateQueries();
    },
  });

  const generateKeyMutation = useMutation({
    ...trpc.generateKey.mutationOptions(),
    onSuccess: async (newKey) => {
      console.log("Generated key:", newKey);

      if (walletClient && newKey.publicKey) {
        try {
          const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

          // TODO type for calls not present.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const permissions = await (walletClient as any).request({
            method: 'wallet_grantPermissions',
            params: [{
              expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
              key: {
                type: 'secp256k1' as const,
                publicKey: newKey.publicKey as `0x${string}`
              },
              permissions: {
                calls: [{
                  address: USDC_BASE_SEPOLIA as `0x${string}`,
                  signature: 'transfer(address,uint256)',
                }]
              }
            }]
          });

          console.log("Permissions granted:", permissions);
        } catch (error) {
          console.error("Failed to grant permissions:", error);
        }
      }

      await queryClient.invalidateQueries();
    },
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await disconnectAsync();
      await authClient.signOut();
    },
    onSuccess: async () => {
      router.push("/");
      await queryClient.invalidateQueries();
    },
  });

  if (session.isPending || profileLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
            <Skeleton className="h-9 w-48 mb-6" />

            {/* Profile Section Skeleton */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-5 w-72" />
                <Skeleton className="h-5 w-80" />
              </div>
            </div>

            {/* Wallets Section Skeleton */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-96" />
                <Skeleton className="h-5 w-96" />
              </div>
            </div>

            {/* Stats Section Skeleton */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-60" />
                <Skeleton className="h-5 w-60" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-52" />
              </div>
            </div>

            <div className="flex justify-end">
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session.data?.data?.user || !profile) {
    return null;
  }

  const handleEditProfile = () => {
    setEditName(profile.name);
    setEditEmail(profile.email);
    setIsEditing(true);
  };

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({
      name: editName !== profile.name ? editName : undefined,
      email: editEmail !== profile.email ? editEmail : undefined,
    });
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Profile Keys</h3>
              <div className="flex gap-2">
                <Button
                  onClick={() => generateKeyMutation.mutate()}
                  disabled={generateKeyMutation.isPending}
                  variant="default"
                  size="sm"
                >
                  {generateKeyMutation.isPending ? "Generating..." : "Generate Key"}
                </Button>
                <Button
                  onClick={() => refetchKeys()}
                  disabled={keysLoading}
                  variant="outline"
                  size="sm"
                >
                  {keysLoading ? "Loading..." : "Refresh Keys"}
                </Button>
              </div>
            </div>

            {/* Display generated keys */}
            <div className="space-y-3">
              {keysLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : keys && keys.length > 0 ? (
                keys.map((key) => (
                  <div
                    key={key.id}
                    className="border rounded-lg p-4 bg-white dark:bg-gray-800"
                  >
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium text-sm">Public Key:</span>
                        <span className="font-mono text-xs ml-2 break-all">
                          {key.publicKey}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-sm">Address:</span>
                        <span className="font-mono text-xs ml-2">
                          {key.address}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm">Status:</span>
                          <span className={`ml-2 text-xs px-2 py-1 rounded ${key.isActive
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                            }`}>
                            {key.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created: {new Date(key.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">
                  No keys generated yet. Click "Generate Key" to create your first key.
                </p>
              )}
            </div>
          </div>

          {/* Profile Section */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Profile Information</h3>
              {!isEditing && (
                <Button onClick={handleEditProfile} variant="outline" size="sm">
                  Edit
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {isEditing ? (
                <>
                  <div>
                    <label className="font-medium text-sm">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-sm">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={updateProfileMutation.isPending}
                      size="sm"
                    >
                      {updateProfileMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      onClick={() => setIsEditing(false)}
                      variant="outline"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="font-medium">Name:</span>{" "}
                    <span>{profile.name}</span>
                  </div>
                  <div>
                    <span className="font-medium">Email:</span>{" "}
                    <span>{profile.email}</span>
                  </div>
                  <div>
                    <span className="font-medium">User ID:</span>{" "}
                    <span className="font-mono text-sm">{profile.id}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Wallet Addresses Section */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Connected Wallets</h3>
            {walletsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : walletAddresses && walletAddresses.length > 0 ? (
              <div className="space-y-2">
                {walletAddresses.map((wallet) => (
                  <div
                    key={wallet.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono text-sm">
                        {wallet.address}
                      </span>
                      {wallet.isPrimary && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          Primary
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">
                      Chain ID: {wallet.chainId}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No wallet addresses connected</p>
            )}
          </div>

          {/* User Stats Section */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Account Statistics</h3>
            {statsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-60" />
                <Skeleton className="h-5 w-60" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-52" />
              </div>
            ) : userStats ? (
              <div className="space-y-2">
                <div>
                  <span className="font-medium">Account Created:</span>{" "}
                  <span>
                    {new Date(userStats.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Last Updated:</span>{" "}
                  <span>
                    {new Date(userStats.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Email Verified:</span>{" "}
                  <span>{userStats.emailVerified ? "Yes" : "No"}</span>
                </div>
                <div>
                  <span className="font-medium">Connected Wallets:</span>{" "}
                  <span>{userStats.walletCount}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No statistics available</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => signOutMutation.mutate()}
              disabled={signOutMutation.isPending}
              variant="outline"
            >
              {signOutMutation.isPending ? "Signing out..." : "Sign Out"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
