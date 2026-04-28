import { connectDb } from "@/backend/db/client";
import { Department } from "@/backend/db/models";
import { DEPARTMENT_SEED } from "@/backend/db/seed/departments.list";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  await connectDb();

  let created = 0;
  let skipped = 0;

  for (const name of DEPARTMENT_SEED) {
    const slug = slugify(name);
    const result = await Department.updateOne(
      { slug },
      { $setOnInsert: { name, slug, headUserId: null } },
      { upsert: true }
    );
    if (result.upsertedCount > 0) created++;
    else skipped++;
  }

  console.log(`[seed] departments — created: ${created}, already-present: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
