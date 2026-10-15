/** Keep domain validation failures distinct from Zod shape errors. */
export const invalidSnapshot = (message: string) =>
  Object.assign(Error(message), { status: 400 });
