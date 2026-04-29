import mongoose from "mongoose";
import { connectDb } from "@/backend/db/client";
import { Department, User, type DepartmentDoc, type UserDoc } from "@/backend/db/models";

export type GoogleProfileInput = {
  googleId: string;
  email: string;
  name: string;
  avatar?: string | null;
};

export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  await connectDb();
  return User.findOne({ email: email.toLowerCase() });
}

export async function findUserById(id: string): Promise<UserDoc | null> {
  await connectDb();
  if (!mongoose.isValidObjectId(id)) return null;
  return User.findById(id);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  await connectDb();
  const existing = await User.exists({ username: username.toLowerCase() });
  return !existing;
}

export async function upsertUserFromGoogle(
  profile: GoogleProfileInput
): Promise<UserDoc> {
  await connectDb();

  const email = profile.email.toLowerCase();
  const now = new Date();

  const updated = await User.findOneAndUpdate(
    { googleId: profile.googleId },
    {
      $set: {
        email,
        name: profile.name,
        avatar: profile.avatar ?? null,
        lastLoginAt: now,
      },
      $setOnInsert: {
        googleId: profile.googleId,
        username: null,
        department: null,
        isDepartmentHead: false,
        isOnboarded: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (!updated) {
    throw new Error("Failed to upsert user from Google profile");
  }
  return updated;
}

export type UserProfileView = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  username: string | null;
  isOnboarded: boolean;
  isDepartmentHead: boolean;
  department: { id: string; name: string; slug: string } | null;
};

export async function getUserProfile(userId: string): Promise<UserProfileView | null> {
  await connectDb();
  if (!mongoose.isValidObjectId(userId)) return null;

  const user = await User.findById(userId).lean<UserDoc | null>();
  if (!user) return null;

  let department: UserProfileView["department"] = null;
  if (user.department) {
    const dept = await Department.findById(user.department).lean<DepartmentDoc | null>();
    if (dept) {
      department = { id: dept._id.toString(), name: dept.name, slug: dept.slug };
    }
  }

  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    avatar: user.avatar ?? null,
    username: user.username ?? null,
    isOnboarded: user.isOnboarded,
    isDepartmentHead: user.isDepartmentHead,
    department,
  };
}

export type AdminUserListItem = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  avatar: string | null;
  isOnboarded: boolean;
  isDepartmentHead: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  department: { id: string; name: string; slug: string } | null;
};

export type UserStats = {
  total: number;
  onboarded: number;
  pending: number;
  departmentHeads: number;
};

export async function countUsers(): Promise<UserStats> {
  await connectDb();
  const [total, onboarded, departmentHeads] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isOnboarded: true }),
    User.countDocuments({ isDepartmentHead: true }),
  ]);
  return {
    total,
    onboarded,
    pending: total - onboarded,
    departmentHeads,
  };
}

export async function listAllUsers(): Promise<AdminUserListItem[]> {
  await connectDb();

  const users = await User.find({})
    .sort({ createdAt: -1 })
    .lean<Array<UserDoc & { createdAt?: Date; updatedAt?: Date }>>();

  const departmentIds = Array.from(
    new Set(
      users
        .map((u) => u.department)
        .filter((d): d is mongoose.Types.ObjectId => Boolean(d))
        .map((d) => d.toString())
    )
  );

  const departments = departmentIds.length
    ? await Department.find({ _id: { $in: departmentIds } }).lean<DepartmentDoc[]>()
    : [];

  const deptById = new Map(
    departments.map((d) => [d._id.toString(), d])
  );

  return users.map((u) => {
    const deptId = u.department ? u.department.toString() : null;
    const dept = deptId ? deptById.get(deptId) ?? null : null;
    return {
      id: u._id.toString(),
      name: u.name,
      username: u.username ?? null,
      email: u.email,
      avatar: u.avatar ?? null,
      isOnboarded: u.isOnboarded,
      isDepartmentHead: u.isDepartmentHead,
      lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
      department: dept
        ? { id: dept._id.toString(), name: dept.name, slug: dept.slug }
        : null,
    };
  });
}

export async function setOnboardedProfile(
  userId: string,
  data: {
    username: string;
    departmentId: string;
    isDepartmentHead: boolean;
  }
): Promise<UserDoc> {
  await connectDb();

  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        username: data.username.toLowerCase(),
        department: new mongoose.Types.ObjectId(data.departmentId),
        isDepartmentHead: data.isDepartmentHead,
        isOnboarded: true,
      },
    },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new Error("User not found while completing onboarding");
  }
  return updated;
}
