import mongoose from "mongoose";

import { connectDb } from "@/backend/db/client";
import {
  Department,
  TemplateLock,
  Template,
  User,
  type DepartmentDoc,
  type TemplateDoc,
  type TemplateLockDoc,
  type UserDoc,
} from "@/backend/db/models";
import { AppError } from "@/backend/errors/app-error";
import { emitTemplateChange } from "@/backend/events/templates.bus";

export type TemplateLockView = {
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

export type DepartmentLockListItem = TemplateLockView & {
  templateName: string;
  templateCoverUrl: string | null;
};

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

type LockSnapshot = Pick<
  TemplateLockDoc,
  "_id" | "templateId" | "departmentId" | "lockedByUserId" | "createdAt" | "updatedAt"
>;

function toView(
  lock: TemplateLockDoc,
  dept: Pick<DepartmentDoc, "_id" | "name" | "abbreviation">,
  options: { viewerUserId: string }
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
    passcode: null,
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

  const [template, dept, existing, existingByDept] = await Promise.all([
    Template.findById(input.templateId).select("_id").lean<Pick<TemplateDoc, "_id"> | null>(),
    Department.findById(input.departmentId).lean<DepartmentDoc | null>(),
    TemplateLock.findOne({ templateId: input.templateId }),
    TemplateLock.findOne({ departmentId: input.departmentId }),
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
  if (existingByDept && existingByDept.templateId.toString() !== input.templateId) {
    throw new AppError(
      "DEPARTMENT_ALREADY_LOCKED",
      "Your department already reserved another design. Free it before reserving a new one.",
      409
    );
  }

  const created = await TemplateLock.create({
    templateId: new mongoose.Types.ObjectId(input.templateId),
    departmentId: new mongoose.Types.ObjectId(input.departmentId),
    lockedByUserId: new mongoose.Types.ObjectId(input.userId),
    passcode: "",
  });

  emitTemplateChange({
    type: "updated",
    templateId: input.templateId,
    at: new Date().toISOString(),
  });

  return toView(created, dept, {
    viewerUserId: input.userId,
  });
}

export async function rotateLockPasscode(input: {
  templateId: string;
  userId: string;
}): Promise<TemplateLockView> {
  void input;
  throw new AppError(
    "FORBIDDEN",
    "Passcode rotation is not supported for reserved designs",
    403
  );
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
  emitTemplateChange({
    type: "updated",
    templateId: input.templateId,
    at: new Date().toISOString(),
  });
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
      passcode: null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      templateName: tpl?.name ?? "(deleted template)",
      templateCoverUrl: tpl?.cover?.url ?? null,
    };
  });
}

async function toAdminListItems(locks: LockSnapshot[]): Promise<AdminTemplateLockListItem[]> {
  const templateIds = Array.from(new Set(locks.map((l) => String(l.templateId))));
  const departmentIds = Array.from(new Set(locks.map((l) => String(l.departmentId))));
  const userIds = Array.from(new Set(locks.map((l) => String(l.lockedByUserId))));

  const [templates, departments, users] = await Promise.all([
    templateIds.length
      ? Template.find({ _id: { $in: templateIds } })
          .select("_id name cover")
          .lean<Pick<TemplateDoc, "_id" | "name" | "cover">[]>()
      : [],
    departmentIds.length
      ? Department.find({ _id: { $in: departmentIds } })
          .select("_id name slug abbreviation")
          .lean<Pick<DepartmentDoc, "_id" | "name" | "slug" | "abbreviation">[]>()
      : [],
    userIds.length
      ? User.find({ _id: { $in: userIds } })
          .select("_id name email username avatar isDepartmentHead department")
          .lean<
            Pick<
              UserDoc,
              "_id" | "name" | "email" | "username" | "avatar" | "isDepartmentHead" | "department"
            >[]
          >()
      : [],
  ]);

  const templateById = new Map(templates.map((t) => [String(t._id), t]));
  const departmentById = new Map(departments.map((d) => [String(d._id), d]));
  const userById = new Map(users.map((u) => [String(u._id), u]));

  return locks.map((lock) => {
    const template = templateById.get(String(lock.templateId)) ?? null;
    const department = departmentById.get(String(lock.departmentId)) ?? null;
    const user = userById.get(String(lock.lockedByUserId)) ?? null;

    return {
      id: String(lock._id),
      template: template
        ? {
            id: String(template._id),
            name: template.name,
            coverUrl: template.cover?.url ?? null,
            coverWidth: template.cover?.width ?? null,
            coverHeight: template.cover?.height ?? null,
          }
        : null,
      department: department
        ? {
            id: String(department._id),
            name: department.name,
            slug: department.slug,
            abbreviation: department.abbreviation,
          }
        : null,
      lockedBy: user
        ? {
            id: String(user._id),
            name: user.name,
            email: user.email,
            username: user.username ?? null,
            avatar: user.avatar ?? null,
            isDepartmentHead: user.isDepartmentHead,
            departmentId: user.department ? String(user.department) : null,
          }
        : null,
      createdAt: lock.createdAt.toISOString(),
      updatedAt: lock.updatedAt.toISOString(),
    };
  });
}

export async function listAllTemplateLocksForAdmin(): Promise<AdminTemplateLockListItem[]> {
  await connectDb();
  const locks = await TemplateLock.find({})
    .sort({ updatedAt: -1 })
    .lean<TemplateLockDoc[]>();

  return toAdminListItems(locks);
}

export async function updateTemplateLockForAdmin(input: {
  lockId: string;
  departmentId: string;
  lockedByUserId: string;
}): Promise<AdminTemplateLockListItem> {
  await connectDb();

  if (!mongoose.isValidObjectId(input.lockId)) {
    throw new AppError("NOT_FOUND", "Reservation not found", 404);
  }
  if (!mongoose.isValidObjectId(input.departmentId)) {
    throw new AppError("NOT_FOUND", "Department not found", 404);
  }
  if (!mongoose.isValidObjectId(input.lockedByUserId)) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }

  const [lock, department, user, existingByDepartment] = await Promise.all([
    TemplateLock.findById(input.lockId),
    Department.findById(input.departmentId).lean<DepartmentDoc | null>(),
    User.findById(input.lockedByUserId).lean<UserDoc | null>(),
    TemplateLock.findOne({
      departmentId: input.departmentId,
      _id: { $ne: input.lockId },
    }).select("_id"),
  ]);

  if (!lock) throw new AppError("NOT_FOUND", "Reservation not found", 404);
  if (!department) throw new AppError("NOT_FOUND", "Department not found", 404);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);

  if (user.department?.toString() !== input.departmentId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The reserving user must belong to the selected department",
      422
    );
  }

  if (existingByDepartment) {
    throw new AppError(
      "DEPARTMENT_ALREADY_LOCKED",
      "That department already has a reserved design",
      409
    );
  }

  lock.departmentId = new mongoose.Types.ObjectId(input.departmentId);
  lock.lockedByUserId = new mongoose.Types.ObjectId(input.lockedByUserId);
  await lock.save();

  emitTemplateChange({
    type: "updated",
    templateId: String(lock.templateId),
    at: new Date().toISOString(),
  });

  const [view] = await toAdminListItems([lock]);
  return view;
}

export async function deleteTemplateLockForAdmin(lockId: string): Promise<void> {
  await connectDb();
  if (!mongoose.isValidObjectId(lockId)) {
    throw new AppError("NOT_FOUND", "Reservation not found", 404);
  }

  const lock = await TemplateLock.findById(lockId);
  if (!lock) throw new AppError("NOT_FOUND", "Reservation not found", 404);

  const templateId = String(lock.templateId);
  await TemplateLock.deleteOne({ _id: lock._id });

  emitTemplateChange({
    type: "updated",
    templateId,
    at: new Date().toISOString(),
  });
}
