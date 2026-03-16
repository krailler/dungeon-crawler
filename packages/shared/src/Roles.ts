/** User roles — `as const` object instead of enum (erasableSyntaxOnly) */
export const Role = {
  ADMIN: "admin",
  USER: "user",
} as const;

export type RoleValue = (typeof Role)[keyof typeof Role];
