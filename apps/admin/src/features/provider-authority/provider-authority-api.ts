import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@identity-experience/app-core/api';

import type { EmergencyValidation, TenantContextReport } from '@/domain/projections';

// identity-control's reads of what it holds from Organization Control, through the BFF. Both are
// provider routes; neither has a command here, because the records are Organization Control's.

export const providerAuthorityKeys = {
  emergency: ['provider-grants', 'emergency-validation'] as const,
  tenantReport: ['projections', 'tenant-context', 'report'] as const,
};

// useEmergencyValidation reads every active emergency grant with its last use, the oldest due first.
export function useEmergencyValidation() {
  return useQuery({
    queryKey: providerAuthorityKeys.emergency,
    queryFn: ({ signal }) => apiGet<EmergencyValidation>('/v1/provider-grants:emergency-validation', signal),
    refetchOnWindowFocus: false,
  });
}

// useTenantContextReport reads the report only when asked: it lists every active Membership, and it
// is read to be posted, not watched.
export function useTenantContextReport(enabled: boolean) {
  return useQuery({
    queryKey: providerAuthorityKeys.tenantReport,
    enabled,
    queryFn: ({ signal }) => apiGet<TenantContextReport>('/v1/projections/tenant-context/report', signal),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}
