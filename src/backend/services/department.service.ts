import mongoose from "mongoose";
import { connectDb } from "@/backend/db/client";
import { Department, type DepartmentDoc } from "@/backend/db/models";
import { AppError } from "@/backend/errors/app-error";

export type DepartmentListItem = {
  id: string;
  name: string;
  slug: string;
  abbreviation: string;
  hasHead: boolean;
};

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

  return docs.map((d) => ({
    id: d._id.toString(),
    name: d.name,
    slug: d.slug,
    abbreviation: d.abbreviation,
    hasHead: Boolean(d.headUserId),
  }));
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
