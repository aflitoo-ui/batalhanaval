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
  customerId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitBuyPrice: z.number().min(0),
  unitSellPrice: z.number().min(0),
  notes: z.string().trim().max(500).optional().nullable(),
  initialPayment: z.number().min(0).optional(),
  adjustment: z.number().optional(),
});

export const saleUpdateSchema = saleSchema.omit({ initialPayment: true }).partial();

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(100),
  phone: z.string().trim().max(30).optional().nullable(),
  active: z.boolean().optional(),
});

export const paymentSchema = z.object({
  amount: z.number().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  notes: z.string().trim().max(500).optional().nullable(),
});

// Chamado "email" no banco/código por herança (era e-mail no começo do
// projeto), mas não é mais validado nem tratado como e-mail — é só um login
// de texto livre, já que o sistema nunca precisou mandar e-mail de verdade
// pra ninguém. Os campos de criação no navegador já filtram @ e .com
// enquanto digita (ver sanitizeLogin em UsuariosClient.tsx/SignupForm.tsx);
// essa validação aqui é a segunda camada, caso alguém chame a API direto.
const loginField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Login deve ter pelo menos 3 caracteres")
  .max(100)
  .refine((v) => !v.includes("@"), "Login não pode conter @")
  .refine((v) => !v.includes(".com"), "Login não pode conter .com");

export const createUserSchema = z.object({
  email: loginField,
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  role: z.enum(["admin", "user"]).optional(),
});

export const signupSchema = z.object({
  code: z.string().trim().min(1, "Convite inválido."),
  email: loginField,
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
});

export const updateUserSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["admin", "user"]).optional(),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres").optional(),
  telegramReset: z.boolean().optional(),
  grantInviteCredit: z.boolean().optional(),
});
