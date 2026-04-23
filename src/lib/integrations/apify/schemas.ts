import { z } from "zod";

// NOTE: Sprint 3 — flesh out against the canonical Apify dataset item shapes.
// Until then, these permissive schemas let us decode dataset items without losing data.

export const ApifyPersonItemSchema = z
  .object({
    linkedinUrl: z.string().url().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    fullName: z.string().optional(),
    headline: z.string().optional(),
    about: z.string().optional(),
    location: z.string().optional(),
    country: z.string().optional(),
    photoUrl: z.string().url().optional(),
    publicIdentifier: z.string().optional(),
    currentPosition: z.string().optional(),
    companyName: z.string().optional(),
    companyWebsite: z.string().optional(),
    companyLinkedinUrl: z.string().url().optional(),
    experiences: z.array(z.unknown()).optional(),
    educations: z.array(z.unknown()).optional(),
    skills: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    connectionsCount: z.number().int().optional(),
    followersCount: z.number().int().optional(),
    inputUrl: z.string().optional(),
    succeeded: z.boolean().optional(),
    error: z.string().optional(),
  })
  .passthrough();
export type ApifyPersonItem = z.infer<typeof ApifyPersonItemSchema>;

export const ApifyCompanyItemSchema = z
  .object({
    linkedinUrl: z.string().url().optional(),
    name: z.string().optional(),
    tagline: z.string().optional(),
    description: z.string().optional(),
    industry: z.string().optional(),
    employeeCount: z.number().int().optional(),
    employeeRange: z.string().optional(),
    foundedYear: z.number().int().optional(),
    website: z.string().optional(),
    hqCity: z.string().optional(),
    hqCountry: z.string().optional(),
    hqRegion: z.string().optional(),
    logoUrl: z.string().url().optional(),
    coverUrl: z.string().url().optional(),
    specialities: z.array(z.string()).optional(),
    inputUrl: z.string().optional(),
    succeeded: z.boolean().optional(),
    error: z.string().optional(),
  })
  .passthrough();
export type ApifyCompanyItem = z.infer<typeof ApifyCompanyItemSchema>;

export const ApifyPostItemSchema = z
  .object({
    authorLinkedinUrl: z.string().url().optional(),
    postUrl: z.string().url().optional(),
    postedAt: z.string().optional(),
    text: z.string().optional(),
    likes: z.number().int().optional(),
    comments: z.number().int().optional(),
    reshares: z.number().int().optional(),
  })
  .passthrough();
export type ApifyPostItem = z.infer<typeof ApifyPostItemSchema>;

export const ApifyRunSchema = z
  .object({
    id: z.string(),
    actId: z.string(),
    status: z.enum([
      "READY",
      "RUNNING",
      "SUCCEEDED",
      "FAILED",
      "TIMING-OUT",
      "TIMED-OUT",
      "ABORTING",
      "ABORTED",
    ]),
    defaultDatasetId: z.string(),
    usageTotalUsd: z.number().optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().nullable().optional(),
  })
  .passthrough();
export type ApifyRun = z.infer<typeof ApifyRunSchema>;
