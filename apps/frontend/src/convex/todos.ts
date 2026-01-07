import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import { internalMutation, mutation, query } from './_generated/server';

export const listTodos = query({
  args: {
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const { count } = args;
    return await ctx.db.query('todos').order('desc').take(count);
  },
});

export const listTodosPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('todos')
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const completeTodo = mutation({
  args: {
    id: v.id('todos'),
  },
  handler: async (ctx, args) => {
    const { id } = args;
    await ctx.db.patch(id, { completed: true });
  },
});

export const reopenTodo = mutation({
  args: {
    id: v.id('todos'),
  },
  handler: async (ctx, args) => {
    const { id } = args;
    await ctx.db.patch(id, { completed: false });
  },
});

export const addTodo = mutation({
  args: {
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { title } = args;
    await ctx.db.insert('todos', { title, description: '', completed: false });
  },
});

export const deleteTodo = mutation({
  args: {
    id: v.id('todos'),
  },
  handler: async (ctx, args) => {
    const { id } = args;
    await ctx.db.delete(id);
  },
});

export const completeAllTodos = internalMutation({
  handler: async (ctx) => {
    const items = await ctx.db.query('todos').collect();
    for (const item of items) {
      await ctx.db.patch(item._id, { completed: true });
    }
  },
});

export const reopenAllTodos = internalMutation({
  handler: async (ctx) => {
    const items = await ctx.db.query('todos').collect();
    for (const item of items) {
      await ctx.db.patch(item._id, { completed: false });
    }
  },
});
