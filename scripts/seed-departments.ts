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
  let updated = 0;

  for (const { name, abbreviation } of DEPARTMENT_SEED) {
    const slug = slugify(name);
    const result = await Department.updateOne(
      { slug },
      {
        $setOnInsert: { slug, headUserId: null },
        $set: { name, abbreviation: abbreviation.toUpperCase() },
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) created++;
    else if (result.modifiedCount > 0) updated++;
  }

  console.log(
    `[seed] departments — created: ${created}, updated: ${updated}, total: ${DEPARTMENT_SEED.length}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
