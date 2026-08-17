import { z } from "zod";

export const productSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(100),
  defaultBuyPrice: z.number().min(0),
  defaultSellPrice: z.number().min(0),
  active: z.boolean().optional(),
});

export const saleSchema = z.object({
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  productId: z.number().int().positive(),
  customerName: z.string().trim().min(1, "Nome do cliente obrigatório").max(100),
  quantity: z.number().positive(),
  unitBuyPrice: z.number().min(0),
  unitSellPrice: z.number().min(0),
  notes: z.string().trim().max(500).optional().nullable(),
  initialPayment: z.number().min(0).optional(),
});

export const saleUpdateSchema = saleSchema.omit({ initialPayment: true }).partial();

export const paymentSchema = z.object({
  amount: z.number().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
});

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  role: z.enum(["admin", "user"]).optional(),
});

export const updateUserSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["admin", "user"]).optional(),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres").optional(),
});
