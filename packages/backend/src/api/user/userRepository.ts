//import bcrypt from 'bcrypt';

import { eq } from 'drizzle-orm';
import { db } from 'src/db';
import { user } from 'src/db/schema';
import { logger } from 'src/server';

import { User } from './userModel';
import {
  CreateUserRequest,
  CreateUserSchema,
  DeleteUserRequest,
  DeleteUserSchema,
  GetUserRequest,
  GetUserSchema,
  GetUsersRequest,
  GetUsersSchema,
  UpdateUserRequest,
  UpdateUserSchema,
} from './userRequest';
import { UserResponse } from './userResponse';
export const userRepository = {
  findAllAsync: async (): Promise<UserResponse[]> => {
    return (await db.select().from(user)) as UserResponse[];
  },

  findByIdAsync: async (id: string): Promise<UserResponse | undefined> => {
    const result = await db.select().from(user).where(eq(user.id, id));
    return result[0] as UserResponse | undefined;
  },
  findByEmailAsync: async (email: string): Promise<UserResponse | undefined> => {
    const result = await db.select().from(user).where(eq(user.email, email));
    return result[0] as UserResponse | undefined;
  },
  findByUsernameAsync: async (username: string): Promise<UserResponse | undefined> => {
    const result = await db.select().from(user).where(eq(user.username, username));
    return result[0] as UserResponse | undefined;
  },
  createUserAsync: async (createUserRequest: CreateUserRequest): Promise<void> => {
    await db.insert(user).values({
      email: createUserRequest.email,
      username: createUserRequest.username,
      password: createUserRequest.password,
      fullName: createUserRequest.full_name,
      phoneNumber: createUserRequest.phone_number,
      levelId: createUserRequest.level_id,
    });
  },
  deleteUserAsync: async (id: string): Promise<void> => {
    await db.delete(user).where(eq(user.id, id));
  },
  updateUserAsync: async (
    id: string,
    fullName: string,
    levelId: number,
    categoryId: number,
    tags: string | undefined
  ): Promise<UserResponse | undefined> => {
    const updatedAt = new Date();
    const result = await db
      .update(user)
      .set({ fullName, levelId, categoryId, tags, updatedAt })
      .where(eq(user.id, id))
      .returning();

    return result[0] as UserResponse | undefined;
  },
  resetPasswordAsync: async (id: string, password: string) => {
    const updatedAt = new Date();
    const result = await db.update(user).set({ password, updatedAt }).where(eq(user.id, id)).returning();
    return result[0] as UserResponse | undefined;
  },
  getPasswordAsync: async (id: string) => {
    const pass = await db.select({ password: user.password }).from(user).where(eq(user.id, id));
    console.log(pass)
    return pass[0].password;
  },
};

