import mongoose from "mongoose";

import { connectDb } from "@/backend/db/client";
import {
  Department,
  TemplateLock,
  Template,
  type DepartmentDoc,
  type TemplateDoc,
  type TemplateLockDoc,
} from "@/backend/db/models";
import { AppError } from "@/backend/errors/app-error";

export type TemplateLockView = {
  id: string;
  templateId: string;
  departmentId: string;
  departmentName: string;
  departmentAbbreviation: string;
  lockedByUserId: string;
  isOwnerLock: boolean;
  passcode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentLockListItem = TemplateLockView & {
  templateName: string;
  templateCoverUrl: string | null;
};

function generatePasscode(abbreviation: string): string {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${abbreviation.toUpperCase()}${digits}`;
}

function toView(
  lock: TemplateLockDoc,
  dept: Pick<DepartmentDoc, "_id" | "name" | "abbreviation">,
  options: { revealPasscode: boolean; viewerUserId: string }
): TemplateLockView {
  const isOwner = lock.lockedByUserId.toString() === options.viewerUserId;
  return {
    id: lock._id.toString(),
    templateId: lock.templateId.toString(),
    departmentId: dept._id.toString(),
    departmentName: dept.name,
    departmentAbbreviation: dept.abbreviation,
    lockedByUserId: lock.lockedByUserId.toString(),
    isOwnerLock: isOwner,
    passcode: options.revealPasscode ? lock.passcode : null,
    createdAt: lock.createdAt.toISOString(),
    updatedAt: lock.updatedAt.toISOString(),
  };
}

export async function getLockByTemplateId(
  templateId: string
): Promise<TemplateLockDoc | null> {
  await connectDb();
  if (!mongoose.isValidObjectId(templateId)) return null;
  return TemplateLock.findOne({ templateId });
}

export async function getLockViewForTemplate(input: {
  templateId: string;
  viewerUserId: string;
  viewerDepartmentId: string | null;
  isLockOwner: boolean;
}): Promise<TemplateLockView | null> {
  await connectDb();
  if (!mongoose.isValidObjectId(input.templateId)) return null;
  const lock = await TemplateLock.findOne({ templateId: input.templateId });
  if (!lock) return null;
  const dept = await Department.findById(lock.departmentId).lean<
    Pick<DepartmentDoc, "_id" | "name" | "abbreviation"> | null
  >();
  if (!dept) return null;

  return toView(lock, dept, {
    revealPasscode: input.isLockOwner,
    viewerUserId: input.viewerUserId,
  });
}

export async function lockTemplateForDepartment(input: {
  templateId: string;
  departmentId: string;
  userId: string;
}): Promise<TemplateLockView> {
  await connectDb();

  if (!mongoose.isValidObjectId(input.templateId)) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }
  if (!mongoose.isValidObjectId(input.departmentId)) {
    throw new AppError("NOT_FOUND", "Department not found", 404);
  }

  const [template, dept, existing] = await Promise.all([
    Template.findById(input.templateId).select("_id").lean<Pick<TemplateDoc, "_id"> | null>(),
    Department.findById(input.departmentId).lean<DepartmentDoc | null>(),
    TemplateLock.findOne({ templateId: input.templateId }),
  ]);

  if (!template) throw new AppError("NOT_FOUND", "Template not found", 404);
  if (!dept) throw new AppError("NOT_FOUND", "Department not found", 404);
  if (existing) {
    throw new AppError(
      "TEMPLATE_LOCKED",
      "This template is already locked",
      409
    );
  }

  const passcode = generatePasscode(dept.abbreviation);

  const created = await TemplateLock.create({
    templateId: new mongoose.Types.ObjectId(input.templateId),
    departmentId: new mongoose.Types.ObjectId(input.departmentId),
    lockedByUserId: new mongoose.Types.ObjectId(input.userId),
    passcode,
  });

  return toView(created, dept, {
    revealPasscode: true,
    viewerUserId: input.userId,
  });
}

export async function rotateLockPasscode(input: {
  templateId: string;
  userId: string;
}): Promise<TemplateLockView> {
  await connectDb();
  if (!mongoose.isValidObjectId(input.templateId)) {
    throw new AppError("NOT_FOUND", "Lock not found", 404);
  }

  const lock = await TemplateLock.findOne({ templateId: input.templateId });
  if (!lock) throw new AppError("NOT_FOUND", "Lock not found", 404);
  if (lock.lockedByUserId.toString() !== input.userId) {
    throw new AppError("FORBIDDEN", "Only the lock owner can rotate the passcode", 403);
  }

  const dept = await Department.findById(lock.departmentId).lean<DepartmentDoc | null>();
  if (!dept) throw new AppError("NOT_FOUND", "Department not found", 404);

  lock.passcode = generatePasscode(dept.abbreviation);
  await lock.save();

  return toView(lock, dept, {
    revealPasscode: true,
    viewerUserId: input.userId,
  });
}

export async function deleteLock(input: {
  templateId: string;
  userId: string;
}): Promise<void> {
  await connectDb();
  if (!mongoose.isValidObjectId(input.templateId)) return;

  const lock = await TemplateLock.findOne({ templateId: input.templateId });
  if (!lock) return;
  if (lock.lockedByUserId.toString() !== input.userId) {
    throw new AppError("FORBIDDEN", "Only the lock owner can delete this lock", 403);
  }
  await TemplateLock.deleteOne({ _id: lock._id });
}

export async function verifyPasscode(input: {
  templateId: string;
  passcode: string;
  viewerDepartmentId: string | null;
}): Promise<{ ok: true; departmentId: string } | { ok: false; reason: "no-lock" | "wrong-department" | "invalid-passcode" }> {
  await connectDb();
  if (!mongoose.isValidObjectId(input.templateId)) {
    return { ok: false, reason: "no-lock" };
  }
  const lock = await TemplateLock.findOne({ templateId: input.templateId });
  if (!lock) return { ok: false, reason: "no-lock" };

  if (
    !input.viewerDepartmentId ||
    lock.departmentId.toString() !== input.viewerDepartmentId
  ) {
    return { ok: false, reason: "wrong-department" };
  }

  const submitted = input.passcode.trim().toUpperCase();
  if (submitted !== lock.passcode.trim().toUpperCase()) {
    return { ok: false, reason: "invalid-passcode" };
  }

  return { ok: true, departmentId: lock.departmentId.toString() };
}

export async function listLocksByDepartment(input: {
  departmentId: string;
  viewerUserId: string;
}): Promise<DepartmentLockListItem[]> {
  await connectDb();
  if (!mongoose.isValidObjectId(input.departmentId)) return [];

  const locks = await TemplateLock.find({ departmentId: input.departmentId })
    .sort({ updatedAt: -1 })
    .lean<TemplateLockDoc[]>();

  if (locks.length === 0) return [];

  const [dept, templates] = await Promise.all([
    Department.findById(input.departmentId).lean<DepartmentDoc | null>(),
    Template.find({ _id: { $in: locks.map((l) => l.templateId) } })
      .select("_id name cover")
      .lean<Pick<TemplateDoc, "_id" | "name" | "cover">[]>(),
  ]);

  if (!dept) return [];

  const tplById = new Map(templates.map((t) => [t._id.toString(), t]));

  return locks.map((l) => {
    const tpl = tplById.get(l.templateId.toString());
    const isOwner = l.lockedByUserId.toString() === input.viewerUserId;
    return {
      id: l._id.toString(),
      templateId: l.templateId.toString(),
      departmentId: dept._id.toString(),
      departmentName: dept.name,
      departmentAbbreviation: dept.abbreviation,
      lockedByUserId: l.lockedByUserId.toString(),
      isOwnerLock: isOwner,
      passcode: isOwner ? l.passcode : null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      templateName: tpl?.name ?? "(deleted template)",
      templateCoverUrl: tpl?.cover?.url ?? null,
    };
  });
}
