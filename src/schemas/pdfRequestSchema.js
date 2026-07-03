import { z } from "zod";

const marginValueSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?(mm|cm|in|px)?$/i, "Valor de margem invalido");

const pdfOptionsSchema = z
  .object({
    format: z
      .enum([
        "A0",
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "Letter",
        "Legal",
        "Tabloid",
      ])
      .default("A4"),
    landscape: z.boolean().default(false),
    printBackground: z.boolean().default(true),
    preferCSSPageSize: z.boolean().default(true),
    displayHeaderFooter: z.boolean().default(false),
    scale: z.number().min(0.1).max(2).optional(),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
    readySelector: z.string().trim().min(1).max(160).optional(),
    readyTimeoutMs: z.number().int().min(100).max(15000).optional(),
    timeoutMs: z.number().int().min(1000).max(60000).default(15000),
    margin: z
      .object({
        top: marginValueSchema.optional(),
        right: marginValueSchema.optional(),
        bottom: marginValueSchema.optional(),
        left: marginValueSchema.optional(),
      })
      .optional(),
  })
  .default({});

export const pdfRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(120).optional(),
    html: z.string().trim().min(1).max(2_000_000),
    templateId: z.unknown().optional(),
    data: z.unknown().optional(),
    options: pdfOptionsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if ("templateId" in value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Campo legado 'templateId' nao e suportado.",
        path: ["templateId"],
      });
    }

    if ("data" in value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Campo legado 'data' nao e suportado.",
        path: ["data"],
      });
    }
  });
