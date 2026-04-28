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
