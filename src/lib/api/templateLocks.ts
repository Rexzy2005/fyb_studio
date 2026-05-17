export type TemplateLockClient = {
  id: string;
  templateId: string;
  departmentId: string;
  departmentName: string;
  departmentAbbreviation: string;
  lockedByUserId: string;
  isOwnerLock: boolean;
  passcode: null;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentLockListItemClient = TemplateLockClient & {
  templateName: string;
  templateCoverUrl: string | null;
};

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data?.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchTemplateLock(
  templateId: string
): Promise<{
  lock: TemplateLockClient | null;
  viewer?: { isOwner: boolean; fromSameDept: boolean };
}> {
  const res = await fetch(`/api/templates/${templateId}/lock`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as {
    lock: TemplateLockClient | null;
    viewer?: { isOwner: boolean; fromSameDept: boolean };
  };
}

export async function lockTemplate(
  templateId: string
): Promise<TemplateLockClient> {
  const res = await fetch(`/api/templates/${templateId}/lock`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { lock: TemplateLockClient };
  return data.lock;
}

export async function deleteTemplateLock(templateId: string): Promise<void> {
  const res = await fetch(`/api/templates/${templateId}/lock`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function fetchDepartmentLocks(): Promise<DepartmentLockListItemClient[]> {
  const res = await fetch(`/api/me/department-locks`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { locks: DepartmentLockListItemClient[] };
  return data.locks;
}
