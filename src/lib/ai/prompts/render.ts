import Handlebars from "handlebars";

const compileCache = new Map<string, HandlebarsTemplateDelegate>();

export function renderPrompt(template: string, variables: Record<string, unknown>): string {
  let compiled = compileCache.get(template);
  if (!compiled) {
    compiled = Handlebars.compile(template, { noEscape: true });
    compileCache.set(template, compiled);
  }
  return compiled(variables);
}

export const TEMPLATE_VARIABLES = [
  "first_name",
  "last_name",
  "full_name",
  "headline",
  "about",
  "current_title",
  "company_name",
  "company_description",
  "company_industry",
  "last_posts",
  "icp_description",
  "brand_voice",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
