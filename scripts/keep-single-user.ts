import { connectDb } from "@/backend/db/client";
import { User } from "@/backend/db/models";

const USER_ID = "69f2b73d0f3260c48e196c22";

async function main() {
  await connectDb();

  const res = await User.deleteMany({ _id: { $ne: USER_ID } });
  console.log(`[keep-user] deleted ${res.deletedCount ?? 0} users`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[keep-user] failed:", err);
  process.exit(1);
});
