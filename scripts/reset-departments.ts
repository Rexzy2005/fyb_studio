import { connectDb } from "@/backend/db/client";
import { Department } from "@/backend/db/models";

async function main() {
  await connectDb();
  const res = await Department.deleteMany({});
  console.log(`[reset] deleted ${res.deletedCount} departments`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[reset] failed:", err);
  process.exit(1);
});
