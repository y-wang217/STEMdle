/**
 * Idempotent bootstrap: the eight bucket profiles and their v1 generator
 * versions. Creates no questions — questions only come from the factory.
 *   npx tsx scripts/seed.ts
 */
import "dotenv/config";
import postgres from "postgres";
import { SLOT_SEEDS, defaultConfig, defaultProfile } from "@/lib/buckets/defaults";

export async function seedBuckets(url: string, quiet = false) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    for (const s of SLOT_SEEDS) {
      await sql.begin(async (tx) => {
        await tx`insert into bucket_profiles (slot, name, category, character, config)
                 values (${s.slot}, ${s.name}, ${s.category}, ${s.character}, ${tx.json(defaultConfig(s) as never)})
                 on conflict (slot) do nothing`;
        const [b] = await tx<{ active: string | null }[]>`select active_generator_version_id as active from bucket_profiles where slot = ${s.slot}`;
        if (!b.active) {
          const [gv] = await tx<{ id: string }[]>`
            insert into generator_versions (slot, version, status, profile, learning_summary, activated_at)
            values (${s.slot}, 1, 'active', ${tx.json(defaultProfile(s) as never)}, ${tx.json({ seed: true } as never)}, now())
            returning id`;
          await tx`update bucket_profiles set active_generator_version_id = ${gv.id} where slot = ${s.slot}`;
          if (!quiet) console.log(`slot ${s.slot} (${s.name}): created generator v1`);
        }
      });
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seedBuckets(process.env.DATABASE_URL!).then(
    () => console.log("buckets seeded"),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
