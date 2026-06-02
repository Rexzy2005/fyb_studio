export type AdminTemplateLockListItem = {
  id: string;
  template: {
    id: string;
    name: string;
    coverUrl: string | null;
    coverWidth: number | null;
    coverHeight: number | null;
  } | null;
  department: {
    id: string;
    name: string;
    slug: string;
    abbreviation: string;
  } | null;
  lockedBy: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    avatar: string | null;
    isDepartmentHead: boolean;
    departmentId: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data?.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchAdminTemplateLocks(): Promise<AdminTemplateLockListItem[]> {
  const res = await fetch("/api/admin/template-locks", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { locks: AdminTemplateLockListItem[] };
  return data.locks;
}

export async function updateAdminTemplateLock(
  lockId: string,
  payload: { departmentId: string; lockedByUserId: string }
): Promise<AdminTemplateLockListItem> {
  const res = await fetch(`/api/admin/template-locks/${lockId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { lock: AdminTemplateLockListItem };
  return data.lock;
}

export async function deleteAdminTemplateLock(lockId: string): Promise<void> {
  const res = await fetch(`/api/admin/template-locks/${lockId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}
