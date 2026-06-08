import mongoose from "mongoose";
import { connectDb } from "@/backend/db/client";
import {
  Department,
  TemplateLock,
  User,
  type DepartmentDoc,
} from "@/backend/db/models";
import { AppError } from "@/backend/errors/app-error";

export type DepartmentListItem = {
  id: string;
  name: string;
  slug: string;
  abbreviation: string;
  hasHead: boolean;
};

export type CreateDepartmentInput = {
  name: string;
  abbreviation: string;
};

export function slugifyDepartmentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toDepartmentListItem(d: Pick<DepartmentDoc, "_id" | "name" | "slug" | "abbreviation" | "headUserId">): DepartmentListItem {
  return {
    id: d._id.toString(),
    name: d.name,
    slug: d.slug,
    abbreviation: d.abbreviation,
    hasHead: Boolean(d.headUserId),
  };
}

export async function listDepartments(): Promise<DepartmentListItem[]> {
  await connectDb();
  const docs = await Department.find(
    {},
    { name: 1, slug: 1, abbreviation: 1, headUserId: 1 }
  )
    .sort({ name: 1 })
    .lean<
      Pick<DepartmentDoc, "_id" | "name" | "slug" | "abbreviation" | "headUserId">[]
    >();

  return docs.map(toDepartmentListItem);
}

export async function createDepartment(
  input: CreateDepartmentInput
): Promise<DepartmentListItem> {
  await connectDb();

  const name = input.name.trim().replace(/\s+/g, " ");
  const abbreviation = input.abbreviation.trim().toUpperCase();
  const slug = slugifyDepartmentName(name);

  if (!slug) {
    throw new AppError("VALIDATION_ERROR", "Department name must contain letters or numbers", 422);
  }

  const existing = await Department.findOne({
    $or: [{ slug }, { abbreviation }],
  }).lean<Pick<DepartmentDoc, "slug" | "abbreviation"> | null>();

  if (existing?.slug === slug) {
    throw new AppError("DEPARTMENT_EXISTS", "A department with this name already exists", 409);
  }
  if (existing?.abbreviation === abbreviation) {
    throw new AppError(
      "DEPARTMENT_ABBREVIATION_EXISTS",
      "A department with this abbreviation already exists",
      409
    );
  }

  try {
    const created = await Department.create({
      name,
      slug,
      abbreviation,
      headUserId: null,
    });
    return toDepartmentListItem(created);
  } catch (err) {
    if (err instanceof mongoose.Error.ValidationError) {
      throw new AppError("VALIDATION_ERROR", err.message, 422);
    }
    throw err;
  }
}

export async function deleteDepartment(id: string): Promise<void> {
  await connectDb();
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("NOT_FOUND", "Department not found", 404);
  }

  const departmentId = new mongoose.Types.ObjectId(id);
  const [department, userCount, lockCount] = await Promise.all([
    Department.findById(departmentId).lean<Pick<DepartmentDoc, "_id"> | null>(),
    User.countDocuments({ department: departmentId }),
    TemplateLock.countDocuments({ departmentId }),
  ]);

  if (!department) {
    throw new AppError("NOT_FOUND", "Department not found", 404);
  }

  if (userCount > 0 || lockCount > 0) {
    throw new AppError(
      "DEPARTMENT_IN_USE",
      "This department is assigned to users or reservations and cannot be deleted yet",
      409,
      { users: userCount, reservations: lockCount }
    );
  }

  await Department.deleteOne({ _id: departmentId });
}

export async function getDepartmentById(id: string): Promise<DepartmentDoc | null> {
  await connectDb();
  if (!mongoose.isValidObjectId(id)) return null;
  return Department.findById(id);
}

export async function claimDepartmentHead(
  departmentId: string,
  userId: string
): Promise<DepartmentDoc> {
  await connectDb();
  if (!mongoose.isValidObjectId(departmentId)) {
    throw new AppError("NOT_FOUND", "Department not found", 404);
  }

  const claimed = await Department.findOneAndUpdate(
    { _id: departmentId, headUserId: null },
    { $set: { headUserId: new mongoose.Types.ObjectId(userId) } },
    { new: true }
  );

  if (!claimed) {
    const exists = await Department.exists({ _id: departmentId });
    if (!exists) throw new AppError("NOT_FOUND", "Department not found", 404);
    throw new AppError(
      "DEPARTMENT_HEAD_TAKEN",
      "This department already has a head",
      409
    );
  }

  return claimed;
}

export async function releaseDepartmentHead(
  departmentId: string,
  userId: string
): Promise<void> {
  await connectDb();
  if (!mongoose.isValidObjectId(departmentId)) return;
  await Department.updateOne(
    { _id: departmentId, headUserId: userId },
    { $set: { headUserId: null } }
  );
}
