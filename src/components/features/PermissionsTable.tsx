import { Hooks } from "porto/wagmi";
import React from "react";

type Permission = ReturnType<typeof Hooks.usePermissions>['data'];

interface PermissionsTableProps {
  permissions: Permission[] | undefined;
  isLoading?: boolean;
}

export const PermissionsTable: React.FC<PermissionsTableProps> = ({
  permissions,
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4">Permissions</h3>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!permissions || permissions.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4">Permissions</h3>
        <p className="text-gray-500">No permissions granted yet</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
      <h3 className="text-lg font-semibold mb-4">Permissions</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Key</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Expiry</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Calls</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Spend Limits</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((permission, index) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                  <span className="font-mono text-xs break-all">
                    {permission.key?.publicKey || 'N/A'}
                  </span>
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                  {permission.expiry ? new Date(permission.expiry * 1000).toLocaleString() : 'N/A'}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                  {permission.permissions?.calls?.map((call, callIndex) => (
                    <div key={callIndex} className="text-xs">
                      <div><strong>To:</strong> {call.to}</div>
                      <div><strong>Signature:</strong> {call.signature}</div>
                    </div>
                  )) || 'None'}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                  {permission.permissions?.spend?.map((spend, spendIndex) => (
                    <div key={spendIndex} className="text-xs">
                      <div><strong>Limit:</strong> {spend.limit?.toString()}</div>
                      <div><strong>Period:</strong> {spend.period}</div>
                      <div><strong>Token:</strong> {spend.token}</div>
                    </div>
                  )) || 'None'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
