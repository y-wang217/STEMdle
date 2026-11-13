import { migrate } from "../scripts/migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mathdle_test";
  if (!/test/.test(url)) throw new Error("refusing to reset a database whose URL does not contain 'test'");
  await migrate(url, { reset: true, quiet: true });
}
