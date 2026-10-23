import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const getNamePick = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ needsName: boolean }> => {
    const { needsNamePick } = await import("./name-pick.server");
    return { needsName: await needsNamePick(context.userId) };
  });
