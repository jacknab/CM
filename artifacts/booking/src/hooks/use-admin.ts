
// TypeScript interfaces based on schema.sql
export interface BusinessTypeCategory {
  id: number;
  name: string;
  image_url?: string;
  store_id?: number;
}

export interface BusinessType {
  id: number;
  name: string;
  categoryId: number;
  // Add other fields as needed
}

// Dummy hooks with correct types
export function useBusinessTypeCategories(): { data: BusinessTypeCategory[] } {
  return { data: [] };
}

export function useBusinessTypes(): { data: BusinessType[] } {
  return { data: [] };
}

type MutateFn<T = any> = (...args: any[]) => void;

export function useCreateBusinessTypeCategory(): { mutate: MutateFn } {
  return { mutate: (...args: any[]) => {} };
}
export function useUpdateBusinessTypeCategory(): { mutate: MutateFn } {
  return { mutate: (...args: any[]) => {} };
}
export function useDeleteBusinessTypeCategory(): { mutate: MutateFn } {
  return { mutate: (...args: any[]) => {} };
}
export function useCreateBusinessType(): { mutate: MutateFn } {
  return { mutate: (...args: any[]) => {} };
}
export function useUpdateBusinessType(): { mutate: MutateFn } {
  return { mutate: (...args: any[]) => {} };
}
export function useDeleteBusinessType(): { mutate: MutateFn } {
  return { mutate: (...args: any[]) => {} };
}
