import { AppError } from "@/backend/errors/app-error";
import {
  claimDepartmentHead,
  getDepartmentById,
  releaseDepartmentHead,
} from "@/backend/services/department.service";
import {
  findUserById,
  isUsernameAvailable,
  setOnboardedProfile,
} from "@/backend/services/user.service";
import { sendWelcomeEmail } from "@/backend/email/send-welcome";
import type { CompleteOnboardingInput } from "@/backend/validation/onboarding.schema";

export async function completeOnboarding(
  userId: string,
  input: CompleteOnboardingInput
) {
  const user = await findUserById(userId);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  if (user.isOnboarded) {
    throw new AppError("ALREADY_ONBOARDED", "User has already been onboarded", 409);
  }

  const department = await getDepartmentById(input.departmentId);
  if (!department) {
    throw new AppError("NOT_FOUND", "Department not found", 404);
  }

  if (!(await isUsernameAvailable(input.username))) {
    throw new AppError("USERNAME_TAKEN", "That username is already taken", 409);
  }

  let headClaimed = false;
  if (input.isDepartmentHead) {
    await claimDepartmentHead(input.departmentId, userId);
    headClaimed = true;
  }

  let updatedUser;
  try {
    updatedUser = await setOnboardedProfile(userId, {
      username: input.username,
      departmentId: input.departmentId,
      isDepartmentHead: input.isDepartmentHead,
    });
  } catch (err) {
    if (headClaimed) {
      await releaseDepartmentHead(input.departmentId, userId).catch(() => {});
    }
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    ) {
      throw new AppError("USERNAME_TAKEN", "That username is already taken", 409);
    }
    throw err;
  }

  void sendWelcomeEmail({
    email: updatedUser.email,
    name: updatedUser.name,
    username: updatedUser.username ?? input.username,
  }).catch((err) => {
    console.error("[onboarding] welcome email failed:", err);
  });

  return {
    id: updatedUser._id.toString(),
    email: updatedUser.email,
    name: updatedUser.name,
    username: updatedUser.username,
    departmentId: input.departmentId,
    departmentName: department.name,
    isDepartmentHead: updatedUser.isDepartmentHead,
    isOnboarded: updatedUser.isOnboarded,
  };
}
