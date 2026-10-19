import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, useCommandPost } from '@identity-experience/app-core/api';
import { normalizeReason } from '@identity-experience/app-core/domain/reason';
import { useSession } from '@identity-experience/app-core/session';

import type {
  EmergencyValidation,
  TenantContextReport,
  TenantContextSweep,
  TenantRedrive,
  UnconvergedTenant,
} from '@/domain/projections';

// identity-control's reads of what it holds from Organization Control, through the BFF, and the two
// commands that schedule the Tenant context projection's own work (TDD-identity-control-002 2.5.0
// §Operator Routes). None changes Organization Control's records or the desired state.

export const providerAuthorityKeys = {
  emergency: ['provider-grants', 'emergency-validation'] as const,
  tenantReport: ['projections', 'tenant-context', 'report'] as const,
  unconverged: ['projections', 'tenant-context', 'unconverged'] as const,
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

// useUnconverged reads the Tenants whose convergence is pending or unresolved, oldest mark first. It is
// bounded by the converger's work, and names Tenants, not people.
export function useUnconverged() {
  return useQuery({
    queryKey: providerAuthorityKeys.unconverged,
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly tenants: readonly UnconvergedTenant[] | null }>(
          '/v1/projections/tenant-context:unconverged',
          signal,
        )
      ).tenants ?? [],
    refetchOnWindowFocus: false,
  });
}

function useCsrfToken(): string {
  const session = useSession();
  return session.data?.authenticated === true ? session.data.csrfToken : '';
}

// useTenantRedrive marks one Tenant to converge again, with a reason, as a sweep marks it. The API
// takes no Idempotency-Key here (keyOptional: convergence is level-driven, so a repeat changes nothing
// a first did not); useCommandPost sends one anyway, which the API ignores.
export function useTenantRedrive() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ tenantId, reason }: { readonly tenantId: string; readonly reason: string }) =>
      post<TenantRedrive>(
        `/v1/projections/tenant-context/tenants/${encodeURIComponent(tenantId)}:redrive`,
        {},
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: providerAuthorityKeys.unconverged }),
  });
}

// useTenantSweep runs the scheduled Tenant context sweep now.
export function useTenantSweep() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: () =>
      post<TenantContextSweep>('/v1/projections/tenant-context:sweep', {}, { csrfToken: token }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: providerAuthorityKeys.unconverged }),
  });
}
