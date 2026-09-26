import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1).max(200),
    organizationName: z.string().min(1).max(200)
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1)
  })
});

export const createConversationSchema = z.object({
  body: z.object({
    title: z.string().max(200).optional()
  })
});

export const createMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Message content is required').max(8000)
  }),
  params: z.object({
    conversationId: z.string().min(1)
  })
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
