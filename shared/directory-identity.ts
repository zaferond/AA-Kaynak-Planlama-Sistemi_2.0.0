import { z } from "zod";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^\u0000-\u001f\u007f]*$/);
export const directoryUserSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{32}$/),
    username: text(100)
      .min(1)
      .transform((value) => value.toLowerCase()),
    name: text(150).min(1),
    email: text(320).refine(
      (value) => !value || /^[^\s@]+@[^\s@]+$/.test(value),
    ),
  })
  .strict();
export type DirectoryUser = z.infer<typeof directoryUserSchema>;
export type DirectoryUsers = {
  configured: boolean;
  users: DirectoryUser[];
  hasMore: boolean;
};
