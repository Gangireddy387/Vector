import { http } from '@/lib/http'
import type { PlanFeatureKey } from '@/lib/plan-features'
import type { OrganizationStatus, UserSummary } from '@/types/models'

/** An organization as the super admin reviews it. */
export interface ReviewedOrganization {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  status: OrganizationStatus
  rejectionReason: string | null
  plan: { id: string; name: string } | null
  createdAt: string
  reviewedAt: string | null
  creator: (UserSummary & { title: string | null }) | null
  memberCount: number
  projectCount: number
}

/** Someone in an organization, as the super admin sees them. */
export interface OrganizationPerson extends UserSummary {
  role: 'admin' | 'member'
  status: 'active' | 'invited' | 'disabled'
  isCreator: boolean
  joinedAt: string
  lastSeenAt: string | null
  timezone: string
  about: string | null
  location: string | null
  phone: string | null
  skills: string[]
}

export interface OrganizationDetail {
  organization: ReviewedOrganization
  limits: { maxMembers: number | null; maxProjects: number | null }
  counts: { departments: number; teams: number; openTasks: number; doneTasks: number }
  admins: OrganizationPerson[]
  members: OrganizationPerson[]
}

/** A plan with its limits (`null` = unlimited) and feature switches. */
export interface Plan {
  id: string
  name: string
  description: string | null
  priceLabel: string | null
  maxMembers: number | null
  maxProjects: number | null
  features: Record<PlanFeatureKey, boolean>
  isDefault: boolean
  position: number
  organizationCount: number
}

export type PlanInput = Omit<Plan, 'id' | 'position' | 'organizationCount'>

export const superAdminApi = {
  organizations: () => http.get<{ organizations: ReviewedOrganization[] }>('/super-admin/organizations').then((r) => r.data.organizations),
  organization: (organizationId: string) => http.get<OrganizationDetail>(`/super-admin/organizations/${organizationId}`).then((r) => r.data),
  approve: (organizationId: string) =>
    http.post<{ organization: ReviewedOrganization }>(`/super-admin/organizations/${organizationId}/approve`).then((r) => r.data.organization),
  reject: (organizationId: string, reason?: string) =>
    http.post<{ organization: ReviewedOrganization }>(`/super-admin/organizations/${organizationId}/reject`, { reason }).then((r) => r.data.organization),
  setPlan: (organizationId: string, planId: string) =>
    http.put<{ organization: ReviewedOrganization }>(`/super-admin/organizations/${organizationId}/plan`, { planId }).then((r) => r.data.organization),

  plans: () => http.get<{ plans: Plan[] }>('/super-admin/plans').then((r) => r.data.plans),
  createPlan: (input: PlanInput) => http.post<{ plan: Plan }>('/super-admin/plans', input).then((r) => r.data.plan),
  updatePlan: (planId: string, changes: Partial<PlanInput>) => http.patch<{ plan: Plan }>(`/super-admin/plans/${planId}`, changes).then((r) => r.data.plan),
  deletePlan: (planId: string) => http.delete(`/super-admin/plans/${planId}`),
}
