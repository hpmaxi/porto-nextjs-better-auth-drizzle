import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const clientEnv = createEnv({
  client: {
    NEXT_PUBLIC_APP_URL: z.url().default("https://localhost:3000"),
    NEXT_PUBLIC_BETTER_AUTH_URL: z
      .url()
      .default("https://localhost:3000/api/auth"),
    NEXT_PUBLIC_FEE_TOKEN: z.string().default('0x'),
    NEXT_PUBLIC_CONTRACT: z.string().default('0x')
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    NEXT_PUBLIC_FEE_TOKEN: process.env.NEXT_PUBLIC_FEE_TOKEN,
    NEXT_PUBLIC_CONTRACT: process.env.NEXT_PUBLIC_CONTRACT
  },
});
