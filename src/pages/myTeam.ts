import type { PageInfo } from "../content/pageDetect.js";

export async function run(_info: PageInfo): Promise<{ teardown: () => void }> {
  return { teardown: () => {} };
}
