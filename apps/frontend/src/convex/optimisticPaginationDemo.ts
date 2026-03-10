import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const laneValidator = v.union(v.literal('alpha'), v.literal('beta'));

type DemoLane = 'alpha' | 'beta';

function seedItemsForLane(lane: DemoLane) {
  const prefix = lane === 'alpha' ? 'Alpha' : 'Beta';
  return [10, 20, 30, 40, 50, 60].map((rank) => ({
    title: `${prefix} rank ${rank}`,
    lane,
    rank,
    completed: rank % 20 === 0,
  }));
}

export const listItemsPaginated = query({
  args: {
    lane: laneValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('optimisticDemoItems')
      .withIndex('by_lane_rank', (q) => q.eq('lane', args.lane))
      .paginate(args.paginationOpts);
  },
});

export const resetLane = mutation({
  args: {
    lane: laneValidator,
  },
  handler: async (ctx, args) => {
    const existingItems = await ctx.db
      .query('optimisticDemoItems')
      .withIndex('by_lane', (q) => q.eq('lane', args.lane))
      .collect();

    for (const item of existingItems) {
      await ctx.db.delete(item._id);
    }

    for (const item of seedItemsForLane(args.lane)) {
      await ctx.db.insert('optimisticDemoItems', item);
    }

    return { inserted: 6 };
  },
});

export const createItem = mutation({
  args: {
    lane: laneValidator,
    title: v.string(),
    rank: v.number(),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('optimisticDemoItems', args);
    return await ctx.db.get(id);
  },
});

export const toggleCompleted = mutation({
  args: {
    id: v.id('optimisticDemoItems'),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) {
      return null;
    }

    await ctx.db.patch(args.id, { completed: !item.completed });
    return await ctx.db.get(args.id);
  },
});
