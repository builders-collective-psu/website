import { readFile } from "node:fs/promises";

/**
 * Minimal .env reader for the scripts in this folder.
 *
 * Values may be bare, 'single quoted' or "double quoted" — a quoted value
 * whose quotes are not stripped silently corrupts things like base64 tokens,
 * which fail far away from the cause.
 */
export async function loadEnv(url: URL): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(url, "utf8");
  } catch {
    return; // No .env — rely on the ambient environment.
  }

  for (const line of contents.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
