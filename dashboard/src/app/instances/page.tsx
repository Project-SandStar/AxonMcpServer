'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Server, Check, X, RefreshCw } from 'lucide-react';

export default function InstancesPage() {
  const { data: instances, isLoading, refetch } = useQuery({
    queryKey: ['instances'],
    queryFn: api.getInstances,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Instances</h1>
          <p className="text-gray-500">SkySpark server connections</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {instances?.map((instance) => (
          <div
            key={instance.name}
            className={`rounded-xl bg-white p-6 shadow-sm border-2 ${
              instance.isActive ? 'border-blue-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gray-100 p-2">
                  <Server className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{instance.name}</h3>
                  <p className="text-sm text-gray-500">
                    {instance.protocol}://{instance.host}:{instance.port}
                  </p>
                </div>
              </div>
              {instance.isActive && (
                <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                  Active
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-gray-500">{instance.projectCount} projects</span>
            </div>

            {instance.projects.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-2 text-xs font-medium text-gray-500">Projects</p>
                <div className="flex flex-wrap gap-2">
                  {instance.projects.slice(0, 5).map((proj) => (
                    <span
                      key={proj.project}
                      className={`rounded-full px-2 py-1 text-xs ${
                        proj.isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {proj.project}
                    </span>
                  ))}
                  {instance.projects.length > 5 && (
                    <span className="text-xs text-gray-400">
                      +{instance.projects.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {(!instances || instances.length === 0) && (
          <div className="col-span-full text-center py-12 text-gray-500">
            No instances configured. Add instance configs to the config/ directory.
          </div>
        )}
      </div>
    </div>
  );
}
