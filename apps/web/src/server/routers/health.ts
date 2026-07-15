/**
 * health router — liveness/echo probe used to verify tRPC wiring end to end.
 * Public (no auth); safe to call unauthenticated.
 */
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "../trpc";

export const healthRouter = createTRPCRouter({
  ping: publicProcedure.query(() => ({
    status: "ok" as const,
    ts: new Date().toISOString(),
  })),
  echo: publicProcedure
    .input(z.object({ message: z.string().min(1) }))
    .query(({ input }) => ({ message: input.message })),
});
